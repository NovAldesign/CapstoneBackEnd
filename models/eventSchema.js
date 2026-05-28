import express from 'express';
import Stripe from 'stripe';
import Event from '../models/Event.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* -------------------------------------------------------
   POST /api/events/checkout
   Handles multi-ticket/multi-event checkout with a 15% discount cap
------------------------------------------------------- */
router.post('/checkout', async (req, res) => {
  try {
    const { cartItems, customerEmail } = req.body;
    /*
      cartItems expected shape:
      [
        { 
          eventId: "65f...", 
          eventName: "Spades Tournament & Game Night", 
          ticketTypeName: "General Admission", 
          priceInCents: 3000, 
          quantity: 2 
        },
        { 
          eventId: "65g...", 
          eventName: "Intentional Conversations Over Dinner", 
          ticketTypeName: "VIP Experience", 
          priceInCents: 5000, 
          quantity: 1 
        }
      ]
    */

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: 'Your event cart is empty.' });
    }

    // 1. Calculate how many UNIQUE events are in the cart to verify bundle eligibility
    const uniqueEventIds = [...new Set(cartItems.map(item => item.eventId))];
    
    // 2. Determine the multi-event bundle discount multiplier (Capped at 15%)
    let discountMultiplier = 1.0;
    let discountLabel = '';

    if (uniqueEventIds.length === 2) {
      discountMultiplier = 0.90; // 10% off
      discountLabel = ' (10% Multi-Event Bundle Discount Applied)';
    } else if (uniqueEventIds.length >= 3) {
      discountMultiplier = 0.85; // 15% off capped max rate
      discountLabel = ' (15% Max Multi-Event Bundle Discount Applied)';
    }

    // 3. Map cart array into official Stripe line items
    const lineItems = cartItems.map((item) => {
      // Apply the bundle discount multiplier directly to the stored cent value
      const finalPriceInCents = Math.round(item.priceInCents * discountMultiplier);

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${item.eventName} — ${item.ticketTypeName}`,
            description: discountMultiplier < 1.0 
              ? `Combating social isolation.${discountLabel}` 
              : 'Standard Community Event Admission',
          },
          unit_amount: finalPriceInCents, // Stripe processes raw cents perfectly
        },
        quantity: item.quantity,
      };
    });

    // 4. Generate the Secure Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // One-time event payment pass
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: lineItems,
      success_url: `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/events?cancelled=true`,
      
      // Pack your cart metadata tightly so your webhook can process ticket allocation adjustments later
      metadata: {
        cartDetails: JSON.stringify(cartItems.map(i => ({
          eventId: i.eventId,
          ticketName: i.ticketTypeName,
          qty: i.quantity
        })))
      }
    });

    // Return the dynamic session link directly to your React layer
    return res.status(201).json({ url: session.url });

  } catch (error) {
    console.error('❌ Event bundle checkout failed:', error.message);
    return res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

export default router;