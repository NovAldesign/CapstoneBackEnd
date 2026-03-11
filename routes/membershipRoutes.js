import express from 'express';
import Membership from '../models/membershipSchema.js';

const router = express.Router();

// --- 1. CREATE Method (Public Signup) ---
router.post('/', async (req, res, next) => {
  try {
    const newMember = new Membership(req.body);
    const saved = await newMember.save();
    return res.status(201).json(saved); 
  } catch (err) {
    console.error("DATABASE ERROR:", err); 
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    next(err); 
  }
});

// --- 2. READ Method (Admin Dashboard Data) ---
router.get('/', async (req, res, next) => {
  try {
    const applicants = await Membership.find().sort({ submittedAt: -1 });
    console.log(`📋 Fetched ${applicants.length} GFC applicants`);
    res.status(200).json(applicants);
  } catch (err) {
    console.error("FETCH ERROR:", err);
    next(err);
  }
});

// --- 3. UPDATE Method ---
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedMember = await Membership.findByIdAndUpdate(
      id,
      { status: status },
      { new: true, runValidators: true }
    );

    if (!updatedMember) return res.status(404).json({ error: "Member not found" });
    res.status(200).json(updatedMember);
  } catch (err) {
    next(err);
  }
});

// --- 4. DELETE Method ---
router.delete('/:id', async (req, res, next) => {
  try {
    await Membership.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Record removed" });
  } catch (err) {
    next(err);
  }
});

export default router;