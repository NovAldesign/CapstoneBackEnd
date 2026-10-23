import { mailer } from "./mailer.js";
import Event from "../models/eventSchema.js";
import Subscriber from "../models/subscriberSchema.js";
import { hasBoughtBefore } from "./promoCodes.js";
import { isFoodEvent } from "./memberCredit.js";

// -------------------------------------------------------
// Newsletter welcome email
// Sent once, right after someone joins the newsletter on the website.
// First-time guests get code WELCOME5: $5 off one ticket, any event without food
// (the code's rules live in utilities/promoCodes.js).
// People who already bought a ticket get the same welcome without the code.
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TEAM_EMAIL = "community@grownfolkscollective.com";
const CODE = "WELCOME5";
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

export const buildWelcomeEmail = ({ name, withCode, events }) => {
  const code = withCode ? CODE : "";
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

  const offer = withCode
    ? `<p>We'd love for you to join us at an event. Here's <strong>$5 off a ticket</strong> to get you in the room:</p>
       <p style="margin:18px 0;"><span style="display:inline-block;border:2px dashed #C5A059;padding:10px 22px;font-size:22px;font-weight:bold;letter-spacing:3px;color:#002147;">${CODE}</span></p>
       <p style="font-size:14px;color:#555;margin-top:0;">Good for one ticket to any event that doesn't include food, for your first GFC ticket. The links below add the code for you.</p>`
    : `<p>We'd love to see you at our next event. Here's what's coming up.</p>`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>Welcome to Grown Folks&trade; Collective! Thank you for joining us. We host game nights, Karaoke Bingo, live music and more for Atlanta's 30+ crowd, all alcohol-free, all about good people and real connection.</p>
    ${offer}
    <p style="margin:22px 0;"><a href="${allEvents}" style="display:inline-block;background:#002147;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px;">See upcoming events</a></p>
    ${list}
    <p>You'll hear from us whenever new events go live.</p>
    <p>See you soon,</p>
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
  </div>`;

  const text = [
    `Hi ${firstName(name)},`,
    "",
    "Welcome to Grown Folks™ Collective! Thank you for joining us. We host game nights, Karaoke Bingo, live music and more for Atlanta's 30+ crowd, all alcohol-free, all about good people and real connection.",
    "",
    withCode
      ? `We'd love for you to join us at an event. Here's $5 off a ticket to get you in the room: ${CODE}\nGood for one ticket to any event that doesn't include food, for your first GFC ticket.`
      : "We'd love to see you at our next event.",
    "",
    `See upcoming events: ${allEvents}`,
    ...(events.length ? ["", "Coming up next:", ...events.map((e) => `- ${e.name}, ${when(e.date)}: ${eventUrl(e, code)}`)] : []),
    "",
    "You'll hear from us whenever new events go live.",
    "",
    "See you soon,",
    "Vaughn",
    "Chief Playmaker",
    "Grown Folks™ Collective",
    "",
    "Where grown folks come out to play.™",
  ].join("\n");

  return {
    subject: withCode ? "Welcome to Grown Folks Collective: here's $5 off" : "Welcome to Grown Folks Collective",
    html,
    text,
  };
};

// Send the welcome email once per subscriber. Never throws.
export const sendWelcomeEmail = async (subscriber) => {
  try {
    if (!mailer || !subscriber?.email || subscriber.welcomeSentAt) return false;
    const [boughtBefore, events] = await Promise.all([hasBoughtBefore(subscriber.email), nextEvents()]);
    const email = buildWelcomeEmail({ name: subscriber.fullName, withCode: !boughtBefore, events });
    const { error } = await mailer.emails.send({
      from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
      to: subscriber.email,
      reply_to: TEAM_EMAIL,
      ...email,
    });
    if (error) return false;
    await Subscriber.updateOne(
      { _id: subscriber._id },
      { $set: { welcomeSentAt: new Date(), welcomeCode: boughtBefore ? "" : CODE } }
    );
    return true;
  } catch (err) {
    console.error("Welcome email error:", err.message);
    return false;
  }
};
