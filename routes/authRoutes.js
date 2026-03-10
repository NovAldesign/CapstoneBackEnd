import express from 'express';
import { loginLimiter } from '../utilities/security.js';
import Admin from '../models/adminSchema.js';
import Membership from '../models/membershipSchema.js';
import Partnership from '../models/partnershipSchema.js';

const router = express.Router();

router.post("/login", loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Search across all potential roles
        let user = await Admin.findOne({ email });
        let role = 'admin';

        if (!user) {
            user = await Membership.findOne({ email });
            role = 'member';
        }

        if (!user) {
            user = await Partnership.findOne({ email });
            role = 'partner';
        }

        // 2. If no user found in any collection
        if (!user) {
            return res.status(401).json({ error: "No account found with this email." });
        }

        // 3. Verify Password using the method defined in your schemas
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid password. Please try again." });
        }

        // 4. Send back the essential info (exclude the password!)
        res.json({
            message: "Success",
            role,
            id: user._id,
            name: user.firstName || user.name || "Member",
            tier: user.tier || null 
        });

    } catch (err) {
        console.error("Auth Error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;