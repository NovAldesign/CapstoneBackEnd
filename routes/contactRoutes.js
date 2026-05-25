import express from 'express';
import { Resend } from 'resend';
import Contact from '../models/contactSchema.js'; // This cleanly imports our fixed model default export now!
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/* -------------------------------------------------------
   POST /api/contact  — Public
------------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone,
      reason, message, eventDetails,
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !reason || !message) {
      return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message must be under 2,000 characters.' });
    }

    // Save to MongoDB
    const contact = new Contact({
      firstName: firstName.trim(),
      lastName:  lastName.trim(),
      email:     email.trim().toLowerCase(),
      phone:     phone?.trim() || '',
      reason,
      message:   message.trim(),
      eventDetails: eventDetails || {},
    });

    await contact.save();

    // Send emails (non-blocking — don't fail the submission if email fails)
    try {
      if (!resend) {
        console.warn('RESEND_API_KEY is not set — skipping email notifications.');
        throw new Error('Resend not configured');
      }

      const eventSection = eventDetails?.eventType ? `
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
        <h3 style="margin:0 0 8px">Event Details</h3>
        <p><strong>Type:</strong> ${eventDetails.eventType}</p>
        <p><strong>Guests:</strong> ${eventDetails.guestCount || 'Not specified'}</p>
        <p><strong>Date:</strong> ${eventDetails.preferredDate || 'Not specified'}</p>
        <p><strong>Budget:</strong> ${eventDetails.budget || 'Not specified'}</p>
      ` : '';

      // 1. Notify you (admin fallback included for environmental variable stability)
      await resend.emails.send({
        from: 'GFC Contact Form <noreply@grownfolkscollective.com>',
        to:   process.env.ADMIN_EMAIL || 'hello@grownfolkscollective.com',
        subject: `New GFC Message — ${reason}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto">
            <h2 style="margin:0 0 16px">New Contact Form Submission</h2>
            <p><strong>From:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
            <p><strong>Message:</strong></p>
            <p style="white-space:pre-wrap">${message}</p>
            ${eventSection}
          </div>
        `,
      });

      // 2. Confirm to the user
      await resend.emails.send({
        from: 'Grown Folks Collective <hello@grownfolkscollective.com>',
        to:   email,
        subject: 'We received your message — GFC',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto">
            <h2>Thanks, ${firstName}!</h2>
            <p>We received your message and will get back to you within 48 hours.</p>
            <p><strong>Your message:</strong></p>
            <p style="white-space:pre-wrap;color:#555">${message}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
            <p style="color:#888;font-size:14px">
              Grown Folks Collective · Atlanta, GA<br/>
              <a href="mailto:hello@grownfolkscollective.com">hello@grownfolkscollective.com</a>
            </p>
          </div>
        `,
      });

      contact.notificationSent = true;
      await contact.save();

    } catch (emailErr) {
      console.error('Email notification failed:', emailErr);
    }

    res.status(201).json({
      success: true,
      message: 'Message received. We will be in touch within 48 hours.',
    });

  } catch (err) {
    console.error('Contact form error:', err);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('. ') });
    }

    res.status(500).json({
      error: 'Something went wrong. Please try again or reach out directly.',
    });
  }
});

/* -------------------------------------------------------
   GET /api/contact  — Admin only
------------------------------------------------------- */
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};

    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Contact.countDocuments(filter);

    res.json({ contacts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts.' });
  }
});

/* -------------------------------------------------------
   PATCH /api/contact/:id/status  — Admin only
------------------------------------------------------- */
router.patch('/:id/status', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['new', 'read', 'responded', 'archived'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!contact) return res.status(404).json({ error: 'Contact not found.' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

export default router;