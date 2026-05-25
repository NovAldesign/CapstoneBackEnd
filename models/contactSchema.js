const express = require('express');
const router  = express.Router();
const { Resend } = require('resend');
const Contact = require('../models/Contact');

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Helpers ────────────────────────────────────────────────────────────────

function buildEmailHtml(data) {
  const { firstName, lastName, email, phone, reason, message, eventDetails } = data;

  const eventBlock =
    reason === 'Plan an Event for Me'
      ? `
        <tr><td colspan="2" style="padding:12px 0 4px;font-weight:600;color:#b8972a;font-size:13px;text-transform:uppercase;letter-spacing:.06em;">Event Details</td></tr>
        <tr><td style="${tdL}">Event Type</td><td style="${tdR}">${eventDetails.eventType || '—'}</td></tr>
        <tr><td style="${tdL}">Guest Count</td><td style="${tdR}">${eventDetails.guestCount || '—'}</td></tr>
        <tr><td style="${tdL}">Preferred Date</td><td style="${tdR}">${eventDetails.preferredDate || '—'}</td></tr>
        <tr><td style="${tdL}">Budget Range</td><td style="${tdR}">${eventDetails.budget || '—'}</td></tr>
      `
      : '';

  const tdL = 'padding:8px 12px 8px 0;color:#888;font-size:14px;width:140px;vertical-align:top;';
  const tdR = 'padding:8px 0;color:#1a1a1a;font-size:14px;vertical-align:top;';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

            <!-- Header -->
            <tr>
              <td style="background:#1a1a1a;padding:28px 32px;">
                <p style="margin:0;color:#b8972a;font-size:11px;letter-spacing:.12em;text-transform:uppercase;">Grown Folks Collective</p>
                <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:600;">New Contact Submission</h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="${tdL}">Name</td><td style="${tdR}">${firstName} ${lastName}</td></tr>
                  <tr><td style="${tdL}">Email</td><td style="${tdR}"><a href="mailto:${email}" style="color:#b8972a;text-decoration:none;">${email}</a></td></tr>
                  <tr><td style="${tdL}">Phone</td><td style="${tdR}">${phone || '—'}</td></tr>
                  <tr><td style="${tdL}">Reason</td><td style="${tdR}">${reason}</td></tr>
                  ${eventBlock}
                  <tr><td colspan="2" style="padding:16px 0 0;border-top:1px solid #eee;"></td></tr>
                  <tr>
                    <td colspan="2" style="padding:0;color:#1a1a1a;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eee;">
                <p style="margin:0;color:#aaa;font-size:12px;">Submitted via grownfolkscollective.com</p>
              </td>
            </tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

// ── POST /api/contact ──────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, reason, message, eventDetails } = req.body;

    // ── Basic validation ──────────────────────────────────────────────────
    if (!firstName || !lastName || !email || !reason || !message) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message must be 2,000 characters or fewer.' });
    }

    // ── Save to MongoDB ───────────────────────────────────────────────────
    const contact = new Contact({
      firstName,
      lastName,
      email,
      phone:        phone || '',
      reason,
      message,
      eventDetails: eventDetails || {},
    });
    await contact.save();

    // ── Send email via Resend ─────────────────────────────────────────────
    await resend.emails.send({
      from:    'Grown Folks Collective <notifications@grownfolkscollective.com>',
      to:      [process.env.NOTIFY_EMAIL],          // your inbox, set in Railway env
      replyTo: email,
      subject: `New Contact: ${reason} — ${firstName} ${lastName}`,
      html:    buildEmailHtml({ firstName, lastName, email, phone, reason, message, eventDetails: eventDetails || {} }),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[/api/contact]', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;