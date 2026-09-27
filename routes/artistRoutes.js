import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { Resend } from "resend";
import ArtistApplication from "../models/artistApplicationSchema.js";
import Event from "../models/eventSchema.js";
import PromoCode from "../models/promoCodeSchema.js";
import {
  normalizeCode,
  codeExists,
  findPromoCode,
  promoAppliesToEvent,
  suggestArtistCode,
} from "../utilities/promoCodes.js";

const router = express.Router();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const TEAM_EMAIL = "events@grownfolkscollective.com";
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const UPLOAD_FOLDER = "gfc/artists";

// The terms artists agree to (also shown on the form)
export const ARTIST_TERMS = [
  "Sell at least 5 tickets using my personal ticket link.",
  "I'm paid $15 for every ticket sold with my link, up to $75, within 3–5 business days after the show via Zelle or Cash App.",
  "Have at least 3 tickets sold one week before the show to hold my spot.",
  "Bring all my own equipment (mic, amp, instrument, cables).",
  "Arrive 1 hour before doors for setup and sound check.",
  "Tag @grownfolkscollective when I promote the show.",
];

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clean = (value, max = 200) => String(value || "").trim().slice(0, max);

const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || ""));

const row = (label, value) =>
  `<tr>
    <td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#002147;">${value || "—"}</td>
  </tr>`;

