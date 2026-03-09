import express from "express";
import Applicant from "../models/applicantSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js";
import { applicantData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();

// --- 1. SEED ROUTE (System Reset) ---
router.get("/seed-all", async (req, res, next) => {
    try {
        await Applicant.deleteMany({});
        await Admin.deleteMany({});
        await Partnership.deleteMany({});

        await Applicant.insertMany(applicantData);
        await Partnership.insertMany(partnershipData);

        for (const admin of adminData) {
            const newAdmin = new Admin(admin);
            await newAdmin.save();
        }

        res.status(201).json({ message: "GFC Database fully seeded!" });
    } catch (err) { next(err); }
});

// --- 2. ADMIN AUTH & LOGIN ---
router.post("/admin/login", async (req, res, next) => {
    try {
        const { email, password, accessKey } = req.body;
        const admin = await Admin.findOne({ email });

        if (!admin) return res.status(401).json({ error: "Invalid Credentials" });

        const isPasswordValid = await admin.comparePassword(password);
        const isKeyValid = [process.env.ADMIN_KEY, process.env.MODERATOR_KEY, "GFC_SECURE_99", "GFC_SECURE_88"].includes(accessKey);

        if (isPasswordValid && isKeyValid) {
            admin.lastAction = "Login Success";
            await admin.save();
            res.json({ message: "Access Granted", admin: { name: admin.name, role: admin.role } });
        } else {
            res.status(401).json({ error: "Unauthorized" });
        }
    } catch (err) { next(err); }
});

// --- 3. APPLICANT / MEMBER ROUTES ---
router.route("/applicants")
    .get(async (req, res, next) => {
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
            res.json(await Applicant.find(query));
        } catch (err) { next(err); }
    })
    .post(async (req, res, next) => {
        try {
            // Using new + save to trigger Bcrypt and Regex validation
            const applicant = new Applicant(req.body);
            const saved = await applicant.save();
            const member = saved.toObject();
            delete member.password;
            res.status(201).json(member);
        } catch (err) { res.status(400).json({ error: err.message }); }
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
            res.json({ message: "Record deleted" });
        } catch (err) { next(err); }
    });

// --- 4. PARTNERSHIP / SPONSOR ROUTES ---
router.route("/partnerships")
    .get(async (req, res, next) => {
        try {
            const sponsors = await Partnership.find({});
            const processed = sponsors.map(s => {
                const daysLeft = (new Date(s.contractEnd) - new Date()) / (1000 * 60 * 60 * 24);
                return { ...s._doc, needsRenewal: daysLeft <= 30 && daysLeft > 0, isExpired: daysLeft <= 0 };
            });
            res.json(processed);
        } catch (err) { next(err); }
    })
    .post(async (req, res, next) => {
        try {
            res.status(201).json(await Partnership.create(req.body));
        } catch (err) { next(err); }
    });

export default router;