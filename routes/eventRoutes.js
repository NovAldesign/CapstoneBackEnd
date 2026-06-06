// import express from 'express';
// import multer from 'multer';
// import path from 'path';
// import Stripe from 'stripe';
// import Event from '../models/eventSchema.js';
// import Order from '../models/orderSchema.js';
// import { protect, restrictTo } from '../middleware/authMiddleware.js';

// const router = express.Router();

// // -------------------------------------------------------
// // Stripe
// // -------------------------------------------------------
// const stripe = process.env.STRIPE_SECRET_KEY
//   ? new Stripe(process.env.STRIPE_SECRET_KEY)
//   : null;

// // -------------------------------------------------------
// // Multer — cover image uploads
// // -------------------------------------------------------
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/events/'),
//   filename:    (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
//   },
// });
// const upload = multer({
//   storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     const allowed = /jpeg|jpg|png|webp/;
//     const ok = allowed.test(path.extname(file.originalname).toLowerCase())
//              && allowed.test(file.mimetype);
//     ok ? cb(null, true) : cb(new Error('Images only (jpeg, jpg, png, webp)'));
//   },
// });

// // -------------------------------------------------------
// // Helper — parse FormData JSON fields safely
// // -------------------------------------------------------
// const parseFormFields = (body) => {
//   const parsed = { ...body };
//   const jsonFields = ['location', 'ticketTypes', 'promoCodes', 'faqs', 'agenda', 'highlights'];
//   for (const field of jsonFields) {
//     if (parsed[field] && typeof parsed[field] === 'string') {
//       try { parsed[field] = JSON.parse(parsed[field]); }
//       catch { delete parsed[field]; }
//     }
//   }
//   if (parsed.isFree !== undefined) parsed.isFree = parsed.isFree === 'true' || parsed.isFree === true;
//   if (parsed.capacity)             parsed.capacity = Number(parsed.capacity);
//   return parsed;
// };

// // -------------------------------------------------------
// // Helper — fetch full Eventbrite event data + structured content
// // -------------------------------------------------------
// const fetchEventbriteFullData = async (eventId, TOKEN) => {
//   const [eventRes, structuredRes] = await Promise.all([
//     fetch(`https://www.eventbriteapi.com/v3/events/${eventId}/?expand=logo,ticket_classes,venue`, {
//       headers: { 'Authorization': `Bearer ${TOKEN}` }
//     }),
//     fetch(`https://www.eventbriteapi.com/v3/events/${eventId}/structured_content/`, {
//       headers: { 'Authorization': `Bearer ${TOKEN}` }
//     })
//   ]);

//   const eventData = eventRes.ok ? await eventRes.json() : null;
//   const structuredData = structuredRes.ok ? await structuredRes.json() : null;

//   return { eventData, structuredData };
// };

// // -------------------------------------------------------
// // Helper — parse agenda from Eventbrite structured content modules
// // -------------------------------------------------------
// const parseAgenda = (structuredData) => {
//   if (!structuredData?.modules) return [];
//   const agenda = [];
//   for (const module of structuredData.modules) {
//     if (module.type === 'agenda' && module.data?.agenda?.items) {
//       for (const item of module.data.agenda.items) {
//         agenda.push({
//           time:        item.start_date_label || '',
//           title:       item.name?.text || '',
//           description: item.description?.text || ''
//         });
//       }
//     }
//   }
//   return agenda;
// };

// // -------------------------------------------------------
// // Helper — build highlights array from Eventbrite event data
// // -------------------------------------------------------
// const parseHighlights = (eventData) => {
//   const highlights = [];
//   if (eventData.format?.name)   highlights.push(eventData.format.name);
//   if (eventData.is_free)        highlights.push('Free Admission');
//   if (!eventData.online_event)  highlights.push('In Person');
//   if (eventData.capacity)       highlights.push(`Limited to ${eventData.capacity} guests`);
//   return highlights;
// };

// // -------------------------------------------------------
// // Helper — parse venue/location from Eventbrite event data
// // -------------------------------------------------------
// const parseLocation = (eventData) => {
//   const venue = eventData.venue;
//   if (!venue) return null;
//   return {
//     name:    venue.name || '',
//     address: venue.address?.address_1 || '',
//     city:    venue.address?.city || '',
//     state:   venue.address?.region || '',
//     zip:     venue.address?.postal_code || ''
//   };
// };

