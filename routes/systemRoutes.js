import express from "express";
import Stripe from 'stripe';
import Membership from "../models/membershipSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js";
import { membershipData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();

// Initialize Stripe safely
const stripe = process.env.STRIPE_SECRET_KEY 
    ? new Stripe(process.env.STRIPE_SECRET_KEY) 
    : null;

/**
 * --- SYSTEM STATUS ---
 * URL: GET /api/status
 */
router.get("/status", async (req, res, next) => {
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
        next(err); // Passes to globalErr in middleware.js
    }
});

/**
 * --- STRIPE CONNECTIVITY CHECK ---
 * URL: GET /api/stripe-check
 */
router.get("/stripe-check", async (req, res, next) => {
    try {
        if (!stripe) {
            throw new Error("STRIPE_SECRET_KEY is missing from environment variables.");
        }

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
        next(err);
    }
});

/**
 * --- SYSTEM SEEDING ---
 * URL: GET /api/seed-all
 */
router.get("/seed-all", async (req, res, next) => {
    try {
        console.log("🌱 System-wide seeding initiated...");

        // Clear existing data
        await Promise.all([
            Membership.deleteMany({}),
            Admin.deleteMany({}),
            Partnership.deleteMany({})
        ]);

        // Insert new data
        await Membership.insertMany(membershipData);
        
        // Using Promise.all for faster execution on Railway
        await Promise.all([
            ...partnershipData.map(p => new Partnership(p).save()),
            ...adminData.map(a => new Admin(a).save())
        ]);

        console.log("✅ GFC Database fully seeded!");
        res.status(201).json({ 
            message: "GFC Database fully seeded",
            count: membershipData.length 
        });
    } catch (err) {
        next(err);
    }
});

export default router;