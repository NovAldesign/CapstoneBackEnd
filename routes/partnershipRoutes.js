import express from 'express';
import Partnership from '../models/partnershipSchema.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

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

    // Stripped out password and industry requirements for our lean inquiry flow
    if (!companyName || !contactPerson || !email) {
      return res.status(400).json({
        error: 'Company name, contact person, and email are required.',
      });
    }

    // Build the dynamic record from the incoming frontend payload
    const partnership = new Partnership({
      companyName,
      contactPerson,
      email,
      phone,
      tierRequested,
      eventsInterested,
      hostingInterest,
      details,
      status: 'pending'
    });

    await partnership.save();

    res.status(201).json({
      success: true,
      message: 'Strategic proposal submitted. Thank you for joining the mission.',
    });

  } catch (err) {
    console.error('Partnership submission error:', err);

    // Gracefully handle duplicate emails without breaking the UI flow
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
      error: 'Submission failed on server. Please try again or contact support.',
    });
  }
});

/* -------------------------------------------------------
   GET /api/partnerships (Admin View remains fully intact)
------------------------------------------------------- */
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const partnerships = await Partnership.find().sort({ createdAt: -1 });
    res.json(partnerships);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch partnerships.' });
  }
});

/* (Keep remaining admin endpoints: GET /:id, PATCH /:id/status, DELETE /:id fully intact) */

export default router;