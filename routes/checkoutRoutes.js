import express from 'express';
import Stripe from 'stripe';
import Order from '../models/orderSchema.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Helper logic engine built to calculate final ticket totals based on live 2026 membership tiers
 */
function calculateMemberDiscount(tier, eventName, quantity, unitPriceInCents, hasUsedQuarterlyFreebie = false) {
  const totalTickets = parseInt(quantity, 10);
  let finalTotalInCents = 0;
  
  // Normalize event name text to match perks accurately
  const name = eventName ? eventName.toLowerCase() : '';

  // ==========================================
  // TIER 1: SOCIAL PASS ($39)
  // ==========================================
  if (tier === 'social_pass') {
    if (name.includes('game night')) {
      // 1 ticket covered every month for free
      const paidTickets = Math.max(0, totalTickets - 1);
      finalTotalInCents = paidTickets * unitPriceInCents;
    } 
    else if (name.includes('intentional conversations') || name.includes('mocktails') || name.includes('cookout')) {
      // $10 off every single ticket ($10.00 = 1000 cents)
      const discountedPrice = Math.max(0, unitPriceInCents - 1000);
      finalTotalInCents = totalTickets * discountedPrice;
    } 
    else {
      // Unlisted events default to standard pricing
      finalTotalInCents = totalTickets * unitPriceInCents;
    }
  }

  // ==========================================
  // TIER 2: FOUNDING MEMBER ($69)
  // ==========================================
  else if (tier === 'founding_member') {
    if (name.includes('game night')) {
      // Member free + 2 guests free = 3 free tickets total
      const paidTickets = Math.max(0, totalTickets - 3);
      finalTotalInCents = paidTickets * unitPriceInCents;
    } 
    else if (name.includes('intentional conversations') || name.includes('mocktails') || name.includes('cookout')) {
      let remainingTickets = totalTickets;
      
      // 1 completely free ticket per quarter check
      if (!hasUsedQuarterlyFreebie && remainingTickets > 0) {
        remainingTickets -= 1; // First ticket adds 0 cents to the bill
      }
      
      // $15 off every other ticket in the cart ($15.00 = 1500 cents)
      const discountedPrice = Math.max(0, unitPriceInCents - 1500);
      finalTotalInCents += (remainingTickets * discountedPrice);
    } 
    else {
      // Unlisted events default to standard pricing
      finalTotalInCents = totalTickets * unitPriceInCents;
    }
  }

  // ==========================================
  // NON-MEMBER / PUBLIC
  // ==========================================
  else {
    finalTotalInCents = totalTickets * unitPriceInCents;
  }

  return finalTotalInCents;
}

/**
 * @route   POST /api/checkout/create-intent
 * @desc    Create a Stripe PaymentIntent with automatic, dynamic membership pricing rules
 */
router.post('/create-intent', async (req, res) => {
  try {
    // Note: ensure your frontend payload sends "eventName" (e.g. "The Grown Folks Game Night")
    const { eventId, eventName, ticketType, quantity, buyerName, buyerEmail, unitPrice } = req.body;

    let detectedTier = 'non_member';
    let hasUsedQuarterlyFreebie = false; 

    // 1. Query Stripe API to automatically verify if this email is an active subscriber
    try {
      const customers = await stripe.customers.list({ email: buyerEmail, limit: 1 });
      
      if (customers.data && customers.data.length > 0) {
        const customer = customers.data[0];
        
        const subscriptions = await stripe.subscriptions.list({ 
          customer: customer.id, 
          status: 'active',
          expand: ['data.items.data.price'] // Fetch the inner price objects to read cost data
        });

        if (subscriptions.data && subscriptions.data.length > 0) {
          const activeSub = subscriptions.data[0];
          
          // Access the monthly price tier setup via expanded price details
          if (activeSub.items && activeSub.items.data && activeSub.items.data.length > 0) {
            const monthlyAmount = activeSub.items.data[0].price.unit_amount;

            if (monthlyAmount === 3900) {
              detectedTier = 'social_pass';
            } else if (monthlyAmount === 6900) {
              detectedTier = 'founding_member';
              
              // Optional: Add a MongoDB lookup here if you want to track their quarterly freebie allocations
              // const claimedThisQuarter = await Order.findOne({ buyerEmail, isQuarterlyFreeClaim: true });
              // if (claimedThisQuarter) hasUsedQuarterlyFreebie = true;
            }
          }
        }
      }
    } catch (stripeErr) {
      console.warn("Membership verification error, defaulting to public checkout pricing:", stripeErr.message);
    }

    // 2. Compute final order price adjustments in cents (Stripe requires amounts multiplied by 100)
    const unitPriceInCents = Math.round(unitPrice * 100);
    const finalTotalInCents = calculateMemberDiscount(
      detectedTier, 
      eventName, 
      quantity, 
      unitPriceInCents, 
      hasUsedQuarterlyFreebie
    );

    // 3. Create the Stripe Payment Intent with your member prices locked in
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalTotalInCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { 
        buyerEmail, 
        eventName,
        ticketType,
        appliedTier: detectedTier,
        originalQty: quantity
      }
    });

    // 4. Save the Pending Order to your MongoDB Collection
    const newOrder = new Order({
      event: eventId,
      ticketType,
      quantity,
      buyerName,
      buyerEmail,
      unitPrice,
      subtotal: (quantity * unitPrice),        // Base value total in dollars
      total: (finalTotalInCents / 100),       // Final processed tier calculation price in dollars
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret: paymentIntent.client_secret,
      paymentStatus: 'pending'
    });
    await newOrder.save();

    // 5. Send calculations and the client secret back to the frontend form
    res.status(201).json({ 
      clientSecret: paymentIntent.client_secret, 
      orderId: newOrder._id,
      appliedTier: detectedTier,
      finalTotal: (finalTotalInCents / 100)
    });

  } catch (err) {
    console.error("Checkout Engine Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;