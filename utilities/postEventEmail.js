import crypto from "crypto";
import { shopStripHtml, shopStripText } from "./shopStrip.js";
import mongoose from "mongoose";
import { mailer } from "./mailer.js";
import Event from "../models/eventSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import PromoCode from "../models/promoCodeSchema.js";
import { isPlusOne, plusOneAllowed } from "./plusOne.js";
import { nextMorning } from "./memberOffer.js";
import { getShareCode, shareLink, FRIENDS_PER_REWARD } from "./referrals.js";

// -------------------------------------------------------
// Day-after "thank you for coming" email, for every event
// Sent at 10 AM Eastern the morning after an event to everyone who bought on the website.
//   - Invite a friend out: the Plus One for the next event (buy 2, save $8)
//   - Coming alone: $5 off one ticket with their own code, good for 48 hours
//   - Friend's first time: they join the newsletter for $5 off (WELCOME5)
// One email per person per event. Each person gets their own code, used once.
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TIME_ZONE = "America/New_York";
const CODE_HOURS = 48;
const GIVE_UP_DAYS = 3; // don't send for events that ended longer ago than this
const HOUR = 60 * 60 * 1000;

const PostEventEmail =
  mongoose.models.PostEventEmail ||
  mongoose.model(
    "PostEventEmail",
    new mongoose.Schema(
      {
        eventId: { type: String, required: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        code: { type: String, default: "" },
        nextEventId: { type: String, default: "" },
        sentAt: { type: Date, default: null },
        error: { type: String, default: "" },
      },
      { timestamps: true }
    ).index({ eventId: 1, email: 1 }, { unique: true })
  );

const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (text = "") =>
  String(text).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const eventUrl = (event, code) =>
  `${SITE_URL}/events/${slugify(event.name || "event")}-${event._id}${code ? `?code=${code}` : ""}`;
const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "friend";
const dollars = (n) => `$${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`;
const when = (date) =>
  new Date(date).toLocaleString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const deadline = (date) =>
  new Date(date).toLocaleString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

// Codes like THANKS7KQ2 (no look-alike letters)
const makeCode = () => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(5);
  return `THANKS${[...bytes].map((b) => chars[b % chars.length]).join("")}`;
};

// Is this ticket type on sale right now? (not hidden, sold out, or outside its sale window)
const onSale = (t, now) => {
  if (!t || t.hidden) return false;
  const status = String(t.onSaleStatus || "").toUpperCase();
  if (status === "SOLD_OUT" || status === "UNAVAILABLE") return false;
  if (t.salesStart && new Date(t.salesStart) > now) return false;
  if (t.salesEnd && new Date(t.salesEnd) < now) return false;
  return Number(t.quantity || 0) - Number(t.sold || 0) > 0;
};

// The next event to invite them to, with its Plus One ticket if it's on sale
const findNextEvent = async (now) => {
  const upcoming = await Event.find({ status: "published", date: { $gt: now } })
    .sort({ date: 1 })
    .limit(10)
    .lean();
  const withPlusOne = upcoming.find(
    (e) => plusOneAllowed(e.name) && (e.ticketTypes || []).some((t) => isPlusOne(t.name) && onSale(t, now))
  );
  const event = withPlusOne || upcoming.find((e) => !e.isFree) || null;
  const plusOne = withPlusOne
    ? (withPlusOne.ticketTypes || []).find((t) => isPlusOne(t.name) && onSale(t, now))
    : null;
  return { event, plusOne };
};

