import express from "express";
import { Resend } from "resend";
import HostingInquiry from "../models/hostingInquirySchema.js";

const router = express.Router();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const TEAM_EMAIL = "events@grownfolkscollective.com";

const FREQUENCIES = ["One-time event", "Monthly series", "Biweekly series", "Weekly series"];

const PACKAGES = [
  "Play. Sip. Toast. Game Night",
  "Play. Sip. Toast. Spades Tournament",
  "Play. Sip. Toast. Karaoke Bingo",
  "Play. Sip. Toast. Live-Action Mystery",
  "Not sure yet",
];

// Keeps what people type from breaking the email layout
const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clean = (value, max = 200) => String(value || "").trim().slice(0, max);

const row = (label, value) =>
  `<tr>
    <td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#002147;"><strong>${escapeHtml(value || "—")}</strong></td>
  </tr>`;

/* -------------------------------------------------------
   POST /api/hosting  — Public (the /host page form)
------------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const firstName = clean(req.body.firstName, 60);
    const lastName = clean(req.body.lastName, 60);
    const email = clean(req.body.email, 120).toLowerCase();
    const phone = clean(req.body.phone, 20);
    const guestCount = Number(req.body.guestCount);

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ error: "Please fill in your name, email, and phone." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 1000) {
      return res.status(400).json({ error: "Please tell us about how many guests to expect." });
    }

    const clientType = ["residents", "corporate", "other"].includes(req.body.clientType)
      ? req.body.clientType
      : "other";
    const pkg = PACKAGES.includes(req.body.package) ? req.body.package : "Not sure yet";

    const inquiry = await HostingInquiry.create({
      firstName,
      lastName,
      email,
      phone,
      organization: clean(req.body.organization, 120),
      clientType,
      package: pkg,
      guestCount,
      preferredDate: clean(req.body.preferredDate, 60),
      city: clean(req.body.city, 80),
      toastUpgrade: Boolean(req.body.toastUpgrade),
      frequency: FREQUENCIES.includes(req.body.frequency) ? req.body.frequency : "One-time event",
      notes: clean(req.body.notes, 1500),
      source: clean(req.body.source, 60),
    });

    // Emails should never block the submission
    if (resend) {
      const typeLabel =
        inquiry.clientType === "residents" ? "Residents (apartment community)"
        : inquiry.clientType === "corporate" ? "Corporate / team"
        : "Other";

      const details = `
        <table style="border-collapse:collapse;font-size:15px;">
          ${row("Name", `${inquiry.firstName} ${inquiry.lastName}`)}
          ${row("Email", inquiry.email)}
          ${row("Phone", inquiry.phone)}
          ${row("Property / company", inquiry.organization)}
          ${row("Type", typeLabel)}
          ${row("Package", inquiry.package)}
          ${row("How often", inquiry.frequency)}
          ${row("Guests", String(inquiry.guestCount))}
          ${row("Preferred date", inquiry.preferredDate)}
          ${row("City", inquiry.city)}
          ${row("Töst toast upgrade", inquiry.toastUpgrade ? "Yes" : "No")}
          ${row("Notes", inquiry.notes)}
        </table>`;

      // 1. Notify the team
      resend.emails
        .send({
          from: "GFC Hosting <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          reply_to: inquiry.email,
          subject: `🥂 ${inquiry.frequency === "One-time event" ? "Hosting request" : `SERIES request (${inquiry.frequency})`}: ${inquiry.organization || `${inquiry.firstName} ${inquiry.lastName}`}, ${inquiry.guestCount} guests`,
          html: `
            <div style="font-family:sans-serif;padding:20px;color:#002147;">
              <h2 style="border-bottom:2px solid #C5A059;padding-bottom:10px;">New Play. Sip. Toast. Request</h2>
              ${details}
              <p style="margin-top:20px;color:#666;">Hit reply to answer ${escapeHtml(inquiry.firstName)} directly. Try to call within 1 business day.</p>
            </div>`,
        })
        .catch((err) => console.error("Hosting team email failed:", err.message));

      // 2. Confirm with the person who asked
      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: inquiry.email,
          reply_to: TEAM_EMAIL,
          subject: `${inquiry.firstName}, let's plan something worth toasting 🥂`,
          html: `
            <div style="font-family:sans-serif;padding:20px;color:#002147;max-width:600px;">
              <h2 style="color:#002147;">Thanks, ${escapeHtml(inquiry.firstName)}!</h2>
              <p style="font-size:15px;line-height:1.6;">
                We got your request for a Play. Sip. Toast. event. We'll reach out within
                1 business day to talk through your date, your guests, and your signature mocktail.
              </p>
              <h3 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">What you sent us</h3>
              ${details}
              <p style="font-size:15px;line-height:1.6;margin-top:20px;">
                Questions? Just reply to this email or call/text 470-256-7729.
              </p>
              <p style="font-size:15px;">Cheers,<br/>Vaughn, Chief Playmaker<br/>Grown Folks&trade; Collective</p>
            </div>`,
        })
        .catch((err) => console.error("Hosting confirmation email failed:", err.message));
    } else {
      console.warn("RESEND_API_KEY is not set — skipping hosting emails.");
    }

    return res.status(201).json({ message: "Request received", id: inquiry._id });
  } catch (err) {
    console.error("Hosting request error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
