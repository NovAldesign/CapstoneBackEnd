import crypto from "crypto";
import { Resend } from "resend";

// -------------------------------------------------------
// Instagram/TikTok Lives with booked artists, hosts and live artists.
// Dashboard (Lives tab) sets the date choices and questions and copies a private link;
// the artist picks a date + platform at /live-setup/:id?t=TOKEN and gets a confirmation
// email with the questions attached. Everything shows in the dashboard on the day.
// -------------------------------------------------------
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const SITE_URL = "https://www.grownfolkscollective.com";
export const TEAM_EMAIL = "events@grownfolkscollective.com";
export const TIME_ZONE = "America/New_York";
export const LIVE_MINUTES = 20;
export const MAX_OPTIONS = 4;
export const MAX_QUESTIONS = 12;
export const PLATFORMS = { instagram: "Instagram", tiktok: "TikTok" };
const GFC_HANDLE = "@grownfolkscollective";
const LOGO = "https://www.grownfolkscollective.com/email/gfc-logo.png";

export const newLiveToken = () => crypto.randomBytes(24).toString("hex");
export const liveLink = (application) =>
  `${SITE_URL}/live-setup/${application._id}?t=${application.live?.token || ""}`;

export const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const fmtLiveDay = (d) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric" });
export const fmtLiveTime = (d) =>
  new Date(d).toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
export const fmtLiveWhen = (d) => `${fmtLiveDay(d)} at ${fmtLiveTime(d)} ET`;
const fmtShortDay = (d) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" });

// Minutes Atlanta is behind UTC at a given moment (240 in summer, 300 in winter)
const etOffsetMinutes = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((date.getTime() - asUtc) / 60000);
};

// "2026-11-12T19:00" typed in the dashboard means 7 PM Atlanta time
export const parseEtLocal = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const first = new Date(guess.getTime() + etOffsetMinutes(guess) * 60000);
  return new Date(guess.getTime() + etOffsetMinutes(first) * 60000);
};

// The same value back for a datetime-local input
export const toEtLocal = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return new Date(date.getTime() - etOffsetMinutes(date) * 60000).toISOString().slice(0, 16);
};

const firstWord = (name = "") => String(name).trim().split(/\s+/)[0] || "you";

// Starter questions (editable in the dashboard before the link goes out)
export const defaultQuestions = (application, event) => {
  const name = application.artistName || application.firstName || "you";
  const day = event?.date ? fmtShortDay(event.date) : "show night";
  const code = application.promoCode ? ` with code ${application.promoCode}` : "";
  if (application.role === "host") {
    return [
      `For anyone meeting you for the first time, who is ${name}, and how did you get started making people laugh?`,
      "How would you describe your hosting style? What can the room expect from you?",
      "What's the best (or wildest) moment you've had on stage so far?",
      `Why are you excited to host Acoustic & Infused™ on ${day}?`,
      "What do you love about a grown folks night out with no alcohol in the room?",
      "Where can people follow you and catch your next show?",
      `Why should folks grab their tickets${code} before they're gone?`,
    ];
  }
  if (application.role === "visual") {
    return [
      `For anyone meeting you for the first time, who is ${name}, and how did you start creating?`,
      "How would you describe your style and the materials you love to work with?",
      "What's it like painting live while the music plays and people watch?",
      `What are you hoping to create in the room on ${day}?`,
      "Where can people see your work or take a piece home?",
      `Why should folks grab their tickets${code} and come watch?`,
    ];
  }
  return [
    `For anyone meeting you for the first time, who is ${name}, and how did your music journey start?`,
    "How would you describe your sound to someone who's never heard you?",
    "Who are the artists that shaped you?",
    `What's a song you're excited to share on ${day}, and what's the story behind it?`,
    "What does performing for a grown, alcohol-free room that really listens mean to you?",
    "What are you working on next, and where can people find your music?",
    `Why should folks grab their tickets${code} before they're gone?`,
  ];
};

// "Add to Google Calendar" link for the confirmation email
const calendarLink = (application, date) => {
  const start = new Date(date);
  const end = new Date(start.getTime() + LIVE_MINUTES * 60000);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const platform = PLATFORMS[application.live.platform] || "Instagram";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Grown Folks Collective ${platform} Live`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Join the ${GFC_HANDLE} ${platform} Live a few minutes after it starts and Vaughn will invite you in.`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
};

