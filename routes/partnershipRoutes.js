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
      industry,
      contactPerson,
      email,
      phone,
      password,
      tierRequested,
      contributionType,
      contractStart,
      contractEnd,
      details,
      hearAboutUs,
      monthlyBudget,
      eventsInterested,
      hasSocialFollowing,
      preferredContact,
      hostingInterest,
    } = req.body;

    if (!companyName || !contactPerson || !email || !password) {
      return res.status(400).json({
        error: 'Company name, contact person, email, and password are required.',
      });
    }

    if (contractStart && contractEnd) {
      if (new Date(contractEnd) <= new Date(contractStart)) {
        return res.status(400).json({
          error: 'Contract end date must be after the start date.',
        });
      }
    }

    const partnership = new Partnership({
      companyName,
      industry,
      contactPerson,
      email,
      phone,
      password,
      tierRequested,
      contributionType,
      contractStart,
      contractEnd,
      details,
      hearAboutUs,
      monthlyBudget,
      eventsInterested,
      hasSocialFollowing,
      preferredContact,
      hostingInterest,
      status: 'pending',
    });

    await partnership.save();

    res.status(201).json({
      success: true,
      message: 'Strategic proposal submitted. Thank you for joining the mission.',
    });

  } catch (err) {
    console.error('Partnership submission error:', err);

    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: message });
    }

    res.status(500).json({
      error: 'Submission failed. Please check your password strength (8+ chars, uppercase, number, symbol).',
    });
  }
});

/* -------------------------------------------------------
   GET /api/partnerships
   Admin only — view all partnership inquiries
------------------------------------------------------- */
router.get(
  '/',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const partnerships = await Partnership.find().sort({ createdAt: -1 });
      res.json(partnerships);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch partnerships.' });
    }
  }
);

/* -------------------------------------------------------
   GET /api/partnerships/:id
   Admin only — view a single partnership inquiry
------------------------------------------------------- */
router.get(
  '/:id',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const partnership = await Partnership.findById(req.params.id);
      if (!partnership) {
        return res.status(404).json({ error: 'Partnership not found.' });
      }
      res.json(partnership);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch partnership.' });
    }
  }
);

/* -------------------------------------------------------
   PATCH /api/partnerships/:id/status
   Admin only — update partnership status
------------------------------------------------------- */
router.patch(
  '/:id/status',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const { status } = req.body;
      const partnership = await Partnership.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );
      if (!partnership) {
        return res.status(404).json({ error: 'Partnership not found.' });
      }
      res.json(partnership);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update status.' });
    }
  }
);

/* -------------------------------------------------------
   DELETE /api/partnerships/:id
   Admin only — delete a partnership inquiry
------------------------------------------------------- */
router.delete(
  '/:id',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const partnership = await Partnership.findByIdAndDelete(req.params.id);
      if (!partnership) {
        return res.status(404).json({ error: 'Partnership not found.' });
      }
      res.json({ message: 'Partnership deleted.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete partnership.' });
    }
  }
);

export default router;