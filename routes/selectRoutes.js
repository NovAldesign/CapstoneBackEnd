import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { Resend } from "resend";
import SelectApplication from "../models/selectApplicationSchema.js";
import SelectRound from "../models/selectRoundSchema.js";
import SelectNotify from "../models/selectNotifySchema.js";
import SelectNomination from "../models/selectNominationSchema.js";
import Subscriber from "../models/subscriberSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";
import {
  doorsLine, notifyConfirm, applyConfirm, nominationInvite, nominatorThanks, friendInvite,
} from "../utilities/selectEmails.js";

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

// Matching questions. Keep in sync with frontend src/Services/selectQuestions.js
const VALUE_KEYS = ["faith", "family", "friends", "finances", "career", "health", "adventure", "growth", "fun", "community"];
const LOVE_KEYS = ["words", "time", "service", "gifts", "touch"];
const CONNECT_KEYS = {
  social: ["room", "few", "mix"],
  conflict: ["now", "later", "show"],
  pace: ["slow", "steady", "fast"],
  roles: ["lead", "partner", "flex"],
  weekend: ["out", "home", "mix"],
};
const KIDS_HAVE = ["yes", "no"];
const KIDS_WANT = ["yes", "no", "open", "done"];
const NIGHT_GOALS = ["one", "few", "friends", "out"];

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
   Shared helpers: emails, invites, friends
------------------------------------------------------- */
const GENDERS = ["man", "woman"];
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ""));

