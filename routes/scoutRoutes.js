import express from "express";
import { Resend } from "resend";
import Scout, { SCOUT_TITLES, SCOUT_INTERESTS } from "../models/scoutSchema.js";
import Event from "../models/eventSchema.js";
import GuestEntry from "../models/guestEntrySchema.js";

// ── Industry scouts: /api/scouts ──
// POST /  — Public sign-up from /scouts. Saves the scout, puts them on the
// guest list (free) for each showcase they pick, and emails them + the team.
const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const TEAM_EMAIL = "events@grownfolkscollective.com";
const SITE_URL = "https://www.grownfolkscollective.com";
const TIME_ZONE = "America/New_York";
const SHOWCASE_EVENT = /showcase|live music|acoustic|open mic|concert|jam session/i;
const LOGO = `${SITE_URL}/email/gfc-logo.png`;

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const esc = (v = "") =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const fmtDay = (d) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const place = (loc = {}) => [loc.name, [loc.address, loc.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

const upcomingShowcases = async () =>
  (await Event.find({ status: "published", date: { $gte: new Date() } })
    .sort({ date: 1 })
    .select("name date location")
    .lean()).filter((e) => SHOWCASE_EVENT.test(e.name || ""));

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const firstName = clean(b.firstName, 60);
    const lastName = clean(b.lastName, 60);
    const email = clean(b.email, 120).toLowerCase();
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: "Please fill in your name and email." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (b.agreed !== true) {
      return res.status(400).json({ error: "Please agree to the Code of Conduct and Participation Waiver." });
    }

    // Only real, upcoming showcases
    const showcases = await upcomingShowcases();
    const wanted = new Set((Array.isArray(b.eventIds) ? b.eventIds : []).map(String));
    const picked = showcases.filter((e) => wanted.has(String(e._id)));

    const website = clean(b.website, 300);
    const fields = {
      firstName,
      lastName,
      phone: clean(b.phone, 20),
      company: clean(b.company, 120),
      title: SCOUT_TITLES.includes(b.title) ? b.title : "Other",
      lookingFor: (Array.isArray(b.lookingFor) ? b.lookingFor : []).filter((x) => SCOUT_INTERESTS.includes(x)),
      genres: clean(b.genres, 200),
      website: /^https?:\/\/\S+$/i.test(website) ? website : "",
      instagram: clean(b.instagram, 80).replace(/^@/, ""),
      notify: b.notify !== false,
      agreedAt: new Date(),
      source: clean(b.source, 120),
    };

    // One record per email: signing up again updates them and adds any new showcases
    const scout = await Scout.findOneAndUpdate(
      { email },
      { $set: fields, $addToSet: { eventIds: { $each: picked.map((e) => String(e._id)) } } },
      { new: true, upsert: true, runValidators: true }
    );

    // Their free ticket = their name on the guest list (once per showcase)
    const fullName = `${firstName} ${lastName}`;
    const note = ["Industry scout", fields.title, fields.company].filter(Boolean).join(" · ");
    for (const e of picked) {
      const eventId = String(e._id);
      const exists = await GuestEntry.findOne({ eventId, email, source: "scout" }).lean();
      if (!exists) {
        await GuestEntry.create({ eventId, name: fullName, email, phone: fields.phone, quantity: 1, source: "scout", notes: note, addedBy: "scout" });
      }
    }

    if (resend) {
      const list = picked.length
        ? `<ul>${picked.map((e) => `<li><strong>${esc(fmtDay(e.date))}, ${esc(fmtTime(e.date))}:</strong> ${esc(e.name)}${place(e.location) ? `<br/><span style="color:#555;">${esc(place(e.location))}</span>` : ""}</li>`).join("")}</ul>`
        : "<p>You didn't pick a showcase yet. We'll let you know as soon as the next one is on the calendar.</p>";

      // 1. Team alert
      resend.emails
        .send({
          from: "GFC Scouts <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          reply_to: email,
          subject: `🔎 New scout: ${fullName}${fields.company ? ` (${fields.company})` : ""}`,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#002147;font-size:15px;line-height:1.6;max-width:620px;">
            <h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">New Industry Scout</h2>
            <p><strong>${esc(fullName)}</strong><br/>${esc([fields.title, fields.company].filter(Boolean).join(" · "))}<br/>
            ${esc(email)}${fields.phone ? ` · ${esc(fields.phone)}` : ""}</p>
            <p><strong>Looking for:</strong> ${esc(fields.lookingFor.join(", ") || "—")}<br/>
            <strong>Genres:</strong> ${esc(fields.genres || "—")}<br/>
            <strong>Website:</strong> ${fields.website ? `<a href="${esc(fields.website)}">${esc(fields.website)}</a>` : "—"}<br/>
            <strong>Instagram:</strong> ${fields.instagram ? `@${esc(fields.instagram)}` : "—"}<br/>
            <strong>Showcase alerts:</strong> ${fields.notify ? "Yes" : "No"}</p>
            <p><strong>On the guest list for:</strong></p>${list}
          </div>`,
        })
        .catch((err) => console.error("Scout team email failed:", err.message));

      // 2. Confirmation to the scout
      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: email,
          reply_to: TEAM_EMAIL,
          subject: picked.length ? "You're on the list 🎶 Your free showcase ticket" : "You're on our scout list 🎶",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.6;max-width:600px;">
            <p>Hi ${esc(firstName)},</p>
            <p>Thanks for joining our scout list. Acoustic &amp; Infused™ puts Atlanta's rising singers, musicians, and live artists on one stage,
              and we're glad to have you in the room.</p>
            <h3 style="color:#002147;border-bottom:2px solid #C5A059;padding-bottom:4px;">${picked.length ? "You're on the guest list for" : "What's next"}</h3>
            ${list}
            ${picked.length ? "<p>Your ticket is free. Just check in at the door under your name. Bringing someone? They can grab a ticket on the event page.</p>" : ""}
            <p>Meet the artists before the show on each event page: <a href="${SITE_URL}/events" style="color:#9A7630;">${SITE_URL.replace("https://", "")}/events</a></p>
            ${fields.notify ? "<p>We'll email you when new showcases are added so you can claim your spot.</p>" : ""}
            <p>Questions? Just reply to this email.</p>
            <p>See you in the room,<br/>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
            <p style="margin-top:20px;"><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="width:110px;height:auto;border:0;"/><br/>
              <em style="color:#9A7630;">Where grown folks come out to play.&trade;</em></p>
          </div>`,
        })
        .catch((err) => console.error("Scout confirmation email failed:", err.message));
    }

    return res.status(201).json({
      message: "You're on the list",
      showcases: picked.map((e) => ({ id: String(e._id), name: e.name, date: e.date })),
      scoutId: String(scout._id),
    });
  } catch (err) {
    console.error("Scout sign-up error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
