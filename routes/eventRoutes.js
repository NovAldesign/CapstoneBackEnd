import express from 'express';
import Stripe from 'stripe';
import Event from '../models/eventSchema.js';
import Order from '../models/orderSchema.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// -------------------------------------------------------
// Safe Stripe Initialization
// -------------------------------------------------------
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY) 
  : null;

/* -------------------------------------------------------
   GET /api/events
   Public — returns all published events, upcoming first
------------------------------------------------------- */
router.get('/', async (req, res, next) => {
  try {
    const events = await Event.find({ status: 'published' })
      .select('-promoCodes')
      .sort({ date: 1 });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   GET /api/events/:id
   Public — returns a single event by ID
------------------------------------------------------- */
router.get('/:id', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).select('-promoCodes');
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   POST /api/events
   Admin only — create a new event
------------------------------------------------------- */
router.post('/', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const event = new Event(req.body);
    await event.save();
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   PUT /api/events/:id
   Admin only — update an event
------------------------------------------------------- */
router.put('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   DELETE /api/events/:id
   Admin only — delete an event
------------------------------------------------------- */
router.delete('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event deleted.' });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   POST /api/events/:id/validate-promo
   Public — validates a promo code for a ticket type
------------------------------------------------------- */
router.post('/:id/validate-promo', async (req, res, next) => {
  try {
    const { code, ticketTypeId, quantity = 1 } = req.body;
    if (!code) return res.status(400).json({ error: 'No code provided.' });

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const promo = event.promoCodes.find(
      (p) => p.code === code.toUpperCase().trim() && p.active
    );

    if (!promo) return res.status(404).json({ error: 'Invalid or expired promo code.' });
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'This promo code has expired.' });
    }
    if (promo.maxUses !== null && promo.uses >= promo.maxUses) {
      return res.status(400).json({ error: 'This promo code has reached its usage limit.' });
    }

    const ticketType = event.ticketTypes.id(ticketTypeId);
    if (!ticketType) return res.status(404).json({ error: 'Ticket type not found.' });

    const subtotal = ticketType.price * quantity;
    let discount = 0;

    if (promo.discountType === 'percent') {
      discount = Math.round(subtotal * (promo.discountValue / 100));
    } else {
      discount = Math.min(promo.discountValue, subtotal);
    }

    res.json({
      valid: true,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discount,
      subtotal,
      total: subtotal - discount,
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   POST /api/events/:id/create-payment-intent
------------------------------------------------------- */
router.post('/:id/create-payment-intent', async (req, res, next) => {
  try {
    // Critical safety check before using Stripe
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const { ticketTypeId, quantity = 1, buyerName, buyerEmail, promoCode } = req.body;

    if (!buyerName || !buyerEmail) {
      return res.status(400).json({ error: 'Buyer name and email are required.' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const ticketType = event.ticketTypes.id(ticketTypeId);
    if (!ticketType) return res.status(404).json({ error: 'Ticket type not found.' });

    const remaining = ticketType.quantity - ticketType.sold;
    if (remaining < quantity) {
      return res.status(400).json({ error: `Only ${remaining} tickets left.` });
    }

    const subtotal = ticketType.price * quantity;
    let discount = 0;
    let promoUsed = null;

    if (promoCode) {
      const promo = event.promoCodes.find(
        (p) => p.code === promoCode.toUpperCase().trim() && p.active
      );
      if (promo) {
        discount = promo.discountType === 'percent' 
            ? Math.round(subtotal * (promo.discountValue / 100)) 
            : Math.min(promo.discountValue, subtotal);
        promoUsed = promo.code;
      }
    }

    const total = subtotal - discount;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: total,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        eventId: event._id.toString(),
        ticketType: ticketType.name,
        buyerEmail,
        promoCode: promoUsed || '',
      },
    });

    const order = new Order({
      event: event._id,
      ticketType: ticketType.name,
      quantity,
      buyerName,
      buyerEmail,
      unitPrice: ticketType.price,
      subtotal,
      discount,
      total,
      promoCode: promoUsed,
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret: paymentIntent.client_secret,
      paymentStatus: 'pending',
    });

    await order.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order._id,
      total,
      subtotal,
      discount,
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   GET /api/events/:id/orders
   Admin only — view all orders for an event
------------------------------------------------------- */
router.get('/:id/orders', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const orders = await Order.find({ event: req.params.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

export default router;