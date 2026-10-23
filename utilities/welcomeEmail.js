import { mailer } from "./mailer.js";
import { isOptedOut, asMarketing } from "./optOut.js";
import { shopStripHtml, shopStripText } from "./shopStrip.js";
import Event from "../models/eventSchema.js";
import Subscriber from "../models/subscriberSchema.js";
import { hasBoughtBefore } from "./promoCodes.js";
import { isFoodEvent } from "./memberCredit.js";

// -------------------------------------------------------
// Newsletter welcome email
// Sent once, right after someone joins the newsletter on the website.
// First-time guests get code WELCOME5: $5 off one ticket, any event without food.
// People who already bought a ticket get WELCOMEBACK10: 10% off one order, any event without food.
// Neither combines with the multi-event bundle discount (rules live in utilities/promoCodes.js).
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TEAM_EMAIL = "community@grownfolkscollective.com";
const FIRST_CODE = "WELCOME5";
const BACK_CODE = "WELCOMEBACK10";
const TIME_ZONE = "America/New_York";

const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (text = "") =>
  String(text).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const eventUrl = (event, code) =>
  `${SITE_URL}/events/${slugify(event.name || "event")}-${event._id}${code ? `?code=${code}` : ""}`;

const when = (date) =>
  new Date(date).toLocaleString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const firstName = (fullName = "") => String(fullName).trim().split(/\s+/)[0] || "there";

// The next few events the code works for (paid, no food)
const nextEvents = async (limit = 3) => {
  const upcoming = await Event.find({ status: "published", date: { $gte: new Date() } })
    .sort({ date: 1 })
    .select("name date location isFree")
    .limit(12)
    .lean();
  return upcoming.filter((e) => !e.isFree && !isFoodEvent(e.name)).slice(0, limit);
};

export const buildWelcomeEmail = ({ name, returning = false, events }) => {
  const code = returning ? BACK_CODE : FIRST_CODE;
  const allEvents = `${SITE_URL}/events${code ? `?code=${code}` : ""}`;
  const list = events.length
    ? `<p style="margin:22px 0 8px;"><strong>Coming up next:</strong></p>
       <ul style="padding-left:20px;margin-top:0;">
         ${events
           .map(
             (e) =>
               `<li style="margin-bottom:6px;"><a href="${eventUrl(e, code)}" style="color:#9A7630;font-weight:bold;">${escapeHtml(e.name)}</a><br/><span style="color:#555;">${escapeHtml(when(e.date))}${e.location?.name ? ` · ${escapeHtml(e.location.name)}` : ""}</span></li>`
           )
           .join("")}
       </ul>`
    : "";

  const codeBox = `<p style="margin:18px 0;"><span style="display:inline-block;border:2px dashed #C5A059;padding:10px 22px;font-size:22px;font-weight:bold;letter-spacing:3px;color:#002147;">${code}</span></p>`;
  const offer = returning
    ? `<p>It's good to have you back! As a thank-you for coming out with us before, here's <strong>10% off your next order</strong>:</p>
       ${codeBox}
       <p style="font-size:14px;color:#555;margin-top:0;">Good for one order, any event that doesn't include food. Can't be combined with the multi-event discount. The links below add the code for you.</p>`
    : `<p>We'd love for you to join us at an event. Here's <strong>$5 off a ticket</strong> to get you in the room:</p>
       ${codeBox}
       <p style="font-size:14px;color:#555;margin-top:0;">Good for one ticket to any event that doesn't include food, for your first GFC ticket. Can't be combined with the multi-event discount. The links below add the code for you.</p>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>${returning ? "Thank you for joining the Grown Folks™ Collective newsletter!" : "Welcome to Grown Folks&trade; Collective! Thank you for joining us. We host game nights, Karaoke Bingo, live music and more for Atlanta's 30+ crowd, all alcohol-free, all about good people and real connection."}</p>
    ${offer}
    <p style="margin:22px 0;"><a href="${allEvents}" style="display:inline-block;background:#002147;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px;">See upcoming events</a></p>
    ${list}
    <p>Look for our weekly newsletter with everything coming up, plus first word on new events.</p>
    <p>See you soon,</p>
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
    ${shopStripHtml()}
  </div>`;

  const text = [
    `Hi ${firstName(name)},`,
    "",
    returning
      ? "Thank you for joining the Grown Folks™ Collective newsletter!"
      : "Welcome to Grown Folks™ Collective! Thank you for joining us. We host game nights, Karaoke Bingo, live music and more for Atlanta's 30+ crowd, all alcohol-free, all about good people and real connection.",
    "",
    returning
      ? `It's good to have you back! As a thank-you for coming out with us before, here's 10% off your next order: ${code}\nGood for one order, any event that doesn't include food. Can't be combined with the multi-event discount.`
      : `We'd love for you to join us at an event. Here's $5 off a ticket to get you in the room: ${code}\nGood for one ticket to any event that doesn't include food, for your first GFC ticket. Can't be combined with the multi-event discount.`,
    "",
    `See upcoming events: ${allEvents}`,
    ...(events.length ? ["", "Coming up next:", ...events.map((e) => `- ${e.name}, ${when(e.date)}: ${eventUrl(e, code)}`)] : []),
    "",
    "Look for our weekly newsletter with everything coming up, plus first word on new events.",
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
    subject: returning ? "Welcome back to Grown Folks Collective: here's 10% off" : "Welcome to Grown Folks Collective: here's $5 off",
    html,
    text,
  };
};

// Send the welcome email once per subscriber. Never throws.
export const sendWelcomeEmail = async (subscriber) => {
  try {
    if (!mailer || !subscriber?.email || subscriber.welcomeSentAt) return false;
    if (await isOptedOut(subscriber.email)) return false;
    const [boughtBefore, events] = await Promise.all([hasBoughtBefore(subscriber.email), nextEvents()]);
    const email = buildWelcomeEmail({ name: subscriber.fullName, returning: boughtBefore, events });
    const { error } = await mailer.emails.send({
      from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
      to: subscriber.email,
      reply_to: TEAM_EMAIL,
      ...asMarketing(email, subscriber.email, "welcome"),
    });
    if (error) return false;
    await Subscriber.updateOne(
      { _id: subscriber._id },
      { $set: { welcomeSentAt: new Date(), welcomeCode: boughtBefore ? BACK_CODE : FIRST_CODE } }
    );
    return true;
  } catch (err) {
    console.error("Welcome email error:", err.message);
    return false;
  }
};
