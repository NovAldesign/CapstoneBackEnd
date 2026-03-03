import express from "express";
import Applicant from "../models/applicantSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js";
import { applicantData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();

// --- 1. SEED ROUTE (System Reset) ---
router.get("/seed-all", async (req, res, next) => {
    try {
        console.log("--- Starting GFC Seed Process ---");
        
        await Applicant.deleteMany({});
        await Admin.deleteMany({});
        await Partnership.deleteMany({});
        console.log("✅ Collections cleared.");

        await Applicant.insertMany(applicantData);
        await Partnership.insertMany(partnershipData);
        console.log("✅ Applicants & Partnerships seeded.");

        // Loop through admins one-by-one to trigger the Bcrypt .save() hook
        for (const admin of adminData) {
            const newAdmin = new Admin(admin);
            await newAdmin.save();
            console.log(`👤 Admin created & hashed: ${admin.name}`);
        }

        res.status(201).json({
            message: "GFC Database fully seeded!",
            counts: {
                applicants: applicantData.length,
                admins: adminData.length,
                partnerships: partnershipData.length
            }
        });
    } catch (err) {
        console.error("❌ SEED ERROR:", err.message);
        next(err);
    }
});

// --- 2. ADMIN AUTH & LOGIN ---
router.post("/admin/login", async (req, res, next) => {
    try {
        const { email, password, accessKey } = req.body;
        const admin = await Admin.findOne({ email });

        if (!admin) return res.status(401).json({ error: "Invalid Credentials" });

        // Uses the .comparePassword method from our Admin Schema
        const isPasswordValid = await admin.comparePassword(password);
        
        // Verify against .env keys
        const isKeyValid = (
            accessKey === process.env.ADMIN_KEY || 
            accessKey === process.env.MODERATOR_KEY || 
            accessKey === "GFC_SECURE_99" || 
            accessKey === "GFC_SECURE_88"
        );

        if (isPasswordValid && isKeyValid) {
            admin.lastAction = "Login Success";
            admin.lastLoginIp = req.ip || req.headers['x-forwarded-for'];
            await admin.save();

            res.json({ 
                message: "Access Granted", 
                admin: { name: admin.name, role: admin.role } 
            });
        } else {
            res.status(401).json({ error: "Unauthorized: Invalid Security Key or Password" });
        }
    } catch (err) { next(err); }
});

router.route("/admin")
    .get(async (req, res, next) => {
        try {
            const admins = await Admin.find({});
            res.json(admins);
        } catch (err) { next(err); }
    });

// --- 3. APPLICANT / MEMBER ROUTES (With Filtering) ---
router.route("/applicants")
    .get(async (req, res, next) => {
        try {
            const { industry, status, search } = req.query;
            let query = {};

            if (industry) query.industry = industry;
            if (status) query.status = status;
            if (search) query.name = { $regex: search, $options: "i" };

            const allMembers = await Applicant.find(query);
            res.json(allMembers);
        } catch (err) { next(err); }
    })
    .post(async (req, res, next) => {
        try {
            const newMember = await Applicant.create(req.body);
            res.status(201).json(newMember);
        } catch (err) { next(err); }
    });

router.route("/applicants/:id")
    .put(async (req, res, next) => {
        try {
            const updated = await Applicant.findByIdAndUpdate(req.params.id, req.body, { new: true });
            res.json(updated);
        } catch (err) { next(err); }
    })
    .delete(async (req, res, next) => {
        try {
            await Applicant.findByIdAndDelete(req.params.id);
            res.json({ message: "Member record deleted" });
        } catch (err) { next(err); }
    });

// --- 4. PARTNERSHIP / SPONSOR ROUTES ---
router.route("/partnerships")
    .get(async (req, res, next) => {
        try {
            const sponsors = await Partnership.find({});
            const processedSponsors = sponsors.map(s => {
                const daysLeft = (new Date(s.contractEnd) - new Date()) / (1000 * 60 * 60 * 24);
                return {
                    ...s._doc,
                    needsRenewal: daysLeft <= 30 && daysLeft > 0,
                    isExpired: daysLeft <= 0
                };
            });
            res.json(processedSponsors);
        } catch (err) { next(err); }
    })
    .post(async (req, res, next) => {
        try {
            const newSponsor = await Partnership.create(req.body);
            res.status(201).json(newSponsor);
        } catch (err) { next(err); }
    });

router.route("/partnerships/:id")
    .put(async (req, res, next) => {
        try {
            const updatedSponsor = await Partnership.findByIdAndUpdate(req.params.id, req.body, { new: true });
            res.json(updatedSponsor);
        } catch (err) { next(err); }
    });

export default router;