// // 1. Core Config & Environment — MUST BE FIRST
// import dotenv from "dotenv";
// dotenv.config(); 

// import express from "express";
// import cors from "cors";
// import path from 'path';
// import fs from 'fs';
// import Stripe from 'stripe';

// // 2. Middleware & DB Imports
// import { logReq, globalErr } from "./middleware/middleware.js";
// import { protect, restrictTo } from "./middleware/authMiddleware.js";
// import connectDB from "./db/conn.js";

// // 3. Route Imports
// import systemRoutes from "./routes/systemRoutes.js";
// import membershipRoutes from "./routes/membershipRoutes.js";
// import authRoutes from './routes/authRoutes.js';
// import adminRoutes from './routes/adminRoutes.js';
// import eventRoutes from './routes/eventRoutes.js';
// import partnershipRoutes from './routes/partnershipRoutes.js';
// import contactRoutes from './routes/contactRoutes.js';
// import travelRoutes from './routes/travelRoutes.js';

// // -------------------------------------------------------
// // Initialization
// // -------------------------------------------------------
// const app = express();

// /** 
//  * RAILWAY FIX: Railway injects a PORT variable. 
//  * This ensures the app listens where Railway expects.
//  */
// const PORT = process.env.PORT || 3001;

// // Initialize Stripe Safely
// const stripe = process.env.STRIPE_SECRET_KEY 
//     ? new Stripe(process.env.STRIPE_SECRET_KEY) 
//     : null;

// if (!stripe) {
//     console.warn("⚠️ WARNING: STRIPE_SECRET_KEY is missing. Stripe features will fail.");
// }

// // Connect to Database
// connectDB();

// // Folder Safety Check
// const uploadDir = path.join(process.cwd(), 'uploads');
// if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true });
//     console.log("Created missing 'uploads' directory");
// }

// // -------------------------------------------------------
// // Initial Middlewares
// // -------------------------------------------------------
// app.use(logReq); 

// app.use(cors({
//     origin: [
//       'http://localhost:5173',
//       'http://localhost:3000',
//       'http://localhost:3001',
//       'https://www.grownfolkscollective.com',
//       'https://grownfolkscollective.com',
//       'https://capstonebackend-production-78e3.up.railway.app',
//       process.env.FRONTEND_URL,
//     ].filter(Boolean),
//     credentials: true
// }));

// /**
//  * RAILWAY FIX: Root Health Check
//  * This prevents "Service Unavailable" errors during deployment.
//  */
// app.get('/', (req, res) => {
//     res.status(200).send('🚀 Grown Folks Collective API is live and healthy!');
// });

// // -------------------------------------------------------
// // STRIPE WEBHOOK — must be BEFORE express.json()
// // -------------------------------------------------------
// app.post(
//   '/api/webhooks/stripe',
//   express.raw({ type: 'application/json' }),
//   async (req, res) => {
//     const sig = req.headers['stripe-signature'];
//     let stripeEvent;

//     if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
//         console.error("Webhook failed: Stripe or Webhook Secret is missing.");
//         return res.status(500).send("Server configuration error.");
//     }

//     try {
//       stripeEvent = stripe.webhooks.constructEvent(
//         req.body,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       console.error('Stripe webhook signature failed:', err.message);
//       return res.status(400).send(`Webhook Error: ${err.message}`);
//     }

//     const { default: Order } = await import('./models/orderSchema.js');
//     const { default: Event } = await import('./models/eventSchema.js');

//     if (stripeEvent.type === 'payment_intent.succeeded') {
//       const paymentIntent = stripeEvent.data.object;
//       try {
//         const order = await Order.findOne({ stripePaymentIntentId: paymentIntent.id });
//         if (order && order.paymentStatus !== 'succeeded') {
//           order.paymentStatus = 'succeeded';
//           await order.save();

//           const event = await Event.findById(order.event);
//           if (event) {
//             const ticketType = event.ticketTypes.find(t => t.name === order.ticketType);
//             if (ticketType) ticketType.sold += order.quantity;
//             if (order.promoCode) {
//               const promo = event.promoCodes.find(p => p.code === order.promoCode);
//               if (promo) promo.uses += 1;
//             }
//             await event.save();
//           }
//           console.log(`✅ Order ${order.confirmationCode} confirmed.`);
//         }
//       } catch (err) {
//         console.error('Webhook processing error:', err);
//       }
//     }

//     if (stripeEvent.type === 'payment_intent.payment_failed') {
//       const paymentIntent = stripeEvent.data.object;
//       try {
//         await Order.findOneAndUpdate(
//           { stripePaymentIntentId: paymentIntent.id },
//           { paymentStatus: 'failed' }
//         );
//       } catch (err) {
//         console.error('Failed to update failed payment order:', err);
//       }
//     }

