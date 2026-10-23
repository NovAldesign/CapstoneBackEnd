import crypto from "crypto";
import { isOptedOut, asMarketing } from "./optOut.js";
import { shopStripHtml, shopStripText } from "./shopStrip.js";
import mongoose from "mongoose";
import { mailer } from "./mailer.js";
import Event from "../models/eventSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import GuestEntry from "../models/guestEntrySchema.js";
import PromoCode from "../models/promoCodeSchema.js";
import Membership from "../models/membershipSchema.js";
import { isFoodEvent } from "./memberCredit.js";

// -------------------------------------------------------
// "We miss you" email
// Who:   a past guest (website ticket or guest list: Posh, Eventnoire, Meetup, door)
//        whose last GFC event was 30+ days ago, who has no ticket for an
//        upcoming event and isn't an active or paused member
// What:  their own code for 15% off one ticket, good for 7 days, any event without food
// When:  between 10 AM and 6 PM Eastern; once per absence (never twice for the
//        same last event) and at most once every 60 days
// Only guests whose last event was within the past 180 days, so the first run
// doesn't email everyone who ever bought a ticket.
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TIME_ZONE = "America/New_York";
const AWAY_DAYS = 30;
const LOOKBACK_DAYS = 180;
const QUIET_DAYS = 60;
const CODE_DAYS = 7;
const PERCENT = 15;
const PER_RUN = 40; // spread a backlog over several runs
const DAY = 24 * 60 * 60 * 1000;

const WinBack =
  mongoose.models.WinBack ||
  mongoose.model(
    "WinBack",
    new mongoose.Schema(
      {
        email: { type: String, required: true, lowercase: true, trim: true, index: true },
        lastEventDate: { type: Date, required: true },
        lastEventName: { type: String, default: "" },
        code: { type: String, default: "" },
        sentAt: { type: Date, default: null },
        error: { type: String, default: "" },
      },
      { timestamps: true }
    ).index({ email: 1, lastEventDate: 1 }, { unique: true })
  );

const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (text = "") =>
  String(text).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const eventUrl = (event, code) =>
  `${SITE_URL}/events/${slugify(event.name || "event")}-${event._id}${code ? `?code=${code}` : ""}`;
const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "friend";
const when = (date) =>
  new Date(date).toLocaleString("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const longDay = (date) =>
  new Date(date).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });
const easternHour = (date) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hour12: false }).format(date));

// Codes like MISSYOU7KQ2M (no look-alike letters)
const makeCode = () => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return `MISSYOU${[...crypto.randomBytes(5)].map((b) => chars[b % chars.length]).join("")}`;
};

export const buildWinBackEmail = ({ name, lastEventName, events, code, expiresAt }) => {
  const list = events.length
    ? `<p style="margin:22px 0 8px;"><strong>Coming up:</strong></p>
       <ul style="padding-left:20px;margin-top:0;">
         ${events
           .map(
             (e) =>
               `<li style="margin-bottom:6px;"><a href="${eventUrl(e, code)}" style="color:#9A7630;font-weight:bold;">${escapeHtml(e.name)}</a><br/><span style="color:#555;">${escapeHtml(when(e.date))}${e.location?.name ? ` · ${escapeHtml(e.location.name)}` : ""}</span></li>`
           )
           .join("")}
       </ul>`
    : "";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>We miss you! It's been a little while since ${lastEventName ? `<strong>${escapeHtml(lastEventName)}</strong>` : "we've seen you"}, and the room isn't the same without you.</p>
    <p>Come join us again. Here's <strong>${PERCENT}% off a ticket</strong> to your next Grown Folks&trade; night:</p>
    <p style="margin:18px 0;"><span style="display:inline-block;border:2px dashed #C5A059;padding:10px 22px;font-size:22px;font-weight:bold;letter-spacing:3px;color:#002147;">${code}</span></p>
    <p style="font-size:14px;color:#555;margin-top:0;">Good for one ticket to any event that doesn't include food. Use it by <strong>${escapeHtml(longDay(expiresAt))}</strong> (7 days). Can't be combined with the Plus One or the multi-event discount. The links below add the code for you.</p>
    <p style="margin:22px 0;"><a href="${SITE_URL}/events?code=${code}" style="display:inline-block;background:#002147;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px;">Pick your next event</a></p>
    ${list}
    <p>Hope to see you soon,</p>
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
    ${shopStripHtml()}
  </div>`;

  const text = [
    `Hi ${firstName(name)},`,
    "",
    `We miss you! It's been a little while since ${lastEventName || "we've seen you"}, and the room isn't the same without you.`,
    "",
    `Come join us again. Here's ${PERCENT}% off a ticket to your next Grown Folks™ night: ${code}`,
    `Good for one ticket to any event that doesn't include food. Use it by ${longDay(expiresAt)} (7 days). Can't be combined with the Plus One or the multi-event discount.`,
    "",
    `Pick your next event: ${SITE_URL}/events?code=${code}`,
    ...(events.length ? ["", "Coming up:", ...events.map((e) => `- ${e.name}, ${when(e.date)}: ${eventUrl(e, code)}`)] : []),
    "",
    "Hope to see you soon,",
    "Vaughn",
    "Chief Playmaker",
    "Grown Folks™ Collective",
    "",
    "Where grown folks come out to play.™",
    "",
    shopStripText(),
  ].join("\n");

  return { subject: `We miss you, ${firstName(name)}`, html, text };
};

