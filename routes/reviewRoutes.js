import express from "express";
import mongoose from "mongoose";
import { Resend } from "resend";
import Review from "../models/reviewSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

const router = express.Router();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const TEAM_EMAIL = "events@grownfolkscollective.com";
const SOURCES = ["website", "google", "eventbrite", "meetup", "other"];
const STATUSES = ["pending", "approved", "hidden"];

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const toRating = (value) => Math.min(5, Math.max(1, Math.round(Number(value) || 5)));
const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// What the public site is allowed to see (no emails)
const publicFields = "name event rating text source featured createdAt";

/* -------------------------------------------------------
   GET /api/reviews  — Public
   Approved reviews for the home page, featured first.
------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 6));
    const reviews = await Review.find({ status: "approved" })
      .sort({ featured: -1, createdAt: -1 })
      .limit(limit)
      .select(publicFields)
      .lean();
    res.json(reviews);
  } catch (err) {
    console.error("Review list error:", err);
    res.status(500).json({ error: "Could not load reviews." });
  }
});

/* -------------------------------------------------------
   POST /api/reviews  — Public (home page form)
   Saves as pending. Nothing shows on the site until approved.
------------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    // Hidden field only bots fill in
    if (req.body.website) return res.status(201).json({ ok: true });

    const name = clean(req.body.name, 60);
    const text = clean(req.body.text, 1500);
    const email = clean(req.body.email, 120).toLowerCase();
    const event = clean(req.body.event, 80);

    if (!name || text.length < 10) {
      return res
        .status(400)
        .json({ error: "Please add your name and a few words about your experience." });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "That email doesn't look right." });
    }

    const review = await Review.create({
      name,
      email,
      event,
      text,
      rating: toRating(req.body.rating),
      canShare: req.body.canShare !== false,
      source: "website",
      status: "pending",
    });

    if (resend) {
      resend.emails
        .send({
          from: "Grown Folks Collective <events@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          subject: `⭐ New review from ${name} (${review.rating}/5): waiting for approval`,
          html: `
            <div style="font-family:Arial,sans-serif;color:#002147;max-width:560px">
              <h2 style="margin:0 0 8px">New review to approve</h2>
              <p style="margin:0 0 4px"><strong>${escapeHtml(name)}</strong>${
                event ? ` · ${escapeHtml(event)}` : ""
              } · ${"★".repeat(review.rating)}</p>
              <p style="margin:0 0 16px;color:#666">${
                review.canShare ? "OK to share on the website" : "Asked NOT to be shared publicly"
              }</p>
              <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #C5A059;background:#F4F1EA;white-space:pre-line">${escapeHtml(
                text
              )}</blockquote>
              <p style="margin:16px 0 0">Approve it in the admin dashboard, Reviews tab.</p>
            </div>`,
        })
        .catch((err) => console.error("Review email error:", err));
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Review submit error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* =======================================================
   ADMIN  — /api/reviews/admin/...
======================================================= */
const admin = [protect, restrictTo("admin")];

// GET /api/reviews/admin  — every review, newest first
router.get("/admin", admin, async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }).lean();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: "Could not load reviews." });
  }
});

// POST /api/reviews/admin  — paste in a review from Google, Eventbrite, etc.
router.post("/admin", admin, async (req, res) => {
  try {
    const name = clean(req.body.name, 60);
    const text = clean(req.body.text, 1500);
    if (!name || !text) {
      return res.status(400).json({ error: "Name and review text are required." });
    }
    const review = await Review.create({
      name,
      text,
      event: clean(req.body.event, 80),
      rating: toRating(req.body.rating),
      source: SOURCES.includes(req.body.source) ? req.body.source : "other",
      status: STATUSES.includes(req.body.status) ? req.body.status : "approved",
      featured: !!req.body.featured,
    });
    if (review.featured) {
      await Review.updateMany({ _id: { $ne: review._id } }, { featured: false });
    }
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: "Could not save the review." });
  }
});

// PATCH /api/reviews/admin/:id  — approve, hide, feature, or fix a typo
router.patch("/admin/:id", admin, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Review not found." });

    const updates = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) {
        return res.status(400).json({ error: "Unknown status." });
      }
      updates.status = req.body.status;
    }
    if (req.body.featured !== undefined) updates.featured = !!req.body.featured;
    if (req.body.name !== undefined) updates.name = clean(req.body.name, 60);
    if (req.body.event !== undefined) updates.event = clean(req.body.event, 80);
    if (req.body.text !== undefined) updates.text = clean(req.body.text, 1500);
    if (req.body.rating !== undefined) updates.rating = toRating(req.body.rating);
    if (req.body.source !== undefined && SOURCES.includes(req.body.source)) {
      updates.source = req.body.source;
    }

    // Featuring a review also approves it
    if (updates.featured) updates.status = "approved";
    // Hiding a review un-features it
    if (updates.status && updates.status !== "approved") updates.featured = false;

    const review = await Review.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!review) return res.status(404).json({ error: "Review not found." });

    // Only one featured review at a time
    if (updates.featured) {
      await Review.updateMany({ _id: { $ne: review._id } }, { featured: false });
    }
    res.json(review);
  } catch (err) {
    res.status(500).json({ error: "Could not update the review." });
  }
});

// DELETE /api/reviews/admin/:id
router.delete("/admin/:id", admin, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Review not found." });
    await Review.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Could not delete the review." });
  }
});

export default router;
