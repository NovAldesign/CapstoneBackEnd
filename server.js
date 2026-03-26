// Imports
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';
import { logReq, globalErr } from "./middleware/middleware.js";
import { protect, restrictTo } from "./middleware/authMiddleware.js";
import connectDB from "./db/conn.js";

// Models & Data
import Membership from "./models/membershipSchema.js";
import Admin from "./models/adminSchema.js";
import Partnership from "./models/partnershipSchema.js";
import Contact from "./models/contactSchema.js";
import { membershipData, adminData, partnershipData } from "./utilities/data.js";

// Routes
import systemRoutes from "./routes/systemRoutes.js";
import membershipRoutes from "./routes/membershipRoutes.js";
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import partnershipRoutes from './routes/partnershipRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import travelRoutes from './routes/travelRoutes.js';

// Setups
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
connectDB();

// --- Folder Safety Check ---
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true});
    console.log("Created missing 'uploads' directory");
}

// -------------------------------------------------------
// STRIPE WEBHOOK — must be registered BEFORE express.json()
// Stripe sends a raw Buffer body that express.json() would
// destroy. This route needs the raw bytes to verify the
// webhook signature.
// -------------------------------------------------------
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let stripeEvent;

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

    // Dynamically import Order and Event to avoid circular deps
    const { default: Order } = await import('./models/orderSchema.js');
    const { default: Event } = await import('./models/eventSchema.js');

    if (stripeEvent.type === 'payment_intent.succeeded') {
      const paymentIntent = stripeEvent.data.object;

      try {
        const order = await Order.findOne({
          stripePaymentIntentId: paymentIntent.id,
        });

        if (!order) {
          console.error('Order not found for payment intent:', paymentIntent.id);
          return res.json({ received: true });
        }

        // Idempotency guard — don't process twice
        if (order.paymentStatus === 'succeeded') {
          return res.json({ received: true });
        }

        order.paymentStatus = 'succeeded';
        await order.save();

        // Decrement ticket inventory
        const event = await Event.findById(order.event);
        if (event) {
          const ticketType = event.ticketTypes.find(
            (t) => t.name === order.ticketType
          );
          if (ticketType) {
            ticketType.sold += order.quantity;
          }

          // Increment promo code uses if applicable
          if (order.promoCode) {
            const promo = event.promoCodes.find(
              (p) => p.code === order.promoCode
            );
            if (promo) promo.uses += 1;
          }

          await event.save();
        }

        console.log(`Order ${order.confirmationCode} confirmed for ${order.buyerEmail}`);
        // TODO: add email confirmation here (SendGrid / Resend)

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
        console.log(`Payment failed for intent: ${paymentIntent.id}`);
      } catch (err) {
        console.error('Failed to update failed payment order:', err);
      }
    }

    res.json({ received: true });
  }
);

// -------------------------------------------------------
// Standard Middlewares — AFTER the Stripe webhook route
// -------------------------------------------------------
app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true
}));
app.use(express.json());
app.use(logReq);

// Serve uploads as static
app.use('/uploads', express.static(uploadDir));

// -------------------------------------------------------
// Routes
// -------------------------------------------------------

// 1. Root system
app.use("/api", systemRoutes);

// 2. Public routes
app.use("/api/membership", membershipRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/partnerships', partnershipRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/travel', travelRoutes);

// 3. Protected routes
app.use('/api/admin', protect, restrictTo('admin'), adminRoutes);

// -------------------------------------------------------
// Global Error Handler
// -------------------------------------------------------
app.use(globalErr);

// -------------------------------------------------------
// Listener
// -------------------------------------------------------
app.listen(PORT, () => {
    console.log(`GFC Server running on PORT: ${PORT}`);
    console.log(`System Date: ${new Date().toLocaleDateString()}`);
    console.log(`Connection Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Stripe mode: ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST'}`);
});