import express from 'express';
import jwt from 'jsonwebtoken';
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

        // 3. Verify Password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid password. Please try again." });
        }

        // 4. Issue JWT Token
        const token = jwt.sign(
            { id: user._id, role, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 5. Send back token + user info
        res.json({
            message: "Success",
            token,
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