const joinSteps = (platform) =>
  platform === "tiktok"
    ? [
        `Follow ${GFC_HANDLE} on TikTok if you haven't yet.`,
        "Open TikTok a few minutes before start time. When our Live starts, tap in and watch it.",
        `Vaughn will send you a guest invite on screen. Tap <strong>Accept</strong> and you're on.`,
      ]
    : [
        `Follow ${GFC_HANDLE} on Instagram if you haven't yet.`,
        "Open Instagram a few minutes before start time. When our Live starts, tap our profile picture to join.",
        `Vaughn will invite you to go Live together. Tap <strong>Join</strong> and you're on.`,
      ];

// Confirmation to the artist (a copy goes to the team inbox)
export const sendLiveConfirmation = async (application, event, { updated = false } = {}) => {
  if (!resend) return false;
  const live = application.live;
  const first = escapeHtml(firstWord(application.artistName || application.firstName));
  const platform = PLATFORMS[live.platform] || "Instagram";
  const h3 = (t) =>
    `<h3 style="color:#002147;border-bottom:2px solid #C5A059;padding-bottom:4px;margin:26px 0 8px;">${t}</h3>`;
  const questions = (live.questions || [])
    .map((q, i) => {
      const note = (live.notes || [])[i];
      return `<li style="margin:0 0 10px;">${escapeHtml(q)}${note ? `<br/><span style="color:#6b6b6b;font-size:14px;">Your note: ${escapeHtml(note)}</span>` : ""}</li>`;
    })
    .join("");
  const extra = live.extraQuestion
    ? `<li style="margin:0 0 10px;">${escapeHtml(live.extraQuestion)} <span style="color:#6b6b6b;font-size:14px;">(your idea)</span></li>`
    : "";

  await resend.emails.send({
    from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
    to: application.email,
    bcc: TEAM_EMAIL,
    reply_to: TEAM_EMAIL,
    subject: `${updated ? "Updated: " : ""}You're set for our ${platform} Live 🔴 ${fmtShortDay(live.date)}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
        <p>Hi ${first},</p>
        <p>${updated ? "Your Live details are updated." : "You're all set!"} We're going Live together so our community can meet you before
          ${event ? `<strong>${escapeHtml(event.name)}</strong>` : "the show"}.</p>

        ${h3("Your Live")}
        <ul>
          <li><strong>When:</strong> ${escapeHtml(fmtLiveWhen(live.date))} (about ${LIVE_MINUTES} minutes)</li>
          <li><strong>Where:</strong> ${platform}, on ${GFC_HANDLE}</li>
          ${live.handle ? `<li><strong>Your ${platform}:</strong> @${escapeHtml(live.handle)}</li>` : ""}
        </ul>
        <p style="margin:0 0 10px;"><a href="${calendarLink(application, live.date)}" style="color:#9A7630;">Add it to your calendar</a></p>

        ${h3("How to join")}
        <ol>${joinSteps(live.platform).map((s) => `<li>${s}</li>`).join("")}</ol>
        <p style="margin:0;">Quick tips: good Wi-Fi, a charged phone, and a spot with light on your face.
          Have your ticket link handy so you can drop it in the comments.</p>

        ${h3("What we'll talk about")}
        <ol>${questions}${extra}</ol>
        ${live.plug ? `<p><strong>You'd like to plug:</strong> ${escapeHtml(live.plug)}</p>` : ""}

        <p>Need to change anything? Open your Live link again any time before the Live:<br/>
          <a href="${liveLink(application)}" style="color:#9A7630;">${escapeHtml(liveLink(application))}</a></p>
        <p>Or just reply to this email.</p>

        <p>See you on ${platform}!</p>
        <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks™ Collective</p>
        <p><img src="${LOGO}" width="90" alt="Grown Folks Collective" style="display:block;width:90px;border-radius:50%;"></p>
        <p style="color:#9A7630;font-style:italic;margin-top:4px;">Where grown folks come out to play.™</p>
      </div>`,
  });
  return true;
};

// Heads-up to the team when someone says none of the dates work
export const sendNeedsDateNotice = async (application) => {
  if (!resend) return false;
  const live = application.live;
  await resend.emails.send({
    from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
    to: TEAM_EMAIL,
    reply_to: application.email,
    subject: `🔴 Live: ${application.artistName} needs a different date`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
        <p><strong>${escapeHtml(application.artistName)}</strong> said none of the Live dates work.</p>
        <p><strong>Times that work for them:</strong> ${escapeHtml(live.customRequest || "—")}</p>
        <p><strong>Platform:</strong> ${escapeHtml(PLATFORMS[live.platform] || "—")}${live.handle ? ` (@${escapeHtml(live.handle)})` : ""}</p>
        <p>Set the date in your dashboard under <strong>Lives</strong>. Saving a date there emails them the confirmation.</p>
      </div>`,
  });
  return true;
};
