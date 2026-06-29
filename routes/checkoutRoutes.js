import express from 'express';
import Stripe from 'stripe';
import Order from '../models/orderSchema.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * @route POST /api/checkout/create-intent
 * @desc Create a Stripe Checkout Session with perfect quantity limits
 */
router.post('/create-intent', async (req, res) => {
  try {
    const { eventId, eventName, ticketType, quantity, buyerName, buyerEmail, unitPrice } = req.body;
    const totalTickets = parseInt(quantity, 10);
    const unitPriceInCents = Math.round(unitPrice * 100);

    let stripeCustomerId;
    let isMember = false;
    let memberTier = 'non_member';

    // 1. Resolve Stripe Customer and Subscription Tier
    try {
      const customers = await stripe.customers.list({ email: buyerEmail, limit: 1 });
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'active',
          expand: ['data.items.data.price']
        });

        if (subscriptions.data.length > 0) {
          isMember = true;
          const activeSub = subscriptions.data[0];
          const monthlyAmount = activeSub.items.data[0].price.unit_amount;

          if (monthlyAmount === 3900) memberTier = 'social_pass';
          if (monthlyAmount === 6900) memberTier = 'founding_member';
        }
      } else {
        const newCustomer = await stripe.customers.create({ email: buyerEmail, name: buyerName });
        stripeCustomerId = newCustomer.id;
      }
    } catch (stripeErr) {
      console.warn("Stripe verification error:", stripeErr.message);
    }

    // 2. Build the Line Items array based on precise quantity limitations
    const lineItems = [];
    const nameLower = eventName ? eventName.toLowerCase() : '';
    let discountCouponId = null;

    if (memberTier === 'social_pass' && nameLower.includes('game night')) {
      // Rule: 1 Free ticket, extra tickets are full price
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `[Member Free Pass] ${eventName} - ${ticketType}` },
          unit_amount: unitPriceInCents,
        },
        quantity: 1,
      });
      discountCouponId = 'FREE_TICKET_COUPON_ID'; // Applies 100% off ONLY to this 1 ticket line item

      if (totalTickets > 1) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: `${eventName} - ${ticketType} (Additional passes)` },
            unit_amount: unitPriceInCents,
          },
          quantity: totalTickets - 1,
        });
      }
    } else if (memberTier === 'founding_member' && nameLower.includes('game night')) {
      // Rule: Up to 3 Free tickets (Member + 2 guests)
      const freeCount = Math.min(3, totalTickets);
      const paidCount = Math.max(0, totalTickets - 3);

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `[Founding Member Pass + Guests] ${eventName} - ${ticketType}` },
          unit_amount: unitPriceInCents,
        },
        quantity: freeCount,
      });
      discountCouponId = 'FREE_TICKET_COUPON_ID'; // Applies 100% off ONLY to the first 3 tickets

      if (paidCount > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: `${eventName} - ${ticketType} (Additional passes)` },
          },
          quantity: paidCount,
        });
      }
    } else {
      // Standard flow for Mocktails, Cookouts, or non-members
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `${eventName} - ${ticketType}` },
          unit_amount: unitPriceInCents,
        },
        quantity: totalTickets,
      });

      // Assign the dollar-off coupons across the standard ticket quantities
      if (memberTier === 'social_pass' && (nameLower.includes('intentional conversations') || nameLower.includes('mocktails') || nameLower.includes('cookout'))) {
        discountCouponId = 'SOCIAL_PASS_10_OFF_COUPON_ID';
      } else if (memberTier === 'founding_member' && (nameLower.includes('intentional conversations') || nameLower.includes('mocktails') || nameLower.includes('cookout'))) {
        discountCouponId = 'FOUNDING_MEMBER_15_OFF_COUPON_ID';
      }
    }

    // 3. Build and launch Stripe Checkout Session
    const sessionConfig = {
      customer: stripeCustomerId,
      line_items: lineItems,
      mode: 'payment',
      success_url: `${req.headers.origin}/membership-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/events`,
      phone_number_collection: { enabled: true }, // 👈 ONLY NEW ADDITION
      metadata: { buyerEmail, eventName, ticketType, memberTier }
    };

    // Safely attach the restriction parameters
    if (discountCouponId) {
      sessionConfig.discounts = [{ coupon: discountCouponId }];
    } else {
      sessionConfig.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // 4. Save Pending Log to MongoDB
    const newOrder = new Order({
      event: eventId,
      ticketType,
      quantity: totalTickets,
      buyerName,
      buyerEmail,
      unitPrice,
      subtotal: (totalTickets * unitPrice),
      total: (session.amount_total / 100),
      stripePaymentIntentId: session.id,
      paymentStatus: 'pending'
    });

    await newOrder.save();

    res.status(201).json({ url: session.url });
  } catch (err) {
    console.error("Checkout Engine Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
