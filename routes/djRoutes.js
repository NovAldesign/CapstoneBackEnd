import express from "express";
import { mailer } from "../utilities/mailer.js";
import DjApplication, { DJ_ERAS, DJ_EQUIPMENT, DJ_NIGHTS } from "../models/djApplicationSchema.js";

// ── DJs: /api/djs ──
// POST /  — Public sign-up from /perform/dj (Scratched & Stirred™, coming 2027).
// Saves the DJ (one record per email) and emails them + the team.
const router = express.Router();
const resend = mailer;

const TEAM_EMAIL = "events@grownfolkscollective.com";
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;

const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const esc = (v = "") =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const pick = (list, allowed) => (Array.isArray(list) ? list : []).filter((x) => allowed.includes(x));

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    if (clean(b.fax)) return res.status(201).json({ message: "Thanks" }); // bot trap

    const firstName = clean(b.firstName, 60);
    const lastName = clean(b.lastName, 60);
    const email = clean(b.email, 120).toLowerCase();
    const djName = clean(b.djName, 80);
    if (!firstName || !lastName || !email || !djName) {
      return res.status(400).json({ error: "Please fill in your name, DJ name and email." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    const mixLinks = (Array.isArray(b.mixLinks) ? b.mixLinks : []).map((l) => clean(l, 300)).filter(Boolean).slice(0, 3);
    if (!mixLinks.length || !mixLinks.every((l) => /^https?:\/\/\S+$/i.test(l))) {
      return res.status(400).json({ error: "Please add at least one mix or video link (starting with https://)." });
    }
    if (b.agreed !== true) {
      return res.status(400).json({ error: "Please agree to the Code of Conduct and Participation Waiver." });
    }

    const fields = {
      firstName,
      lastName,
      phone: clean(b.phone, 20),
      djName,
      instagram: clean(b.instagram, 80).replace(/^@/, ""),
      tiktok: clean(b.tiktok, 80).replace(/^@/, ""),
      mixLinks,
      eras: pick(b.eras, DJ_ERAS),
      otherStyles: clean(b.otherStyles, 200),
      yearsSpinning: clean(b.yearsSpinning, 20),
      equipment: DJ_EQUIPMENT.includes(b.equipment) ? b.equipment : "",
      nights: pick(b.nights, DJ_NIGHTS),
      about: clean(b.about, 1200),
      alsoBooks: b.alsoBooks === true,
      notify: b.notify !== false,
      agreedAt: new Date(),
      source: clean(b.source, 120),
    };

    const dj = await DjApplication.findOneAndUpdate(
      { email },
      { $set: fields },
      { new: true, upsert: true, runValidators: true }
    );

    if (resend) {
      const fullName = `${firstName} ${lastName}`;
      const links = mixLinks.map((l) => `<a href="${esc(l)}">${esc(l)}</a>`).join("<br/>");

      // 1. Team alert
      resend.emails
        .send({
          from: "GFC DJs <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          reply_to: email,
          subject: `🎧 New DJ: ${djName} (${fullName})`,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#002147;font-size:15px;line-height:1.6;max-width:620px;">
            <h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">New DJ for Scratched &amp; Stirred&trade;</h2>
            <p><strong>${esc(djName)}</strong> · ${esc(fullName)}<br/>${esc(email)}${fields.phone ? ` · ${esc(fields.phone)}` : ""}</p>
            <p><strong>Eras:</strong> ${esc(fields.eras.join(", ") || "—")}${fields.otherStyles ? `<br/><strong>Also spins:</strong> ${esc(fields.otherStyles)}` : ""}<br/>
            <strong>Years spinning:</strong> ${esc(fields.yearsSpinning || "—")}<br/>
            <strong>Equipment:</strong> ${esc(fields.equipment || "—")}<br/>
            <strong>Best nights:</strong> ${esc(fields.nights.join(", ") || "—")}<br/>
            <strong>Open to private and corporate gigs:</strong> ${fields.alsoBooks ? "Yes" : "No"}<br/>
            <strong>Instagram:</strong> ${fields.instagram ? `@${esc(fields.instagram)}` : "—"} · <strong>TikTok:</strong> ${fields.tiktok ? `@${esc(fields.tiktok)}` : "—"}</p>
            <p><strong>Mixes:</strong><br/>${links}</p>
            ${fields.about ? `<p><strong>About:</strong><br/>${esc(fields.about)}</p>` : ""}
          </div>`,
        })
        .catch((err) => console.error("DJ team email failed:", err.message));

      // 2. Confirmation to the DJ
      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: email,
          reply_to: TEAM_EMAIL,
          subject: "You're on the list for Scratched & Stirred™",
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.6;max-width:600px;">
            <p>Hi ${esc(firstName)},</p>
            <p>Thanks for joining the DJ list for <strong>Scratched &amp; Stirred&trade;</strong>, the Grown Folks DJ night coming in 2027.
              Three DJs, three eras and one dance floor for Atlanta's 30+ crowd. Your favorites, remixed &amp; refreshed.</p>
            <p>We'll listen to your mixes and reach out as we start booking. Everyone on this list hears about dates first, along with how booking and pay work.</p>
            <p>Want to see the kind of rooms we fill? Check out our upcoming events at <a href="${SITE_URL}/events" style="color:#9A7630;">grownfolkscollective.com/events</a>, and follow <strong>@grownfolkscollective</strong>.</p>
            <p>Questions? Just reply to this email.</p>
            <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
            <p style="margin-top:20px;"><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="width:110px;height:auto;border:0;"/><br/>
              <em style="color:#9A7630;">Where grown folks come out to play.&trade;</em></p>
          </div>`,
        })
        .catch((err) => console.error("DJ confirmation email failed:", err.message));
    }

    return res.status(201).json({ message: "You're on the list", djId: String(dj._id) });
  } catch (err) {
    console.error("DJ sign-up error:", err.message);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
