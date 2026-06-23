import express from 'express';
import Stripe from 'stripe';
import Order from '../models/orderSchema.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * @route   POST /api/checkout/create-intent
 * @desc    Create a Stripe Checkout Session with Automatic Membership Discount Support
 */
router.post('/create-intent', async (req, res) => {
  try {
    const { eventId, eventName, ticketType, quantity, buyerName, buyerEmail, unitPrice } = req.body;
    const totalTickets = parseInt(quantity, 10);

    // 1. Convert price to cents for Stripe
    const unitPriceInCents = Math.round(unitPrice * 100);

    // 2. Look up or create the customer in Stripe using their email
    let stripeCustomerId;
    let isMember = false;
    let appliedDiscountCoupon = null;

    try {
      const customers = await stripe.customers.list({ email: buyerEmail, limit: 1 });
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        stripeCustomerId = customer.id;

        // Check if they have an active subscription
        const subscriptions = await stripe.subscriptions.list({ 
          customer: stripeCustomerId, 
          status: 'active',
          expand: ['data.items.data.price']
        });

        if (subscriptions.data.length > 0) {
          isMember = true;
          const activeSub = subscriptions.data[0];
          const monthlyAmount = activeSub.items.data[0].price.unit_amount;

          // Match their subscription tier to your business rules
          const nameLower = eventName ? eventName.toLowerCase() : '';

          if (monthlyAmount === 3900) { // Social Pass ($39)
            if (nameLower.includes('game night')) {
              // 1 free ticket. If they buy more than 1, we must handle via a Stripe coupon or custom line items.
              // To keep it simple on hosted checkout, we create an inline coupon code for them
              if (totalTickets === 1) appliedDiscountCoupon = 'FREE_TICKET_COUPON_ID'; // Replace with a 100% off coupon ID from Stripe Dashboard
            } else if (nameLower.includes('intentional conversations') || nameLower.includes('mocktails') || nameLower.includes('cookout')) {
              // $10 off coupon rule
              appliedDiscountCoupon = 'SOCIAL_PASS_10_OFF_COUPON_ID'; // Replace with a $10 off coupon ID from Stripe Dashboard
            }
          } else if (monthlyAmount === 6900) { // Founding Member ($69)
            if (nameLower.includes('game night')) {
              if (totalTickets <= 3) appliedDiscountCoupon = 'FREE_TICKET_COUPON_ID';
            } else if (nameLower.includes('intentional conversations') || nameLower.includes('mocktails') || nameLower.includes('cookout')) {
              appliedDiscountCoupon = 'FOUNDING_MEMBER_15_OFF_COUPON_ID'; // Replace with a $15 off coupon ID from Stripe Dashboard
            }
          }
        }
      } else {
        // Create a guest customer profile in Stripe so they can checkout
        const newCustomer = await stripe.customers.create({ email: buyerEmail, name: buyerName });
        stripeCustomerId = newCustomer.id;
      }
    } catch (stripeErr) {
      console.warn("Stripe customer verification bypassed:", stripeErr.message);
    }

    // 3. Define the ticket line item using an inline product configuration
    const lineItem = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${eventName} - ${ticketType}`,
        },
        unit_amount: unitPriceInCents,
      },
      quantity: totalTickets,
    };

    // 4. Build Stripe Checkout configuration session payload
    const sessionConfig = {
      customer: stripeCustomerId,
      line_items: [lineItem],
      mode: 'payment',
      success_url: `${req.headers.origin}/membership-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/events`,
      metadata: {
        buyerEmail,
        eventName,
        ticketType,
        isMemberUser: isMember ? 'true' : 'false'
      }
    };

    // Attach coupon discount automatically to the Stripe checkout UI page if eligible
    if (appliedDiscountCoupon) {
      sessionConfig.discounts = [{ coupon: appliedDiscountCoupon }];
    } else {
      // If no automatic subscription perk applies, allow manual entry boxes just in case
      sessionConfig.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // 5. Commit pending order log file parameters to MongoDB database collection
    const newOrder = new Order({
      event: eventId,
      ticketType,
      quantity: totalTickets,
      buyerName,
      buyerEmail,
      unitPrice,
      subtotal: (totalTickets * unitPrice),
      total: (session.amount_total / 100), // Captures discounted totals directly from Stripe session metrics
      stripePaymentIntentId: session.id, // Using Session ID for tracking redirects
      paymentStatus: 'pending'
    });
    await newOrder.save();

    // 6. Send checkout portal URL redirect string payload straight to frontend drawer click handlers
    res.status(201).json({ url: session.url });

  } catch (err) {
    console.error("Checkout Engine Redirection Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;