// /* -------------------------------------------------------
//    GET /api/events
//    Public — published events only, upcoming first
// ------------------------------------------------------- */
// router.get('/', async (req, res, next) => {
//   try {
//     const events = await Event.find({ status: 'published' })
//       .select('-promoCodes')
//       .sort({ date: 1 });
//     res.json(events);
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    GET /api/events/external/:eventId
//    Public — Fetch full dynamic event data from Eventbrite
//    Returns: title, description, image, start, end, location,
//             agenda, highlights, ticketTiers
// ------------------------------------------------------- */
// router.get('/external/:eventId', async (req, res, next) => {
//   try {
//     const { eventId } = req.params;
//     const TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;

//     if (!TOKEN) {
//       return res.status(500).json({ error: 'Eventbrite API token is missing on the server.' });
//     }

//     const { eventData, structuredData } = await fetchEventbriteFullData(eventId, TOKEN);

//     if (!eventData) {
//       return res.status(404).json({ error: 'Failed to retrieve event details from Eventbrite.' });
//     }

//     // Ticket tiers
//     const ticketTiers = (eventData.ticket_classes || []).map(tc => ({
//       name:         tc.name,
//       price:        tc.cost ? (tc.cost.value / 100) : 0,
//       priceInCents: tc.cost ? tc.cost.value : 0,
//       quantity:     tc.quantity_total || 36,
//       sold:         tc.quantity_sold || 0
//     }));

//     res.json({
//       title:       eventData.name?.text || '',
//       description: eventData.description?.html || '',
//       image:       eventData.logo?.original?.url || '',
//       start:       eventData.start?.local || '',
//       end:         eventData.end?.local || '',
//       location:    parseLocation(eventData),
//       agenda:      parseAgenda(structuredData),
//       highlights:  parseHighlights(eventData),
//       ticketTiers
//     });

//   } catch (err) {
//     next(err);
//   }
// });

// /* -------------------------------------------------------
//    POST /api/events/checkout
//    Public — Multi-ticket/Multi-event bundle checkout (Capped at 15%)
// ------------------------------------------------------- */
// router.post('/checkout', async (req, res, next) => {
//   try {
//     if (!stripe) {
//       return res.status(500).json({ error: 'Stripe is not configured on the server.' });
//     }

//     const { cartItems, customerEmail } = req.body;

//     if (!cartItems || cartItems.length === 0) {
//       return res.status(400).json({ error: 'Your cart is completely empty.' });
//     }

//     const uniqueEventIds = [...new Set(cartItems.map(item => item.eventId))];

//     let discountMultiplier = 1.0;
//     let discountLabel = '';

//     if (uniqueEventIds.length === 2) {
//       discountMultiplier = 0.90;
//       discountLabel = ' (10% Multi-Event Bundle Discount Applied)';
//     } else if (uniqueEventIds.length >= 3) {
//       discountMultiplier = 0.85;
//       discountLabel = ' (15% Max Multi-Event Bundle Discount Applied)';
//     }

//     const lineItems = cartItems.map((item) => {
//       const finalPriceInCents = Math.round(item.priceInCents * discountMultiplier);
//       return {
//         price_data: {
//           currency: 'usd',
//           product_data: {
//             name: `${item.eventName} — ${item.ticketTypeName}`,
//             description: discountMultiplier < 1.0
//               ? `Ending social isolation.${discountLabel}`
//               : 'Standard Community Event Admission Pass',
//           },
//           unit_amount: finalPriceInCents,
//         },
//         quantity: item.quantity,
//       };
//     });

//     const session = await stripe.checkout.sessions.create({
//       mode: 'payment',
//       payment_method_types: ['card'],
//       customer_email: customerEmail || undefined,
//       line_items: lineItems,
//       success_url: `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events/success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url:  `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events?cancelled=true`,
//       metadata: {
//         cartDetails: JSON.stringify(cartItems.map(i => ({
//           eventId:    i.eventId,
//           ticketTypeId: i.ticketTypeId,
//           ticketName: i.ticketTypeName,
//           qty:        i.quantity,
//           pricePaid:  Math.round(i.priceInCents * discountMultiplier)
//         }))),
//         isBundleCheckout: (discountMultiplier < 1.0).toString()
//       }
//     });

//     return res.status(201).json({ url: session.url });

//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    GET /api/events/admin/all
//    Admin only — all events regardless of status
// ------------------------------------------------------- */
// router.get('/admin/all', protect, restrictTo('admin'), async (req, res, next) => {
//   try {
//     const events = await Event.find().sort({ date: -1 });

//     const eventsWithAttendees = await Promise.all(
//       events.map(async (ev) => {
//         const orders = await Order.find({
//           event: ev._id,
//           paymentStatus: 'succeeded',
//         }).sort({ createdAt: -1 });