export const buildPostEventEmail = ({ name, pastEvent, nextEvent, plusOne, code, expiresAt, shareCode }) => {
  const past = escapeHtml(pastEvent?.name || "our event");
  const nextName = nextEvent ? escapeHtml(nextEvent.name) : "";
  const button = (href, label) =>
    `<a href="${href}" style="display:inline-block;background:#002147;color:#ffffff;padding:11px 22px;text-decoration:none;font-weight:bold;border-radius:4px;">${label}</a>`;

  const friendBlock = nextEvent && plusOne
    ? `<h3 style="color:#002147;border-bottom:2px solid #C5A059;padding-bottom:4px;margin:26px 0 8px;">Invite a friend out</h3>
       <p>Next up is <strong>${nextName}</strong> on ${escapeHtml(when(nextEvent.date))}. Bring someone with the <strong>Plus One</strong>: 2 tickets for <strong>${dollars(plusOne.price)}</strong>, $8 less than buying them separately.</p>
       <p>${button(eventUrl(nextEvent), "Get the Plus One")}</p>`
    : nextEvent
    ? `<h3 style="color:#002147;border-bottom:2px solid #C5A059;padding-bottom:4px;margin:26px 0 8px;">Invite a friend out</h3>
       <p>Next up is <strong>${nextName}</strong> on ${escapeHtml(when(nextEvent.date))}. Bring someone along and make it a night.</p>
       <p>${button(eventUrl(nextEvent), "See the event")}</p>`
    : "";

  const aloneBlock = `<h3 style="color:#002147;border-bottom:2px solid #C5A059;padding-bottom:4px;margin:26px 0 8px;">Coming alone?</h3>
       <p>Save <strong>$5</strong> on your ticket with your own code:</p>
       <p style="margin:14px 0;"><span style="display:inline-block;border:2px dashed #C5A059;padding:10px 22px;font-size:22px;font-weight:bold;letter-spacing:3px;color:#002147;">${code}</span></p>
       <p style="font-size:14px;color:#555;margin-top:0;">Good for one ticket to any event that doesn't include food. Use it by <strong>${escapeHtml(deadline(expiresAt))}</strong> (48 hours). Can't be combined with the Plus One or the multi-event discount.</p>
       <p>${button(nextEvent ? eventUrl(nextEvent, code) : `${SITE_URL}/events?code=${code}`, "Use my $5 off")}</p>`;

  const newFriend = shareCode
    ? `<div style="background:#FAF7F0;border-left:3px solid #C5A059;padding:14px 16px;margin:24px 0;">
         <p style="margin:0 0 8px;"><strong>Bring your folks, earn free tickets</strong></p>
         <p style="margin:0 0 8px;">Your own code is <strong style="letter-spacing:2px;">${shareCode}</strong>. Friends who use it get $5 off their first ticket, and every ${FRIENDS_PER_REWARD} friends who come out earns <strong>you a free ticket</strong>.</p>
         <p style="margin:0;font-size:14px;">Share this link: <a href="${shareLink(shareCode)}" style="color:#9A7630;font-weight:bold;">${shareLink(shareCode)}</a></p>
       </div>`
    : `<p style="background:#FAF7F0;border-left:3px solid #C5A059;padding:12px 16px;margin:24px 0;"><strong>First time for your friend?</strong> They can join our newsletter at <a href="${SITE_URL}" style="color:#9A7630;font-weight:bold;">grownfolkscollective.com</a> for $5 off their own first ticket.</p>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>Thank you for coming out to <strong>${past}</strong>! Rooms like that only happen because people like you show up, and we loved having you there.</p>
    ${friendBlock}
    ${aloneBlock}
    ${newFriend}
    <p><strong>Loved last night?</strong> Take the vibe home with <a href="${SITE_URL}/shop" style="color:#9A7630;font-weight:bold;">Grown Folks&trade; merch</a>, made to order.</p>
    <p>See you soon,</p>
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
    ${shopStripHtml()}
  </div>`;

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `Thank you for coming out to ${pastEvent?.name || "our event"}! Rooms like that only happen because people like you show up, and we loved having you there.`,
    ...(nextEvent
      ? [
          "",
          "INVITE A FRIEND OUT",
          plusOne
            ? `Next up is ${nextEvent.name} on ${when(nextEvent.date)}. Bring someone with the Plus One: 2 tickets for ${dollars(plusOne.price)}, $8 less than buying them separately.`
            : `Next up is ${nextEvent.name} on ${when(nextEvent.date)}. Bring someone along and make it a night.`,
          eventUrl(nextEvent),
        ]
      : []),
    "",
    "COMING ALONE?",
    `Save $5 on your ticket with your own code: ${code}`,
    `Good for one ticket to any event that doesn't include food. Use it by ${deadline(expiresAt)} (48 hours). Can't be combined with the Plus One or the multi-event discount.`,
    nextEvent ? eventUrl(nextEvent, code) : `${SITE_URL}/events?code=${code}`,
    "",
    shareCode
      ? `BRING YOUR FOLKS, EARN FREE TICKETS\nYour own code is ${shareCode}. Friends who use it get $5 off their first ticket, and every ${FRIENDS_PER_REWARD} friends who come out earns you a free ticket.\nShare this link: ${shareLink(shareCode)}`
      : `First time for your friend? They can join our newsletter at ${SITE_URL} for $5 off their own first ticket.`,
    "",
    `Loved last night? Take the vibe home with Grown Folks™ merch, made to order: ${SITE_URL}/shop`,
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

  return { subject: `Thank you for coming out, ${firstName(name)}!`, html, text };
};