const doorsNow = async () => {
  const round = await currentRound();
  const state = roundState(round);
  const opens = round?.opensAt && state === "soon"
    ? new Date(round.opensAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" })
    : "";
  return doorsLine(state, opens);
};

// Send one of the copy objects from utilities/selectEmails.js (never blocks the request)
const sendSelectEmail = (to, firstName, { subject, message, button, footer }) => {
  if (!resend) return;
  resend.emails
    .send({
      from: "GFC Select™ <events@grownfolkscollective.com>",
      to,
      reply_to: "community@grownfolkscollective.com",
      subject,
      html: selectEmailHtml(firstName, message, footer, button),
    })
    .catch((err) => console.error(`Select email error (${subject}):`, err));
};

// invited = OK to email · already = on the list or applied · repeat = invited in the last 30 days
const inviteStatus = async (email) => {
  const [onList, applied, recent] = await Promise.all([
    SelectNotify.exists({ email }),
    SelectApplication.exists({ email }),
    SelectNomination.exists({
      nomineeEmail: email,
      status: "invited",
      createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }),
  ]);
  if (onList || applied) return "already";
  if (recent) return "repeat";
  return "invited";
};

// "Applying with a friend?" — name (optional), email (optional), man/woman (needed with an email)
const readFriend = (b, ownEmail) => {
  const name = clean(b.friendName, 80);
  const email = clean(b.friendEmail, 120).toLowerCase();
  const gender = GENDERS.includes(b.friendGender) ? b.friendGender : "";
  if (!email) return { name, email: "", gender: "" };
  if (!isEmail(email)) return { error: "Your friend's email doesn't look right." };
  if (email === ownEmail) return { error: "Add your friend's email, not your own." };
  if (!name) return { error: "Add your friend's first name so we can greet them." };
  if (!gender) return { error: "Let us know if your friend is a man or a woman." };
  return { name, email, gender };
};

// Sends the friend one personal invite (unless they're already on the list or recently invited)
const inviteFriend = async ({ inviterName, inviterEmail, inviterGender, friend, doors, source }) => {
  try {
    const status = await inviteStatus(friend.email);
    await SelectNomination.create({
      kind: "friend",
      nominatorName: inviterName,
      nominatorEmail: inviterEmail,
      shareName: true,
      relationship: "Friend",
      nomineeFirstName: friend.name.split(" ")[0],
      nomineeEmail: friend.email,
      nomineeGender: friend.gender,
      status,
      invitedAt: status === "invited" ? new Date() : null,
      source,
    });
    if (status === "invited") {
      sendSelectEmail(friend.email, friend.name, friendInvite({
        friendName: friend.name.split(" ")[0],
        gender: friend.gender,
        inviterName,
        inviterGender,
        doors,
      }));
    }
  } catch (err) {
    console.error("Select friend invite error:", err);
  }
};

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
    const gender = GENDERS.includes(req.body.gender) ? req.body.gender : "";
    if (!firstName || !isEmail(email)) {
      return res.status(400).json({ error: "Please add your first name and a valid email." });
    }
    const friend = readFriend(req.body, email);
    if (friend.error) return res.status(400).json({ error: friend.error });

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
        ...(friend.name ? { friendName: friend.name } : {}),
        ...(friend.email ? { friendEmail: friend.email, friendGender: friend.gender } : {}),
        ...(wantsNewsletter ? { newsletter: true } : {}),
        ...(existing ? {} : { source: clean(req.body.source, 60) }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const doors = await doorsNow();
    if (!existing) sendSelectEmail(email, firstName, notifyConfirm({ firstName, gender, doors }));
    if (friend.email) {
      await inviteFriend({ inviterName: firstName, inviterEmail: email, inviterGender: gender, friend, doors, source: "notify" });
    }

    res.status(201).json({ ok: true, already: Boolean(existing) });
  } catch (err) {
    console.error("Select notify error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   POST /api/select/nominate  — Public (/select/nominate)
   "Nominate someone who belongs in the room": a man or a woman.
   Body: { nominatorName, nominatorEmail, shareName, relationship, note,
           nomineeFirstName, nomineeEmail, nomineePhone, nomineeGender, confirmed, source }
------------------------------------------------------- */
const nominateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many nominations from this device. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/nominate", nominateLimiter, async (req, res) => {
  try {
    if (req.body.website) return res.status(201).json({ ok: true }); // bots
    const b = req.body;
    const nominatorName = clean(b.nominatorName, 60);
    const nominatorEmail = clean(b.nominatorEmail, 120).toLowerCase();
    const nomineeFirstName = clean(b.nomineeFirstName, 40);
    const nomineeEmail = clean(b.nomineeEmail, 120).toLowerCase();
    const nomineePhone = clean(b.nomineePhone, 30);
    const nomineeGender = GENDERS.includes(b.nomineeGender) ? b.nomineeGender : "man";
    const him = nomineeGender === "woman" ? "her" : "him";
    const his = nomineeGender === "woman" ? "her" : "his";
    const hes = nomineeGender === "woman" ? "she's" : "he's";

    if (!nominatorName || !isEmail(nominatorEmail)) {
      return res.status(400).json({ error: "Please add your first name and a valid email." });
    }
    if (!nomineeFirstName) return res.status(400).json({ error: `Please add ${his} first name.` });
    if (!nomineeEmail && !nomineePhone) {
      return res.status(400).json({ error: `Please add ${his} email or phone so we can reach ${him}.` });
    }
    if (nomineeEmail && !isEmail(nomineeEmail)) {
      return res.status(400).json({ error: `${his.charAt(0).toUpperCase() + his.slice(1)} email doesn't look right.` });
    }
    if (nomineeEmail && nomineeEmail === nominatorEmail) {
      return res.status(400).json({ error: "Nominate someone else. You can join the list yourself on the Select page." });
    }
    if (b.confirmed !== true) {
      return res.status(400).json({ error: `Please confirm ${hes} single and 30 or older.` });
    }

    const status = nomineeEmail ? await inviteStatus(nomineeEmail) : "text";

    const nomination = await SelectNomination.create({
      kind: "nomination",
      nominatorName,
      nominatorEmail,
      shareName: b.shareName === true,
      relationship: clean(b.relationship, 40),
      note: clean(b.note, 400),
      nomineeFirstName,
      nomineeEmail,
      nomineePhone,
      nomineeGender,
      status,
      invitedAt: status === "invited" ? new Date() : null,
      source: clean(b.source, 60),
    });

    const doors = await doorsNow();

    // 1. Their personal invite (email only, never a repeat)
    if (status === "invited") {
      sendSelectEmail(nomineeEmail, nomineeFirstName, nominationInvite({
        firstName: nomineeFirstName,
        gender: nomineeGender,
        nominatorName,
        shareName: nomination.shareName,
        doors,
      }));
    }

    // 2. Thank the person who nominated them
    sendSelectEmail(nominatorEmail, nominatorName, nominatorThanks({
      nominatorName,
      nomineeFirstName,
      gender: nomineeGender,
      status,
    }));

    // 3. Phone-only nominations need a personal text from the team
    if (status === "text" && resend) {
      resend.emails
        .send({
          from: "GFC Select™ <events@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          subject: `🎭 Text this nominee: ${nomineeFirstName} (${nomineeGender}, ${nomineePhone})`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0E2340">
            <h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px">New GFC Select™ nomination (phone only)</h2>
            <p><strong>${escapeHtml(nomineeFirstName)}</strong> (${nomineeGender}) · ${escapeHtml(nomineePhone)}</p>
            <p>Nominated by ${escapeHtml(nominatorName)} (${escapeHtml(nominatorEmail)})${nomination.relationship ? `, ${his} ${escapeHtml(nomination.relationship.toLowerCase())}` : ""}. ${nomination.shareName ? "OK to use the nominator's name." : "Keep the nominator's name private."}</p>
            ${nomination.note ? `<p style="background:#F4F1EA;padding:12px;border-left:3px solid #C5A059">${escapeHtml(nomination.note)}</p>` : ""}
          </div>`,
        })
        .catch((err) => console.error("Select nomination team email error:", err));
    }

    res.status(201).json({ ok: true, status });
  } catch (err) {
    console.error("Select nomination error:", err);
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

    const friend = readFriend(b, email);
    if (friend.error) return res.status(400).json({ error: friend.error });

    // Your heart: goal, kids, ages, the night
    if (!LOOKING_FOR.includes(b.lookingFor) || !KIDS_HAVE.includes(b.hasKids) || !KIDS_WANT.includes(b.wantsKids) || !NIGHT_GOALS.includes(b.nightGoal)) {
      return res.status(400).json({ error: "Please finish \"Your heart\": what you're looking for, kids and your goal for the night." });
    }
    const ageMin = Math.round(Number(b.ageMin));
    const ageMax = Math.round(Number(b.ageMax));
    if (!(ageMin >= 30 && ageMax >= ageMin && ageMax <= 99)) {
      return res.status(400).json({ error: "Please add the ages you'd like to meet (30 or older)." });
    }

    // What you value: every value rated 1–5
    const values = {};
    for (const k of VALUE_KEYS) {
      const n = Math.round(Number(b.values?.[k]));
      if (!(n >= 1 && n <= 5)) {
        return res.status(400).json({ error: "Please rate every value from 1 to 5." });
      }
      values[k] = n;
    }

    // How you connect
    const connect = {};
    for (const [k, allowed] of Object.entries(CONNECT_KEYS)) {
      if (!allowed.includes(b[k])) {
        return res.status(400).json({ error: "Please answer every question in \"How you connect\"." });
      }
      connect[k] = b[k];
    }
    const giveLove = [...new Set(pick(b.giveLove, LOVE_KEYS))].slice(0, 2);
    const receiveLove = [...new Set(pick(b.receiveLove, LOVE_KEYS))].slice(0, 2);
    if (giveLove.length !== 2 || receiveLove.length !== 2) {
      return res.status(400).json({ error: "Please pick 2 answers for each love question." });
    }

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
      friendName: friend.name,
      friendEmail: friend.email,
      friendGender: friend.gender,
      lookingFor: b.lookingFor,
      hasKids: b.hasKids,
      wantsKids: b.wantsKids,
      ageMin,
      ageMax,
      nightGoal: b.nightGoal,
      values,
      valuesWhy: clean(b.valuesWhy, 800),
      ...connect,
      giveLove,
      receiveLove,
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
              ${row("Top values", VALUE_KEYS.filter((k) => values[k] >= 4).map((k) => `${k} ${values[k]}`).join(", ") || "None rated 4+")}
              ${row("Kids", `has: ${app.hasKids}, wants: ${app.wantsKids}`)}
              ${row("Would meet ages", `${ageMin}–${ageMax}`)}
              ${row("Why now", app.whyNow)}
              ${row("Ideal first date", app.firstDate)}
              ${row("Why those values", app.valuesWhy)}
              ${row("Allergies", food)}
              ${row("Diet", app.diet.join(", "))}
              ${row("Heard from", app.heardFrom)}
              ${row("Referred by", app.referredBy)}
              ${row("Applying with", app.friendName)}
            </table>
            <p style="color:#666;font-size:13px">Bingo answers are saved with the application.</p>
          </div>`,
        })
        .catch((err) => console.error("Select team email error:", err));

      // To the applicant, written for a man or a woman
      sendSelectEmail(email, firstName, applyConfirm({ firstName, gender }));

      // Their friend, if they asked us to invite one
      if (friend.email) {
        await inviteFriend({ inviterName: firstName, inviterEmail: email, inviterGender: gender, friend, doors: await doorsNow(), source: "apply" });
      }
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

const DEFAULT_FOOTER = "You're receiving this because you requested an invitation to GFC Select™. Please keep the details private.";
const selectEmailHtml = (firstName, message, footer = DEFAULT_FOOTER, button = null) => {
  const paragraphs = escapeHtml(fillName(message, firstName))
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.7">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="background:#070B16;padding:32px 12px;font-family:Georgia,'Times New Roman',serif">
    <div style="max-width:560px;margin:0 auto;background:#F4F1EA;border:1px solid #C5A059;padding:40px 34px;color:#0E2340">
      <p style="margin:0;text-align:center;letter-spacing:.3em;font-size:11px;color:#8A6A2A;font-family:Arial,sans-serif">GFC SELECT™</p>
      <div style="width:60px;height:1px;background:#C5A059;margin:14px auto 28px"></div>
      <div style="font-size:16px">${paragraphs}</div>
      ${button ? `<p style="margin:8px 0 0;text-align:center"><a href="${button.href}" style="display:inline-block;background:#0E2340;color:#F4F1EA;padding:14px 28px;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.18em;text-transform:uppercase">${escapeHtml(button.label)}</a></p>` : ""}
      <p style="margin:28px 0 0;font-style:italic">— Vaughn</p>
      <p style="margin:4px 0 0;font-size:13px;color:#555;font-family:Arial,sans-serif">Grown Folks™ Collective · (270) 380-8896</p>
    </div>
    <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:11px;color:#8b93a7;font-family:Arial,sans-serif">${escapeHtml(footer)}</p>
  </div>`;
};

// Dashboard emails can carry a men's and a women's version.
// Body: { subject, message, men: { subject, message }, women: { subject, message } }
// Everyone gets the version for them; anyone without a man/woman answer gets the main one.
const readVersions = (body) => {
  const v = (o) => {
    const subject = clean(o?.subject, 200);
    const message = String(o?.message || "").trim().slice(0, 5000);
    return subject && message ? { subject, message } : null;
  };
  return { base: v(body), man: v(body.men), woman: v(body.women) };
};
const versionFor = (versions, gender) => versions[gender] || versions.base;

const sendDashboardEmails = async ({ people, versions, test, Model }) => {
  if (test) {
    const sample = people[0];
    const sentTo = [];
    for (const [label, ver] of [["Everyone", versions.base], ["Men", versions.man], ["Women", versions.woman]]) {
      if (!ver) continue;
      await resend.emails.send({
        from: "GFC Select™ <events@grownfolkscollective.com>",
        to: TEAM_EMAIL,
        subject: `[TEST · ${label}] ${fillName(ver.subject, sample.firstName)}`,
        html: selectEmailHtml(sample.firstName, ver.message),
      });
      sentTo.push(label);
    }
    return { ok: true, test: true, sentTo: TEAM_EMAIL, versions: sentTo };
  }

  let sent = 0;
  const failed = [];
  for (let i = 0; i < people.length; i += 100) {
    const chunk = people.slice(i, i + 100);
    try {
      const { error } = await resend.batch.send(
        chunk.map((p) => {
          const ver = versionFor(versions, p.gender);
          return {
            from: "GFC Select™ <events@grownfolkscollective.com>",
            to: p.email,
            reply_to: "community@grownfolkscollective.com",
            subject: fillName(ver.subject, p.firstName),
            html: selectEmailHtml(p.firstName, ver.message),
          };
        })
      );
      if (error) throw new Error(error.message || "Batch failed");
      sent += chunk.length;
      for (const g of ["man", "woman", ""]) {
        const ids = chunk.filter((p) => (versions[p.gender] ? p.gender : "") === g).map((p) => p._id);
        if (!ids.length) continue;
        const subject = (g ? versions[g] : versions.base).subject;
        await Model.updateMany({ _id: { $in: ids } }, { $push: { emailLog: { subject, sentAt: new Date() } } });
      }
    } catch (err) {
      console.error("Select bulk email error:", err);
      failed.push(...chunk.map((p) => p.email));
    }
  }
  return { ok: failed.length === 0, sent, failed };
};

router.post("/admin/email", admin, async (req, res) => {
  try {
    if (!resend) return res.status(500).json({ error: "Email isn't set up (RESEND_API_KEY missing)." });
    const versions = readVersions(req.body);
    if (!versions.base && !versions.man && !versions.woman) {
      return res.status(400).json({ error: "Add a subject and a message." });
    }

    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (!ids.length) return res.status(400).json({ error: "Choose at least one person." });

    const people = await SelectApplication.find({ _id: { $in: ids } }).select("firstName email gender").lean();
    if (!people.length) return res.status(404).json({ error: "No matching applications." });

    // Every person needs a version: theirs, or the main one
    const missing = people.filter((p) => !versionFor(versions, p.gender));
    if (missing.length) {
      return res.status(400).json({ error: `Add a ${missing[0].gender === "man" ? "men's" : "women's"} version (or a main message) before sending.` });
    }

    res.json(await sendDashboardEmails({ people, versions, test: req.body.test === true, Model: SelectApplication }));
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

// GET /api/select/admin/nominations  — "Nominate a Good Man" submissions
router.get("/admin/nominations", admin, async (req, res) => {
  try {
    const list = await SelectNomination.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Could not load nominations." });
  }
});

// POST /api/select/admin/notify/email  Body: { subject, message, test }
// Emails EVERYONE on the notify list (e.g. "The doors are open").
router.post("/admin/notify/email", admin, async (req, res) => {
  try {
    if (!resend) return res.status(500).json({ error: "Email isn't set up (RESEND_API_KEY missing)." });
    const versions = readVersions(req.body);
    if (!versions.base && !versions.man && !versions.woman) {
      return res.status(400).json({ error: "Add a subject and a message." });
    }

    const people = await SelectNotify.find().select("firstName email gender").lean();
    if (!people.length) return res.status(400).json({ error: "The notify list is empty." });

    const missing = people.filter((p) => !versionFor(versions, p.gender));
    if (missing.length) {
      return res.status(400).json({ error: "Some people on the list didn't say man or woman. Add a main message for them." });
    }

    res.json(await sendDashboardEmails({ people, versions, test: req.body.test === true, Model: SelectNotify }));
  } catch (err) {
    console.error("Select notify email error:", err);
    res.status(500).json({ error: "Could not send the emails." });
  }
});

export default router;