//         const attendees = orders.map(o => ({
//           firstName:        o.buyerName?.split(' ')[0] || '',
//           lastName:         o.buyerName?.split(' ').slice(1).join(' ') || '',
//           email:            o.buyerEmail,
//           phone:            o.buyerPhone || '',
//           ticketType:       o.ticketType,
//           amountPaid:       o.total,
//           checkedIn:        o.checkedIn || false,
//           confirmationCode: o.confirmationCode,
//           createdAt:        o.createdAt,
//         }));

//         return { ...ev.toJSON(), attendees };
//       })
//     );

//     res.json(eventsWithAttendees);
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    GET /api/events/:id
//    Public — single event (no promo codes exposed)
// ------------------------------------------------------- */
// router.get('/:id', async (req, res, next) => {
//   try {
//     const event = await Event.findById(req.params.id).select('-promoCodes');
//     if (!event) return res.status(404).json({ error: 'Event not found.' });
//     res.json(event);
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    POST /api/events
//    Admin only — create event (multipart/form-data)
// ------------------------------------------------------- */
// router.post('/', protect, restrictTo('admin'), upload.single('coverImage'), async (req, res, next) => {
//   try {
//     const body = parseFormFields(req.body);
//     if (req.file) body.coverImage = `/uploads/events/${req.file.filename}`;

//     const event = new Event(body);
//     await event.save();
//     res.status(201).json(event);
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    PUT /api/events/:id
//    Admin only — full update (multipart/form-data)
// ------------------------------------------------------- */
// router.put('/:id', protect, restrictTo('admin'), upload.single('coverImage'), async (req, res, next) => {
//   try {
//     const body = parseFormFields(req.body);
//     if (req.file) body.coverImage = `/uploads/events/${req.file.filename}`;

//     const event = await Event.findByIdAndUpdate(
//       req.params.id,
//       body,
//       { new: true, runValidators: true }
//     );
//     if (!event) return res.status(404).json({ error: 'Event not found.' });
//     res.json(event);
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    DELETE /api/events/:id
//    Admin only
// ------------------------------------------------------- */
// router.delete('/:id', protect, restrictTo('admin'), async (req, res, next) => {
//   try {
//     const event = await Event.findByIdAndDelete(req.params.id);
//     if (!event) return res.status(404).json({ error: 'Event not found.' });
//     res.json({ message: 'Event deleted.' });
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    POST /api/events/:id/validate-promo
// ------------------------------------------------------- */
// router.post('/:id/validate-promo', async (req, res, next) => {
//   try {
//     const { code, ticketTypeId, quantity = 1 } = req.body;
//     if (!code) return res.status(400).json({ error: 'No code provided.' });

//     const event = await Event.findById(req.params.id);
//     if (!event) return res.status(404).json({ error: 'Event not found.' });

//     const promo = event.promoCodes.find(
//       (p) => p.code === code.toUpperCase().trim() && p.active
//     );

//     if (!promo) return res.status(404).json({ error: 'Invalid or expired promo code.' });
//     if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return res.status(400).json({ error: 'This promo code has expired.' });
//     if (promo.maxUses !== null && promo.uses >= promo.maxUses) return res.status(400).json({ error: 'This promo code has reached its limit.' });

//     const ticketType = event.ticketTypes.id(ticketTypeId);
//     if (!ticketType) return res.status(404).json({ error: 'Ticket type not found.' });

//     const subtotal = ticketType.price * quantity;
//     const discount = promo.discountType === 'percent'
//       ? Math.round(subtotal * (promo.discountValue / 100))
//       : Math.min(promo.discountValue, subtotal);

//     res.json({
//       valid:         true,
//       code:          promo.code,
//       discountType:  promo.discountType,
//       discountValue: promo.discountValue,
//       discount,
//       subtotal,
//       total: subtotal - discount,
//     });
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    POST /api/events/:id/create-payment-intent
// ------------------------------------------------------- */
// router.post('/:id/create-payment-intent', async (req, res, next) => {
//   try {
//     if (!stripe) return res.status(500).json({ error: 'Stripe is not configured on the server.' });

//     const { ticketTypeId, quantity = 1, buyerName, buyerEmail, promoCode } = req.body;
//     if (!buyerName || !buyerEmail) return res.status(400).json({ error: 'Buyer name and email are required.' });

//     const event = await Event.findById(req.params.id);
//     if (!event) return res.status(404).json({ error: 'Event not found.' });

//     const ticketType = event.ticketTypes.id(ticketTypeId);
//     if (!ticketType) return res.status(404).json({ error: 'Ticket type not found.' });