/* -------------------------------------------------------
   GET /api/artists/upload-signature  — Public
   Lets the form upload a headshot straight to Cloudinary
   without exposing the secret key.
------------------------------------------------------- */
router.get("/upload-signature", (req, res) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    return res.status(500).json({ error: "Photo uploads aren't set up yet." });
  }
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = `folder=${UPLOAD_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + API_SECRET).digest("hex");
  res.json({ cloudName: CLOUD_NAME, apiKey: API_KEY, timestamp, folder: UPLOAD_FOLDER, signature });
});

/* -------------------------------------------------------
   POST /api/artists/apply  — Public
------------------------------------------------------- */
router.post("/apply", async (req, res) => {
  try {
    const b = req.body || {};
    const firstName = clean(b.firstName, 60);
    const lastName = clean(b.lastName, 60);
    const email = clean(b.email, 120).toLowerCase();
    const phone = clean(b.phone, 20);
    const artistName = clean(b.artistName, 80);
    const signatureName = clean(b.signatureName, 120);

    if (!firstName || !lastName || !email || !phone || !artistName) {
      return res.status(400).json({ error: "Please fill in your name, artist name, email, and phone." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    const performanceLinks = (Array.isArray(b.performanceLinks) ? b.performanceLinks : [])
      .map((l) => clean(l, 300))
      .filter(isHttpUrl)
      .slice(0, 4);
    if (!performanceLinks.length) {
      return res.status(400).json({ error: "Please add at least one link to a performance video or song." });
    }
    if (b.termsAccepted !== true) {
      return res.status(400).json({ error: "Please check every box to agree to the artist terms." });
    }
    if (!signatureName) {
      return res.status(400).json({ error: "Please type your full name to sign." });
    }

    // Only accept headshots uploaded to our own Cloudinary account
    const headshotUrl = clean(b.headshotUrl, 500);
    const validHeadshot =
      CLOUD_NAME && headshotUrl.startsWith(`https://res.cloudinary.com/${CLOUD_NAME}/`) ? headshotUrl : "";

    const application = await ArtistApplication.create({
      firstName,
      lastName,
      email,
      phone,
      artistName,
      genres: clean(b.genres, 120),
      hometown: clean(b.hometown, 80),
      bio: clean(b.bio, 600),
      headshotUrl: validHeadshot,
      instagram: clean(b.instagram, 80).replace(/^@/, ""),
      tiktok: clean(b.tiktok, 80).replace(/^@/, ""),
      otherSocial: clean(b.otherSocial, 300),
      performanceLinks,
      eventId: mongoose.Types.ObjectId.isValid(String(b.eventId || "")) ? String(b.eventId) : "",
      eventName: clean(b.eventName, 200) || "Any upcoming showcase",
      equipmentNotes: clean(b.equipmentNotes, 600),
      needsPower: Boolean(b.needsPower),
      payoutMethod: ["Zelle", "Cash App"].includes(b.payoutMethod) ? b.payoutMethod : "",
      payoutHandle: clean(b.payoutHandle, 120),
      termsAccepted: true,
      featureConsent: Boolean(b.featureConsent),
      signatureName,
      signedAt: new Date(),
      reviewToken: crypto.randomBytes(24).toString("hex"),
    });

    if (resend) {
      const base = `https://${req.get("host")}/api/artists/${application._id}`;
      const approveUrl = `${base}/review?action=approve&token=${application.reviewToken}`;
      const declineUrl = `${base}/review?action=decline&token=${application.reviewToken}`;
      const linksHtml = performanceLinks
        .map((l) => `<a href="${escapeHtml(l)}" style="color:#9A7630;">${escapeHtml(l)}</a>`)
        .join("<br/>");

      // 1. Team alert with one-click approve / decline
      resend.emails
        .send({
          from: "GFC Artist Applications <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          reply_to: application.email,
          subject: `🎤 Artist application: ${application.artistName} (${application.eventName})`,
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#002147;max-width:680px;">
              <h2 style="border-bottom:2px solid #C5A059;padding-bottom:10px;">New Artist Application</h2>
              ${application.headshotUrl ? `<img src="${escapeHtml(application.headshotUrl)}" alt="" style="width:160px;height:160px;object-fit:cover;border-radius:8px;margin:0 0 14px;"/>` : ""}
              <table style="border-collapse:collapse;font-size:15px;">
                ${row("Artist name", `<strong>${escapeHtml(application.artistName)}</strong>`)}
                ${row("Name", escapeHtml(`${application.firstName} ${application.lastName}`))}
                ${row("Email", escapeHtml(application.email))}
                ${row("Phone", escapeHtml(application.phone))}
                ${row("Showcase", escapeHtml(application.eventName))}
                ${row("Genre", escapeHtml(application.genres))}
                ${row("Hometown", escapeHtml(application.hometown))}
                ${row("Bio", escapeHtml(application.bio))}
                ${row("Performances", linksHtml)}
                ${row("Instagram", application.instagram ? `@${escapeHtml(application.instagram)}` : "")}
                ${row("TikTok", application.tiktok ? `@${escapeHtml(application.tiktok)}` : "")}
                ${row("Other", escapeHtml(application.otherSocial))}
                ${row("Equipment", escapeHtml(application.equipmentNotes))}
                ${row("Needs power outlet", application.needsPower ? "Yes" : "No")}
                ${row("Payout", escapeHtml([application.payoutMethod, application.payoutHandle].filter(Boolean).join(": ")))}
                ${row("Agreed to terms", "✅ Yes")}
                ${row("OK to feature on site/socials", application.featureConsent ? "✅ Yes" : "No")}
                ${row("Signed", escapeHtml(`${application.signatureName}, ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })}`))}
              </table>
              <p style="margin:24px 0 8px;">
                <a href="${approveUrl}" style="background:#002147;color:#fff;padding:12px 22px;text-decoration:none;font-weight:bold;border-radius:4px;">✅ Approve</a>
                &nbsp;&nbsp;
                <a href="${declineUrl}" style="color:#B3261E;font-weight:bold;">Decline</a>
              </p>
              <p style="color:#666;font-size:13px;">Approve lets you confirm their showcase and ticket code, then creates the code,
                emails their booking details, and adds them to "Meet the Artists" in one click.</p>
            </div>`,
        })
        .catch((err) => console.error("Artist team email failed:", err.message));

      // 2. Confirmation to the artist
      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: application.email,
          reply_to: TEAM_EMAIL,
          subject: `${application.artistName}, we got your application 🎶`,
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#002147;max-width:600px;font-size:15px;line-height:1.6;">
              <h2>Thanks for applying, ${escapeHtml(application.firstName)}!</h2>
              <p>We received your application to perform at <strong>${escapeHtml(application.eventName)}</strong>.
                We'll review your performance links and get back to you within 3–5 business days.</p>
              <h3 style="border-bottom:2px solid #C5A059;padding-bottom:6px;">What you agreed to</h3>
              <ul>${ARTIST_TERMS.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
              <p>You keep 100% of your merch and tips. 🎤</p>
              <p>Questions? Just reply to this email.</p>
              <p>Warmly,<br/>Grown Folks Collective</p>
            </div>`,
        })
        .catch((err) => console.error("Artist confirmation email failed:", err.message));
    }

    return res.status(201).json({ message: "Application received" });
  } catch (err) {
    console.error("Artist application error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   ONE-CLICK APPROVAL
   /api/artists/:id/review?action=approve|decline&token=...
   GET  = confirm page (pick showcase, confirm code, send email?)
   POST = approve: creates their ticket code, emails their booking
          details, and adds them to "Meet the Artists".
   (Two steps so email apps that "preview" links can't approve by accident.)
------------------------------------------------------- */
const SITE_URL = "https://www.grownfolkscollective.com";
const TIME_ZONE = "America/New_York";
const SET_MINUTES = 20;
const MUSIC_EVENT = /showcase|live music|acoustic|open mic|concert|jam session/i;

const fmtDay = (d) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });
const fmtShort = (d) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" });
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const ymd = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TIME_ZONE }); // YYYY-MM-DD

