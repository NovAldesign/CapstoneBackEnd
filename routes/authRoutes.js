import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import { loginLimiter } from '../utilities/security.js';
import Admin from '../models/adminSchema.js';
import Membership from '../models/membershipSchema.js';
import Partnership from '../models/partnershipSchema.js';

const router = express.Router();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SITE_URL = process.env.FRONTEND_URL || 'https://www.grownfolkscollective.com';
const RESET_MINUTES = 30;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Max 5 reset emails per hour from one device
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset requests. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

/* -------------------------------------------------------
   POST /api/auth/forgot-password  — Public
   Body: { email }
   Emails an admin a one-time link to set a new password.
   Always gives the same answer, so nobody can use this to
   find out which emails have accounts.
------------------------------------------------------- */
router.post('/forgot-password', resetLimiter, async (req, res) => {
  const generic = {
    message: "If that email belongs to an admin account, a reset link is on its way. It works for 30 minutes.",
  };
  try {
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
    if (!email) return res.status(400).json({ error: 'Please enter your email.' });

    const admin = await Admin.findOne({
      email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' },
    });
    if (!admin || admin.status === 'inactive') return res.json(generic);

    const token = crypto.randomBytes(32).toString('hex');
    admin.resetTokenHash = hashToken(token);
    admin.resetTokenExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
    admin.lastAction = 'Password reset requested';
    await admin.save({ validateBeforeSave: false });

    const link = `${SITE_URL}/reset-password/${token}`;
    if (resend) {
      await resend.emails.send({
        from: 'Grown Folks Collective <events@grownfolkscollective.com>',
        to: admin.email,
        subject: 'Reset your Grown Folks Collective admin password',
        html: `
          <div style="font-family:Arial,sans-serif;color:#002147;max-width:520px">
            <h2 style="margin:0 0 12px">Reset your password</h2>
            <p>Someone (hopefully you) asked to reset the admin password for this account.</p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#C5A059;color:#002147;padding:12px 22px;text-decoration:none;font-weight:bold">Set a new password</a>
            </p>
            <p style="color:#666;font-size:13px">This link works once and expires in ${RESET_MINUTES} minutes. If you didn't ask for this, you can ignore this email and your password stays the same.</p>
          </div>`,
      });
    } else {
      console.error('Password reset: RESEND_API_KEY is missing, email not sent.');
    }

    res.json(generic);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/* -------------------------------------------------------
   POST /api/auth/reset-password/:token  — Public
   Body: { password }
------------------------------------------------------- */
router.post('/reset-password/:token', resetLimiter, async (req, res) => {
  try {
    const admin = await Admin.findOne({
      resetTokenHash: hashToken(String(req.params.token || '')),
      resetTokenExpires: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpires');

    if (!admin) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const password = String(req.body.password || '');
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!strong.test(password)) {
      return res.status(400).json({
        error: 'Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and one of these: @ $ ! % * ? &',
      });
    }

    admin.password = password; // hashed by the model before saving
    admin.resetTokenHash = undefined;
    admin.resetTokenExpires = undefined;
    admin.lastAction = 'Password reset';
    await admin.save({ validateBeforeSave: false });

    res.json({ message: 'Your password has been updated. Taking you to the login page…' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;