//     const remaining = ticketType.quantity - ticketType.sold;
//     if (remaining < quantity) return res.status(400).json({ error: `Only ${remaining} tickets left.` });

//     const subtotal = ticketType.price * quantity;
//     let discount  = 0;
//     let promoUsed = null;

//     if (promoCode) {
//       const promo = event.promoCodes.find((p) => p.code === promoCode.toUpperCase().trim() && p.active);
//       if (promo) {
//         discount  = promo.discountType === 'percent' ? Math.round(subtotal * (promo.discountValue / 100)) : Math.min(promo.discountValue, subtotal);
//         promoUsed = promo.code;
//       }
//     }

//     const total = subtotal - discount;
//     if (total === 0) return res.status(400).json({ error: 'Total is $0.' });

//     const paymentIntent = await stripe.paymentIntents.create({
//       amount:   total,
//       currency: 'usd',
//       automatic_payment_methods: { enabled: true },
//       metadata: {
//         eventId:    event._id.toString(),
//         eventName:  event.name,
//         ticketType: ticketType.name,
//         buyerEmail,
//         promoCode:  promoUsed || ''
//       },
//     });

//     const order = new Order({
//       event:                 event._id,
//       ticketType:            ticketType.name,
//       quantity,
//       buyerName,
//       buyerEmail,
//       unitPrice:             ticketType.price,
//       subtotal,
//       discount,
//       total,
//       promoCode:             promoUsed,
//       stripePaymentIntentId: paymentIntent.id,
//       stripeClientSecret:    paymentIntent.client_secret,
//       paymentStatus:         'pending',
//     });

//     await order.save();

//     res.json({ clientSecret: paymentIntent.client_secret, orderId: order._id, total, subtotal, discount });
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    GET /api/events/:id/orders
// ------------------------------------------------------- */
// router.get('/:id/orders', protect, restrictTo('admin'), async (req, res, next) => {
//   try {
//     const orders = await Order.find({ event: req.params.id }).sort({ createdAt: -1 });
//     res.json(orders);
//   } catch (err) { next(err); }
// });

// /* -------------------------------------------------------
//    POST /api/events/webhook/eventbrite
//    Public — Automated Background Sync Listening for Eventbrite updates
// ------------------------------------------------------- */
// router.post('/webhook/eventbrite', async (req, res, next) => {
//   try {
//     const { api_url } = req.body;
//     const TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;
//     const action = req.body.action || req.body.config?.action || req.headers['x-eventbrite-event'];

//     console.log(`📡 Eventbrite Webhook Triggered: Action -> ${action}`);

//     if (action === 'event.updated' || action === 'event.published' || action === 'event.created' || action === 'test') {

//       // Handle Eventbrite manual mock test hook cleanly
//       if (action === 'test' || !api_url || api_url.includes('{api-endpoint-to-fetch-object-details}')) {
//         console.log("📝 Manual Test Hook detected. Seeding structural mock ticket options...");

//         const testPayload = {
//           name:        "GFC Elite Masterclass & Gathering",
//           description: "Curated real-world strategy alignment spaces for elite operators. Join us to disconnect from professional isolation.",
//           date:        new Date(),
//           endDate:     new Date(Date.now() + 4 * 60 * 60 * 1000),
//           location: {
//             name:    "The Luxe Lounge",
//             address: "100 Buckhead Ave",
//             city:    "Atlanta",
//             state:   "GA",
//             zip:     ""
//           },
//           status:   "published",
//           capacity: 50,
//           eventbriteId: "15833661",
//           ticketTypes: [
//             { name: "Early Bird Entry Pass",   price: 30, quantity: 20, sold: 0 },
//             { name: "General Admission Pass",  price: 35, quantity: 30, sold: 0 }
//           ],
//           agenda: [
//             { time: "6:00 PM", title: "Doors Open",        description: "Arrive, settle in, and connect with fellow attendees." },
//             { time: "6:30 PM", title: "Welcome Remarks",   description: "Opening words and the evening's agenda overview." },
//             { time: "7:00 PM", title: "Main Experience",   description: "The curated collective experience begins." },
//             { time: "9:00 PM", title: "Evening Closes",    description: "Thank you for being here." }
//           ],
//           highlights: ["In Person", "Limited Seating", "Alcohol-Free"],
//           faqs: [
//             { question: "Are mocktails provided?",  answer: "Yes, a premium selection of artisanal curated mocktails is fully included with every pass tier entry." }
//           ]
//         };

//         await Event.findOneAndUpdate(
//           { eventbriteId: testPayload.eventbriteId },
//           { $set: testPayload },
//           { new: true, upsert: true }
//         );

