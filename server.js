// 1. Core Config & Environment — MUST BE FIRST
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Stripe from "stripe";
import mongoose from "mongoose";
import { Resend } from "resend"; 

// 2. Middleware & DB Imports
import { logReq, globalErr } from "./middleware/middleware.js";
import { protect, restrictTo } from "./middleware/authMiddleware.js";
import connectDB from "./db/conn.js";
import Membership from "./models/membershipSchema.js"; 

// 3. Route Imports
import systemRoutes from "./routes/systemRoutes.js";
import membershipRoutes from "./routes/membershipRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import eventRoutes from "./routes/eventRoutes.js"; // Handles our new /external/:eventId route automatically
import partnershipRoutes from "./routes/partnershipRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import travelRoutes from "./routes/travelRoutes.js";

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// Path handling for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// -------------------------------------------------------
// 4. STRATEGIC CORS CONFIG (Optimized for Preflight)
// -------------------------------------------------------
const allowedOrigins = [
  "https://grownfolkscollective.com",
  "https://www.grownfolkscollective.com",
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS Blocked: Origin ${origin} not in allowed list.`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Explicitly handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Initialize general request logging
app.use(logReq);

console.log("🛠️  BOOTING UP LEAN GROWN FOLKS COLLECTIVE SERVER...");

// Stripe & Resend Initializations
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// -------------------------------------------------------
// 5. 🔥 FIX: ISOLATED RAW WEBHOOK ROUTE MOUNTING (Stripe & Eventbrite)
// -------------------------------------------------------
// Intercepting webhook requests here using express.json/raw directly
// BEFORE global JSON parsing can alter or corrupt the payload streams.
app.use((req, res, next) => {
  // Added a check for /api/events/webhook/stripe to preserve the raw body needed for verifying signatures
  if (req.path === "/api/membership/webhook" || req.path === "/api/events/webhook/stripe") {
    express.raw({ type: "application/json" })(req, res, next);
  } else if (req.path === "/api/events/webhook/eventbrite") {
    express.json()(req, res, next);
  } else {
    next();
  }
});

// -------------------------------------------------------
// 6. GLOBAL JSON PARSERS (Safe now that webhooks are bypassed/handled)
// -------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------
// 7. Dynamic API Routes
// -------------------------------------------------------
app.use("/api",              systemRoutes);
app.use("/api/membership",   membershipRoutes); 
app.use("/api/auth",         authRoutes);
app.use("/api/events",       eventRoutes);      // Matches /api/events/external/:eventId seamlessly
app.use("/api/partnerships", partnershipRoutes);
app.use("/api/contact",      contactRoutes);
app.use("/api/travel",       travelRoutes);
app.use("/api/admin", protect, restrictTo("admin"), adminRoutes);

// -------------------------------------------------------
// 8. STRIPE CANCEL REDIRECT LAYER
// -------------------------------------------------------
app.get("/membership/cancelled", (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "https://grownfolkscollective.com";
  return res.redirect(`${frontendUrl}/membership?cancelled=true`);
});

// -------------------------------------------------------
// 9. DEDICATED ROOT HEALTH CHECK ROUTE
// -------------------------------------------------------
app.get("/", (req, res) => {
  return res.status(200).json({
    status: "healthy",
    message: "GGF Core Engine online and serving requests.",
    timestamp: new Date().toISOString(),
    uptime: `${process.uptime().toFixed(2)}s`,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// -------------------------------------------------------
// 10. Fallback Layer: Serve Frontend Static Built Assets
// -------------------------------------------------------
app.use(express.static(join(__dirname, "../frontend/dist"))); 

// -------------------------------------------------------
// 11. FRONTEND SPA CATCH-ALL ROUTE
// -------------------------------------------------------
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "../frontend/dist/index.html"));
});

// -------------------------------------------------------
// 12. Final Catch & Start
// -------------------------------------------------------
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  next(err);
});

app.use(globalErr);

// -------------------------------------------------------
// 13. Optimized Startup Pipeline
// -------------------------------------------------------
const startServer = async () => {
  app.listen(PORT, "0.0.0.0", async () => {
    console.log("🚀 GFC Lean Server successfully responding on PORT:", PORT);
    
    try {
      await connectDB();
      console.log("✅ MongoDB Connection Established");
    } catch (err) {
      console.error("❌ Deferred Database Connection Error:", err.message);
    }
  });
};

// Execute the start
startServer();