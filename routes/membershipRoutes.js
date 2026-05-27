import express from 'express';
import Stripe from 'stripe';
import { Resend } from 'resend';
import Membership from '../models/membershipSchema.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// --- Tier price map (match these to your Stripe Price IDs) ---
const TIER_PRICE_IDS = {
  Social:   process.env.STRIPE_PRICE_SOCIAL,   // $39/mo
  Founding: process.env.STRIPE_PRICE_FOUNDING, // $69/mo
};

// --- 1. CREATE — Public Signup ---
router.post('/', async (req, res, next) => {
  try {
    // 1a. Save member to DB
    const newMember = new Membership(req.body);
    const saved = await newMember.save();

    // 1b. Send confirmation email via Resend
    try {
      await resend.emails.send({
        from: 'GFC <noreply@yourdomain.com>',        // swap to your verified Resend domain
        to: saved.email,
        subject: 'Your GFC Application Was Received',
        html: `
          <div style="font-family: 'Montserrat', sans-serif; max-width: 600px; margin: 0 auto; color: #002147;">
            <div style="background: #002147; padding: 40px; text-align: center;">
              <h1 style="font-family: Georgia, serif; color: #C5A059; font-size: 2rem; margin: 0;">
                The Collective
              </h1>
              <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; letter-spacing: 4px; text-transform: uppercase; margin: 8px 0 0;">
                Grown Folks Collective · Est. 2026
              </p>
            </div>
            <div style="padding: 48px 40px;">
              <p style="font-size: 1rem; margin-bottom: 8px;">Hi ${saved.firstName},</p>
              <p style="font-size: 0.95rem; line-height: 1.7; color: #444;">
                Your application to the Grown Folks Collective has been received. 
                We're reviewing it now and will be in touch shortly.
              </p>
              <div style="background: #FDFBFA; border-left: 3px solid #C5A059; padding: 20px 24px; margin: 32px 0;">
                <p style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; color: #888; margin: 0 0 6px;">Selected Tier</p>
                <p style="font-family: Georgia, serif; font-size: 1.3rem; font-weight: 700; color: #002147; margin: 0;">
                  ${saved.tier === 'Founding' ? 'Founding Member — $69/mo' : 'Social Pass — $39/mo'}
                </p>
              </div>
              <p style="font-size: 0.9rem; line-height: 1.7; color: #444;">
                Complete your membership below to lock in your spot. 
                Founding Member slots are limited to 40.
              </p>
            </div>
            <div style="background: #002147; padding: 24px; text-align: center;">
              <p style="color: rgba(255,255,255,0.4); font-size: 0.72rem; margin: 0;">
                Grown Folks Collective · Atlanta, GA
              </p>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      // Email failure should not block checkout — log and continue
      console.error('RESEND ERROR:', emailErr);
    }

    // 1c. Create Stripe Checkout session
    const priceId = TIER_PRICE_IDS[saved.tier];

    if (!priceId) {
      return res.status(400).json({ error: `No Stripe price configured for tier: ${saved.tier}` });
    }

  const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [
    {
      price: priceId,
      quantity: 1,
    },
  ],
  customer_email: saved.email,
  metadata: {
    memberId: saved._id.toString(),
    tier: saved.tier,
    firstName: saved.firstName,
    lastName: saved.lastName,
  },
  success_url: `${process.env.CLIENT_URL}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
  
  // 🔥 UPDATE THIS LINE: Append the saved member ID to the cancel URL
  cancel_url:  `${process.env.CLIENT_URL}/membership?cancelled=true&id=${saved._id.toString()}`,
});

    // 1d. Return member + Stripe checkout URL to frontend
    return res.status(201).json({
      member: saved,
      checkoutUrl: session.url,
    });

  } catch (err) {
    console.error('MEMBERSHIP CREATE ERROR:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(409).json({ error: `An account with this ${field} already exists.` });
    }
    next(err);
  }
});

// --- 2. READ — Admin Dashboard ---
router.get('/', async (req, res, next) => {
  try {
    const applicants = await Membership.find().sort({ submittedAt: -1 });
    console.log(`Fetched ${applicants.length} GFC applicants`);
    res.status(200).json(applicants);
  } catch (err) {
    console.error('FETCH ERROR:', err);
    next(err);
  }
});

// --- 3. UPDATE — Status Change (Admin) ---
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedMember = await Membership.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedMember) return res.status(404).json({ error: 'Member not found' });
    res.status(200).json(updatedMember);
  } catch (err) {
    next(err);
  }
});

// --- 4. DELETE ---
router.delete('/:id', async (req, res, next) => {
  try {
    await Membership.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Record removed' });
  } catch (err) {
    next(err);
  }
});

export default router;