//         return res.status(200).json({ received: true });
//       }

//       if (!TOKEN) {
//         console.error("❌ Cannot sync with Eventbrite: EVENTBRITE_PRIVATE_TOKEN is missing in .env.");
//         return res.status(500).json({ error: 'Server authentication misconfigured.' });
//       }

//       // Extract the event ID from the api_url so we can call our shared helper
//       const eventIdMatch = api_url.match(/events\/(\d+)/);
//       if (!eventIdMatch) {
//         console.error("❌ Could not extract event ID from api_url:", api_url);
//         return res.status(400).json({ error: 'Could not parse event ID from webhook payload.' });
//       }
//       const eventId = eventIdMatch[1];

//       // Fetch full event data + structured content in parallel
//       const { eventData: ebEvent, structuredData } = await fetchEventbriteFullData(eventId, TOKEN);

//       if (!ebEvent) {
//         console.error(`❌ Failed to fetch fresh webhook payload from Eventbrite for event: ${eventId}`);
//         return res.status(400).send('Failed to fetch resource state');
//       }

//       // Translate ticket classes into schema format
//       const formattedTicketTypes = (ebEvent.ticket_classes || []).map((tc) => ({
//         name:        tc.name || 'General Admission Pass',
//         price:       tc.cost ? (tc.cost.value / 100) : 0,
//         quantity:    tc.quantity_total || 36,
//         sold:        tc.quantity_sold || 0,
//         description: tc.description || ''
//       }));

//       // Build the full sync payload
//       const syncPayload = {
//         name:        ebEvent.name?.text || 'Untitled Gathering',
//         description: ebEvent.description?.html || 'No description provided.',
//         date:        new Date(ebEvent.start?.utc || Date.now()),
//         endDate:     new Date(ebEvent.end?.utc   || Date.now() + 3 * 60 * 60 * 1000),
//         location: {
//           name:    ebEvent.venue?.name                  || 'Atlanta Curated Location',
//           address: ebEvent.venue?.address?.address_1    || '',
//           city:    ebEvent.venue?.address?.city         || 'Atlanta',
//           state:   ebEvent.venue?.address?.region       || 'GA',
//           zip:     ebEvent.venue?.address?.postal_code  || ''
//         },
//         status:       ebEvent.status === 'live' ? 'published' : 'draft',
//         capacity:     ebEvent.capacity || 36,
//         ticketTypes:  formattedTicketTypes,
//         agenda:       parseAgenda(structuredData),
//         highlights:   parseHighlights(ebEvent),
//         faqs: [
//           {
//             question: "What is the policy regarding dynamic refunds?",
//             answer:   "All sales are final. Individual tickets are completely non-refundable due to curated venue, structural catering, and operational arrangements."
//           },
//           {
//             question: "Can I transfer my entry reservation pass?",
//             answer:   "Yes. Entry reservation passes can be fully assigned to another verified individual up to 24 hours prior to the session start time."
//           }
//         ],
//         ...(ebEvent.logo?.original?.url && { coverImage: ebEvent.logo.original.url })
//       };

//       const updatedDocument = await Event.findOneAndUpdate(
//         { eventbriteId: ebEvent.id },
//         { $set: syncPayload },
//         { new: true, upsert: true }
//       );

//       console.log(`✅ Database Synchronized: "${updatedDocument.name}" with ${updatedDocument.ticketTypes.length} ticket tier(s), ${updatedDocument.agenda.length} agenda item(s).`);
//     }

//     return res.status(200).json({ received: true });

//   } catch (err) {
//     console.error("❌ Error executing Eventbrite webhook sync:", err.message);
//     return res.status(200).json({ error: err.toString() });
//   }
// });

// export default router;

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
  limits: { fileSize: 5 * 1024 * 1024 },
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
  const jsonFields = ['location', 'ticketTypes', 'promoCodes', 'faqs', 'agenda', 'highlights'];
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

// -------------------------------------------------------
// Helper — fetch full Eventbrite event data + structured content
// -------------------------------------------------------
const fetchEventbriteFullData = async (eventId, TOKEN) => {
  const [eventRes, structuredRes] = await Promise.all([
    fetch(`https://www.eventbriteapi.com/v3/events/${eventId}/?expand=logo,ticket_classes,venue`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    }),
    fetch(`https://www.eventbriteapi.com/v3/events/${eventId}/structured_content/`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    })
  ]);

  const eventData = eventRes.ok ? await eventRes.json() : null;
  const structuredData = structuredRes.ok ? await structuredRes.json() : null;

  return { eventData, structuredData };
};

