import express from 'express';
import TravelInterest from '../models/travelInterestSchema.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/* -------------------------------------------------------
   POST /api/travel/interest
   Public — anyone can join the interest list
------------------------------------------------------- */
router.post('/interest', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      interestedTrips,
      groupSize,
      budgetRange,
      isMember,
      notes,
    } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        error: 'First name, last name, and email are required.',
      });
    }

    // Check for duplicate email on same trip
    const existing = await TravelInterest.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        error: "You're already on the interest list. We'll be in touch soon!",
      });
    }

    const interest = new TravelInterest({
      firstName,
      lastName,
      email,
      phone: phone || '',
      interestedTrips: interestedTrips || [],
      groupSize: groupSize || '',
      budgetRange: budgetRange || '',
      isMember: isMember || false,
      notes: notes || '',
    });

    await interest.save();

    res.status(201).json({
      success: true,
      message: "You're on the list. We'll reach out with details as soon as they're confirmed.",
    });
  } catch (err) {
    console.error('Travel interest error:', err);
    res.status(500).json({
      error: 'Something went wrong. Please try again.',
    });
  }
});

/* -------------------------------------------------------
   GET /api/travel/interest
   Admin only — view all interest list signups
------------------------------------------------------- */
router.get(
  '/interest',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const list = await TravelInterest.find().sort({ createdAt: -1 });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch travel interest list.' });
    }
  }
);

/* -------------------------------------------------------
   PATCH /api/travel/interest/:id/status
   Admin only — update signup status
------------------------------------------------------- */
router.patch(
  '/interest/:id/status',
  protect,
  restrictTo('admin'),
  async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await TravelInterest.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Entry not found.' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update status.' });
    }
  }
);

export default router;