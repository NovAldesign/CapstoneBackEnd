import crypto from "crypto";
import { mailer } from "./mailer.js";
import { isOptedOut, asMarketing } from "./optOut.js";
import Subscriber from "../models/subscriberSchema.js";

// -------------------------------------------------------
// Hosting (Play. Sip. Toast.) savings for companies and property managers
//
// 1. Booking specials, one at a time, by date (Eastern):
//      Holiday:  book a December event by Oct 31, save $150
//      New Year: book a January or February event by Nov 30, save $125
//    The frontend shows the same list (src/content/hostingPackages.js).
//
// 2. Planner signup savings: join the corporate list (footer signup, source "corporate")
//    and get a personal code for $99 off a first hosted event, booked within 90 days.
//    One per company. Doesn't combine with a booking special: they get whichever saves more.
//
// Hosting is quoted by hand, so nothing is charged here. The request form takes the
// code (or matches the email), and the team email says which savings apply.
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TIME_ZONE = "America/New_York";
const DAY = 24 * 60 * 60 * 1000;
export const PLANNER_SAVINGS = 99;
export const PLANNER_DAYS = 90;

export const HOSTING_SPECIALS = [
  {
    id: "holiday",
    title: "Holiday Booking Special",
    amount: 150,
    covers: "a December event",
    endsLabel: "Oct 31",
    endsAt: new Date("2026-10-31T23:59:59-04:00"),
  },
  {
    id: "newyear",
    title: "New Year Booking Special",
    amount: 125,
    covers: "a January or February event",
    startsAt: new Date("2026-11-01T00:00:00-04:00"),
    endsLabel: "Nov 30",
    endsAt: new Date("2026-11-30T23:59:59-05:00"),
  },
];

export const currentSpecial = (now = new Date()) =>
  HOSTING_SPECIALS.find((s) => (!s.startsAt || now >= s.startsAt) && now <= s.endsAt) || null;

const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "there";
const longDay = (date) =>
  new Date(date).toLocaleDateString("en-US", { timeZone: TIME_ZONE, month: "long", day: "numeric", year: "numeric" });

// Codes like PLAN99K7Q2M (no look-alike letters)
const makeCode = () => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return `PLAN99${[...crypto.randomBytes(5)].map((b) => chars[b % chars.length]).join("")}`;
};

export const buildPlannerWelcomeEmail = ({ name, code, until, special }) => {
  const bookUrl = `${SITE_URL}/host?type=corporate&code=${code}#book`;
  const specialLine = special
    ? `Right now we also have our <strong>${escapeHtml(special.title)}</strong>: book ${escapeHtml(special.covers)} by ${escapeHtml(special.endsLabel)} and save $${special.amount}. The two don't combine, so we'll take whichever saves you more.`
    : "";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>Thank you for joining the Grown Folks&trade; Collective planner list! We host alcohol-free Play. Sip. Toast. events for apartment communities, offices and teams across Atlanta: Game Night, Spades Tournaments, Karaoke Bingo and Live-Action Mysteries, with a signature mocktail bar and a toast to your people's wins.</p>
    <p>As a thank-you for signing up, here's <strong>$${PLANNER_SAVINGS} off your first hosted event</strong>:</p>
    <p style="margin:18px 0;"><span style="display:inline-block;border:2px dashed #C5A059;padding:10px 22px;font-size:22px;font-weight:bold;letter-spacing:3px;color:#002147;">${code}</span></p>
    <p style="font-size:14px;color:#555;margin-top:0;">Good for one hosted event per company, booked by <strong>${escapeHtml(longDay(until))}</strong> (90 days). Can't be combined with other hosting specials. Enter the code when you request a date, or the button below adds it for you.</p>
    ${specialLine ? `<p>${specialLine}</p>` : ""}
    <p style="margin:22px 0;"><a href="${bookUrl}" style="display:inline-block;background:#002147;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px;">Request a date</a></p>
    <p>About once a month, we'll send seasonal event ideas, booking dates and first pick of open weekday dates. Questions? Just reply, or call or text 470-256-7729.</p>
    <p>Cheers,</p>
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
  </div>`;

  const text = [
    `Hi ${firstName(name)},`,
    "",
    "Thank you for joining the Grown Folks™ Collective planner list! We host alcohol-free Play. Sip. Toast. events for apartment communities, offices and teams across Atlanta: Game Night, Spades Tournaments, Karaoke Bingo and Live-Action Mysteries, with a signature mocktail bar and a toast to your people's wins.",
    "",
    `As a thank-you for signing up, here's $${PLANNER_SAVINGS} off your first hosted event: ${code}`,
    `Good for one hosted event per company, booked by ${longDay(until)} (90 days). Can't be combined with other hosting specials. Enter the code when you request a date.`,
    ...(special
      ? ["", `Right now we also have our ${special.title}: book ${special.covers} by ${special.endsLabel} and save $${special.amount}. The two don't combine, so we'll take whichever saves you more.`]
      : []),
    "",
    `Request a date: ${bookUrl}`,
    "",
    "About once a month, we'll send seasonal event ideas, booking dates and first pick of open weekday dates. Questions? Just reply, or call or text 470-256-7729.",
    "",
    "Cheers,",
    "Vaughn",
    "Chief Playmaker",
    "Grown Folks™ Collective",
    "",
    "Where grown folks come out to play.™",
  ].join("\n");

  return { subject: `Welcome, ${firstName(name)}: here's $${PLANNER_SAVINGS} off your first hosted event`, html, text };
};