// -------------------------------------------------------
// Helper — parse agenda from Eventbrite structured content modules
// -------------------------------------------------------
const parseAgenda = (structuredData) => {
  if (!structuredData?.modules) return [];
  const agenda = [];
  for (const module of structuredData.modules) {
    if (module.type === 'agenda' && module.data?.agenda?.items) {
      for (const item of module.data.agenda.items) {
        agenda.push({
          time:        item.start_date_label || '',
          title:       item.name?.text || '',
          description: item.description?.text || ''
        });
      }
    }
  }
  return agenda;
};

// -------------------------------------------------------
// Helper — build highlights array from Eventbrite event data
// -------------------------------------------------------
const parseHighlights = (eventData) => {
  const highlights = [];
  if (eventData.format?.name)   highlights.push(eventData.format.name);
  if (eventData.is_free)        highlights.push('Free Admission');
  if (!eventData.online_event)  highlights.push('In Person');
  if (eventData.capacity)       highlights.push(`Limited to ${eventData.capacity} guests`);
  return highlights;
};

// -------------------------------------------------------
// Helper — parse venue/location from Eventbrite event data
// -------------------------------------------------------
const parseLocation = (eventData) => {
  const venue = eventData.venue;
  if (!venue) return null;
  return {
    name:    venue.name || '',
    address: venue.address?.address_1 || '',
    city:    venue.address?.city || '',
    state:   venue.address?.region || '',
    zip:     venue.address?.postal_code || ''
  };
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
   Public — Fetch full dynamic event data from Eventbrite
   Returns: title, description, image, start, end, location,
            agenda, highlights, ticketTiers
------------------------------------------------------- */
router.get('/external/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;

    if (!TOKEN) {
      return res.status(500).json({ error: 'Eventbrite API token is missing on the server.' });
    }

    const { eventData, structuredData } = await fetchEventbriteFullData(eventId, TOKEN);

    if (!eventData) {
      return res.status(404).json({ error: 'Failed to retrieve event details from Eventbrite.' });
    }

    // Ticket tiers
    const ticketTiers = (eventData.ticket_classes || []).map(tc => ({
      name:         tc.name,
      price:        tc.cost ? (tc.cost.value / 100) : 0,
      priceInCents: tc.cost ? tc.cost.value : 0,
      quantity:     tc.quantity_total || 36,
      sold:         tc.quantity_sold || 0
    }));

    res.json({
      title:       eventData.name?.text || '',
      description: eventData.description?.html || '',
      image:       eventData.logo?.original?.url || '',
      start:       eventData.start?.local || '',
      end:         eventData.end?.local || '',
      location:    parseLocation(eventData),
      agenda:      parseAgenda(structuredData),
      highlights:  parseHighlights(eventData),
      ticketTiers
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

    const uniqueEventIds = [...new Set(cartItems.map(item => item.eventId))];

    let discountMultiplier = 1.0;
    let discountLabel = '';

    if (uniqueEventIds.length === 2) {
      discountMultiplier = 0.90;
      discountLabel = ' (10% Multi-Event Bundle Discount Applied)';
    } else if (uniqueEventIds.length >= 3) {
      discountMultiplier = 0.85;
      discountLabel = ' (15% Max Multi-Event Bundle Discount Applied)';
    }

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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: customerEmail || undefined,
      line_items: lineItems,
      success_url: `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events?cancelled=true`,
      metadata: {
        cartDetails: JSON.stringify(cartItems.map(i => ({
          eventId:      i.eventId,
          ticketTypeId: i.ticketTypeId,
          ticketName:   i.ticketTypeName,
          qty:          i.quantity,
          pricePaid:    Math.round(i.priceInCents * discountMultiplier)
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
          firstName:        o.buyerName?.split(' ')[0] || '',
          lastName:         o.buyerName?.split(' ').slice(1).join(' ') || '',
          email:            o.buyerEmail,
          phone:            o.buyerPhone || '',
          ticketType:       o.ticketType,
          amountPaid:       o.total,
          checkedIn:        o.checkedIn || false,
          confirmationCode: o.confirmationCode,
          createdAt:        o.createdAt,
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
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return res.status(400).json({ error: 'This promo code has expired.' });
    if (promo.maxUses !== null && promo.uses >= promo.maxUses) return res.status(400).json({ error: 'This promo code has reached its limit.' });

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
    if (!stripe) return res.status(500).json({ error: 'Stripe is not configured on the server.' });

    const { ticketTypeId, quantity = 1, buyerName, buyerEmail, promoCode } = req.body;
    if (!buyerName || !buyerEmail) return res.status(400).json({ error: 'Buyer name and email are required.' });

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const ticketType = event.ticketTypes.id(ticketTypeId);
    if (!ticketType) return res.status(404).json({ error: 'Ticket type not found.' });

    const remaining = ticketType.quantity - ticketType.sold;
    if (remaining < quantity) return res.status(400).json({ error: `Only ${remaining} tickets left.` });

    const subtotal = ticketType.price * quantity;
    let discount  = 0;
    let promoUsed = null;

    if (promoCode) {
      const promo = event.promoCodes.find((p) => p.code === promoCode.toUpperCase().trim() && p.active);
      if (promo) {
        discount  = promo.discountType === 'percent' ? Math.round(subtotal * (promo.discountValue / 100)) : Math.min(promo.discountValue, subtotal);
        promoUsed = promo.code;
      }
    }

    const total = subtotal - discount;
    if (total === 0) return res.status(400).json({ error: 'Total is $0.' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   total,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        eventId:    event._id.toString(),
        eventName:  event.name,
        ticketType: ticketType.name,
        buyerEmail,
        promoCode:  promoUsed || ''
      },
    });

    const order = new Order({
      event:                 event._id,
      ticketType:            ticketType.name,
      quantity,
      buyerName,
      buyerEmail,
      unitPrice:             ticketType.price,
      subtotal,
      discount,
      total,
      promoCode:             promoUsed,
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret:    paymentIntent.client_secret,
      paymentStatus:         'pending',
    });

    await order.save();

    res.json({ clientSecret: paymentIntent.client_secret, orderId: order._id, total, subtotal, discount });
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   GET /api/events/:id/orders
------------------------------------------------------- */
router.get('/:id/orders', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const orders = await Order.find({ event: req.params.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) { next(err); }
});

/* -------------------------------------------------------
   POST /api/events/webhook/stripe
   Public — Listens for completed checkouts to sync ticket counts
------------------------------------------------------- */
router.post('/webhook/stripe', async (req, res, next) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_EVENTS_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe integration is not initialized on the server.' });
    }
    stripeEvent = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`❌ Stripe Webhook Verification Failure: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;

    try {
      if (session.metadata && session.metadata.cartDetails) {
        const purchasedCart = JSON.parse(session.metadata.cartDetails);

        console.log(`📡 Stripe Webhook Processed: Syncing ${purchasedCart.length} inventory lines...`);

        for (const item of purchasedCart) {
          const updatedEvent = await Event.findOneAndUpdate(
            { 
              _id: item.eventId, 
              "ticketTypes._id": item.ticketTypeId 
            },
            { 
              $inc: { "ticketTypes.$.sold": Number(item.qty) } 
            },
            { new: true }
          );

          if (updatedEvent) {
            console.log(`📈 Synchronized Ticket: Increased "${item.ticketName}" count by +${item.qty}.`);
          } else {
            console.warn(`⚠️ Inventory Mismatch: Unable to credit ticket category ID: ${item.ticketTypeId}`);
          }
        }
      }
    } catch (processErr) {
      console.error(`❌ Critical layout failure parsing item metrics:`, processErr);
      return res.status(500).json({ error: 'Internal transactional matrix fault.' });
    }
  }

  res.status(200).json({ received: true });
});

/* -------------------------------------------------------
   POST /api/events/webhook/eventbrite
   Public — Automated Background Sync Listening for Eventbrite updates
------------------------------------------------------- */
router.post('/webhook/eventbrite', async (req, res, next) => {
  try {
    const { api_url } = req.body;
    const TOKEN = process.env.EVENTBRITE_PRIVATE_TOKEN;
    const action = req.body.action || req.body.config?.action || req.headers['x-eventbrite-event'];

    console.log(`📡 Eventbrite Webhook Triggered: Action -> ${action}`);

    if (action === 'event.updated' || action === 'event.published' || action === 'event.created' || action === 'test') {

      // Handle Eventbrite manual mock test hook cleanly
      if (action === 'test' || !api_url || api_url.includes('{api-endpoint-to-fetch-object-details}')) {
        console.log("📝 Manual Test Hook detected. Seeding structural mock ticket options...");

        const testPayload = {
          name:        "GFC Elite Masterclass & Gathering",
          description: "Curated real-world strategy alignment spaces for elite operators. Join us to disconnect from professional isolation.",
          date:        new Date(),
          endDate:     new Date(Date.now() + 4 * 60 * 60 * 1000),
          location: {
            name:    "The Luxe Lounge",
            address: "100 Buckhead Ave",
            city:    "Atlanta",
            state:   "GA",
            zip:     ""
          },
          status:   "published",
          capacity: 50,
          eventbriteId: "15833661",
          ticketTypes: [
            { name: "Early Bird Entry Pass",   price: 30, quantity: 20, sold: 0 },
            { name: "General Admission Pass",  price: 35, quantity: 30, sold: 0 }
          ],
          agenda: [
            { time: "6:00 PM", title: "Doors Open",        description: "Arrive, settle in, and connect with fellow attendees." },
            { time: "6:30 PM", title: "Welcome Remarks",   description: "Opening words and the evening's agenda overview." },
            { time: "7:00 PM", title: "Main Experience",   description: "The curated collective experience begins." },
            { time: "9:00 PM", title: "Evening Closes",    description: "Thank you for being here." }
          ],
          highlights: ["In Person", "Limited Seating", "Alcohol-Free"],
          faqs: [
            { question: "Are mocktails provided?",  answer: "Yes, a premium selection of artisanal curated mocktails is fully included with every pass tier entry." }
          ]
        };

        await Event.findOneAndUpdate(
          { eventbriteId: testPayload.eventbriteId },
          { $set: testPayload },
          { new: true, upsert: true }
        );

        return res.status(200).json({ received: true });
      }

      if (!TOKEN) {
        console.error("❌ Cannot sync with Eventbrite: EVENTBRITE_PRIVATE_TOKEN is missing in .env.");
        return res.status(500).json({ error: 'Server authentication misconfigured.' });
      }

      // Extract the event ID from the api_url so we can call our shared helper
      const eventIdMatch = api_url.match(/events\/(\d+)/);
      if (!eventIdMatch) {
        console.error("❌ Could not extract event ID from api_url:", api_url);
        return res.status(400).json({ error: 'Could not parse event ID from webhook payload.' });
      }
      const eventId = eventIdMatch[1];

      // Fetch full event data + structured content in parallel
      const { eventData: ebEvent, structuredData } = await fetchEventbriteFullData(eventId, TOKEN);

      if (!ebEvent) {
        console.error(`❌ Failed to fetch fresh webhook payload from Eventbrite for event: ${eventId}`);
        return res.status(400).send('Failed to fetch resource state');
      }

      // Translate ticket classes into schema format
      const formattedTicketTypes = (ebEvent.ticket_classes || []).map((tc) => ({
        name:        tc.name || 'General Admission Pass',
        price:       tc.cost ? (tc.cost.value / 100) : 0,
        quantity:    tc.quantity_total || 36,
        sold:        tc.quantity_sold || 0,
        description: tc.description || ''
      }));

      // Build the full sync payload
      const syncPayload = {
        name:        ebEvent.name?.text || 'Untitled Gathering',
        description: ebEvent.description?.html || 'No description provided.',
        date:        new Date(ebEvent.start?.utc || Date.now()),
        endDate:     new Date(ebEvent.end?.utc   || Date.now() + 3 * 60 * 60 * 1000),
        location: {
          name:    ebEvent.venue?.name                  || 'Atlanta Curated Location',
          address: ebEvent.venue?.address?.address_1    || '',
          city:    ebEvent.venue?.address?.city         || 'Atlanta',
          state:   ebEvent.venue?.address?.region       || 'GA',
          zip:     ebEvent.venue?.address?.postal_code  || ''
        },
        status:       ebEvent.status === 'live' ? 'published' : 'draft',
        capacity:     ebEvent.capacity || 36,
        ticketTypes:  formattedTicketTypes,
        agenda:       parseAgenda(structuredData),
        highlights:   parseHighlights(ebEvent),
        faqs: [
          {
            question: "What is the policy regarding dynamic refunds?",
            answer:   "All sales are final. Individual tickets are completely non-refundable due to curated venue, structural catering, and operational arrangements."
          },
          {
            question: "Can I transfer my entry reservation pass?",
            answer:   "Yes. Entry reservation passes can be fully assigned to another verified individual up to 24 hours prior to the session start time."
          }
        ],
        ...(ebEvent.logo?.original?.url && { coverImage: ebEvent.logo.original.url })
      };

      const updatedDocument = await Event.findOneAndUpdate(
        { eventbriteId: ebEvent.id },
        { $set: syncPayload },
        { new: true, upsert: true }
      );

      console.log(`Base Schema Synchronized: "${updatedDocument.name}" is now updated internally.`);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ Error executing Eventbrite webhook sync:", err.message);
    return res.status(200).json({ error: err.toString() });
  }
});

export default router;