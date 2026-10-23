import { mailer } from "./mailer.js";
import { shopStripHtml, shopStripText } from "./shopStrip.js";
import MemberOffer from "../models/memberOfferSchema.js";
import Membership from "../models/membershipSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import Order from "../models/orderSchema.js";
import { grantCredit, MONTHLY_CREDIT_CENTS, MEMBER_TICKET_OFF_CENTS } from "./memberCredit.js";

// -------------------------------------------------------
// "Become a member" offer after a ticket purchase
// Who:   a guest who has now bought tickets to MORE THAN 3 different events (4+)
//        and isn't an active or paused member
// When:  the next morning at 10 AM Eastern, after their ticket receipt
// How often: at most once every 60 days per email
// Offer: join within 7 days and what they paid for that order comes back as member credit
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TIME_ZONE = "America/New_York";
const MIN_EVENTS = 4; // "more than 3"
const QUIET_DAYS = 60;
const JOIN_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (cents = 0) => {
  const d = Number(cents) / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
};
const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "friend";
const longDate = (date) =>
  new Date(date).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });

// 10:00 AM Eastern on the day after `from` (handles daylight saving)
export const nextMorning = (from = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(from)
      .map((p) => [p.type, p.value])
  );
  for (const utcHour of [14, 15]) {
    const guess = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, utcHour));
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hour12: false }).format(guess));
    if (hour === 10) return guess;
  }
  return new Date(from.getTime() + DAY);
};

// Different events this email has bought tickets to, and what they've paid on the website
export const guestHistory = async (email) => {
  const [orders, oldOrders] = await Promise.all([
    TicketOrder.find({ buyerEmail: email, status: "paid" }).select("items.eventId totalPaidCents").lean(),
    Order.find({ buyerEmail: email, paymentStatus: "succeeded" }).select("event").lean(),
  ]);
  const events = new Set();
  orders.forEach((o) => (o.items || []).forEach((i) => i.eventId && events.add(String(i.eventId))));
  oldOrders.forEach((o) => o.event && events.add(String(o.event)));
  const spentCents = orders.reduce((s, o) => s + (Number(o.totalPaidCents) || 0), 0);
  return { eventsAttended: events.size, spentCents };
};

const isMember = async (email) =>
  Boolean(await Membership.exists({ email, status: { $in: ["active", "paused"] } }));

// Called right after a paid ticket order is saved. Never throws.
export const queueMemberOffer = async (order) => {
  try {
    const email = String(order?.buyerEmail || "").toLowerCase().trim();
    if (!email || !order?._id) return null;
    if (await isMember(email)) return null;
    const { eventsAttended } = await guestHistory(email);
    if (eventsAttended < MIN_EVENTS) return null;
    const recent = await MemberOffer.exists({
      email,
      $or: [{ status: "due" }, { status: "sent", sentAt: { $gte: new Date(Date.now() - QUIET_DAYS * DAY) } }],
    });
    if (recent) return null;
    return await MemberOffer.create({
      email,
      name: order.buyerName || "",
      orderId: String(order._id),
      eventName: order.items?.[0]?.eventName || "",
      creditCents: Number(order.totalPaidCents) || 0,
      dueAt: nextMorning(),
    });
  } catch (err) {
    if (err.code !== 11000) console.error("Member offer queue:", err.message);
    return null;
  }
};

