import express from 'express';
import Stripe from 'stripe';
import { Resend } from 'resend';
import Membership from '../models/membershipSchema.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// -------------------------------------------------------------------------
// ── 1. STANDARD MEMBERSHIP SIGNUP ROUTE ──
// Handles the public registration form data hitting: POST /api/membership
// -------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    // 1. Create the pending member record inside MongoDB using the form text body
    const newMember = new Membership({
      ...req.body,
      status: 'pending' // Keeps them pending until checkout completion logs a success
    });
    const savedMember = await newMember.save();

    // 🔥 FIXED: Adjusted map variables to match your backend .env keys exactly
    const priceId = req.body.tier === 'Founding' 
      ? process.env.STRIPE_PRICE_FOUNDING 
      : process.env.STRIPE_PRICE_SOCIAL;

    // 2. Generate a secure custom Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: savedMember.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BACKEND_URL || 'https://capstonebackend-production-87ed.up.railway.app'}/membership/cancelled`,
      
      // SAFE BACKUP CHECK: Prevents server crash if savedMember.name is missing or malformed
      metadata: {
        memberId: savedMember._id.toString(),
        tier: savedMember.tier || 'Social',
        firstName: savedMember.name ? savedMember.name.split(' ')[0] : 'Member'
      }
    });

    // Send the Stripe URL straight back to the React client to initiate a smooth checkout redirect
    return res.status(201).json({ url: session.url, memberId: savedMember._id });
  } catch (error) {
    console.error("❌ Error initiating application workflow:", error.message);
    
    // Instead of crashing, let's catch the error and pass a clean response back to the client
    return res.status(500).json({ error: `❌ ${error.toString()}` });
  }
});

// -------------------------------------------------------------------------
// ── 2. AUTOMATED PAYMENT WEBHOOK FULFILLMENT ──
// Handles Stripe webhooks hitting: POST /api/membership/webhook
// -------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`❌ Webhook Signature Mismatch:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    const { memberId, tier, firstName } = session.metadata || {};
    const customerEmail = session.customer_email;

    try {
      // 1. Instantly advance their database application state to active
      if (memberId) {
        await Membership.findByIdAndUpdate(memberId, { status: 'active' });
        console.log(`✅ Member database status advanced to active for ID: ${memberId}`);
      }

      // 2. Dispatch the automated Resend template instantly from community@
      if (customerEmail) {
        await resend.emails.send({
          from: 'GFC <community@grownfolkscollective.com>',
          to: customerEmail,
          subject: "You're In! Welcome to the Grown Folks Collective",
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Welcome to the Collective</title>
            </head>
            <body style="margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">

              <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; margin: 20px auto; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                
                <tr>
                  <td bgcolor="#002147" style="padding: 40px 20px; text-align: center;">
                    <h1 style="font-family: Georgia, serif; color: #C5A059; font-size: 2.2rem; margin: 0; font-weight: normal; letter-spacing: 2px;">
                      The Collective
                    </h1>
                    <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; letter-spacing: 4px; text-transform: uppercase; margin: 8px 0 0;">
                      Grown Folks Collective · Est. 2026
                    </p>
                  </td>
                </tr>

                <tr>
                  <td height="4" bgcolor="#C5A059"></td>
                </tr>

                <tr>
                  <td style="padding: 48px 40px; background-color: #ffffff;">
                    <p style="font-size: 1.1rem; font-weight: 600; color: #002147; margin-top: 0; margin-bottom: 20px;">
                      Welcome to the family, ${firstName || "there"}! ✨
                    </p>
                    
                    <p style="font-size: 0.95rem; line-height: 1.7; color: #444444; margin-bottom: 24px;">
                      Your payment was successfully processed, and your membership status is officially <strong>Active</strong>. You have locked in your custom rate and community status for life.
                    </p>

                    <div style="background-color: #FDFBFA; border-left: 3px solid #C5A059; padding: 20px 24px; margin: 32px 0; border-radius: 0 4px 4px 0;">
                      <p style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; color: #888888; margin: 0 0 6px;">Membership Level</p>
                      <p style="font-family: Georgia, serif; font-size: 1.3rem; font-weight: bold; color: #002147; margin: 0;">
                        ${tier === 'Founding' ? 'Founding Member Pack ($69/mo)' : 'Social Pass ($39/mo)'}
                      </p>
                    </div>

                    <h3 style="font-family: Georgia, serif; color: #002147; font-size: 1.1rem; margin-top: 32px; margin-bottom: 12px; font-weight: normal;">
                      What Happens Next:
                    </h3>
                    
                    <ul style="padding-left: 20px; margin: 0 0 32px 0; color: #444444; font-size: 0.95rem; line-height: 1.8;">
                      <li style="margin-bottom: 10px;">
                        <strong>Your Personal Member Code:</strong> Keep an eye on your inbox. We are currently generating your custom membership discount code and will email it to you shortly. You will use this code at checkout to automatically unlock your covered tickets and tier discounts for every event.
                      </li>
                      <li style="margin-bottom: 10px;">
                        <strong>Priority Event Booking:</strong> You now get 24 to 48 hours of early access notice via email to book all Game Nights, Intentional Dinners, and Cookouts before booking windows unlock for the general public.
                      </li>
                      <li style="margin-bottom: 10px;">
                        <strong>Genuine Connections:</strong> Your presence helps us foster a thoughtful, healthy social landscape for the 35+ community. No posturing or shallow small talk required—just real people showing up authentically to share space.
                      </li>
                    </ul>

                    <p style="font-size: 0.95rem; line-height: 1.7; color: #444444; margin-bottom: 40px;">
                      We built this collective because meaningful connection shouldn't be hard to find as we get older. We can't wait to welcome you face-to-face very soon.
                    </p>

                    <p style="font-size: 0.95rem; margin-top: 30px; font-weight: 600; color: #002147; margin-bottom: 4px;">
                      Warmly,
                    </p>
                    <p style="font-family: Georgia, serif; font-size: 1.1rem; color: #C5A059; margin: 0;">
                      The Grown Folks Collective Team
                    </p>
                  </td>
                </tr>

                <tr>
                  <td bgcolor="#002147" style="padding: 32px 20px; text-align: center;">
                    <p style="color: rgba(255,255,255,0.4); font-size: 0.75rem; margin: 0; letter-spacing: 1px;">
                      © 2026 Grown Folks Collective. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>

            </body>
            </html>
          `
        });
        console.log(`📧 Success automation email dispatched out to: ${customerEmail}`);
      }

    } catch (error) {
      console.error(`❌ Webhook fulfillment operations errored:`, error);
    }
  }

  res.status(200).json({ received: true });
});

export default router;