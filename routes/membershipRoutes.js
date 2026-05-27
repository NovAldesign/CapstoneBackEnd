import express from 'express';
import Stripe from 'stripe';
import { Resend } from 'resend';
import Membership from './models/membershipSchema.js'; // Adjust path to schema

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// ── STRIPE WEBHOOK LISTENER ──
// This path will listen to Stripe events silently in the background
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verifies that the message actually came securely from Stripe
    event = stripe.webhooks.constructEvent(
      req.body, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`❌ Webhook Signature Verification Failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the successful subscription payment event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Pull the structural metadata we passed during creation
    const { memberId, tier, firstName } = session.metadata;
    const customerEmail = session.customer_email;

    try {
      // 1. Update the member status to "active" in your database
      await Membership.findByIdAndUpdate(memberId, { status: 'active' });
      console.log(`✅ Member ${memberId} updated to active status.`);

      // 2. Automatically fire your official onboarding email template via Resend
      await resend.emails.send({
        from: 'GFC <onboarding@grownfolkscollective.com>', // Replace with your verified Resend domain
        to: customerEmail,
        subject: "You're In! Welcome to the Grown Folks Collective",
        html: `
          <div style="font-family: 'Montserrat', sans-serif; max-width: 600px; margin: 0 auto; color: #002147;">
            <div style="background: #002147; padding: 40px; text-align: center;">
              <h1 style="font-family: Georgia, serif; color: #C5A059; font-size: 2.2rem; margin: 0;">The Collective</h1>
              <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; letter-spacing: 4px; text-transform: uppercase; margin: 8px 0 0;">
                Grown Folks Collective
              </p>
            </div>
            <div style="padding: 48px 40px; background: #fff; border: 1px solid #eee;">
              <p style="font-size: 1.1rem; font-weight: 600;">Welcome to the family, ${firstName}! ✨</p>
              <p style="font-size: 0.95rem; line-height: 1.7; color: #444;">
                Your payment was successfully processed and your premium membership status is now **Active**. 
                You have locked in your custom rate for life.
              </p>
              <div style="background: #FDFBFA; border-left: 3px solid #C5A059; padding: 20px 24px; margin: 32px 0;">
                <p style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; color: #888; margin: 0 0 6px;">Confirmed Tier</p>
                <p style="font-family: Georgia, serif; font-size: 1.3rem; font-weight: 700; color: #002147; margin: 0;">
                  ${tier === 'Founding' ? 'Founding Member Pack ($69/mo)' : 'Social Pass ($39/mo)'}
                </p>
              </div>
              <p style="font-size: 0.95rem; line-height: 1.7; color: #444;">
                Keep an eye out for a separate text link containing your private community access invite and details for our upcoming Cookout and Wind Down Wednesday priority seating list.
              </p>
              <p style="font-size: 0.95rem; margin-top: 30px; font-weight: 600;">See you at the next event,</p>
              <p style="font-family: Georgia, serif; font-size: 1.1rem; color: #C5A059; margin: 0;">The Grown Folks Collective Team</p>
            </div>
          </div>
        `
      });
      console.log(`📧 Automated Onboarding Email sent successfully to ${customerEmail}`);

    } catch (dbErr) {
      console.error(`Error executing webhook fulfillment updates:`, dbErr);
    }
  }

  // Return a clean 200 response to tell Stripe you received the payload safely
  res.status(200).json({ received: true });
});

export default router;