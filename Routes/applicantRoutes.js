import express from "express";
import Applicant from "../models/applicantSchema.js";
import Admin from "../models/adminSchema.js";
import Partnership from "../models/partnershipSchema.js"; 
import { applicantData, adminData, partnershipData } from "../utilities/data.js";

const router = express.Router();

// --- SEED ROUTE ---
router.get("/seed-all", async (req, res, next) => {
    try {
        await Applicant.deleteMany({});
        await Admin.deleteMany({});
        await Partnership.deleteMany({});

        await Applicant.insertMany(applicantData);
        await Admin.insertMany(adminData);
        await Partnership.insertMany(partnershipData);

        res.status(201).json({
            message: "GFC Database fully seeded!",
            counts: {
                applicants: applicantData.length,
                admin: adminData.length,
                partnerships: partnershipData.length
            }
        });
    } catch (err) { next(err); }
});

// --- APPLICANT ROUTES (Members) ---
router.route("/applicants")
    .post(async (req, res, next) => {
        try {
            // Logic: Default status is 'pending' for new professional applicants
            let newApplicant = await Applicant.create(req.body);
            res.status(201).json(newApplicant);
        } catch (err) { next(err); }
    })
    .get(async (req, res, next) => {
        try {
            let allApplicants = await Applicant.find({});
            res.json(allApplicants);
        } catch (err) { next(err); }
    });

// --- ADMIN ROUTES ---
router.route("/admin")
    .post(async (req, res, next) => {
        try {
            // Logic: Create new Admin/Moderator with secure accessKey
            let newAdmin = await Admin.create(req.body);
            res.status(201).json(newAdmin);
        } catch (err) { next(err); }
    })
    .get(async (req, res, next) => {
        try {
            // Sorted by most recent login/action
            const admin = await Admin.find().sort({ updatedAt: -1 });
            res.json(admin);
        } catch (err) { next(err); }
    });

// --- PARTNERSHIPS ROUTES ---
router.route("/partnerships")
    .post(async (req, res, next) => {
        try {
            // Purposeful logic: New requests must be missionAligned: true
            let newPartnership = await Partnership.create(req.body);
            res.status(201).json(newPartnership);
        } catch (err) { next(err); }
    })
    .get(async (req, res, next) => {
        try {
            // Logic: Fetch all partnership requests for Admin review
            const allPartnerships = await Partnership.find({});
            res.json(allPartnerships);
        } catch (err) { next(err); }
    });

// --- INDIVIDUAL PARTNERSHIP UPDATE ---
router.route("/partnerships/:id")
    .put(async (req, res, next) => {
        try {
            let updatedPartnership = await Partnership.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            );
            res.json(updatedPartnership);
        } catch (err) { next(err); }
    });

// --- INDIVIDUAL APPLICANT CRUD ---
router.route("/applicants/:id")
    .put(async (req, res, next) => {
        try {
            let updatedApplicant = await Applicant.findByIdAndUpdate(
                req.params.id,
                req.body,
                { new: true, runValidators: true }
            );
            if (!updatedApplicant) return res.status(404).json({ error: "Member Not Found" });
            res.json(updatedApplicant);
        } catch (err) { next(err); }
    })
    .delete(async (req, res, next) => {
        try {
            let deletedApplicant = await Applicant.findByIdAndDelete(req.params.id);
            if (!deletedApplicant) return res.status(404).json({ error: "Member Not Found" });
            res.json({ message: "Member removed from collective", deletedApplicant });
        } catch (err) { next(err); }
    });

// --- FILTERED INDUSTRY ROUTE ---
router.get("/applicants/industry/:id", async (req, res, next) => {
    try {
        let currentMember = await Applicant.findById(req.params.id);
        if (!currentMember) return res.status(404).json({ error: "Member Not Found" });

        const othersInIndustry = await Applicant.find({
            industry: currentMember.industry,
            _id: { $ne: currentMember._id }
        });

        res.json({
            industry: currentMember.industry,
            count: othersInIndustry.length,
            members: othersInIndustry
        });
    } catch (err) { next(err); }
});

export default router;