export const buildMemberOfferEmail = ({ name, eventName, eventsAttended, spentCents, creditCents, expiresAt }) => {
  const social = MONTHLY_CREDIT_CENTS.Social, founding = MONTHLY_CREDIT_CENTS.Founding;
  const credit = creditCents > 0;
  const event = eventName ? escapeHtml(eventName) : "your next event";
  const joinUrl = `${SITE_URL}/membership`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>Thank you for grabbing your ticket to <strong>${event}</strong>! That's <strong>${eventsAttended} events</strong> with us so far, and we love having you in the room.</p>
    <p>Since you're coming out this often, a membership pays for itself:</p>
    <ul style="padding-left:20px;">
      <li style="margin-bottom:6px;"><strong>Social Pass, $39.99/mo:</strong> ${money(social)} in event credit every month (it rolls over a month), plus ${money(MEMBER_TICKET_OFF_CENTS.Social)} off every ticket and a $25 birthday credit</li>
      <li><strong>Founding Member, $69.99/mo:</strong> ${money(founding)} in event credit every month, plus ${money(MEMBER_TICKET_OFF_CENTS.Founding)} off every ticket and a $25 birthday credit</li>
    </ul>
    ${spentCents > 0 ? `<p>You've spent <strong>${money(spentCents)}</strong> on tickets with us so far. As a member, your monthly credit covers nights like these.</p>` : ""}
    ${credit ? `<div style="background:#FAF7F0;border-left:3px solid #C5A059;padding:14px 16px;margin:20px 0;"><strong>Join by ${escapeHtml(longDate(expiresAt))}</strong> and the ${money(creditCents)} you just paid for ${event} comes back to you as member credit for your next event.</div>` : ""}
    <p style="margin:22px 0;"><a href="${joinUrl}" style="display:inline-block;background:#002147;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px;">Become a member</a></p>
    <p>Questions about membership? Just reply to this email.</p>
    <p>See you soon,</p>
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
    ${shopStripHtml()}
  </div>`;

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `Thank you for grabbing your ticket to ${eventName || "your next event"}! That's ${eventsAttended} events with us so far, and we love having you in the room.`,
    "",
    "Since you're coming out this often, a membership pays for itself:",
    `- Social Pass, $39.99/mo: ${money(social)} in event credit every month (it rolls over a month), plus ${money(MEMBER_TICKET_OFF_CENTS.Social)} off every ticket and a $25 birthday credit`,
    `- Founding Member, $69.99/mo: ${money(founding)} in event credit every month, plus ${money(MEMBER_TICKET_OFF_CENTS.Founding)} off every ticket and a $25 birthday credit`,
    ...(spentCents > 0 ? ["", `You've spent ${money(spentCents)} on tickets with us so far. As a member, your monthly credit covers nights like these.`] : []),
    ...(credit ? ["", `Join by ${longDate(expiresAt)} and the ${money(creditCents)} you just paid for ${eventName || "your ticket"} comes back to you as member credit for your next event.`] : []),
    "",
    `Become a member: ${joinUrl}`,
    "",
    "Questions about membership? Just reply to this email.",
    "",
    "See you soon,",
    "Vaughn",
    "Chief Playmaker",
    "Grown Folks™ Collective",
    "",
    "Where grown folks come out to play.™",
    "",
    shopStripText(),
  ].join("\n");

  return {
    subject: `You keep showing up, ${firstName(name)}. Let's make it official.`,
    html,
    text,
  };
};

// Runs on a timer (server.js): send offers that are due. Never throws.
export const sendDueMemberOffers = async (now = new Date()) => {
  if (!mailer) return 0;
  const due = await MemberOffer.find({ status: "due", dueAt: { $lte: now } }).limit(25);
  let sent = 0;
  for (const offer of due) {
    try {
      // Re-check: they may have joined, or a refund may have changed things overnight
      const order = await TicketOrder.findById(offer.orderId).select("status").lean();
      if (!order || order.status !== "paid") {
        await MemberOffer.updateOne({ _id: offer._id }, { status: "skipped", skipReason: "order not paid" });
        continue;
      }
      if (await isMember(offer.email)) {
        await MemberOffer.updateOne({ _id: offer._id }, { status: "skipped", skipReason: "already a member" });
        continue;
      }
      const history = await guestHistory(offer.email);
      const expiresAt = new Date(now.getTime() + JOIN_DAYS * DAY);
      const email = buildMemberOfferEmail({ ...offer.toObject(), ...history, expiresAt });
      const { error } = await mailer.emails.send({
        from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
        to: offer.email,
        reply_to: "community@grownfolkscollective.com",
        ...email,
      });
      if (error) continue; // stays due; tried again next run
      await MemberOffer.updateOne(
        { _id: offer._id },
        { status: "sent", sentAt: now, expiresAt, eventsAttended: history.eventsAttended, spentCents: history.spentCents }
      );
      sent++;
    } catch (err) {
      console.error("Member offer send:", err.message);
    }
  }
  return sent;
};

// When a new member's first month is paid: if they joined from an offer in time,
// credit back what they paid for that order (once). Never throws.
export const creditJoinOffer = async (member, { paidAt = new Date(), expiresAt } = {}) => {
  try {
    if (!member?._id || !member.email) return null;
    const offer = await MemberOffer.findOne({
      email: String(member.email).toLowerCase(),
      status: "sent",
      redeemedAt: null,
      expiresAt: { $gte: paidAt },
      creditCents: { $gt: 0 },
    }).sort({ sentAt: -1 });
    if (!offer) return null;
    const row = await grantCredit({
      memberId: member._id,
      type: "bonus",
      cents: offer.creditCents,
      expiresAt,
      note: `Welcome credit: your ${offer.eventName || "ticket"} order, credited back for joining`,
      key: `join-offer:${offer._id}`,
    });
    if (row) await MemberOffer.updateOne({ _id: offer._id }, { redeemedAt: new Date(), memberId: String(member._id) });
    return row;
  } catch (err) {
    console.error("Join offer credit:", err.message);
    return null;
  }
};
