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

// 2. Middleware & DB Imports
import { logReq, globalErr } from "./middleware/middleware.js";
import { protect, restrictTo } from "./middleware/authMiddleware.js";
import connectDB from "./db/conn.js";

// 3. Route Imports
import systemRoutes from "./routes/systemRoutes.js";
import membershipRoutes from "./routes/membershipRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
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

// -------------------------------------------------------
// 5. Initialization
// -------------------------------------------------------
app.use(logReq);

console.log("🛠️  BOOTING UP LEAN GROWN FOLKS COLLECTIVE SERVER...");

// Stripe Setup
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// -------------------------------------------------------
// 6. STRIPE WEBHOOK — MUST be before express.json()
// -------------------------------------------------------
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(500).send("Config error.");

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  res.json({ received: true });
});

// -------------------------------------------------------
// 7. Standard Middleware (After CORS/Webhooks)
// -------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------
// 8. Dynamic API Routes
// -------------------------------------------------------
app.use("/api",              systemRoutes);
app.use("/api/membership",   membershipRoutes);
app.use("/api/auth",         authRoutes);
app.use("/api/events",       eventRoutes);
app.use("/api/partnerships", partnershipRoutes);
app.use("/api/contact",      contactRoutes);
app.use("/api/travel",       travelRoutes);
app.use("/api/admin", protect, restrictTo("admin"), adminRoutes);

// -------------------------------------------------------
// 9. DEDICATED ROOT HEALTH CHECK ROUTE (Fixes Railway Health Check Timeouts)
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
  // Bind the port instantly so Railway registers the application as online right away
  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`🚀 GFC Lean Server successfully responding on PORT: ${PORT}`);
    
    // Connect to database asynchronously in the background
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