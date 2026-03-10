import express from "express";
import path from "path";
import Membership from "../models/membershipSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js";
import upload from "../utilities/upload.js"; 
import { membershipData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();

// --- 1. SEED ROUTE (System Reset) ---
router.get("/seed-all", async (req, res, next) => {
    try {
        await Membership.deleteMany({});
        await Admin.deleteMany({});
        await Partnership.deleteMany({});

        await Membership.insertMany(membershipData);
        
        for (const p of partnershipData) {
            const newPartner = new Partnership(p);
            await newPartner.save();
        }

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
        const isKeyValid = [process.env.ADMIN_KEY, "GFC_SECURE_99", "GFC_SECURE_88"].includes(accessKey);

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
router.route("/membership")
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
            res.json(await Membership.find(query));
        } catch (err) { next(err); }
    })
    .post(async (req, res, next) => {
        try {
            const membership = new Membership(req.body);
            const saved = await membership.save();
            const member = saved.toObject();
            delete member.password;
            res.status(201).json(member);
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

router.route("/membership/:id")
    .put(async (req, res, next) => {
        try {
            const updated = await Membership.findByIdAndUpdate(req.params.id, req.body, { new: true });
            res.json(updated);
        } catch (err) { next(err); }
    })
    .delete(async (req, res, next) => {
        try {
            await Membership.findByIdAndDelete(req.params.id);
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
            const partner = new Partnership(req.body);
            res.status(201).json(await partner.save());
        } catch (err) { res.status(400).json({ error: err.message }); }
    });

// --- 5. PARTNER DOCUMENT VAULT (Multer Upload) ---
router.post("/partnerships/:id/documents", upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded. Please select a document." });
        }

        const partner = await Partnership.findById(req.params.id);
        if (!partner) return res.status(404).json({ error: "Partner not found" });

        // Create the document entry
        const newDoc = {
            fileName: req.file.originalname,
            fileUrl: `/uploads/${req.file.filename}`
        };

        // Push to the documents array in the schema
        partner.documents.push(newDoc);
        await partner.save();

        res.status(200).json({ message: "File successfully added to vault", document: newDoc });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;