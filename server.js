// Imports
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';

// Middleware & DB
import { logReq, globalErr } from "./middleware/middleware.js";
import { protect, restrictTo } from "./middleware/authMiddleware.js";
import connectDB from "./db/conn.js";

// Routes
import systemRoutes from "./routes/systemRoutes.js";
import membershipRoutes from "./routes/membershipRoutes.js";
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import partnershipRoutes from './routes/partnershipRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import travelRoutes from './routes/travelRoutes.js';

// -------------------------------------------------------
// Setups & Environment
// -------------------------------------------------------
dotenv.config(); // Must be called before accessing process.env

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Stripe Safely to prevent crash if key is missing
const stripe = process.env.STRIPE_SECRET_KEY 
    ? new Stripe(process.env.STRIPE_SECRET_KEY) 
    : null;

if (!stripe) {
    console.warn("⚠️ WARNING: STRIPE_SECRET_KEY is missing. Stripe features will fail.");
}

connectDB();

// --- Folder Safety Check ---
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("Created missing 'uploads' directory");
}

// -------------------------------------------------------
// Initial Middlewares
// -------------------------------------------------------
// 1. Logger first so we see every incoming request
app.use(logReq);

// 2. CORS Configuration
app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://www.grownfolkscollective.com',
      'https://grownfolkscollective.com',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true
}));

// -------------------------------------------------------
// STRIPE WEBHOOK — must be BEFORE express.json()
// -------------------------------------------------------
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let stripeEvent;

    if (!stripe) return res.status(500).send("Stripe not initialized");

    try {
      stripeEvent = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Stripe webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Dynamic imports to handle circular dependencies
    const { default: Order } = await import('./models/orderSchema.js');
    const { default: Event } = await import('./models/eventSchema.js');

    if (stripeEvent.type === 'payment_intent.succeeded') {
      const paymentIntent = stripeEvent.data.object;

      try {
        const order = await Order.findOne({ stripePaymentIntentId: paymentIntent.id });

        if (order && order.paymentStatus !== 'succeeded') {
          order.paymentStatus = 'succeeded';
          await order.save();

          const event = await Event.findById(order.event);
          if (event) {
            const ticketType = event.ticketTypes.find(t => t.name === order.ticketType);
            if (ticketType) ticketType.sold += order.quantity;
            
            if (order.promoCode) {
              const promo = event.promoCodes.find(p => p.code === order.promoCode);
              if (promo) promo.uses += 1;
            }
            await event.save();
          }
          console.log(`✅ Order ${order.confirmationCode} confirmed.`);
        }
      } catch (err) {
        console.error('Webhook processing error:', err);
      }
    }

    if (stripeEvent.type === 'payment_intent.payment_failed') {
      const paymentIntent = stripeEvent.data.object;
      try {
        const { default: Order } = await import('./models/orderSchema.js');
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: paymentIntent.id },
          { paymentStatus: 'failed' }
        );
      } catch (err) {
        console.error('Failed to update failed payment order:', err);
      }
    }

    res.json({ received: true });
  }
);

// -------------------------------------------------------
// Remaining Standard Middlewares
// -------------------------------------------------------
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// -------------------------------------------------------
// Routes
// -------------------------------------------------------
app.use("/api", systemRoutes);
app.use("/api/membership", membershipRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/partnerships', partnershipRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/travel', travelRoutes);

// Protected routes
app.use('/api/admin', protect, restrictTo('admin'), adminRoutes);

// -------------------------------------------------------
// Global Error Handler — MUST be last
// -------------------------------------------------------
app.use(globalErr);

// -------------------------------------------------------
// Listener
// -------------------------------------------------------
app.listen(PORT, () => {
    console.log(`🚀 GFC Server running on PORT: ${PORT}`);
    console.log(`📅 System Date: ${new Date().toLocaleDateString()}`);
    console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);
});