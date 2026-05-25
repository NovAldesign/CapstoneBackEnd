import express from 'express';
import { Resend } from 'resend'; // 1. Import Resend
import Partnership from '../models/partnershipSchema.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// 2. Initialize the Resend client using your existing environment key
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/* -------------------------------------------------------
   POST /api/partnerships
   Public — submit a partnership inquiry
------------------------------------------------------- */
router.post('/', async (req, res) => {
  try {
    const {
      companyName,
      contactPerson,
      email,
      phone,
      tierRequested,
      eventsInterested,
      hostingInterest,
      details
    } = req.body;

    if (!companyName || !contactPerson || !email) {
      return res.status(400).json({
        error: 'Company name, contact person, and email are required.',
      });
    }

    // Save records to MongoDB first
    const partnership = new Partnership({
      companyName,
      contactPerson,
      email,
      phone: phone || '',
      tierRequested: tierRequested || 'Not sure / Custom',
      eventsInterested: eventsInterested || [],
      hostingInterest: hostingInterest || '',
      details: details || '',
      status: 'pending'
    });

    await partnership.save();

    // 3. Trigger Targeted Email Routing (Non-blocking loop)
    try {
      if (!resend) {
        console.warn('RESEND_API_KEY is missing — skipping partnership alert emails.');
        throw new Error('Resend not configured');
      }

      // Format events list for the admin digest
      const formattedEvents = eventsInterested && eventsInterested.length > 0
        ? eventsInterested.join(', ')
        : 'None selected';

      // EMAIL A: Send to your dedicated partnerships inbox
      await resend.emails.send({
        from: 'GFC Partnership Portal <noreply@grownfolkscollective.com>',
        to: 'partnerships@grownfolkscollective.com', // Separated destination address
        subject: `New Strategic Proposal: ${companyName} (${tierRequested})`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#002147;">
            <h2 style="border-bottom:2px solid #C5A059;padding-bottom:10px;">New Partnership Inquiry</h2>
            <p><strong>Company / Brand Name:</strong> ${companyName}</p>
            <p><strong>Contact Person:</strong> ${contactPerson}</p>
            <p><strong>Email Address:</strong> ${email}</p>
            <p><strong>Phone Number:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Tier Level Requested:</strong> ${tierRequested}</p>
            <p><strong>Co-Creation Interest:</strong> ${hostingInterest || 'Standard placement only'}</p>
            <p><strong>Auditioning Events:</strong> ${formattedEvents}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
            <p><strong>Brand Timeline & Context Details:</strong></p>
            <p style="white-space:pre-wrap;background:#fcfbfa;padding:15px;border-left:4px solid #C5A059;">${details || 'No additional details provided.'}</p>
          </div>
        `,
      });

      // EMAIL B: Send corporate confirmation receipt to the partner applicant
      await resend.emails.send({
        from: 'Grown Folks Collective <partnerships@grownfolkscollective.com>', // Branded sender
        to: email,
        subject: 'Your Partnership Inquiry — Grown Folks Collective',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#002147;line-height:1.6;">
            <h2>Thank you for connecting, ${contactPerson}.</h2>
            <p>We have received your strategic proposal for <strong>${companyName}</strong> to partner with the Collective.</p>
            <p>Our demographics team is currently auditing target event formats for alignment. You can expect a direct response or timeline setup schedule from our partnerships desk within the next 48 hours.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
            <p style="color:#888;font-size:13px;">
              <strong>Grown Folks Collective</strong><br />
              Atlanta & Surrounding Cities<br />
              <a href="mailto:partnerships@grownfolkscollective.com" style="color:#C5A059;">partnerships@grownfolkscollective.com</a>
            </p>
          </div>
        `,
      });

    } catch (emailErr) {
      // Prevents route crashes if Resend experiences an API interruption
      console.error('Partnership notification routing failed:', emailErr);
    }

    res.status(201).json({
      success: true,
      message: 'Strategic proposal submitted. Thank you for joining the mission.',
    });

  } catch (err) {
    console.error('Partnership submission error:', err);

    if (err.code === 11000) {
      return res.status(400).json({ 
        error: 'An inquiry using this email address has already been submitted.' 
      });
    }

    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: message });
    }

    res.status(500).json({
      error: 'Submission failed on server. Please try again later.',
    });
  }
});

/* (Keep your administrative GET, PATCH, and DELETE endpoints down here unchanged) */

export default router;