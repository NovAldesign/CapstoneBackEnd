import express from 'express';
import multer from 'multer';
import path from 'path';
import Stripe from 'stripe';
import Event from '../models/eventSchema.js';
import Order from '../models/orderSchema.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// -------------------------------------------------------
// Stripe
// -------------------------------------------------------
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// -------------------------------------------------------
// Multer — cover image uploads
// -------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/events/'),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase())
             && allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Images only (jpeg, jpg, png, webp)'));
  },
});

// -------------------------------------------------------
// Helper — parse FormData JSON fields safely
// -------------------------------------------------------
const parseFormFields = (body) => {
  const parsed = { ...body };
  const jsonFields = ['location', 'ticketTypes', 'promoCodes'];
  for (const field of jsonFields) {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try { parsed[field] = JSON.parse(parsed[field]); }
      catch { delete parsed[field]; }
    }
  }
  if (parsed.isFree !== undefined) parsed.isFree = parsed.isFree === 'true' || parsed.isFree === true;
  if (parsed.capacity)             parsed.capacity = Number(parsed.capacity);
  return parsed;
};

/* -------------------------------------------------------
   GET /api/events
   Public — published events only, upcoming first
------------------------------------------------------- */
router.get('/', async (req, res, next) => {
  try {
    const events = await Event.find({ status: 'published' })
      .select('-promoCodes')
      .sort({ date: 1 });
    res.json(events);
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   GET /api/events/external/:eventId
   Public — Fetch dynamic event copy/imagery from Eventbrite
------------------------------------------------------- */
router.get('/external/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;

    if (!TOKEN) {
      return res.status(500).json({ error: 'Eventbrite API token is missing on the server.' });
    }

    // Server-to-server call fetching description and original cover image dimensions
    const response = await fetch(`https://www.eventbriteapi.com/v3/events/${eventId}/?expand=logo`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to retrieve event details from Eventbrite' });
    }

    const eventData = await response.json();

    // Pass clean asset URLs and text formatting back to the layout UI
    res.json({
      title: eventData.name.text,
      description: eventData.description.html, 
      image: eventData.logo?.original?.url || '', 
      start: eventData.start.local
    });

  } catch (err) { 
    next(err); 
  }
});

/* -------------------------------------------------------
   POST /api/events/checkout
   Public — Multi-ticket/Multi-event bundle checkout (Capped at 15%)
------------------------------------------------------- */
router.post('/checkout', async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });
    }

    const { cartItems, customerEmail } = req.body;

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is completely empty.' });
    }

    // 1. Calculate how many UNIQUE events are chosen to measure bundle discount tiers
    const uniqueEventIds = [...new Set(cartItems.map(item => item.eventId))];

    // 2. Set multi-event bundle discount scales (Capped strictly at 15% max ceiling)
    let discountMultiplier = 1.0;
    let discountLabel = '';

    if (uniqueEventIds.length === 2) {
      discountMultiplier = 0.90; // 10% off total bundle ticket line item rates
      discountLabel = ' (10% Multi-Event Bundle Discount Applied)';
    } else if (uniqueEventIds.length >= 3) {
      discountMultiplier = 0.85; // 15% off capped max rate for 3+ distinct events
      discountLabel = ' (15% Max Multi-Event Bundle Discount Applied)';
    }

    // 3. Map items dynamically into an authorized Stripe Line Items configuration
    const lineItems = cartItems.map((item) => {
      const finalPriceInCents = Math.round(item.priceInCents * discountMultiplier);

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${item.eventName} — ${item.ticketTypeName}`,
            description: discountMultiplier < 1.0 
              ? `Ending social isolation.${discountLabel}` 
              : 'Standard Community Event Admission Pass',
          },
          unit_amount: finalPriceInCents,
        },
        quantity: item.quantity,
      };
    });

    // 4. Generate the verified safe Stripe Checkout Session window
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: customerEmail || undefined,
      line_items: lineItems,
      success_url: `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events?cancelled=true`,
      
      metadata: {
        cartDetails: JSON.stringify(cartItems.map(i => ({
          eventId: i.eventId,
          ticketTypeId: i.ticketTypeId,
          ticketName: i.ticketTypeName,
          qty: i.quantity,
          pricePaid: Math.round(i.priceInCents * discountMultiplier)
        }))),
        isBundleCheckout: (discountMultiplier < 1.0).toString()
      }
    });

    return res.status(201).json({ url: session.url });

  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   GET /api/events/admin/all
   Admin only — all events regardless of status
------------------------------------------------------- */
router.get('/admin/all', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const events = await Event.find().sort({ date: -1 });

    const eventsWithAttendees = await Promise.all(
      events.map(async (ev) => {
        const orders = await Order.find({
          event: ev._id,
          paymentStatus: 'succeeded',
        }).sort({ createdAt: -1 });

        const attendees = orders.map(o => ({
          firstName:   o.buyerName?.split(' ')[0] || '',
          lastName:    o.buyerName?.split(' ').slice(1).join(' ') || '',
          email:       o.buyerEmail,
          phone:       o.buyerPhone || '',
          ticketType:  o.ticketType,
          amountPaid:  o.total,
          checkedIn:   o.checkedIn || false,
          confirmationCode: o.confirmationCode,
          createdAt:   o.createdAt,
        }));

        return { ...ev.toJSON(), attendees };
      })
    );

    res.json(eventsWithAttendees);
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   GET /api/events/:id
   Public — single event (no promo codes exposed)
------------------------------------------------------- */
router.get('/:id', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).select('-promoCodes');
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(event);
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   POST /api/events
   Admin only — create event (multipart/form-data)
------------------------------------------------------- */
router.post('/', protect, restrictTo('admin'), upload.single('coverImage'), async (req, res, next) => {
  try {
    const body = parseFormFields(req.body);
    if (req.file) body.coverImage = `/uploads/events/${req.file.filename}`;

    const event = new Event(body);
    await event.save();
    res.status(201).json(event);
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   PUT /api/events/:id
   Admin only — full update (multipart/form-data)
------------------------------------------------------- */
router.put('/:id', protect, restrictTo('admin'), upload.single('coverImage'), async (req, res, next) => {
  try {
    const body = parseFormFields(req.body);
    if (req.file) body.coverImage = `/uploads/events/${req.file.filename}`;

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(event);
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   DELETE /api/events/:id
   Admin only
------------------------------------------------------- */
router.delete('/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event deleted.' });
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   POST /api/events/:id/validate-promo
   Public — validate a promo code
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

    if (!promo)
      return res.status(404).json({ error: 'Invalid or expired promo code.' });
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date())
      return res.status(400).json({ error: 'This promo code has expired.' });
    if (promo.maxUses !== null && promo.uses >= promo.maxUses)
      return res.status(400).json({ error: 'This promo code has reached its usage limit.' });

    const ticketType = event.ticketTypes.id(ticketTypeId);
    if (!ticketType) return res.status(404).json({ error: 'Ticket type not found.' });

    const subtotal = ticketType.price * quantity;
    const discount = promo.discountType === 'percent'
      ? Math.round(subtotal * (promo.discountValue / 100))
      : Math.min(promo.discountValue, subtotal);

    res.json({
      valid:         true,
      code:          promo.code,
      discountType:  promo.discountType,
      discountValue: promo.discountValue,
      discount,
      subtotal,
      total: subtotal - discount,
    });
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   POST /api/events/:id/create-payment-intent
------------------------------------------------------- */
router.post('/:id/create-payment-intent', async (req, res, next) => {
  try {
    if (!stripe)
      return res.status(500).json({ error: 'Stripe is not configured on the server.' });

    const { ticketTypeId, quantity = 1, buyerName, buyerEmail, promoCode } = req.body;

    if (!buyerName || !buyerEmail)
      return res.status(400).json({ error: 'Buyer name and email are required.' });

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const ticketType = event.ticketTypes.id(ticketTypeId);
    if (!ticketType) return res.status(404).json({ error: 'Ticket type not found.' });

    const remaining = ticketType.quantity - ticketType.sold;
    if (remaining < quantity)
      return res.status(400).json({ error: `Only ${remaining} ticket${remaining === 1 ? '' : 's'} left.` });

    const subtotal = ticketType.price * quantity;
    let discount  = 0;
    let promoUsed = null;

    if (promoCode) {
      const promo = event.promoCodes.find(
        (p) => p.code === promoCode.toUpperCase().trim() && p.active
      );
      if (promo) {
        discount  = promo.discountType === 'percent'
          ? Math.round(subtotal * (promo.discountValue / 100))
          : Math.min(promo.discountValue, subtotal);
        promoUsed = promo.code;
      }
    }

    const total = subtotal - discount;

    if (total === 0) {
      return res.status(400).json({
        error: 'Total is $0 — use the free checkout flow instead of Stripe.',
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   total,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        eventId:    event._id.toString(),
        eventName:  event.name,
        ticketType: ticketType.name,
        buyerEmail,
        promoCode:  promoUsed || '',
      },
    });

    const order = new Order({
      event:                  event._id,
      ticketType:             ticketType.name,
      quantity,
      buyerName,
      buyerEmail,
      unitPrice:              ticketType.price,
      subtotal,
      discount,
      total,
      promoCode:              promoUsed,
      stripePaymentIntentId:  paymentIntent.id,
      stripeClientSecret:     paymentIntent.client_secret,
      paymentStatus:          'pending',
    });

    await order.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      orderId:      order._id,
      total,
      subtotal,
      discount,
    });
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   GET /api/events/:id/orders
   Admin only
------------------------------------------------------- */
router.get('/:id/orders', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const orders = await Order.find({ event: req.params.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   POST /api/events/webhook/eventbrite
   Public — Automated Background Sync Listening for Eventbrite updates
------------------------------------------------------- */
router.post('/webhook/eventbrite', async (req, res, next) => {
  try {
    const { action, api_url } = req.body;
    const TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;

    console.log(`📡 Eventbrite Webhook Triggered: Action -> ${action}`);

    // Capture whenever an event is modified, created, launched, or tested
    if (action === 'event.updated' || action === 'event.published' || action === 'event.created' || action === 'test') {
      
      // 🌟 FALLBACK: Handle Eventbrite manual mock test hook cleanly
      if (action === 'test' || !api_url || api_url.includes('{api-endpoint-to-fetch-object-details}')) {
        console.log("📝 Manual Test Hook detected. Seeding a live production baseline card...");
        
        const testPayload = {
          name: "GFC Elite Masterclass & Gathering",
          description: "Curated real-world strategy alignment spaces for elite operators. Join us to disconnect from professional isolation.",
          date: new Date(),
          endDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours later
          location: { 
            name: "The Luxe Lounge", 
            address: "100 Buckhead Ave", 
            city: "Atlanta", 
            state: "GA" 
          },
          status: "published",
          capacity: 50,
          eventbriteId: "15833661" // Explicitly tracking unique key matching your webhook dashboard instance
        };

        const testDoc = await Event.findOneAndUpdate(
          { eventbriteId: testPayload.eventbriteId },
          { $set: testPayload },
          { new: true, upsert: true }
        );
        
        console.log(`🚀 Success! Test Event Upserted into MongoDB: "${testDoc.name}"`);
        return res.status(200).json({ received: true });
      }

      if (!TOKEN) {
        console.error("❌ Cannot sync with Eventbrite: EVENTBRITE_PRIVATE_TOKEN is missing in .env.");
        return res.status(500).json({ error: 'Server authentication misconfigured.' });
      }

      // 1. Request the fresh absolute state package from Eventbrite
      const ebResponse = await fetch(`${api_url}?expand=logo`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
      });

      if (!ebResponse.ok) {
        console.error(`❌ Failed to fetch fresh webhook payload from Eventbrite endpoint: ${api_url}`);
        return res.status(400).send('Failed to fetch resource state');
      }

      const ebEvent = await ebResponse.json();

      // 2. Map Eventbrite's structure directly to your core schema, safely handling missing fields
      const syncPayload = {
        name: ebEvent.name?.text || 'Untitled Gathering',
        description: ebEvent.description?.html || 'No description provided.',
        date: new Date(ebEvent.start?.utc || Date.now()),
        endDate: new Date(ebEvent.end?.utc || Date.now() + 3 * 60 * 60 * 1000), // Populates required schema value safely
        location: {
          name: ebEvent.venue?.name || 'Atlanta Curated Location',
          address: ebEvent.venue?.address?.address_1 || '',
          city: ebEvent.venue?.address?.city || 'Atlanta',
          state: ebEvent.venue?.address?.region || 'GA'
        },
        status: ebEvent.status === 'live' ? 'published' : 'draft',
        capacity: ebEvent.capacity || 36,
        ...(ebEvent.logo?.original?.url && { coverImage: ebEvent.logo.original.url })
      };

      // 3. Search and upsert (creates if it doesn't exist) based on the unique eventbriteId field
      const updatedDocument = await Event.findOneAndUpdate(
        { eventbriteId: ebEvent.id },
        { $set: syncPayload },
        { new: true, upsert: true } // 🌟 FIXED: Implemented upsert true capability layout
      );

      console.log(`✅ Railway MongoDB Synchronized: "${updatedDocument.name}"`);
    }

    // Always give Eventbrite a fast 200 OK receipt so it clears out its delivery queue
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ Error executing automated backend Eventbrite update pipeline:", err.message);
    return res.status(200).json({ error: err.toString() });
  }
});

export default router;