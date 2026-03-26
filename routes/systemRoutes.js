import express from "express";
import Stripe from 'stripe';
import Membership from "../models/membershipSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js";
import { membershipData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * --- SYSTEM STATUS ---
 * URL: GET /api/status
 */
router.get("/status", async (req, res) => {
    try {
        const memberCount = await Membership.countDocuments();
        const adminCount = await Admin.countDocuments();
        const partnerCount = await Partnership.countDocuments();

        res.status(200).json({
            status: "Online",
            database: "Connected",
            counts: {
                memberships: memberCount,
                admins: adminCount,
                partnerships: partnerCount
            },
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: `Status Check Failed: ${err.message}` });
    }
});

/**
 * --- STRIPE CONNECTIVITY CHECK ---
 * URL: GET /api/stripe-check
 * Verifies if the Secret Key is valid by creating a test PaymentIntent
 */
router.get("/stripe-check", async (req, res) => {
    try {
        // Create a dummy $1.00 payment intent to verify the key
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 100, 
            currency: 'usd',
            payment_method_types: ['card'],
            description: 'GFC System Health Check',
        });

        res.status(200).json({ 
            status: "Stripe API is reachable", 
            mode: process.env.STRIPE_SECRET_KEY.startsWith('sk_test') ? "Test Mode" : "Live Mode",
            testIntentId: paymentIntent.id 
        });
    } catch (err) {
        res.status(500).json({ error: `Stripe connection failed: ${err.message}` });
    }
});

/**
 * --- SYSTEM SEEDING ---
 * URL: GET /api/seed-all
 */
router.get("/seed-all", async (req, res, next) => {
    try {
        console.log("🌱 System-wide seeding initiated...");

        await Membership.deleteMany({});
        await Admin.deleteMany({});
        await Partnership.deleteMany({});

        await Membership.insertMany(membershipData);
        
        for (const p of partnershipData) {
            await new Partnership(p).save();
        }

        for (const a of adminData) {
            await new Admin(a).save();
        }

        console.log("✅ GFC Database fully seeded!");
        res.status(201).json({ 
            message: "GFC Database fully seeded at /api/seed-all",
            count: membershipData.length 
        });
    } catch (err) {
        res.status(500).json({ error: `Seeding Failed: ${err.message}` });
    }
});

export default router;