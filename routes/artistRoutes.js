import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { Resend } from "resend";
import ArtistApplication from "../models/artistApplicationSchema.js";

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
              <p style="color:#666;font-size:13px;">Approving adds them to "Meet the Artists" on the event page (if they gave permission).
                Then give them a ticket code and send their invite.</p>
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
   /api/artists/:id/review?action=approve|decline&token=...
   From the team email: GET shows a confirm button,
   POST (the button) makes the change. This stops email apps
   that "preview" links from approving by accident.
------------------------------------------------------- */
const reviewPage = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
   <meta name="robots" content="noindex"/><title>${title}</title></head>
   <body style="font-family:Arial,Helvetica,sans-serif;color:#002147;max-width:560px;margin:60px auto;padding:0 20px;">
   <h1 style="border-bottom:3px solid #C5A059;padding-bottom:10px;">${title}</h1>${body}</body></html>`;

const findForReview = async (req) => {
  const action = req.query.action;
  const token = req.query.token;
  if (!mongoose.Types.ObjectId.isValid(req.params.id) || !["approve", "decline"].includes(action)) return null;
  const application = await ArtistApplication.findById(req.params.id);
  if (!application || !token || token !== application.reviewToken) return null;
  return { application, action };
};

router.get("/:id/review", async (req, res) => {
  try {
    const found = await findForReview(req);
    if (!found) return res.status(404).send(reviewPage("Invalid link", "<p>This review link isn't valid.</p>"));
    const { application, action } = found;
    const name = escapeHtml(application.artistName);
    const verb = action === "approve" ? "Approve" : "Decline";
    const color = action === "approve" ? "#002147" : "#B3261E";
    return res.send(reviewPage(`${verb} ${name}?`,
      `<p>Showcase: <strong>${escapeHtml(application.eventName)}</strong><br/>Current status: ${escapeHtml(application.status)}</p>
       <form method="POST">
         <button type="submit" style="background:${color};color:#fff;border:none;padding:14px 26px;font-size:16px;font-weight:bold;border-radius:4px;cursor:pointer;">
           Yes, ${verb.toLowerCase()} ${name}
         </button>
       </form>`));
  } catch (err) {
    console.error("Artist review error:", err.message);
    return res.status(500).send(reviewPage("Something went wrong", "<p>Please try the link again.</p>"));
  }
});

router.post("/:id/review", async (req, res) => {
  try {
    const found = await findForReview(req);
    if (!found) return res.status(404).send(reviewPage("Invalid link", "<p>This review link isn't valid.</p>"));
    const { application, action } = found;
    application.status = action === "approve" ? "approved" : "declined";
    application.reviewedAt = new Date();
    await application.save();

    const name = escapeHtml(application.artistName);
    if (action === "approve") {
      return res.send(reviewPage(`✅ ${name} is approved`,
        `<p>${application.featureConsent && application.eventId
          ? `${name} now shows in <strong>Meet the Artists</strong> on the ${escapeHtml(application.eventName)} page.`
          : `${name} is approved. They won't show in Meet the Artists because they ${application.featureConsent ? "didn't pick a specific showcase" : "didn't give permission to be featured"}.`}</p>
         <p><strong>Next:</strong> add their ticket code to <code>utilities/promoCodes.js</code> and send their invite.</p>`));
    }
    return res.send(reviewPage(`${name} was declined`, "<p>They won't appear on the website. You can still reply to their application email if you'd like to explain.</p>"));
  } catch (err) {
    console.error("Artist review error:", err.message);
    return res.status(500).send(reviewPage("Something went wrong", "<p>Please try the link again.</p>"));
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