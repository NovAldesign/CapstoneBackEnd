import express from 'express';
import Stripe from 'stripe';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import Membership from '../models/membershipSchema.js';

// 1. Core Config initialization — MUST run before instantiating Stripe/Resend constructors
dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const TEAM_EMAIL = 'community@grownfolkscollective.com';

const TIER_LABELS = {
  Founding: 'Founding Member ($69.99/mo)',
  Social: 'Social Pass ($39.99/mo)',
};

// Keeps names and answers people type from breaking the email layout
const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// -------------------------------------------------------------------------
// ── 1. STANDARD MEMBERSHIP SIGNUP ROUTE ──
// Handles the public registration form data hitting: POST /api/membership
// -------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();

    // Only accept the fields the form is supposed to send
    const formData = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email,
      phone,
      dob: req.body.dob,
      tier: req.body.tier,
      connectionGoals: req.body.connectionGoals,
      submittedAt: new Date(),
    };

    // 1. If this email already applied, reuse that record instead of failing
    let savedMember = await Membership.findOne({ email });

    if (savedMember && savedMember.status === 'active') {
      return res.status(409).json({
        error: "You're already a member! Check your email for your welcome message, or contact us if you need help.",
      });
    }

    const isReturning = Boolean(savedMember);

    if (savedMember) {
      // Came back to finish joining (or switched tiers) — update their application
      savedMember.set({ ...formData, status: 'pending' });
      savedMember = await savedMember.save();
    } else {
      savedMember = await new Membership({ ...formData, status: 'pending' }).save();
    }

    // Adjusted map variables to match your backend .env keys exactly
    const priceId = savedMember.tier === 'Founding'
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

      // SAFE BACKUP CHECK: Prevents server crash if a field is missing or malformed
      metadata: {
        memberId: savedMember._id.toString(),
        tier: savedMember.tier || 'Social',
        firstName: savedMember.firstName || 'Member'
      }
    });

    // 3. Let the team know someone applied (they haven't paid yet).
    //    Never blocks the signup — if the email fails, the member still gets to Stripe.
    resend.emails.send({
      from: 'GFC Registration Monitor <noreply@grownfolkscollective.com>',
      to: TEAM_EMAIL,
      subject: `📝 New Membership Application: ${savedMember.firstName} ${savedMember.lastName} (not paid yet)`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #002147;">
          <h2 style="border-bottom: 2px solid #C5A059; padding-bottom: 10px;">
            ${isReturning ? 'Returning Applicant' : 'New Membership Application'}
          </h2>
          <p><strong>Name:</strong> ${escapeHtml(savedMember.firstName)} ${escapeHtml(savedMember.lastName)}</p>
          <p><strong>Email:</strong> ${escapeHtml(savedMember.email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(savedMember.phone)}</p>
          <p><strong>Tier Selected:</strong> ${escapeHtml(TIER_LABELS[savedMember.tier] || savedMember.tier)}</p>
          <p><strong>Most excited about:</strong> ${escapeHtml(savedMember.connectionGoals?.primaryInterest || 'N/A')}</p>
          <p><strong>What's kept them from connecting:</strong> ${escapeHtml(savedMember.connectionGoals?.isolationBarrier || 'N/A')}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #888; font-size: 12px;">
            They were just sent to Stripe to pay. You'll get a separate "New Member Activation" email if they finish.
            If that email never arrives, they didn't complete payment — a personal follow-up can help.
          </p>
        </div>
      `
    }).catch((err) => console.error('❌ Application notice email failed:', err.message));

    // 4. Thank the applicant and give them a way back if they get interrupted.
    //    The Stripe link works for 24 hours; the Membership page link always works.
    const membershipPageUrl = `${process.env.FRONTEND_URL || 'https://grownfolkscollective.com'}/membership`;
    const tierName = TIER_LABELS[savedMember.tier] || TIER_LABELS.Social;

    resend.emails.send({
      from: 'GFC <noreply@grownfolkscollective.com>',
      to: savedMember.email,
      subject: `${savedMember.firstName}, your spot in the Collective is waiting`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Finish Joining the Collective</title></head>
        <body style="margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; margin: 20px auto; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <tr>
              <td bgcolor="#002147" style="padding: 36px 20px; text-align: center;">
                <h1 style="font-family: Georgia, serif; color: #C5A059; font-size: 2rem; margin: 0; font-weight: normal; letter-spacing: 2px;">The Collective</h1>
                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; letter-spacing: 4px; text-transform: uppercase; margin: 8px 0 0;">Grown Folks Collective</p>
              </td>
            </tr>
            <tr><td height="4" bgcolor="#C5A059"></td></tr>
            <tr>
              <td style="padding: 44px 40px;">
                <p style="font-size: 1.1rem; font-weight: 600; color: #002147; margin: 0 0 18px;">
                  Hi ${escapeHtml(savedMember.firstName)},
                </p>
                <p style="font-size: 0.95rem; line-height: 1.7; color: #444444; margin: 0 0 18px;">
                  Thanks for applying to join the Grown Folks Collective as a <strong>${tierName}</strong>. We're so glad you're here.
                </p>
                <p style="font-size: 0.95rem; line-height: 1.7; color: #444444; margin: 0 0 28px;">
                  If you already finished checkout, you're all set. Your welcome email is on its way. If you got interrupted,
                  you can pick up right where you left off:
                </p>
                <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto 18px;">
                  <tr>
                    <td bgcolor="#C5A059" style="border-radius: 2px;">
                      <a href="${session.url}" style="display: inline-block; padding: 16px 34px; font-size: 0.8rem; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #002147; text-decoration: none;">
                        Finish Joining
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="font-size: 0.8rem; line-height: 1.6; color: #888888; text-align: center; margin: 0 0 32px;">
                  This link works for 24 hours. After that, you can join anytime at
                  <a href="${membershipPageUrl}" style="color: #C5A059;">grownfolkscollective.com/membership</a>.
                </p>
                <p style="font-size: 0.95rem; line-height: 1.7; color: #444444; margin: 0 0 32px;">
                  Have a question first, or want to come to an event before joining? Just reply to this email. We'd love to hear from you.
                </p>
                <p style="font-size: 0.95rem; font-weight: 600; color: #002147; margin: 0 0 4px;">Warmly,</p>
                <p style="font-family: Georgia, serif; font-size: 1.1rem; color: #C5A059; margin: 0;">The Grown Folks Collective Team</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#002147" style="padding: 28px 20px; text-align: center;">
                <p style="color: rgba(255,255,255,0.4); font-size: 0.75rem; margin: 0; letter-spacing: 1px;">© 2026 Grown Folks Collective. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      reply_to: TEAM_EMAIL,
    }).catch((err) => console.error('❌ Applicant email failed:', err.message));

    // Send the Stripe URL straight back to the React client to initiate a smooth checkout redirect
    return res.status(201).json({ url: session.url, memberId: savedMember._id });
  } catch (error) {
    console.error("❌ Error initiating application workflow:", error.message);

    // Phone number already used by a different email
    if (error.code === 11000 && error.keyPattern?.phone) {
      return res.status(409).json({
        error: 'That phone number is already linked to another application. Please use a different number or contact us.',
      });
    }

    // Missing or invalid form fields
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Some of your details look incomplete. Please check your name, email, phone, and date of birth, then try again.',
      });
    }

    // Instead of crashing, pass a clean response back to the client
    return res.status(500).json({ error: 'Something went wrong starting your membership. Please try again or contact us.' });
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

  // ── A. Membership payment completed → member is active ──
  // Ticket purchases send this same event, so skip anything that isn't a membership
  if (event.type === 'checkout.session.completed' && event.data.object.metadata?.memberId) {
    const session = event.data.object;

    const { memberId, tier, firstName } = session.metadata || {};
    const customerEmail = session.customer_email || session.customer_details?.email;

    try {
      // 1. Mark them active and save their Stripe IDs
      if (memberId) {
        await Membership.findByIdAndUpdate(memberId, {
          status: 'active',
          paidAt: new Date(),
          stripeCustomerId: session.customer || '',
          stripeSubscriptionId: session.subscription || '',
        });
        console.log(`✅ Member database status advanced to active for ID: ${memberId}`);
      }

      // 2. Send confirmation emails
      if (customerEmail) {

        // ── EMAIL A: Welcome confirmation sent directly to the new member ──
        await resend.emails.send({
          from: 'GFC <noreply@grownfolkscollective.com>',
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
                      Welcome to the family, ${escapeHtml(firstName || 'there')}! ✨
                    </p>

                    <p style="font-size: 0.95rem; line-height: 1.7; color: #444444; margin-bottom: 24px;">
                      Your payment was successfully processed, and your membership is officially <strong>Active</strong>.
                      ${tier === 'Founding' ? 'As a Founding Member, your rate is locked in for life.' : ''}
                    </p>

                    <div style="background-color: #FDFBFA; border-left: 3px solid #C5A059; padding: 20px 24px; margin: 32px 0; border-radius: 0 4px 4px 0;">
                      <p style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; color: #888888; margin: 0 0 6px;">Membership Level</p>
                      <p style="font-family: Georgia, serif; font-size: 1.3rem; font-weight: bold; color: #002147; margin: 0;">
                        ${TIER_LABELS[tier] || TIER_LABELS.Social}
                      </p>
                    </div>

                    <h3 style="font-family: Georgia, serif; color: #002147; font-size: 1.1rem; margin-top: 32px; margin-bottom: 12px; font-weight: normal;">
                      What Happens Next:
                    </h3>

                    <ul style="padding-left: 20px; margin: 0 0 32px 0; color: #444444; font-size: 0.95rem; line-height: 1.8;">
                      <li style="margin-bottom: 10px;">
                        <strong>Your Member Perks:</strong> We'll be in touch shortly with everything you need to use your monthly event credit, member pricing, and partner discounts.
                      </li>
                      <li style="margin-bottom: 10px;">
                        <strong>Early Access:</strong> Watch your inbox. Members hear about new events and get tickets before the public.
                      </li>
                      <li style="margin-bottom: 10px;">
                        <strong>Your People:</strong> We'll add you to our private member group chat so the connection keeps going between events.
                      </li>
                    </ul>

                    <p style="font-size: 0.95rem; line-height: 1.7; color: #444444; margin-bottom: 40px;">
                      We built this collective because grown life is better with your people, and real connection shouldn't be hard to find. We can't wait to welcome you face-to-face very soon.
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
        console.log(`📧 Success onboarding email dispatched out to member: ${customerEmail}`);

        // ── EMAIL B: Internal notification sent directly to your team account ──
        await resend.emails.send({
          from: 'GFC Registration Monitor <noreply@grownfolkscollective.com>',
          to: TEAM_EMAIL,
          subject: `🔔 New Member Activation: ${firstName || 'A User'} has joined!`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #002147;">
              <h2 style="border-bottom: 2px solid #C5A059; padding-bottom: 10px;">New Membership Activated!</h2>
              <p><strong>First Name:</strong> ${escapeHtml(firstName || 'N/A')}</p>
              <p><strong>Email Address:</strong> ${escapeHtml(customerEmail)}</p>
              <p><strong>Tier Selected:</strong> ${escapeHtml(TIER_LABELS[tier] || tier || 'Social')}</p>
              <p><strong>Database ID Link:</strong> ${escapeHtml(memberId || 'N/A')}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="color: #888; font-size: 12px;">This payment completed in Stripe, and the member's status is now active.</p>
            </div>
          `
        });
        console.log(`📢 Internal notification email dispatched to ${TEAM_EMAIL}`);
      }

    } catch (error) {
      console.error(`❌ Webhook fulfillment operations errored:`, error);
    }
  }

  // ── B. Subscription ended (canceled or payment failed for good) → mark canceled ──
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;

    try {
      const member = await Membership.findOneAndUpdate(
        { stripeSubscriptionId: subscription.id },
        { status: 'canceled' },
        { new: true }
      );

      if (member) {
        console.log(`🚪 Membership canceled for ${member.email}`);

        await resend.emails.send({
          from: 'GFC Registration Monitor <noreply@grownfolkscollective.com>',
          to: TEAM_EMAIL,
          subject: `🚪 Membership Canceled: ${member.firstName} ${member.lastName}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #002147;">
              <h2 style="border-bottom: 2px solid #C5A059; padding-bottom: 10px;">Membership Canceled</h2>
              <p><strong>Name:</strong> ${escapeHtml(member.firstName)} ${escapeHtml(member.lastName)}</p>
              <p><strong>Email:</strong> ${escapeHtml(member.email)}</p>
              <p><strong>Tier:</strong> ${escapeHtml(TIER_LABELS[member.tier] || member.tier)}</p>
              <p style="color: #888; font-size: 12px;">A quick personal check-in can help you learn why, or win them back.</p>
            </div>
          `
        });
      }
    } catch (error) {
      console.error(`❌ Cancellation handling errored:`, error);
    }
  }

  res.status(200).json({ received: true });
});

export default router;