const addressLine = (loc = {}) => {
  const stateZip = [loc.state, loc.zip].filter(Boolean).join(" ");
  return [loc.address, loc.city, stateZip].filter(Boolean).join(", ");
};
const artistLink = (eventId, code) => `${SITE_URL}/events/showcase-${eventId}?code=${encodeURIComponent(code)}`;
const eventPageLink = (eventId) => `${SITE_URL}/events/showcase-${eventId}`;
const eventLabel = (ev) => `${fmtShort(ev.date)} · ${ev.name}`;

const reviewPage = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
   <meta name="robots" content="noindex"/><title>${title}</title>
   <style>
     body{font-family:Arial,Helvetica,sans-serif;color:#002147;max-width:600px;margin:50px auto;padding:0 20px;line-height:1.55;}
     h1{border-bottom:3px solid #C5A059;padding-bottom:10px;}
     label{display:block;font-weight:bold;margin:18px 0 6px;font-size:14px;}
     select,input[type=text]{width:100%;padding:11px;font-size:16px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;}
     .hint{color:#666;font-size:13px;margin:6px 0 0;}
     .check{display:flex;gap:10px;align-items:flex-start;font-weight:normal;}
     .box{background:#FAF7F0;border-left:3px solid #C5A059;padding:14px 16px;margin:18px 0;}
     code{background:#F5EFE3;padding:2px 6px;border-radius:3px;font-size:15px;}
     button{border:none;color:#fff;padding:14px 26px;font-size:16px;font-weight:bold;border-radius:4px;cursor:pointer;margin-top:22px;}
     a{color:#9A7630;font-weight:bold;}
   </style></head>
   <body><h1>${title}</h1>${body}</body></html>`;

const findForReview = async (req) => {
  const action = req.query.action;
  const token = req.query.token;
  if (!mongoose.Types.ObjectId.isValid(req.params.id) || !["approve", "decline"].includes(action)) return null;
  const application = await ArtistApplication.findById(req.params.id);
  if (!application || !token || token !== application.reviewToken) return null;
  return { application, action };
};

// Upcoming music events, plus the one the artist picked
const showcaseOptions = async (application) => {
  const upcoming = await Event.find({ status: "published", date: { $gte: new Date() } })
    .sort({ date: 1 })
    .select("name date")
    .lean();
  return upcoming.filter(
    (e) => MUSIC_EVENT.test(e.name || "") || String(e._id) === String(application.eventId)
  );
};

// Their "You're booked!" email
const sendBookingEmail = async (application, event, code) => {
  if (!resend) return false;
  const loc = event.location || {};
  const doors = new Date(event.date);
  const arrive = new Date(doors.getTime() - 60 * 60 * 1000);
  const holdBy = new Date(doors.getTime() - 7 * 24 * 60 * 60 * 1000);
  const link = artistLink(event._id, code);
  const featured = application.featureConsent;
  const payout = application.payoutMethod
    ? `via <strong>${escapeHtml(application.payoutMethod)}</strong>${application.payoutHandle ? ` (${escapeHtml(application.payoutHandle)})` : ""}`
    : "via <strong>Zelle</strong> or <strong>Cash App</strong>";
  const h3 = (t) =>
    `<h3 style="color:#002147;border-bottom:2px solid #C5A059;padding-bottom:4px;margin:26px 0 8px;">${t}</h3>`;

  await resend.emails.send({
    from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
    to: application.email,
    bcc: TEAM_EMAIL,
    reply_to: TEAM_EMAIL,
    subject: `You're booked! 🎤 ${event.name} (${fmtShort(event.date)})`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
        <p>Hi ${escapeHtml(application.firstName)},</p>
        <p>You're officially on the lineup for <strong>${escapeHtml(event.name)}</strong>! 🎶 Here's everything you need.</p>

        ${h3("The Event")}
        <ul>
          <li><strong>Date:</strong> ${escapeHtml(fmtDay(event.date))}</li>
          <li><strong>Time:</strong> ${escapeHtml(fmtTime(event.date))}${event.endDate ? ` to ${escapeHtml(fmtTime(event.endDate))}` : ""}.
            Please arrive by <strong>${escapeHtml(fmtTime(arrive))}</strong> for setup and sound check.</li>
          <li><strong>Location:</strong> ${escapeHtml([loc.name, addressLine(loc)].filter(Boolean).join(", "))}</li>
          <li><strong>Your set:</strong> ${SET_MINUTES} minutes. We'll share the performance order closer to the date.</li>
        </ul>

        ${h3("Your Personal Ticket Link")}
        <p style="margin:0 0 10px;">Share this link with your fans. Every ticket bought through it counts toward your 5:</p>
        <p style="margin:0 0 10px;">
          <a href="${link}" style="display:inline-block;background:#002147;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:bold;border-radius:4px;">Get Tickets</a>
        </p>
        <p style="margin:0;font-size:14px;color:#444;">${escapeHtml(link)}<br/>Your code: <strong>${escapeHtml(code)}</strong></p>

        ${h3("Key Dates")}
        <ul>
          <li><strong>${escapeHtml(fmtDay(holdBy))}:</strong> have at least <strong>3 tickets</strong> sold to hold your spot.</li>
          <li><strong>${escapeHtml(fmtDay(event.date))}:</strong> showtime! Arrive by ${escapeHtml(fmtTime(arrive))}.</li>
        </ul>

        ${h3("Your Pay")}
        <ul>
          <li><strong>$15 for every ticket sold with your link, up to $75</strong> for 5 tickets, paid within 3–5 business days after the show ${payout}.</li>
          <li>Set up a merch table and a tip jar or QR code. <strong>You keep 100%</strong> of those sales.</li>
        </ul>

        ${h3("Promotion")}
        <ul>
          ${featured ? `<li>Your photo and bio are now featured in <strong>Meet the Artists</strong> on the <a href="${eventPageLink(event._id)}" style="color:#9A7630;">event page</a>.</li>` : ""}
          <li>We'll promote you on our socials and email list. When you post about the show, please tag <strong>@grownfolkscollective</strong>.</li>
        </ul>

        ${h3("Reminders")}
        <ul>
          <li>Bring all your own equipment (mic, amp, instrument, cables).${application.needsPower ? " We noted you need a power outlet." : ""}</li>
          <li>Questions or changes? Just reply to this email.</li>
        </ul>

        <p>We're excited to have you!</p>
        <p>Warmly,<br/>Vaughn<br/>Grown Folks Collective</p>
      </div>`,
  });
  return true;
};

router.get("/:id/review", async (req, res) => {
  try {
    const found = await findForReview(req);
    if (!found) return res.status(404).send(reviewPage("Invalid link", "<p>This review link isn't valid.</p>"));
    const { application, action } = found;
    const name = escapeHtml(application.artistName);

    if (action === "decline") {
      return res.send(reviewPage(`Decline ${name}?`,
        `<p>They won't appear on the website. No email is sent, so you can reply to their application personally if you'd like.</p>
         <form method="POST"><button type="submit" style="background:#B3261E;">Yes, decline ${name}</button></form>`));
    }

    const options = await showcaseOptions(application);
    if (!options.length) {
      return res.send(reviewPage(`Approve ${name}`,
        "<p>There are no upcoming showcases on the website yet. Publish the showcase in Eventbrite first, then use this link again.</p>"));
    }
    const selected = options.find((e) => String(e._id) === String(application.eventId)) || options[0];
    const suggested = application.promoCode || (await suggestArtistCode(application.artistName, selected));

    return res.send(reviewPage(`Approve ${name}`,
      `<p>Status: <strong>${escapeHtml(application.status)}</strong>${application.promoCode ? ` · Code: <code>${escapeHtml(application.promoCode)}</code>` : ""}</p>
       <form method="POST">
         <label for="eventId">Showcase</label>
         <select id="eventId" name="eventId">
           ${options.map((e) => `<option value="${e._id}" ${String(e._id) === String(selected._id) ? "selected" : ""}>${escapeHtml(eventLabel(e))}</option>`).join("")}
         </select>

         <label for="code">Their ticket code</label>
         <input id="code" name="code" type="text" value="${escapeHtml(suggested)}" maxlength="14" autocomplete="off"/>
         <p class="hint">Letters and numbers only. Their link will be: ${escapeHtml(SITE_URL)}/events/showcase-…?code=<strong>${escapeHtml(suggested)}</strong></p>

         <label class="check"><input type="checkbox" name="sendEmail" value="yes" ${application.bookingEmailSentAt ? "" : "checked"}/>
           <span>Email ${escapeHtml(application.firstName)} their booking details and ticket link${application.bookingEmailSentAt ? " (already sent once)" : ""}</span></label>

         <div class="box">Approving will:<br/>✓ create their ticket code<br/>✓ ${application.featureConsent ? "add them to Meet the Artists on the event page" : "<em>not</em> show them on the event page (they didn't give permission)"}<br/>✓ send their booking email (if checked)</div>
         <button type="submit" style="background:#002147;">Yes, approve ${name}</button>
       </form>`));
  } catch (err) {
    console.error("Artist review error:", err.message);
    return res.status(500).send(reviewPage("Something went wrong", "<p>Please try the link again.</p>"));
  }
});

router.post("/:id/review", async (req, res) => {
  const back = `<p><a href="javascript:history.back()">← Go back</a></p>`;
  try {
    const found = await findForReview(req);
    if (!found) return res.status(404).send(reviewPage("Invalid link", "<p>This review link isn't valid.</p>"));
    const { application, action } = found;
    const name = escapeHtml(application.artistName);

    if (action === "decline") {
      application.status = "declined";
      application.reviewedAt = new Date();
      await application.save();
      return res.send(reviewPage(`${name} was declined`, "<p>They won't appear on the website.</p>"));
    }

    // 1. The showcase
    const eventId = String(req.body?.eventId || application.eventId || "");
    const event = mongoose.Types.ObjectId.isValid(eventId)
      ? await Event.findById(eventId).select("name date endDate location").lean()
      : null;
    if (!event) return res.status(400).send(reviewPage("Pick a showcase", `<p>Please choose which showcase they're performing at.</p>${back}`));

    // 2. Their ticket code (reuse it if it already works for this showcase)
    const code = normalizeCode(req.body?.code) || (await suggestArtistCode(application.artistName, event));
    if (code.length < 3 || code.length > 14) {
      return res.status(400).send(reviewPage("Check the code", `<p>Codes need 3–14 letters or numbers.</p>${back}`));
    }
    const existing = await codeExists(code);
    if (existing) {
      const live = await findPromoCode(code);
      if (!live || !promoAppliesToEvent(live, event)) {
        return res.status(400).send(reviewPage("That code is taken",
          `<p><code>${escapeHtml(code)}</code> is already used for something else. Please go back and pick a different code.</p>${back}`));
      }
    } else {
      try {
        await PromoCode.create({
          code,
          label: `Artist: ${application.artistName}, ${eventLabel(event)}`,
          type: "tracking",
          value: 0,
          eventIds: [String(event._id)],
          expires: ymd(event.date),
          source: "artist",
          artistId: String(application._id),
        });
      } catch (err) {
        if (err?.code === 11000) {
          return res.status(400).send(reviewPage("That code is taken", `<p>Please go back and pick a different code.</p>${back}`));
        }
        throw err;
      }
    }

    // 3. Approve + book them for this showcase
    application.status = "approved";
    application.reviewedAt = application.reviewedAt || new Date();
    application.eventId = String(event._id);
    application.eventName = eventLabel(event);
    application.promoCode = code;

    // 4. Booking email
    let emailNote = "Booking email not sent (unchecked).";
    if (req.body?.sendEmail === "yes") {
      try {
        const sent = await sendBookingEmail(application, event, code);
        if (sent) {
          application.bookingEmailSentAt = new Date();
          emailNote = `✓ Booking email sent to ${escapeHtml(application.email)} (you got a copy).`;
        } else {
          emailNote = "Email isn't set up on the server, so no booking email was sent.";
        }
      } catch (err) {
        console.error("Booking email failed:", err.message);
        emailNote = "⚠️ The booking email failed to send. Please email them their link below.";
      }
    }
    await application.save();

    const link = artistLink(event._id, code);
    return res.send(reviewPage(`✅ ${name} is booked`,
      `<div class="box">
         <strong>${escapeHtml(eventLabel(event))}</strong><br/>
         Code: <code>${escapeHtml(code)}</code><br/>
         Their link: <a href="${link}">${escapeHtml(link)}</a>
       </div>
       <p>${emailNote}</p>
       <p>${application.featureConsent
         ? `✓ They now show in <strong>Meet the Artists</strong>. <a href="${eventPageLink(event._id)}">View the event page →</a>`
         : "They won't show in Meet the Artists (they didn't give permission to be featured)."}</p>
       <p style="color:#666;font-size:14px;">Their sales will show under <code>${escapeHtml(code)}</code> in your code report.</p>`));
  } catch (err) {
    console.error("Artist approve error:", err.message);
    return res.status(500).send(reviewPage("Something went wrong", `<p>Please try again.</p>${back}`));
  }
});

/* -------------------------------------------------------
   GET /api/artists/public?eventId=...  — Public
   Approved artists for "Meet the Artists" (public info only)
------------------------------------------------------- */
router.get("/public", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "");
    if (!mongoose.Types.ObjectId.isValid(eventId)) return res.json([]);
    const artists = await ArtistApplication.find({
      eventId,
      status: "approved",
      featureConsent: true,
    })
      .sort({ reviewedAt: 1 })
      .select("artistName genres hometown bio headshotUrl instagram tiktok performanceLinks")
      .lean();

    res.json(
      artists.map((a) => ({
        id: String(a._id),
        artistName: a.artistName,
        genres: a.genres,
        hometown: a.hometown,
        bio: a.bio,
        headshotUrl: a.headshotUrl,
        instagram: a.instagram,
        tiktok: a.tiktok,
        listenUrl: (a.performanceLinks || [])[0] || "",
      }))
    );
  } catch (err) {
    console.error("Public artists error:", err.message);
    res.json([]);
  }
});

export default router;