// Each past guest's most recent event, from website tickets AND the guest lists
// (tickets sold on Posh, Eventnoire, Meetup, AllEvents, comps and walk-ins at the door).
// A guest with a ticket for an upcoming event has a later "last event", so is left out.
const GUEST_LIST_SOURCES = ["posh", "eventnoire", "meetup", "allevents", "door", "comp", "other"]; // not scouts or partners
const isObjectId = (id) => /^[a-f0-9]{24}$/i.test(String(id || ""));

const guestsAway = async (now) => {
  const latest = new Map(); // email -> { name, lastEventDate, lastEventName }
  const note = (email, name, date, eventName) => {
    const key = String(email || "").trim().toLowerCase();
    if (!key || !date) return;
    const d = new Date(date);
    const cur = latest.get(key);
    if (!cur || d > cur.lastEventDate) latest.set(key, { name: name || cur?.name || "", lastEventDate: d, lastEventName: eventName || "" });
    else if (!cur.name && name) cur.name = name;
  };

  const orders = await TicketOrder.find({ status: "paid", buyerEmail: { $nin: ["", null] } })
    .select("buyerEmail buyerName items.eventDate items.eventName")
    .lean();
  for (const o of orders) for (const i of o.items || []) note(o.buyerEmail, o.buyerName, i.eventDate, i.eventName);

  const entries = await GuestEntry.find({ email: { $nin: ["", null] }, source: { $in: GUEST_LIST_SOURCES } })
    .select("email name eventId")
    .lean();
  const ids = [...new Set(entries.map((e) => e.eventId).filter(isObjectId))];
  const events = new Map(
    (await Event.find({ _id: { $in: ids } }).select("name date").lean()).map((e) => [String(e._id), e])
  );
  for (const g of entries) {
    const ev = events.get(String(g.eventId));
    if (ev) note(g.email, g.name, ev.date, ev.name);
  }

  const awayBefore = new Date(now.getTime() - AWAY_DAYS * DAY);
  const lookback = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  return [...latest.entries()]
    .filter(([, v]) => v.lastEventDate <= awayBefore && v.lastEventDate >= lookback)
    .map(([email, v]) => ({ _id: email, name: v.name, lastEventDate: v.lastEventDate, lastEventName: v.lastEventName }))
    .sort((a, b) => b.lastEventDate - a.lastEventDate);
};

// Runs on a timer (server.js). Never throws.
export const sendWinBackEmails = async (now = new Date()) => {
  if (!mailer) return 0;
  const hour = easternHour(now);
  if (hour < 10 || hour >= 18) return 0;

  const guests = await guestsAway(now);
  if (!guests.length) return 0;
  const members = new Set(
    (await Membership.find({ email: { $in: guests.map((g) => g._id) }, status: { $in: ["active", "paused"] } }).select("email").lean()).map((m) => m.email)
  );
  const upcoming = (
    await Event.find({ status: "published", date: { $gt: now } }).sort({ date: 1 }).select("name date location isFree").limit(10).lean()
  )
    .filter((e) => !e.isFree && !isFoodEvent(e.name))
    .slice(0, 3);

  let sent = 0;
  for (const g of guests) {
    if (sent >= PER_RUN) break;
    const email = g._id;
    if (members.has(email)) continue;
    if (await isOptedOut(email)) continue;
    try {
      const recent = await WinBack.exists({
        email,
        sentAt: { $ne: null },
        $or: [{ lastEventDate: g.lastEventDate }, { sentAt: { $gte: new Date(now.getTime() - QUIET_DAYS * DAY) } }],
      });
      if (recent) continue;

      let row = await WinBack.findOne({ email, lastEventDate: g.lastEventDate });
      if (!row) row = await WinBack.create({ email, lastEventDate: g.lastEventDate, lastEventName: g.lastEventName || "" });
      const expiresAt = new Date(now.getTime() + CODE_DAYS * DAY);
      let code = row.code;
      if (!code) {
        for (let tries = 0; tries < 5 && !code; tries++) {
          const candidate = makeCode();
          try {
            await PromoCode.create({
              code: candidate,
              label: `We miss you: ${PERCENT}% off one ticket, 7 days`,
              type: "percent",
              value: PERCENT,
              active: true,
              expiresAt,
              oncePerOrder: true,
              maxUses: 1,
              noBundle: true,
              noFood: true,
              source: "winback",
              notes: `"We miss you" email to ${email}`,
            });
            code = candidate;
          } catch (err) {
            if (err.code !== 11000) throw err;
          }
        }
        row.code = code;
        await row.save();
      } else {
        await PromoCode.updateOne({ code }, { expiresAt }); // a retry restarts the 7 days
      }

      const message = buildWinBackEmail({ name: g.name, lastEventName: g.lastEventName, events: upcoming, code, expiresAt });
      const { error } = await mailer.emails.send({
        from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
        to: email,
        reply_to: "community@grownfolkscollective.com",
        ...asMarketing(message, email, "we-miss-you"),
      });
      if (error) {
        row.error = error.message || "send failed";
        await row.save();
        continue;
      }
      row.sentAt = new Date();
      row.error = "";
      await row.save();
      sent++;
    } catch (err) {
      if (err.code !== 11000) console.error("We miss you email:", err.message);
    }
  }
  return sent;
};