// Sends once per subscriber. Never throws.
export const sendPlannerWelcome = async (subscriber) => {
  try {
    if (!mailer || !subscriber?.email || subscriber.plannerCode) return false;
    if (await isOptedOut(subscriber.email)) return false;
    const now = new Date();
    const until = new Date(now.getTime() + PLANNER_DAYS * DAY);
    let code = "";
    for (let tries = 0; tries < 5 && !code; tries++) {
      const candidate = makeCode();
      if (!(await Subscriber.exists({ plannerCode: candidate }))) code = candidate;
    }
    if (!code) return false;
    const message = buildPlannerWelcomeEmail({ name: subscriber.fullName, code, until, special: currentSpecial(now) });
    const { error } = await mailer.emails.send({
      from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
      to: subscriber.email,
      reply_to: "events@grownfolkscollective.com",
      ...asMarketing(message, subscriber.email, "planner-welcome"),
    });
    if (error) return false;
    await Subscriber.updateOne(
      { _id: subscriber._id },
      { $set: { plannerCode: code, plannerSavingsUntil: until, welcomeSentAt: now, welcomeCode: code } }
    );
    return true;
  } catch (err) {
    console.error("Planner welcome email error:", err.message);
    return false;
  }
};

// What savings a hosting request qualifies for (for the team email)
export const savingsForRequest = async ({ email, code, now = new Date() }) => {
  const clean = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
  const or = [{ email: String(email || "").toLowerCase() }];
  if (clean) or.push({ plannerCode: clean });
  const sub = await Subscriber.findOne({ $or: or, plannerCode: { $nin: ["", null] } }).lean();
  const planner =
    sub && sub.plannerSavingsUntil && sub.plannerSavingsUntil >= now
      ? { amount: PLANNER_SAVINGS, code: sub.plannerCode, until: sub.plannerSavingsUntil, email: sub.email }
      : null;
  const expiredPlanner = sub && !planner ? { code: sub.plannerCode, until: sub.plannerSavingsUntil } : null;
  const special = currentSpecial(now);

  const lines = [];
  if (planner) lines.push(`$${PLANNER_SAVINGS} planner signup savings (code ${planner.code}, book by ${longDay(planner.until)}). One per company.`);
  if (expiredPlanner) lines.push(`Planner code ${expiredPlanner.code} expired ${longDay(expiredPlanner.until)}.`);
  if (clean && !sub) lines.push(`Code "${clean}" didn't match a planner signup.`);
  if (special) lines.push(`${special.title}: $${special.amount} off ${special.covers} booked by ${special.endsLabel}.`);
  if (planner && special) lines.push("They don't combine: apply whichever saves more for this date.");
  return { planner, special, note: lines.join(" ") };
};