// Runs on a timer (server.js). Sends the day-after emails that are due. Never throws.
export const sendPostEventEmails = async (now = new Date()) => {
  if (!mailer) return 0;
  const recent = await Event.find({
    status: { $in: ["published", "completed"] },
    date: { $gte: new Date(now.getTime() - (GIVE_UP_DAYS + 1) * 24 * HOUR), $lte: now },
  }).lean();
  let sent = 0;
  let next = null;

  for (const pastEvent of recent) {
    const ended = new Date(pastEvent.endDate || pastEvent.date);
    if (now < nextMorning(ended)) continue; // not the morning after yet
    if (now - ended > GIVE_UP_DAYS * 24 * HOUR) continue; // too late, skip

    const orders = await TicketOrder.find({ status: "paid", "items.eventId": String(pastEvent._id) })
      .select("buyerEmail buyerName")
      .lean();
    const buyers = new Map();
    orders.forEach((o) => o.buyerEmail && !buyers.has(o.buyerEmail) && buyers.set(o.buyerEmail, o.buyerName));
    if (!buyers.size) continue;

    const already = new Set(
      (await PostEventEmail.find({ eventId: String(pastEvent._id), sentAt: { $ne: null } }).select("email").lean()).map((r) => r.email)
    );
    if (!next) next = await findNextEvent(now);

    for (const [email, name] of buyers) {
      if (already.has(email)) continue;
      try {
        let row = await PostEventEmail.findOne({ eventId: String(pastEvent._id), email });
        if (!row) row = await PostEventEmail.create({ eventId: String(pastEvent._id), email });
        const expiresAt = new Date(now.getTime() + CODE_HOURS * HOUR);
        let code = row.code;
        if (!code) {
          for (let tries = 0; tries < 5 && !code; tries++) {
            const candidate = makeCode();
            try {
              await PromoCode.create({
                code: candidate,
                label: `Thank-you: $5 off, 48 hours (${pastEvent.name})`,
                type: "amount",
                value: 5,
                active: true,
                expiresAt,
                oncePerOrder: true,
                maxUses: 1,
                noBundle: true,
                noFood: true,
                source: "thankyou",
                notes: `Day-after email to ${email}`,
              });
              code = candidate;
            } catch (err) {
              if (err.code !== 11000) throw err;
            }
          }
          row.code = code;
          await row.save();
        } else {
          await PromoCode.updateOne({ code }, { expiresAt }); // a retry restarts the 48 hours
        }
        const shareCode = await getShareCode(email, name);
        const message = buildPostEventEmail({ name, pastEvent, nextEvent: next.event, plusOne: next.plusOne, code, expiresAt, shareCode });
        const { error } = await mailer.emails.send({
          from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
          to: email,
          reply_to: "community@grownfolkscollective.com",
          ...message,
        });
        if (error) {
          row.error = error.message || "send failed";
          await row.save();
          continue;
        }
        row.sentAt = new Date();
        row.nextEventId = next.event ? String(next.event._id) : "";
        row.error = "";
        await row.save();
        sent++;
      } catch (err) {
        if (err.code !== 11000) console.error("Day-after email:", err.message);
      }
    }
  }
  return sent;
};
