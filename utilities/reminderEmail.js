import mongoose from "mongoose";
import { shopStripHtml, shopStripText } from "./shopStrip.js";
import { mailer } from "./mailer.js";
import Event from "../models/eventSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import { nextMorning } from "./memberOffer.js";
import { isFoodEvent } from "./memberCredit.js";
import { getShareCode } from "./referrals.js";

// -------------------------------------------------------
// Day-before reminder: "See you tomorrow!"
// 10 AM Eastern the day before each event, to everyone with a website ticket.
// Ticket details, directions, and "room for one more?" with their share code
// (a friend gets $5 off their first ticket; it doesn't work for food events).
// Tickets bought after 10 AM still get it, up to 3 hours before doors.
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TIME_ZONE = "America/New_York";
const HOUR = 60 * 60 * 1000;

const EventReminder =
  mongoose.models.EventReminder ||
  mongoose.model(
    "EventReminder",
    new mongoose.Schema(
      {
        eventId: { type: String, required: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        sentAt: { type: Date, default: null },
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
const dayTime = (date) =>
  new Date(date).toLocaleString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const time = (date) => new Date(date).toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const addressLine = (loc = {}) =>
  [loc.address, loc.city, [loc.state, loc.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const directionsUrl = (loc = {}) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc.name, addressLine(loc)].filter(Boolean).join(", "))}`;

export const buildReminderEmail = ({ name, event, tickets, confirmationCode, shareCode }) => {
  const loc = event.location || {};
  const food = isFoodEvent(event.name);
  const friend = shareCode && !food
    ? `<div style="background:#FAF7F0;border-left:3px solid #C5A059;padding:14px 16px;margin:22px 0;">
         <p style="margin:0 0 8px;"><strong>Room for one more?</strong></p>
         <p style="margin:0 0 8px;">Bring a friend tomorrow. They get <strong>$5 off their first ticket</strong> with your code <strong style="letter-spacing:2px;">${shareCode}</strong>, and it counts toward your free ticket.</p>
         <p style="margin:0;font-size:14px;">Send them this link: <a href="${eventUrl(event, shareCode)}" style="color:#9A7630;font-weight:bold;">${eventUrl(event, shareCode)}</a></p>
       </div>`
    : `<p style="margin:22px 0;"><strong>Room for one more?</strong> Send a friend the event link: <a href="${eventUrl(event)}" style="color:#9A7630;font-weight:bold;">${eventUrl(event)}</a></p>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>See you tomorrow! We can't wait to have you at <strong>${escapeHtml(event.name)}</strong>.</p>
    <div style="border:1px solid #E5DCC8;border-left:4px solid #C5A059;padding:16px 18px;margin:18px 0;background:#FFFFFF;">
      <p style="margin:0 0 6px;"><strong>${escapeHtml(dayTime(event.date))}</strong>${event.endDate ? ` to ${escapeHtml(time(event.endDate))}` : ""}</p>
      <p style="margin:0 0 6px;">${escapeHtml(loc.name || "")}${loc.name && addressLine(loc) ? "<br/>" : ""}${escapeHtml(addressLine(loc))}</p>
      <p style="margin:0 0 6px;">${escapeHtml(tickets)}${confirmationCode ? ` · Confirmation <strong>${escapeHtml(confirmationCode)}</strong>` : ""}</p>
      <p style="margin:0;font-size:14px;">${loc.name || loc.address ? `<a href="${directionsUrl(loc)}" style="color:#9A7630;font-weight:bold;">Get directions</a> &nbsp;·&nbsp; ` : ""}<a href="${eventUrl(event)}" style="color:#9A7630;font-weight:bold;">Event details</a></p>
    </div>
    <p>At check-in, just give your name or show your confirmation code.</p>
    ${friend}
    <p>See you tomorrow,</p>
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
    ${shopStripHtml()}
  </div>`;

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `See you tomorrow! We can't wait to have you at ${event.name}.`,
    "",
    `${dayTime(event.date)}${event.endDate ? ` to ${time(event.endDate)}` : ""}`,
    [loc.name, addressLine(loc)].filter(Boolean).join(", "),
    `${tickets}${confirmationCode ? ` · Confirmation ${confirmationCode}` : ""}`,
    loc.name || loc.address ? `Directions: ${directionsUrl(loc)}` : "",
    "",
    "At check-in, just give your name or show your confirmation code.",
    "",
    shareCode && !food
      ? `Room for one more? Bring a friend tomorrow. They get $5 off their first ticket with your code ${shareCode}, and it counts toward your free ticket: ${eventUrl(event, shareCode)}`
      : `Room for one more? Send a friend the event link: ${eventUrl(event)}`,
    "",
    "See you tomorrow,",
    "Vaughn",
    "Chief Playmaker",
    "Grown Folks™ Collective",
    "",
    "Where grown folks come out to play.™",
    "",
    shopStripText(),
  ].join("\n");

  return { subject: `See you tomorrow at ${event.name}!`, html, text };
};

// Runs on a timer (server.js). Never throws.
export const sendEventReminders = async (now = new Date()) => {
  if (!mailer) return 0;
  const events = await Event.find({
    status: "published",
    date: { $gt: new Date(now.getTime() + 3 * HOUR), $lte: new Date(now.getTime() + 40 * HOUR) },
  }).lean();
  let sent = 0;
  for (const event of events) {
    const due = nextMorning(new Date(new Date(event.date).getTime() - 48 * HOUR)); // 10 AM the day before
    if (now < due) continue;
    const orders = await TicketOrder.find({ status: "paid", "items.eventId": String(event._id) })
      .select("buyerEmail buyerName confirmationCode items")
      .lean();
    for (const order of orders) {
      const email = String(order.buyerEmail || "").toLowerCase();
      if (!email) continue;
      try {
        if (await EventReminder.exists({ eventId: String(event._id), email, sentAt: { $ne: null } })) continue;
        const row =
          (await EventReminder.findOne({ eventId: String(event._id), email })) ||
          (await EventReminder.create({ eventId: String(event._id), email }));
        const lines = (order.items || []).filter((i) => String(i.eventId) === String(event._id));
        const people = lines.reduce((s, i) => s + (Number(i.quantity) || 1) * (Number(i.guests) || 1), 0);
        const tickets = people === 1 ? "1 ticket" : `Tickets for ${people} people`;
        const shareCode = await getShareCode(email, order.buyerName);
        const message = buildReminderEmail({ name: order.buyerName, event, tickets, confirmationCode: order.confirmationCode, shareCode });
        const { error } = await mailer.emails.send({
          from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
          to: email,
          reply_to: "community@grownfolkscollective.com",
          ...message,
        });
        if (error) continue;
        row.sentAt = new Date();
        await row.save();
        sent++;
      } catch (err) {
        if (err.code !== 11000) console.error("Event reminder:", err.message);
      }
    }
  }
  return sent;
};
