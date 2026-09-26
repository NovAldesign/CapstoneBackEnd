import express from "express";
import { Resend } from "resend";
import GroupBooking from "../models/groupBookingSchema.js";

const router = express.Router();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const TEAM_EMAIL = "community@grownfolkscollective.com";

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
   POST /api/group-bookings  — Public
------------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const firstName = clean(req.body.firstName, 60);
    const lastName = clean(req.body.lastName, 60);
    const email = clean(req.body.email, 120).toLowerCase();
    const phone = clean(req.body.phone, 20);
    const groupSize = Number(req.body.groupSize);

    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ error: "Please fill in your name, email, and phone." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!Number.isFinite(groupSize) || groupSize < 1 || groupSize > 200) {
      return res.status(400).json({ error: "Please tell us how many people are in your group." });
    }

    const booking = await GroupBooking.create({
      firstName,
      lastName,
      email,
      phone,
      occasion: clean(req.body.occasion, 60),
      eventId: clean(req.body.eventId, 60),
      eventTitle: clean(req.body.eventTitle, 200),
      groupSize,
      songRequests: clean(req.body.songRequests, 1500),
      bringingCake: Boolean(req.body.bringingCake),
      wantsMocktails: Boolean(req.body.wantsMocktails),
      notes: clean(req.body.notes, 1500),
    });

    // Emails should never block the submission
    if (resend) {
      const details = `
        <table style="border-collapse:collapse;font-size:15px;">
          ${row("Name", `${booking.firstName} ${booking.lastName}`)}
          ${row("Email", booking.email)}
          ${row("Phone", booking.phone)}
          ${row("Occasion", booking.occasion)}
          ${row("Event", booking.eventTitle || "Not sure yet")}
          ${row("Group size", String(booking.groupSize))}
          ${row("Bringing a cake", booking.bringingCake ? "Yes" : "No")}
          ${row("Mocktail special", booking.wantsMocktails ? "Interested" : "No")}
          ${row("Songs / card requests", booking.songRequests)}
          ${row("Notes", booking.notes)}
        </table>`;

      // 1. Notify the team
      resend.emails
        .send({
          from: "GFC Group Bookings <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          reply_to: booking.email,
          subject: `🎉 Group request: ${booking.firstName} ${booking.lastName}, party of ${booking.groupSize}`,
          html: `
            <div style="font-family:sans-serif;padding:20px;color:#002147;">
              <h2 style="border-bottom:2px solid #C5A059;padding-bottom:10px;">New Group Request</h2>
              ${details}
              <p style="margin-top:20px;color:#666;">Hit reply to answer ${escapeHtml(booking.firstName)} directly.</p>
            </div>`,
        })
        .catch((err) => console.error("Group booking team email failed:", err.message));

      // 2. Confirm with the guest
      resend.emails
        .send({
          from: "GFC <noreply@grownfolkscollective.com>",
          to: booking.email,
          reply_to: TEAM_EMAIL,
          subject: `${booking.firstName}, we got your group request 🎉`,
          html: `
            <div style="font-family:sans-serif;padding:20px;color:#002147;max-width:600px;">
              <h2 style="color:#002147;">Let's celebrate, ${escapeHtml(booking.firstName)}!</h2>
              <p style="font-size:15px;line-height:1.6;">
                Thanks for planning your group outing with Grown Folks Collective.
                We'll email you within 48 hours with your group ticket link and next steps.
              </p>
              <h3 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">What you sent us</h3>
              ${details}
              <p style="font-size:15px;line-height:1.6;margin-top:20px;">
                Questions or changes? Just reply to this email.
              </p>
              <p style="font-size:15px;">See you soon,<br/>Vaughn &amp; the GFC team</p>
            </div>`,
        })
        .catch((err) => console.error("Group booking guest email failed:", err.message));
    } else {
      console.warn("RESEND_API_KEY is not set — skipping group booking emails.");
    }

    return res.status(201).json({ message: "Request received", id: booking._id });
  } catch (err) {
    console.error("Group booking error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;