import Stripe from "stripe";
import { Resend } from "resend";
import CartReminder from "../models/cartReminderSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import MerchOrder from "../models/merchOrderSchema.js";
import DigitalOrder from "../models/digitalOrderSchema.js";
import GiftCard from "../models/giftCardSchema.js";

// -------------------------------------------------------
// "You left something in your bag" emails
// Every website checkout expires after RECOVERY_WINDOW_MIN if it isn't paid. Stripe then sends
// checkout.session.expired to our webhook with a recovery link that rebuilds the same bag.
// If the person typed their email at checkout, they get ONE reminder with that link.
// -------------------------------------------------------
export const RECOVERY_WINDOW_MIN = 60;
const QUIET_DAYS = 3; // at most one reminder per email in this many days

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const TEAM_EMAIL = "events@grownfolkscollective.com";

const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (cents = 0) => {
  const d = Number(cents) / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
};

// Spread into stripe.checkout.sessions.create({...}) for any checkout that can be safely rebuilt
export const recoveryOptions = () => ({
  expires_at: Math.floor(Date.now() / 1000) + RECOVERY_WINDOW_MIN * 60,
  after_expiration: { recovery: { enabled: true } },
  consent_collection: { promotions: "auto" },
});

const kindOf = (meta = {}) => meta.shopKind || (meta.itemCount || meta.cartDetails ? "tickets" : "");

// Did this email buy anything since the abandoned checkout started?
const boughtSince = async (email, since) => {
  const after = { $gte: since };
  const [t, m, d, g] = await Promise.all([
    TicketOrder.exists({ buyerEmail: email, createdAt: after }),
    MerchOrder.exists({ buyerEmail: email, createdAt: after }),
    DigitalOrder.exists({ buyerEmail: email, createdAt: after }),
    GiftCard.exists({ purchaserEmail: email, createdAt: after }),
  ]);
  return Boolean(t || m || d || g);
};

const COPY = {
  tickets: { subject: "Your seats are still waiting 🎟️", head: "Still coming out?", line: "You were this close to grabbing your tickets. Rooms fill up, so lock your spot in while it's open." },
  merch: { subject: "You left something in your bag 🛍️", head: "Still want these?", line: "Your Grown Folks™ merch is still in your bag. Every piece is made to order just for you." },
  digital: { subject: "Your Karaoke Bingo cards are waiting 🎤", head: "Ready for game night?", line: "Your printable Karaoke Bingo cards are one click away. Download right after checkout." },
  gift: { subject: "Your gift is almost on its way 🎁", head: "Finish your gift?", line: "Your Grown Folks™ gift is still in checkout. It only takes a minute to send." },
  pass: { subject: "Your Holiday Pass is still waiting 🎁", head: "Finish your Holiday Pass?", line: "Your Holiday Pass is still in checkout." },
};

export const handleExpiredSession = async (session) => {
  const meta = session.metadata || {};
  const email = String(session.customer_details?.email || session.customer_email || "").toLowerCase().trim();
  const recoveryUrl = session.after_expiration?.recovery?.url || "";
  const kind = kindOf(meta);
  if (!email || !recoveryUrl || !kind || meta.partnerPortal) return { skipped: "no email or no recovery link" };

  const started = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000);
  let skipped = "";
  if (session.consent?.promotions === "opt_out") skipped = "opted out of emails";
  else if (await boughtSince(email, started)) skipped = "already bought";
  else if (await CartReminder.exists({ email, skipped: "", createdAt: { $gte: new Date(Date.now() - QUIET_DAYS * 86400000) } })) {
    skipped = "reminded recently";
  }

  let items = [];
  try {
    if (stripe) {
      const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
      items = lines.data.map((l) => `${l.description}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`);
    }
  } catch (err) {
    console.error("Cart reminder line items failed:", err.message);
  }

  let record;
  try {
    record = await CartReminder.create({
      stripeSessionId: session.id,
      email,
      kind,
      items,
      amountCents: session.amount_total || 0,
      recoveryUrl,
      skipped,
    });
  } catch (err) {
    if (err?.code === 11000) return { duplicate: true };
    throw err;
  }
  if (skipped || !resend) return { skipped: skipped || "email not set up" };

  const c = COPY[kind] || COPY.merch;
  const first = String(session.customer_details?.name || "").split(" ")[0] || "friend";
  const list = items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  await resend.emails.send({
    from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
    to: email,
    reply_to: TEAM_EMAIL,
    subject: c.subject,
    html: `<div style="font-family:Arial,sans-serif;color:#0E2340;max-width:600px;margin:0 auto;padding:24px;background:#FAF7F0;">
      <h2 style="font-family:Georgia,serif;border-bottom:3px solid #C5A059;padding-bottom:10px;">${escapeHtml(c.head)}</h2>
      <p>Hi ${escapeHtml(first)},</p>
      <p>${escapeHtml(c.line)}</p>
      ${list ? `<ul>${list}</ul>` : ""}
      ${session.amount_total ? `<p>Total: <strong>${money(session.amount_total)}</strong></p>` : ""}
      <p style="margin:26px 0;"><a href="${escapeHtml(recoveryUrl)}" style="background:#0E2340;color:#fff;padding:14px 26px;text-decoration:none;border-radius:6px;font-weight:bold;">Finish checking out</a></p>
      <p>Questions or ran into a problem? Just reply to this email.</p>
      <p>Vaughn<br>Chief Playmaker<br>Grown Folks™ Collective</p>
      <p><img src="https://www.grownfolkscollective.com/email/gfc-logo.png" width="90" alt="Grown Folks Collective" style="display:block;width:90px;border-radius:50%;"></p>
      <p style="font-family:Georgia,serif;font-style:italic;color:#9A7630;">Where grown folks come out to play.™</p>
      <p style="font-size:12px;color:#6B7280;">This is a one-time reminder about your unfinished checkout at grownfolkscollective.com. We won't send another.</p>
    </div>`,
  });
  return { reminded: record.email };
};

// Mark a reminder as recovered when that person pays (called from the completed-checkout webhook)
export const markRecovered = async (session) => {
  const email = String(session.customer_details?.email || "").toLowerCase().trim();
  if (!email) return;
  await CartReminder.updateMany(
    { email, skipped: "", recovered: false, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } },
    { $set: { recovered: true } }
  ).catch(() => {});
};
