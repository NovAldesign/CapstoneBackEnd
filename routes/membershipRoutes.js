import express from "express";
import Membership from "../models/membershipSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js";
import { membershipData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();

/**
 * --- 1. SYSTEM SEEDING ---
 * URL: GET /api/membership/seed-all
 */
router.get("/seed-all", async (req, res) => { 
    try {
        console.log("🌱 Seeding initiated...");

        // 1. Clear existing data
        await Membership.deleteMany({});
        await Admin.deleteMany({});
        await Partnership.deleteMany({});

        // 2. Seed Memberships 
        await Membership.insertMany(membershipData);
        
        // 3. Seed Partnerships 
        for (const p of partnershipData) {
            await new Partnership(p).save();
        }

        // 4. Seed Admins 
        for (const admin of adminData) {
            const newAdmin = new Admin(admin);
            await newAdmin.save();
        }

        console.log("✅ GFC Database fully seeded!");
        return res.status(201).json({ message: "GFC Database fully seeded!" });

    } catch (err) { 
        console.error("❌ Seeding Failed:", err.message);

        return res.status(500).json({ error: `Seeding Failed: ${err.message}` });
    }
});
/**
 * --- 2. ADMIN AUTH ---
 */
router.post("/admin/login", async (req, res) => {
    try {
        const { email, password, accessKey } = req.body;
        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(401).json({ error: "Invalid Credentials" });

        const isPasswordValid = await admin.comparePassword(password);
        const isKeyValid = [process.env.ADMIN_KEY, "GFC_EXEC_2026"].includes(accessKey);

        if (isPasswordValid && isKeyValid) {
            admin.lastAction = `Login: ${new Date().toLocaleString()}`;
            await admin.save();
            res.json({ message: "Access Granted", admin: { name: admin.name, role: admin.role } });
        } else {
            res.status(401).json({ error: "Unauthorized access attempt." });
        }
    } catch (err) { 
        res.status(500).json({ error: err.message });
    }
});

/**
 * --- 3. MEMBERSHIP CORE ROUTES ---
 */
router.route("/")
    .get(async (req, res) => {
        try {
            const { industry, status, search } = req.query;
            let query = {};
            if (industry) query.industry = industry;
            if (status) query.status = status;
            if (search) {
                query.$or = [
                    { firstName: { $regex: search, $options: "i" } },
                    { lastName: { $regex: search, $options: "i" } }
                ];
            }
            res.json(await Membership.find(query));
        } catch (err) { 
            res.status(500).json({ error: err.message });
        }
    })
    .post(async (req, res) => {
        try {
            const membership = new Membership(req.body);
            const saved = await membership.save();
            const member = saved.toObject();
            delete member.password; 
            res.status(201).json(member);
        } catch (err) { 
            // This is where we catch the Password validation error
            const statusCode = err.name === "ValidationError" ? 400 : 500;
            res.status(statusCode).json({ 
                error: `❌ ${err.name || 'Error'}: ${err.message}` 
            });
        }
    });

router.route("/:id")
    .put(async (req, res) => {
        try {
            const updated = await Membership.findByIdAndUpdate(
                req.params.id, 
                req.body, 
                { new: true, runValidators: true }
            );
            res.json(updated);
        } catch (err) { 
            res.status(400).json({ error: err.message });
        }
    })
    .delete(async (req, res) => {
        try {
            await Membership.findByIdAndDelete(req.params.id);
            res.json({ message: "Member record removed from GFC." });
        } catch (err) { 
            res.status(500).json({ error: err.message });
        }
    });

export default router;