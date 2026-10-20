import express from "express";
import mongoose from "mongoose";
import { Resend } from "resend";
import Donation, { DONATION_KINDS, DONATION_EVENTS, DELIVERY } from "../models/donationSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

// ── In-kind donations: /api/donations ──
// POST /            — Public. Donation offer from the Partnerships page.
// GET  /admin       — Admin. Every offer, newest first.
// PATCH /admin/:id  — Admin. Status (new, accepted, received, declined) and notes.
const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const PARTNERS_EMAIL = "partners@grownfolkscollective.com";
const LOGO = "https://www.grownfolkscollective.com/email/gfc-logo.png";
const STATUSES = ["new", "accepted", "received", "declined"];

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const esc = (v = "") =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const pick = (list, allowed) => (Array.isArray(list) ? list : []).filter((x) => allowed.includes(x));

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    if (b.fax) return res.status(201).json({ ok: true }); // bot trap

    const contactName = clean(b.contactName, 100);
    const email = clean(b.email, 120).toLowerCase();
    const items = clean(b.items, 1500);
    const donorType = b.donorType === "individual" ? "individual" : "business";
    const companyName = clean(b.companyName, 150);

    if (!contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please add your name and a valid email." });
    }
    if (donorType === "business" && !companyName) {
      return res.status(400).json({ error: "Please add your business or brand name." });
    }
    if (items.length < 5) {
      return res.status(400).json({ error: "Please tell us what you'd like to donate." });
    }

    const website = clean(b.website, 300);
    const donation = await Donation.create({
      donorType,
      companyName,
      contactName,
      email,
      phone: clean(b.phone, 20),
      kinds: pick(b.kinds, DONATION_KINDS),
      items,
      quantity: clean(b.quantity, 200),
      events: pick(b.events, DONATION_EVENTS),
      delivery: DELIVERY.includes(b.delivery) ? b.delivery : "Let's talk",
      availableBy: clean(b.availableBy, 100),
      recognition: b.recognition !== false,
      instagram: clean(b.instagram, 80).replace(/^@/, ""),
      website: /^https?:\/\/\S+$/i.test(website) ? website : "",
      notes: clean(b.notes, 1000),
      source: clean(b.source, 120),
    });

    if (resend) {
      const who = donation.companyName || donation.contactName;
      const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:4px 0;">${v || "—"}</td></tr>`;
      resend.emails
        .send({
          from: "GFC Donations <noreply@grownfolkscollective.com>",
          to: PARTNERS_EMAIL,
          reply_to: email,
          subject: `🎁 Donation offer: ${who}`,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#002147;font-size:15px;line-height:1.6;max-width:640px;">
            <h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">New Donation Offer</h2>
            <p style="white-space:pre-line;background:#FAF7F0;border-left:4px solid #C5A059;padding:12px 14px;margin:0 0 14px;">${esc(items)}</p>
            <table style="font-size:14px;border-collapse:collapse;">
              ${row("From", esc([donation.companyName, donation.contactName].filter(Boolean).join(" · ")))}
              ${row("Email", esc(email))}
              ${row("Phone", esc(donation.phone))}
              ${row("Type", esc(donation.kinds.join(", ")))}
              ${row("How much", esc(donation.quantity))}
              ${row("For", esc(donation.events.join(", ")))}
              ${row("Delivery", esc(donation.delivery))}
              ${row("Available", esc(donation.availableBy))}
              ${row("Recognition", donation.recognition ? `Yes${donation.instagram ? ` · @${esc(donation.instagram)}` : ""}` : "Keep it anonymous")}
              ${row("Notes", esc(donation.notes))}
            </table>
            <p>Review it in the dashboard: Donations tab.</p>
          </div>`,
        })
        .catch((err) => console.error("Donation team email failed:", err.message));

      resend.emails
        .send({
          from: "Grown Folks Collective <partners@grownfolkscollective.com>",
          to: email,
          subject: "Thank you for your donation offer 🎁",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.6;max-width:600px;">
            <p>Hi ${esc(contactName.split(" ")[0])},</p>
            <p>Thank you for offering to donate to Grown Folks&trade; Collective. Gifts like yours help us create more joy,
              play and real connection for Atlanta's grown folks.</p>
            <p>We received your offer and will reach out within a few days to confirm the details and how to get it to us.</p>
            <p>Questions in the meantime? Just reply to this email.</p>
            <p>With gratitude,<br/>La'Von "Vaughn" Williams<br/>Founder &amp; Chief Playmaker<br/>Grown Folks&trade; Collective</p>
            <p style="margin-top:20px;"><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="width:110px;height:auto;border:0;"/><br/>
              <em style="color:#9A7630;">Where grown folks come out to play.&trade;</em></p>
          </div>`,
        })
        .catch((err) => console.error("Donation confirmation email failed:", err.message));
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Donation error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

const admin = [protect, restrictTo("admin")];

router.get("/admin", admin, async (req, res) => {
  try {
    res.json(await Donation.find().sort({ createdAt: -1 }).lean());
  } catch (err) {
    res.status(500).json({ error: "Couldn't load donations." });
  }
});

router.patch("/admin/:id", admin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Not found." });
    const updates = {};
    if (req.body?.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Unknown status." });
      updates.status = req.body.status;
      updates.receivedAt = req.body.status === "received" ? new Date() : null;
    }
    if (typeof req.body?.adminNotes === "string") updates.adminNotes = clean(req.body.adminNotes, 1000);
    const donation = await Donation.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    if (!donation) return res.status(404).json({ error: "Not found." });
    res.json(donation);
  } catch (err) {
    res.status(500).json({ error: "Couldn't save." });
  }
});

export default router;