//     res.json({ received: true });
//   }
// );

// // -------------------------------------------------------
// // Standard Middlewares
// // -------------------------------------------------------
// app.use(express.json());
// app.use('/uploads', express.static(uploadDir));

// // -------------------------------------------------------
// // Routes
// // -------------------------------------------------------
// app.use("/api", systemRoutes);
// app.use("/api/membership", membershipRoutes);
// app.use('/api/auth', authRoutes);
// app.use('/api/events', eventRoutes);
// app.use('/api/partnerships', partnershipRoutes);
// app.use('/api/contact', contactRoutes);
// app.use('/api/travel', travelRoutes);

// // Admin/Protected
// app.use('/api/admin', protect, restrictTo('admin'), adminRoutes);

// // -------------------------------------------------------
// // Global Error Handler — MUST be last
// // -------------------------------------------------------
// app.use(globalErr);

// // -------------------------------------------------------
// // Listener
// // -------------------------------------------------------
// /**
//  * RAILWAY FIX: Listen on 0.0.0.0
//  * This is mandatory for Docker/Railway to route traffic to your app.
//  */
// app.listen(PORT, '0.0.0.0', () => {
//     console.log(`🚀 GFC Server running on PORT: ${PORT}`);
//     console.log(`📅 System Date: ${new Date().toLocaleDateString()}`);
//     console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);
// });

// // 1. Core Config & Environment — MUST BE FIRST
// import dotenv from "dotenv";
// dotenv.config(); 

// import express from "express";
// import cors from "cors";
// import path from 'path';
// import fs from 'fs';
// import Stripe from 'stripe';

// // 2. Middleware & DB Imports
// import { logReq, globalErr } from "./middleware/middleware.js";
// import { protect, restrictTo } from "./middleware/authMiddleware.js";
// import connectDB from "./db/conn.js";

// // 3. Route Imports
// import systemRoutes from "./routes/systemRoutes.js";
// import membershipRoutes from "./routes/membershipRoutes.js";
// import authRoutes from './routes/authRoutes.js';
// import adminRoutes from './routes/adminRoutes.js';
// import eventRoutes from './routes/eventRoutes.js';
// import partnershipRoutes from './routes/partnershipRoutes.js';
// import contactRoutes from './routes/contactRoutes.js';
// import travelRoutes from './routes/travelRoutes.js';

// // -------------------------------------------------------
// // Initialization & Debugging
// // -------------------------------------------------------
// const app = express();

// // These logs will tell us if Railway is actually reading your variables
// console.log("🛠️  BOOTING UP GROWN FOLKS COLLECTIVE...");
// console.log("📡 TARGET PORT:", process.env.PORT);
// console.log("📦 NODE_ENV:", process.env.NODE_ENV);
// console.log("🔑 MONGO URI PRESENT:", !!process.env.MONGODB_URI);

// /** * RAILWAY FIX: Use process.env.PORT provided by Railway.
//  */
// const PORT = process.env.PORT || 3001;

// // Initialize Stripe Safely
// const stripe = process.env.STRIPE_SECRET_KEY 
//     ? new Stripe(process.env.STRIPE_SECRET_KEY) 
//     : null;

// if (!stripe) {
//     console.warn("⚠️ WARNING: STRIPE_SECRET_KEY is missing. Stripe features will fail.");
// }

// // TEMPORARY TEST: Start the server BEFORE the DB to bypass the 502 hang
// app.listen(PORT, '0.0.0.0', () => {
//     console.log(`🚀 Emergency Start on PORT: ${PORT}`);
//     connectDB().catch(err => console.error("DB Still Failing:", err));
// });

// // Connect to Database with error catching to prevent server hang
// connectDB().catch(err => {
//     console.error("❌ DATABASE CONNECTION FAILED:", err.message);
// });

// // Folder Safety Check for image uploads
// const uploadDir = path.join(process.cwd(), 'uploads');
// if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true });
//     console.log("Created missing 'uploads' directory");
// }

// // -------------------------------------------------------
// // Initial Middlewares
// // -------------------------------------------------------
// app.use(logReq); 

// app.use(cors({
//     origin: [
//       'http://localhost:5173',
//       'http://localhost:3000',
//       'http://localhost:3001',
//       'https://www.grownfolkscollective.com',
//       'https://grownfolkscollective.com',
//       'https://capstonebackend-production-78e3.up.railway.app', 
//       process.env.FRONTEND_URL,
//     ].filter(Boolean),
//     credentials: true
// }));

