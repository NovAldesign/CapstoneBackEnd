import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import SelectApplication from "../models/selectApplicationSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const TEAM_EMAIL = "events@grownfolkscollective.com";

// Keep in sync with the lists on the /select page
const BINGO_PROMPTS = [
  "A place I've traveled that changed me",
  "My go-to karaoke or 90s R&B song",
  "A hidden talent",
  "The dish I cook best",
  "Something I'm learning right now",
  "My favorite Atlanta spot",
  "A fun fact most people don't know about me",
  "My love language",
  "The last concert or show I went to",
  "My zodiac sign",
];
const ALLERGIES = ["Peanuts", "Tree nuts", "Shellfish", "Fish", "Dairy", "Eggs", "Gluten", "Soy", "Sesame"];
const DIETS = ["Vegetarian", "Vegan", "Pescatarian", "Halal", "No pork"];
const LOOKING_FOR = [
  "A long-term relationship",
  "Marriage",
  "Dating with intention",
  "Open to seeing where it goes",
];
const STATUSES = ["new", "selected", "waitlist", "not_this_time"];

const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const ageOn = (birthdate, today = new Date()) => {
  let age = today.getFullYear() - birthdate.getFullYear();
  const m = today.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthdate.getDate())) age--;
  return age;
};

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many applications from this device. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/* -------------------------------------------------------
   POST /api/select/apply  — Public (/select page)
------------------------------------------------------- */
router.post("/apply", applyLimiter, async (req, res) => {
  try {
    if (req.body.website) return res.status(201).json({ ok: true }); // bots

    const b = req.body;
    const firstName = clean(b.firstName, 40);
    const lastName = clean(b.lastName, 40);
    const email = clean(b.email, 120).toLowerCase();
    const phone = clean(b.phone, 30);
    const gender = ["man", "woman"].includes(b.gender) ? b.gender : "";
    const birthdate = new Date(b.birthdate);

    if (!firstName || !lastName || !email || !phone || !gender) {
      return res.status(400).json({ error: "Please fill in your name, email, phone and whether you're a man or woman." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "That email doesn't look right." });
    }
    if (Number.isNaN(birthdate.getTime())) {
      return res.status(400).json({ error: "Please add your birthdate." });
    }
    const age = ageOn(birthdate);
    if (age < 30 || age > 100) {
      return res.status(400).json({ error: "GFC Select™ is for singles 30 and over." });
    }
    if (b.isSingle !== true) {
      return res.status(400).json({ error: "GFC Select™ is for singles only." });
    }
    if (b.agreed !== true) {
      return res.status(400).json({ error: "Please agree to the house rules to apply." });
    }

    const bingo = (Array.isArray(b.bingo) ? b.bingo : [])
      .filter((x) => BINGO_PROMPTS.includes(x?.prompt) && clean(x?.answer, 160))
      .slice(0, 5)
      .map((x) => ({ prompt: x.prompt, answer: clean(x.answer, 160) }));
    if (bingo.length < 5) {
      return res.status(400).json({ error: "Please answer 5 of the fun-fact prompts." });
    }

    const pick = (list, allowed) =>
      (Array.isArray(list) ? list : []).filter((x) => allowed.includes(x));

    const recent = await SelectApplication.findOne({
      email,
      createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    if (recent) {
      return res.status(409).json({ error: "We already have your application. We'll be in touch." });
    }

    const app = await SelectApplication.create({
      firstName,
      lastName,
      email,
      phone,
      birthdate,
      gender,
      area: clean(b.area, 60),
      occupation: clean(b.occupation, 80),
      instagram: clean(b.instagram, 60),
      heardFrom: clean(b.heardFrom, 80),
      referredBy: clean(b.referredBy, 80),
      lookingFor: LOOKING_FOR.includes(b.lookingFor) ? b.lookingFor : "",
      isSingle: true,
      whyNow: clean(b.whyNow, 800),
      firstDate: clean(b.firstDate, 800),
      matters: clean(b.matters, 800),
      learnLater: clean(b.learnLater, 800),
      bingo,
      allergies: pick(b.allergies, ALLERGIES),
      allergyOther: clean(b.allergyOther, 200),
      diet: pick(b.diet, DIETS),
      agreed: true,
      source: clean(b.source, 60),
    });

    if (resend) {
      const row = (label, value) =>
        `<tr><td style="padding:5px 12px 5px 0;color:#666;vertical-align:top">${label}</td><td style="padding:5px 0;color:#0E2340"><strong>${escapeHtml(value || "—")}</strong></td></tr>`;
      const food = [...app.allergies, app.allergyOther].filter(Boolean).join(", ") || "None";

      // To the team
      resend.emails
        .send({
          from: "GFC Select™ <events@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          subject: `🎭 GFC Select™ application: ${firstName} ${lastName.charAt(0)}. (${gender}, ${age})`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px">
            <h2 style="color:#0E2340;border-bottom:2px solid #C5A059;padding-bottom:8px">New GFC Select™ application</h2>
            <table style="border-collapse:collapse;font-size:14px">
              ${row("Name", `${firstName} ${lastName}`)}
              ${row("Man / woman", gender)}
              ${row("Age", String(age))}
              ${row("Email", email)}
              ${row("Phone", phone)}
              ${row("Side of town", app.area)}
              ${row("Work", app.occupation)}
              ${row("Instagram", app.instagram)}
              ${row("Looking for", app.lookingFor)}
              ${row("Why now", app.whyNow)}
              ${row("Ideal first date", app.firstDate)}
              ${row("Matters most", app.matters)}
              ${row("Learn later", app.learnLater)}
              ${row("Allergies", food)}
              ${row("Diet", app.diet.join(", "))}
              ${row("Heard from", app.heardFrom)}
              ${row("Referred by", app.referredBy)}
            </table>
            <p style="color:#666;font-size:13px">Bingo answers are saved with the application.</p>
          </div>`,
        })
        .catch((err) => console.error("Select team email error:", err));

      // To the applicant
      resend.emails
        .send({
          from: "GFC Select™ <events@grownfolkscollective.com>",
          to: email,
          subject: "Your GFC Select™ request has been received",
          html: `<div style="font-family:Georgia,serif;max-width:560px;color:#0E2340;background:#F4F1EA;padding:32px">
            <p style="letter-spacing:.2em;font-size:12px;color:#9A7630;margin:0">GFC SELECT™</p>
            <h2 style="margin:8px 0 16px">Thank you, ${escapeHtml(firstName)}.</h2>
            <p>Your request for an invitation has been received. Every guest is personally selected, so we review each request with care.</p>
            <p>If you're selected, you'll receive an invitation with the date, that evening's dress code and how to reserve your seat. The location is shared with selected guests 48 hours before.</p>
            <p>Until then, keep it between us.</p>
            <p style="margin-top:24px">— Vaughn<br><span style="font-size:13px;color:#555">Grown Folks™ Collective · (270) 380-8896</span></p>
          </div>`,
        })
        .catch((err) => console.error("Select confirmation email error:", err));
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Select apply error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* =======================================================
   ADMIN  — /api/select/admin
======================================================= */
const admin = [protect, restrictTo("admin")];

router.get("/admin", admin, async (req, res) => {
  try {
    const apps = await SelectApplication.find().sort({ createdAt: -1 }).lean();
    res.json(apps.map((a) => ({ ...a, age: ageOn(new Date(a.birthdate)) })));
  } catch (err) {
    res.status(500).json({ error: "Could not load applications." });
  }
});

router.patch("/admin/:id", admin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: "Application not found." });
    }
    const updates = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Unknown status." });
      updates.status = req.body.status;
    }
    if (req.body.notes !== undefined) updates.notes = clean(req.body.notes, 2000);
    const app = await SelectApplication.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!app) return res.status(404).json({ error: "Application not found." });
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: "Could not update the application." });
  }
});

export default router;
