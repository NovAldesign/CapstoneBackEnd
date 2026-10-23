import crypto from "crypto";
import Stripe from "stripe";
import PromoCode from "../models/promoCodeSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";

// -------------------------------------------------------
// Thank-you page offer: "Add another event in the next 15 minutes and keep your discount"
// Right after a ticket purchase, the buyer gets their own one-time code worth the
// multi-event discount they'd have had if both were in one order:
//   1 event bought  -> 5% off the next one (2 events = 5%)
//   2+ events bought -> 10% off the next one (3+ events = 10%)
// The code stops working 15 minutes after the purchase.
// -------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Same session always gets the same code (refreshing the page doesn't make new ones)
const codeFor = (sessionId) =>
  `ADDON${crypto.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 7).toUpperCase().replace(/0/g, "X").replace(/1/g, "Y")}`;

export const getAddonOffer = async (sessionId) => {
  const id = String(sessionId || "").trim();
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return { ok: false, reason: "no-session" };

  // The webhook may not have saved the order yet: fall back to Stripe
  let paidAt = null;
  let events = 0;
  let plusOne = false;
  const order = await TicketOrder.findOne({ stripeSessionId: id }).select("createdAt items status").lean();
  if (order) {
    if (order.status !== "paid") return { ok: false, reason: "not-paid" };
    paidAt = order.createdAt;
    events = new Set((order.items || []).map((i) => i.eventId)).size;
    plusOne = (order.items || []).some((i) => /plus\s*-?\s*one/i.test(i.ticketName || ""));
  } else if (stripe) {
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session.payment_status !== "paid") return { ok: false, reason: "not-paid" };
    paidAt = new Date(session.created * 1000);
    const m = session.metadata || {};
    const ids = new Set();
    for (let i = 0; i < Number(m.itemCount || 0); i++) {
      try {
        const item = JSON.parse(m[`item_${i}`] || "{}");
        if (item.eventId) ids.add(String(item.eventId));
        if (/plus\s*-?\s*one/i.test(item.ticketName || "")) plusOne = true;
      } catch {
        /* skip a bad entry */
      }
    }
    events = ids.size;
  } else {
    return { ok: false, reason: "unavailable" };
  }
  if (!events) return { ok: false, reason: "no-tickets" };
  if (plusOne) return { ok: false, reason: "plus-one" }; // the Plus One doesn't combine with the bundle discount

  const expiresAt = new Date(new Date(paidAt).getTime() + WINDOW_MS);
  if (Date.now() > expiresAt.getTime()) return { ok: false, reason: "expired" };

  const percent = events >= 2 ? 10 : 5;
  const code = codeFor(id);
  try {
    await PromoCode.create({
      code,
      label: `Thank-you page: ${percent}% off another event (15 minutes)`,
      type: "percent",
      value: percent,
      active: true,
      expiresAt,
      maxUses: 1,
      noBundle: true,
      source: "addon",
      notes: `Stripe session ${id}`,
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // already made on an earlier visit
  }
  return { ok: true, code, percent, expiresAt: expiresAt.toISOString() };
};
