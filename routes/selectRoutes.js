import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import SelectApplication from "../models/selectApplicationSchema.js";
import SelectRound from "../models/selectRoundSchema.js";
import SelectNotify from "../models/selectNotifySchema.js";
import Subscriber from "../models/subscriberSchema.js";
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
   THE DOORS: is the application window open?
------------------------------------------------------- */
const currentRound = () => SelectRound.findOne().sort({ updatedAt: -1 }).lean();

const roundState = (round, now = new Date()) => {
  if (!round || !round.opensAt || !round.closesAt) return "soon";
  if (now < new Date(round.opensAt)) return "soon";
  if (now <= new Date(round.closesAt)) return "open";
  return "closed";
};

// GET /api/select/status  — Public
router.get("/status", async (req, res) => {
  try {
    const round = await currentRound();
    res.json({
      state: roundState(round),
      opensAt: round?.opensAt || null,
      closesAt: round?.closesAt || null,
      eventDate: round?.eventDate || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not load status." });
  }
});

/* -------------------------------------------------------
   POST /api/select/notify  — Public
   Body: { firstName, email, phone, gender, textOk, source }
------------------------------------------------------- */
const notifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many sign-ups from this device. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/notify", notifyLimiter, async (req, res) => {
  try {
    if (req.body.website) return res.status(201).json({ ok: true }); // bots
    const firstName = clean(req.body.firstName, 40);
    const email = clean(req.body.email, 120).toLowerCase();
    const phone = clean(req.body.phone, 30);
    const gender = ["man", "woman"].includes(req.body.gender) ? req.body.gender : "";
    if (!firstName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please add your first name and a valid email." });
    }

    const wantsNewsletter = req.body.newsletter === true;
    const existing = await SelectNotify.findOne({ email });

    // Checked the box: also add them to the regular events newsletter (skip if already subscribed)
    if (wantsNewsletter) {
      await Subscriber.updateOne(
        { email },
        { $setOnInsert: { fullName: firstName, email, source: "select-notify" } },
        { upsert: true }
      ).catch((err) => console.error("Select newsletter opt-in error:", err));
    }

    await SelectNotify.findOneAndUpdate(
      { email },
      {
        firstName,
        email,
        ...(phone ? { phone } : {}),
        ...(gender ? { gender } : {}),
        textOk: Boolean(phone) && req.body.textOk === true,
        ...(wantsNewsletter ? { newsletter: true } : {}),
        ...(existing ? {} : { source: clean(req.body.source, 60) }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (resend && !existing) {
      const round = await currentRound();
      const opens = round?.opensAt && roundState(round) === "soon"
        ? new Date(round.opensAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })
        : "";
      resend.emails
        .send({
          from: "GFC Select™ <events@grownfolkscollective.com>",
          to: email,
          subject: "You're on the list for GFC Select™",
          html: `<div style="background:#070B16;padding:32px 12px;font-family:Georgia,'Times New Roman',serif">
            <div style="max-width:540px;margin:0 auto;background:#F4F1EA;border:1px solid #C5A059;padding:38px 32px;color:#0E2340">
              <p style="margin:0;text-align:center;letter-spacing:.3em;font-size:11px;color:#8A6A2A;font-family:Arial,sans-serif">GFC SELECT™</p>
              <div style="width:60px;height:1px;background:#C5A059;margin:14px auto 26px"></div>
              <p style="margin:0 0 16px;line-height:1.7">${escapeHtml(firstName)}, you're on the list.</p>
              <p style="margin:0 0 16px;line-height:1.7">${opens ? `The doors open <strong>${escapeHtml(opens)}</strong>, and they stay open for two weeks only.` : "When the doors open, they stay open for two weeks only."} You'll be among the first to know.</p>
              <p style="margin:0 0 16px;line-height:1.7">Forty seats. Twenty men, twenty women. One unforgettable night.</p>
              <p style="margin:24px 0 0;font-style:italic">— Vaughn</p>
              <p style="margin:4px 0 0;font-size:13px;color:#555;font-family:Arial,sans-serif">Grown Folks™ Collective · (270) 380-8896</p>
            </div>
          </div>`,
        })
        .catch((err) => console.error("Select notify email error:", err));
    }

    res.status(201).json({ ok: true, already: Boolean(existing) });
  } catch (err) {
    console.error("Select notify error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   POST /api/select/apply  — Public (/select page)
------------------------------------------------------- */
router.post("/apply", applyLimiter, async (req, res) => {
  try {
    if (req.body.website) return res.status(201).json({ ok: true }); // bots

    const round = await currentRound();
    if (roundState(round) !== "open") {
      return res.status(403).json({ error: "The doors are closed right now. Join the list to hear when they open." });
    }

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

/* -------------------------------------------------------
   POST /api/select/admin/bulk-status  — Admin
   Body: { ids: [...], status }
   Approve / waitlist / decline several applications at once.
------------------------------------------------------- */
router.post("/admin/bulk-status", admin, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (!ids.length) return res.status(400).json({ error: "Choose at least one application." });
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Unknown status." });
    const result = await SelectApplication.updateMany(
      { _id: { $in: ids } },
      { status: req.body.status }
    );
    res.json({ ok: true, updated: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: "Could not update those applications." });
  }
});

/* -------------------------------------------------------
   POST /api/select/admin/email  — Admin
   Body: { ids: [...], subject, message, test: true|false }
   Sends one personal email to each chosen applicant.
   {firstName} in the subject or message becomes their first name.
   test: true sends a single preview to the team inbox instead.
------------------------------------------------------- */
const fillName = (text, firstName) => String(text).replace(/\{firstName\}/g, firstName);

const selectEmailHtml = (firstName, message) => {
  const paragraphs = escapeHtml(fillName(message, firstName))
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.7">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="background:#070B16;padding:32px 12px;font-family:Georgia,'Times New Roman',serif">
    <div style="max-width:560px;margin:0 auto;background:#F4F1EA;border:1px solid #C5A059;padding:40px 34px;color:#0E2340">
      <p style="margin:0;text-align:center;letter-spacing:.3em;font-size:11px;color:#8A6A2A;font-family:Arial,sans-serif">GFC SELECT™</p>
      <div style="width:60px;height:1px;background:#C5A059;margin:14px auto 28px"></div>
      <div style="font-size:16px">${paragraphs}</div>
      <p style="margin:28px 0 0;font-style:italic">— Vaughn</p>
      <p style="margin:4px 0 0;font-size:13px;color:#555;font-family:Arial,sans-serif">Grown Folks™ Collective · (270) 380-8896</p>
    </div>
    <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:11px;color:#8b93a7;font-family:Arial,sans-serif">You're receiving this because you requested an invitation to GFC Select™. Please keep the details private.</p>
  </div>`;
};

router.post("/admin/email", admin, async (req, res) => {
  try {
    if (!resend) return res.status(500).json({ error: "Email isn't set up (RESEND_API_KEY missing)." });

    const subject = clean(req.body.subject, 200);
    const message = String(req.body.message || "").trim().slice(0, 5000);
    if (!subject || !message) return res.status(400).json({ error: "Add a subject and a message." });

    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (!ids.length) return res.status(400).json({ error: "Choose at least one person." });

    const apps = await SelectApplication.find({ _id: { $in: ids } }).select("firstName email").lean();
    if (!apps.length) return res.status(404).json({ error: "No matching applications." });

    // Test: one preview to the team inbox, using the first person's name
    if (req.body.test === true) {
      await resend.emails.send({
        from: "GFC Select™ <events@grownfolkscollective.com>",
        to: TEAM_EMAIL,
        subject: `[TEST] ${fillName(subject, apps[0].firstName)}`,
        html: selectEmailHtml(apps[0].firstName, message),
      });
      return res.json({ ok: true, test: true, sentTo: TEAM_EMAIL });
    }

    // Real send: one personal email each, in batches of 100
    let sent = 0;
    const failed = [];
    for (let i = 0; i < apps.length; i += 100) {
      const chunk = apps.slice(i, i + 100);
      try {
        const { error } = await resend.batch.send(
          chunk.map((a) => ({
            from: "GFC Select™ <events@grownfolkscollective.com>",
            to: a.email,
            reply_to: "community@grownfolkscollective.com",
            subject: fillName(subject, a.firstName),
            html: selectEmailHtml(a.firstName, message),
          }))
        );
        if (error) throw new Error(error.message || "Batch failed");
        sent += chunk.length;
        await SelectApplication.updateMany(
          { _id: { $in: chunk.map((a) => a._id) } },
          { $push: { emailLog: { subject, sentAt: new Date() } } }
        );
      } catch (err) {
        console.error("Select bulk email error:", err);
        failed.push(...chunk.map((a) => a.email));
      }
    }

    res.json({ ok: failed.length === 0, sent, failed });
  } catch (err) {
    console.error("Select email error:", err);
    res.status(500).json({ error: "Could not send the emails." });
  }
});

/* -------------------------------------------------------
   ADMIN: the doors (round dates) and the notify list
------------------------------------------------------- */
// GET /api/select/admin/round
router.get("/admin/round", admin, async (req, res) => {
  try {
    const round = await currentRound();
    res.json({ round: round || null, state: roundState(round) });
  } catch (err) {
    res.status(500).json({ error: "Could not load the round." });
  }
});

// PUT /api/select/admin/round  Body: { name, opensAt, closesAt, eventDate }
router.put("/admin/round", admin, async (req, res) => {
  try {
    const toDate = (v) => (v ? new Date(v) : null);
    const opensAt = toDate(req.body.opensAt);
    const closesAt = toDate(req.body.closesAt);
    const eventDate = toDate(req.body.eventDate);
    if ([opensAt, closesAt, eventDate].some((d) => d && Number.isNaN(d.getTime()))) {
      return res.status(400).json({ error: "One of those dates isn't valid." });
    }
    if (opensAt && closesAt && closesAt <= opensAt) {
      return res.status(400).json({ error: "The doors have to close after they open." });
    }
    const existing = await SelectRound.findOne().sort({ updatedAt: -1 });
    const data = { name: clean(req.body.name, 80), opensAt, closesAt, eventDate };
    const round = existing
      ? await SelectRound.findByIdAndUpdate(existing._id, data, { new: true })
      : await SelectRound.create(data);
    res.json({ round, state: roundState(round) });
  } catch (err) {
    res.status(500).json({ error: "Could not save the round." });
  }
});

// GET /api/select/admin/notify  — the notify list
router.get("/admin/notify", admin, async (req, res) => {
  try {
    const list = await SelectNotify.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Could not load the notify list." });
  }
});

// POST /api/select/admin/notify/email  Body: { subject, message, test }
// Emails EVERYONE on the notify list (e.g. "The doors are open").
router.post("/admin/notify/email", admin, async (req, res) => {
  try {
    if (!resend) return res.status(500).json({ error: "Email isn't set up (RESEND_API_KEY missing)." });
    const subject = clean(req.body.subject, 200);
    const message = String(req.body.message || "").trim().slice(0, 5000);
    if (!subject || !message) return res.status(400).json({ error: "Add a subject and a message." });

    const list = await SelectNotify.find().select("firstName email").lean();
    if (!list.length) return res.status(400).json({ error: "The notify list is empty." });

    if (req.body.test === true) {
      await resend.emails.send({
        from: "GFC Select™ <events@grownfolkscollective.com>",
        to: TEAM_EMAIL,
        subject: `[TEST] ${fillName(subject, list[0].firstName)}`,
        html: selectEmailHtml(list[0].firstName, message),
      });
      return res.json({ ok: true, test: true, sentTo: TEAM_EMAIL });
    }

    let sent = 0;
    const failed = [];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      try {
        const { error } = await resend.batch.send(
          chunk.map((p) => ({
            from: "GFC Select™ <events@grownfolkscollective.com>",
            to: p.email,
            reply_to: "community@grownfolkscollective.com",
            subject: fillName(subject, p.firstName),
            html: selectEmailHtml(p.firstName, message),
          }))
        );
        if (error) throw new Error(error.message || "Batch failed");
        sent += chunk.length;
        await SelectNotify.updateMany(
          { _id: { $in: chunk.map((p) => p._id) } },
          { $push: { emailLog: { subject, sentAt: new Date() } } }
        );
      } catch (err) {
        console.error("Select notify bulk email error:", err);
        failed.push(...chunk.map((p) => p.email));
      }
    }
    res.json({ ok: failed.length === 0, sent, failed });
  } catch (err) {
    console.error("Select notify email error:", err);
    res.status(500).json({ error: "Could not send the emails." });
  }
});

export default router;
