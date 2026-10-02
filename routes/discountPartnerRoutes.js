import express from "express";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import DiscountPartner from "../models/discountPartnerSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const TEAM_EMAIL = "partners@grownfolkscollective.com";

const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

const LABELS = {
  where: { "in-store": "In person", online: "Online", both: "In person and online" },
  offerType: { percent: "Percent off", dollar: "Dollar amount off", freebie: "Free item or add-on", other: "Other" },
  redeem: {
    "show-membership": "Show their GFC membership",
    "promo-code": "Promo code",
    mention: "Mention Grown Folks Collective",
    other: "Other",
  },
};

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many submissions from this device. Please try again later." },
});

/* -------------------------------------------------------
   POST /api/discount-partners  — Public (/partnerships page)
------------------------------------------------------- */
router.post("/", submitLimiter, async (req, res) => {
  try {
    if (req.body.website2) return res.status(201).json({ ok: true }); // bots

    const b = req.body;
    const data = {
      businessName: clean(b.businessName, 120),
      contactName: clean(b.contactName, 80),
      email: clean(b.email, 120).toLowerCase(),
      phone: clean(b.phone, 30),
      website: clean(b.website, 200),
      category: clean(b.category, 60),
      where: pick(b.where, ["in-store", "online", "both"], "in-store"),
      address: clean(b.address, 200),
      offerType: pick(b.offerType, ["percent", "dollar", "freebie", "other"], "percent"),
      offer: clean(b.offer, 160),
      redeem: pick(b.redeem, ["show-membership", "promo-code", "mention", "other"], "show-membership"),
      promoCode: clean(b.promoCode, 40),
      finePrint: clean(b.finePrint, 1000),
      startDate: toDate(b.startDate),
      endDate: toDate(b.endDate),
      agreed: b.agreed === true,
      agreedAt: b.agreed === true ? new Date() : null,
      source: clean(b.source, 60),
    };

    if (!data.businessName || !data.contactName || !data.offer) {
      return res.status(400).json({ error: "Please add your business name, your name, and the discount." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return res.status(400).json({ error: "Please add a valid email." });
    }
    if (data.where !== "online" && !data.address) {
      return res.status(400).json({ error: "Please add the address where members can use the discount." });
    }
    if (data.redeem === "promo-code" && !data.promoCode) {
      return res.status(400).json({ error: "Please add the promo code members should use." });
    }
    if (!data.agreed) {
      return res.status(400).json({ error: "Please confirm you can offer and honor this discount." });
    }

    const partner = await DiscountPartner.create(data);

    if (resend) {
      const row = (label, value) =>
        value
          ? `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">${label}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`
          : "";
      const dates = `${data.startDate ? fmtDate(data.startDate) : "Right away"} → ${data.endDate ? fmtDate(data.endDate) : "Ongoing"}`;

      resend.emails
        .send({
          from: "GFC Member Perks <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          reply_to: data.email,
          subject: `New Member Perk: ${data.businessName} (${data.offer})`,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#002147;max-width:640px;">
            <h2 style="border-bottom:2px solid #C5A059;padding-bottom:10px;">New Member Perk Submission</h2>
            <table style="border-collapse:collapse;font-size:15px;">
              ${row("Business", data.businessName)}
              ${row("Contact", data.contactName)}
              ${row("Email", data.email)}
              ${row("Phone", data.phone)}
              ${row("Website / IG", data.website)}
              ${row("Category", data.category)}
              ${row("Where", LABELS.where[data.where])}
              ${row("Address", data.address)}
              ${row("Discount", `${data.offer} (${LABELS.offerType[data.offerType]})`)}
              ${row("How to redeem", LABELS.redeem[data.redeem])}
              ${row("Promo code", data.promoCode)}
              ${row("Dates", dates)}
              ${row("Fine print", data.finePrint)}
            </table>
            <p style="color:#666;font-size:13px;margin-top:20px;">Status: pending. Reply to this email to reach ${escapeHtml(data.contactName)} directly.</p>
          </div>`,
        })
        .catch((err) => console.error("Member perk team email error:", err));

      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: data.email,
          reply_to: TEAM_EMAIL,
          subject: "We got your Member Perk, thank you!",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:600px;">
            <p>Hi ${escapeHtml(data.contactName)},</p>
            <p>Thank you for offering <strong>${escapeHtml(data.offer)}</strong> at <strong>${escapeHtml(data.businessName)}</strong> to Grown Folks™ Collective members!</p>
            <p><strong>What happens next:</strong></p>
            <ol>
              <li>We'll review your offer within 3 business days.</li>
              <li>We'll confirm the details with you before anything goes live.</li>
              <li>Once approved, your business is added to our Member Perks list and featured in our newsletter and on our socials.</li>
            </ol>
            <p>Need to change something? Just reply to this email.</p>
            <p>Warmly,<br/>La'Von "Vaughn" Williams<br/>Founder &amp; Chief Playmaker, Grown Folks™ Collective<br/>470-256-7729 · partners@grownfolkscollective.com</p>
          </div>`,
        })
        .catch((err) => console.error("Member perk confirmation email error:", err));
    }

    res.status(201).json({ ok: true, id: partner._id });
  } catch (err) {
    console.error("Member perk submission error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   GET /api/discount-partners  — Public: approved, current perks
   (for the member dashboard / perks list)
------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const now = new Date();
    const perks = await DiscountPartner.find({
      status: "approved",
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .sort({ businessName: 1 })
      .select("businessName website category where address offerType offer redeem finePrint endDate")
      .lean();
    res.json(perks);
  } catch (err) {
    console.error("Member perks list error:", err);
    res.status(500).json({ error: "Couldn't load member perks." });
  }
});

/* -------------------------------------------------------
   Admin
------------------------------------------------------- */
router.get("/admin", protect, restrictTo("admin"), async (req, res) => {
  try {
    const all = await DiscountPartner.find().sort({ createdAt: -1 }).lean();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: "Couldn't load submissions." });
  }
});

router.patch("/admin/:id", protect, restrictTo("admin"), async (req, res) => {
  try {
    const update = {};
    if (req.body.status) update.status = pick(req.body.status, ["pending", "approved", "paused", "declined"], "pending");
    if (req.body.notes !== undefined) update.notes = clean(req.body.notes, 2000);
    const doc = await DiscountPartner.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: "Not found." });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: "Couldn't update." });
  }
});

export default router;
