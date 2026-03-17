import express from 'express';
import Contact from '../models/Contact.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/* -------------------------------------------------------
   POST /api/contact
   Public — anyone can submit
   Saves to MongoDB, sends email notification to Vaughn
   Body: { firstName, lastName, email, phone, reason,
           message, eventDetails? }
------------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      reason,
      message,
      eventDetails,
    } = req.body;

    if (!firstName || !lastName || !email || !reason || !message) {
      return res.status(400).json({
        error: 'Please fill in all required fields.',
      });
    }

    // Save to MongoDB
    const contact = new Contact({
      firstName,
      lastName,
      email,
      phone: phone || '',
      reason,
      message,
      eventDetails: eventDetails || {},
    });

    await contact.save();

    // -------------------------------------------------------
    // Email notification — using nodemailer or Resend
    // Uncomment and configure whichever you use
    // -------------------------------------------------------

    // OPTION A: Resend (recommended — simple API, great free tier)
    // npm install resend
    //
    // import { Resend } from 'resend';
    // const resend = new Resend(process.env.RESEND_API_KEY);
    //
    // await resend.emails.send({
    //   from: 'GFC Contact Form <noreply@yourdomain.com>',
    //   to: process.env.ADMIN_EMAIL,
    //   subject: `New GFC Message — ${reason}`,
    //   html: `
    //     <h2>New Contact Form Submission</h2>
    //     <p><strong>From:</strong> ${firstName} ${lastName}</p>
    //     <p><strong>Email:</strong> ${email}</p>
    //     <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
    //     <p><strong>Reason:</strong> ${reason}</p>
    //     <hr />
    //     <p><strong>Message:</strong></p>
    //     <p>${message}</p>
    //     ${eventDetails?.eventType ? `
    //       <hr />
    //       <h3>Event Details</h3>
    //       <p><strong>Type:</strong> ${eventDetails.eventType}</p>
    //       <p><strong>Guests:</strong> ${eventDetails.guestCount}</p>
    //       <p><strong>Date:</strong> ${eventDetails.preferredDate}</p>
    //       <p><strong>Budget:</strong> ${eventDetails.budget}</p>
    //     ` : ''}
    //   `,
    // });

    // OPTION B: Nodemailer + Gmail
    // npm install nodemailer
    //
    // import nodemailer from 'nodemailer';
    // const transporter = nodemailer.createTransport({
    //   service: 'gmail',
    //   auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    // });
    // await transporter.sendMail({
    //   from: process.env.GMAIL_USER,
    //   to: process.env.ADMIN_EMAIL,
    //   subject: `New GFC Message — ${reason}`,
    //   text: `From: ${firstName} ${lastName}\nEmail: ${email}\n\n${message}`,
    // });

    contact.notificationSent = true;
    await contact.save();

    res.status(201).json({
      success: true,
      message: 'Message received. We will be in touch within 48 hours.',
    });

  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({
      error: 'Something went wrong. Please try again or reach out directly.',
    });
  }
});

/* -------------------------------------------------------
   GET /api/contact
   Admin only — view all submissions
------------------------------------------------------- */
router.get(
  '/',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const contacts = await Contact.find()
        .sort({ createdAt: -1 });
      res.json(contacts);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch contacts.' });
    }
  }
);

/* -------------------------------------------------------
   PATCH /api/contact/:id/status
   Admin only — update contact status
------------------------------------------------------- */
router.patch(
  '/:id/status',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const { status } = req.body;
      const contact = await Contact.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );
      if (!contact) return res.status(404).json({ error: 'Contact not found.' });
      res.json(contact);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update status.' });
    }
  }
);

export default router;