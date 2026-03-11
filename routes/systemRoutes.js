// routes/systemRoutes.js
import express from "express";
import Membership from "../models/membershipSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js";
import { membershipData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();

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
        res.status(201).json({ message: "GFC Database fully seeded at /api/seed-all" });
    } catch (err) {
        res.status(500).json({ error: `Seeding Failed: ${err.message}` });
    }
});

export default router;