// /**
//  * RAILWAY FIX: Health Check Route
//  * Railway pings "/" to see if the server is alive. 
//  */
// app.get('/', (req, res) => {
//     res.status(200).send('🚀 GFC API is live and healthy!');
// });

// // -------------------------------------------------------
// // STRIPE WEBHOOK — must be BEFORE express.json()
// // -------------------------------------------------------
// app.post(
//   '/api/webhooks/stripe',
//   express.raw({ type: 'application/json' }),
//   async (req, res) => {
//     const sig = req.headers['stripe-signature'];
//     let stripeEvent;

//     if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
//         console.error("Webhook failed: Stripe or Webhook Secret is missing.");
//         return res.status(500).send("Server configuration error.");
//     }

//     try {
//       stripeEvent = stripe.webhooks.constructEvent(
//         req.body,
//         sig,
//         process.env.STRIPE_WEBHOOK_SECRET
//       );
//     } catch (err) {
//       console.error('Stripe webhook signature failed:', err.message);
//       return res.status(400).send(`Webhook Error: ${err.message}`);
//     }

//     // Dynamic imports for models
//     const { default: Order } = await import('./models/orderSchema.js');
//     const { default: Event } = await import('./models/eventSchema.js');

//     if (stripeEvent.type === 'payment_intent.succeeded') {
//       const paymentIntent = stripeEvent.data.object;
//       try {
//         const order = await Order.findOne({ stripePaymentIntentId: paymentIntent.id });
//         if (order && order.paymentStatus !== 'succeeded') {
//           order.paymentStatus = 'succeeded';
//           await order.save();

//           const event = await Event.findById(order.event);
//           if (event) {
//             const ticketType = event.ticketTypes.find(t => t.name === order.ticketType);
//             if (ticketType) ticketType.sold += order.quantity;
//             if (order.promoCode) {
//               const promo = event.promoCodes.find(p => p.code === order.promoCode);
//               if (promo) promo.uses += 1;
//             }
//             await event.save();
//           }
//           console.log(`✅ Order ${order.confirmationCode} confirmed.`);
//         }
//       } catch (err) {
//         console.error('Webhook processing error:', err);
//       }
//     }

//     if (stripeEvent.type === 'payment_intent.payment_failed') {
//       const paymentIntent = stripeEvent.data.object;
//       try {
//         await Order.findOneAndUpdate(
//           { stripePaymentIntentId: paymentIntent.id },
//           { paymentStatus: 'failed' }
//         );
//       } catch (err) {
//         console.error('Failed to update failed payment order:', err);
//       }
//     }

//     res.json({ received: true });
//   }
// );

// // -------------------------------------------------------
// // Standard Middlewares
// // -------------------------------------------------------
// app.use(express.json());
// app.use('/uploads', express.static(uploadDir));

// // -------------------------------------------------------
// // Routes
// // -------------------------------------------------------
// app.use("/api", systemRoutes);
// app.use("/api/membership", membershipRoutes);
// app.use('/api/auth', authRoutes);
// app.use('/api/events', eventRoutes);
// app.use('/api/partnerships', partnershipRoutes);
// app.use('/api/contact', contactRoutes);
// app.use('/api/travel', travelRoutes);

// // Admin/Protected
// app.use('/api/admin', protect, restrictTo('admin'), adminRoutes);

// // -------------------------------------------------------
// // Global Error Handler — MUST be last
// // -------------------------------------------------------
// app.use(globalErr);

// // -------------------------------------------------------
// // Listener
// // -------------------------------------------------------
// /**
//  * RAILWAY FIX: Bind to '0.0.0.0'.
//  */
// // app.listen(PORT, '0.0.0.0', () => {
// //     console.log(`🚀 GFC Server running on PORT: ${PORT}`);
// //     console.log(`📅 System Date: ${new Date().toLocaleDateString()}`);
// });
// 1. Core Config & Environment — MUST BE FIRST
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Stripe from "stripe";

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
// 8. API Routes (Brought Forward to Intercept Before Static Files)
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
// 9. Serve Frontend Static Built Assets (Fallback Layer)
// -------------------------------------------------------
app.use(express.static(join(__dirname, "../frontend/dist"))); 

// -------------------------------------------------------
// 10. FRONTEND SPA CATCH-ALL ROUTE (Fixes 405/404 on Refresh)
// -------------------------------------------------------
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "../frontend/dist/index.html"));
});

// -------------------------------------------------------
// 11. Final Catch & Start
// -------------------------------------------------------
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  next(err);
});

app.use(globalErr);

// -------------------------------------------------------
// 12. Optimized Startup Pipeline (Fixes Railway Healthchecks)
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
      // We don't call process.exit(1) here so the app remains up to stream logs back to you
    }
  });
};

// Execute the start
startServer();