import express from "express";
import mongoose from "mongoose";
import { Resend } from "resend";
import {
  RecessSpeaker,
  RecessInterest,
  SPEAKER_TYPES,
  BOOK_OPTIONS,
  AVAILABILITY,
} from "../models/recessSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

// ── Recess Talks: /api/recess ──
// POST /interest  — Public. "Be first to know" list for guests.
// POST /speakers  — Public. Speaker application (authors, professors, therapists, coaches…).
// GET  /admin     — Admin. Speaker applications + interest list.
// PATCH /admin/speakers/:id — Admin. Status and private notes.
const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const TEAM_EMAIL = "events@grownfolkscollective.com";
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const STATUSES = ["new", "talking", "booked", "not-now"];

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const esc = (v = "") =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const url = (v) => (/^https?:\/\/\S+$/i.test(clean(v, 300)) ? clean(v, 300) : "");
const signoff = `<p>Warmly,<br/>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
  <p style="margin-top:20px;"><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="width:110px;height:auto;border:0;"/><br/>
  <em style="color:#9A7630;">Where grown folks come out to play.&trade;</em></p>`;

/* ---------- Guest interest list ---------- */
router.post("/interest", async (req, res) => {
  try {
    if (req.body?.company) return res.status(201).json({ ok: true }); // bot trap
    const name = clean(req.body?.name, 80);
    const email = clean(req.body?.email, 120).toLowerCase();
    if (!name || !isEmail(email)) {
      return res.status(400).json({ error: "Please add your name and a valid email." });
    }
    const existing = await RecessInterest.findOne({ email }).lean();
    await RecessInterest.updateOne(
      { email },
      { $set: { name }, $setOnInsert: { source: clean(req.body?.source, 120) } },
      { upsert: true }
    );

    if (resend && !existing) {
      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: email,
          reply_to: "community@grownfolkscollective.com",
          subject: "You're on the Recess Talks list 🖍️",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.6;max-width:600px;">
            <p>Hi ${esc(name.split(" ")[0])},</p>
            <p>You're on the list for <strong>Recess Talks</strong>, our new monthly series on play, joy and inner-child healing.
              Authors and experts, coffee and tea, something to color while you listen, and a room full of grown folks who
              came to slow down and be present.</p>
            <p>We're planning our first talk for <strong>January 2027</strong>. You'll be the first to know when the date,
              speaker and tickets are set.</p>
            ${signoff}
          </div>`,
        })
        .catch((err) => console.error("Recess interest email failed:", err.message));
    }
    res.status(201).json({ ok: true, already: Boolean(existing) });
  } catch (err) {
    console.error("Recess interest error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* ---------- Speaker application ---------- */
router.post("/speakers", async (req, res) => {
  try {
    const b = req.body || {};
    if (b.company) return res.status(201).json({ ok: true }); // bot trap

    const firstName = clean(b.firstName, 60);
    const lastName = clean(b.lastName, 60);
    const email = clean(b.email, 120).toLowerCase();
    const talkTitle = clean(b.talkTitle, 150);
    const talkSummary = clean(b.talkSummary, 2000);
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "Please fill in your name and email." });
    }
    if (!isEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (!talkTitle || talkSummary.length < 30) {
      return res.status(400).json({ error: "Please share your talk title and a few sentences about it." });
    }
    if (b.agreed !== true) {
      return res.status(400).json({ error: "Please confirm you're the speaker and agree to the Code of Conduct." });
    }

    const speaker = await RecessSpeaker.create({
      firstName,
      lastName,
      email,
      phone: clean(b.phone, 20),
      speakerType: SPEAKER_TYPES.includes(b.speakerType) ? b.speakerType : "Other",
      organization: clean(b.organization, 150),
      about: clean(b.about, 1200),
      talkTitle,
      talkSummary,
      interactive: clean(b.interactive, 1200),
      bookTitles: clean(b.bookTitles, 400),
      books: BOOK_OPTIONS.includes(b.books) ? b.books : "Not sure yet",
      website: url(b.website),
      instagram: clean(b.instagram, 80).replace(/^@/, ""),
      videoLink: url(b.videoLink),
      availability: (Array.isArray(b.availability) ? b.availability : []).filter((x) => AVAILABILITY.includes(x)),
      notes: clean(b.notes, 1000),
      agreedAt: new Date(),
      source: clean(b.source, 120),
    });

    if (resend) {
      const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:4px 0;">${v || "—"}</td></tr>`;
      const link = (v) => (v ? `<a href="${esc(v)}">${esc(v)}</a>` : "");
      resend.emails
        .send({
          from: "Recess Talks <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          reply_to: email,
          subject: `🖍️ New Recess Talks speaker: ${firstName} ${lastName} (${speaker.speakerType})`,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#002147;font-size:15px;line-height:1.6;max-width:640px;">
            <h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">New Speaker Application</h2>
            <h3 style="margin:0 0 4px;">“${esc(talkTitle)}”</h3>
            <p style="white-space:pre-line;margin:0 0 14px;">${esc(talkSummary)}</p>
            <table style="font-size:14px;border-collapse:collapse;">
              ${row("Name", esc(`${firstName} ${lastName}`))}
              ${row("Email", esc(email))}
              ${row("Phone", esc(speaker.phone))}
              ${row("Type", esc(speaker.speakerType))}
              ${row("Organization", esc(speaker.organization))}
              ${row("About", `<span style="white-space:pre-line;">${esc(speaker.about)}</span>`)}
              ${row("Play element", `<span style="white-space:pre-line;">${esc(speaker.interactive)}</span>`)}
              ${row("Books", esc([speaker.books, speaker.bookTitles].filter(Boolean).join(" · ")))}
              ${row("Website", link(speaker.website))}
              ${row("Instagram", speaker.instagram ? `@${esc(speaker.instagram)}` : "")}
              ${row("Past talk", link(speaker.videoLink))}
              ${row("Available", esc(speaker.availability.join(", ")))}
              ${row("Notes", esc(speaker.notes))}
            </table>
            <p>Review it in the dashboard: Recess Talks tab.</p>
          </div>`,
        })
        .catch((err) => console.error("Recess team email failed:", err.message));

      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: email,
          reply_to: "community@grownfolkscollective.com",
          subject: "Thanks for applying to speak at Recess Talks 🖍️",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.6;max-width:600px;">
            <p>Hi ${esc(firstName)},</p>
            <p>Thank you for applying to speak at <strong>Recess Talks</strong>. We received your talk idea,
              <strong>“${esc(talkTitle)}”</strong>, and we're excited to read it.</p>
            <p>We're planning our first talks for early 2027. We'll review every application and reach out if your talk
              is a fit for an upcoming month.</p>
            <p>Questions in the meantime? Just reply to this email.</p>
            ${signoff}
          </div>`,
        })
        .catch((err) => console.error("Recess speaker confirmation failed:", err.message));
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Recess speaker error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* ---------- Admin ---------- */
const admin = [protect, restrictTo("admin")];

router.get("/admin", admin, async (req, res) => {
  try {
    const [speakers, interest] = await Promise.all([
      RecessSpeaker.find().sort({ createdAt: -1 }).lean(),
      RecessInterest.find().sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ speakers, interest });
  } catch (err) {
    res.status(500).json({ error: "Couldn't load Recess Talks." });
  }
});

router.patch("/admin/speakers/:id", admin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Not found." });
    const updates = {};
    if (req.body?.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Unknown status." });
      updates.status = req.body.status;
    }
    if (typeof req.body?.adminNotes === "string") updates.adminNotes = clean(req.body.adminNotes, 1000);
    const speaker = await RecessSpeaker.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
    if (!speaker) return res.status(404).json({ error: "Not found." });
    res.json(speaker);
  } catch (err) {
    res.status(500).json({ error: "Couldn't save." });
  }
});

export default router;
