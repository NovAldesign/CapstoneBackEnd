import crypto from "crypto";
import { Resend } from "resend";
import Partnership from "../models/partnershipSchema.js";
import DiscountPartner from "../models/discountPartnerSchema.js";
import Event from "../models/eventSchema.js";

// -------------------------------------------------------
// Partner portal: sponsors (Partnership) and Member Perks
// partners (DiscountPartner). Checklists, status steps,
// sign-in links, and partner emails.
// -------------------------------------------------------

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const SITE_URL = (process.env.FRONTEND_URL || "https://www.grownfolkscollective.com").replace(/\/$/, "");
export const PARTNER_EMAIL = "partners@grownfolkscollective.com";
export const PARTNER_PHONE = "470-256-7729";

export const INVITE_DAYS = 7; // link in the approval email
export const LINK_MINUTES = 30; // link from "email me a new link"
export const SESSION_DAYS = 30;

// Bump when the agreement wording changes (also in src/content/legalContent.js)
export const SPONSOR_TERMS_VERSION = "2026-10-09";
export const PERK_TERMS_VERSION = "2026-10-09";

// Sponsor tiers (per event). MUST match src/Pages/Partnership.jsx
export const TIER_PRICE_CENTS = { bronze: 15000, silver: 50000, gold: 120000 };
export const tierOf = (p) => {
  const t = String(p?.tierRequested || "").toLowerCase();
  return t.includes("gold") ? "gold" : t.includes("silver") ? "silver" : t.includes("bronze") ? "bronze" : "custom";
};

export const KINDS = { sponsor: Partnership, perk: DiscountPartner };
export const nameOf = (kind, doc) => (kind === "perk" ? doc.businessName : doc.companyName);
export const contactOf = (kind, doc) => (kind === "perk" ? doc.contactName : doc.contactPerson);

// Sponsors approved = accepted/active; perks approved = approved/paused/ended
export const portalOpen = (kind, doc) =>
  kind === "perk" ? ["approved", "paused", "ended"].includes(doc.status) : ["accepted", "active", "expired"].includes(doc.status);

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
export const newToken = () => crypto.randomBytes(32).toString("hex");

export const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const money = (cents = 0) => {
  const d = Number(cents) / 100;
  return `$${Number.isInteger(d) ? d.toLocaleString("en-US") : d.toFixed(2)}`;
};

/* -------------------------------------------------------
   Checklist: what the partner still needs to send
------------------------------------------------------- */
export const checklistFor = (kind, doc) => {
  const p = doc.portal || {};
  if (kind === "perk") {
    return [
      { key: "logo", label: "Logo", done: Boolean(doc.logo || p.logoUrl) },
      { key: "photo", label: "Storefront or product photo", done: Boolean(p.photoUrl) },
      { key: "confirm", label: "Confirm your discount, how members redeem it, and the fine print", done: Boolean(p.perkConfirmedAt) },
      { key: "agreement", label: "Sign the Member Perk terms", done: Boolean(p.agreement?.signedAt) },
    ];
  }
  const tier = tierOf(doc);
  const onSite = tier !== "bronze"; // Silver, Gold and custom partners show up in person
  const items = [
    { key: "logo", label: "Logo (PNG or SVG)", done: Boolean(p.logoUrl) },
    { key: "blurb", label: "A short description of your brand (about 50 words)", done: Boolean(p.blurb) },
    { key: "socials", label: "Website and social links", done: Boolean(p.website || p.instagram || p.facebook || p.tiktok) },
  ];
  if (onSite) {
    items.push(
      { key: "onsite", label: "On-site contact for event day", done: Boolean(p.onsiteName && p.onsitePhone) },
      { key: "setup", label: "Table and signage needs", done: Boolean(p.tableNeeds || p.signageNeeds) },
      { key: "sampling", label: tier === "gold" ? "Activation and sampling plan" : "Sampling plan", done: Boolean(p.samplingPlan) }
    );
  }
  items.push({ key: "agreement", label: "Sign the Sponsor Agreement", done: Boolean(p.agreement?.signedAt) });
  if (p.amountCents > 0) items.push({ key: "payment", label: `Pay your sponsorship (${money(p.amountCents)})`, done: Boolean(p.paidAt) });
  return items;
};

export const progressOf = (items) => {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, missing: items.filter((i) => !i.done).map((i) => i.label) };
};

/* -------------------------------------------------------
   Status steps shown at the top of the portal
------------------------------------------------------- */
const isLivePerk = (doc, now = new Date()) =>
  doc.status === "approved" &&
  (!doc.startDate || new Date(doc.startDate) <= now) &&
  (!doc.endDate || new Date(doc.endDate) >= now);

export const stepsFor = (kind, doc, event, now = new Date()) => {
  const p = doc.portal || {};
  if (kind === "perk") {
    const live = isLivePerk(doc, now);
    const last = doc.status === "ended" || (doc.endDate && new Date(doc.endDate) < now) ? "Ended" : doc.status === "paused" ? "Paused" : null;
    const steps = [
      { key: "approved", label: "Approved", done: true },
      { key: "live", label: "Live for members", done: live || Boolean(last) },
    ];
    if (last) steps.push({ key: "off", label: last, done: true });
    return steps;
  }
  const items = checklistFor(kind, doc).filter((i) => i.key !== "payment");
  const eventDate = event?.date ? new Date(event.date) : null;
  return [
    { key: "approved", label: "Approved", done: true },
    { key: "details", label: "Details in", done: items.every((i) => i.done) },
    { key: "paid", label: "Paid", done: !(p.amountCents > 0) || Boolean(p.paidAt) },
    { key: "event", label: "Event day", done: Boolean(eventDate && eventDate <= now) },
    { key: "recap", label: "Recap", done: Boolean(p.recapUrl || p.recapNote) },
  ];
};

export const loadEvent = async (eventId) => {
  if (!eventId || !/^[a-f0-9]{24}$/i.test(eventId)) return null;
  return Event.findById(eventId).select("name date endDate location").lean();
};

/* -------------------------------------------------------
   Sign-in links
------------------------------------------------------- */
// Saves a one-time link on the record and returns the raw token
export const issueLink = async (kind, doc, minutes) => {
  const token = newToken();
  await KINDS[kind].updateOne(
    { _id: doc._id },
    { $set: { "portal.loginTokenHash": hashToken(token), "portal.loginTokenExpires": new Date(Date.now() + minutes * 60 * 1000) } }
  );
  return token;
};

export const portalLink = (token) => `${SITE_URL}/partner/login/${token}`;

/* -------------------------------------------------------
   Emails (signed by Vaughn, logo + tagline at the bottom)
------------------------------------------------------- */
const shell = (inner) => `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#F8F9FA;padding:20px">
    <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-collapse:collapse">
      <tr><td bgcolor="#002147" style="padding:26px 20px;text-align:center">
        <h1 style="font-family:Georgia,serif;color:#C5A059;font-size:1.6rem;margin:0;font-weight:normal;letter-spacing:2px">Grown Folks&trade; Collective</h1>
        <p style="margin:6px 0 0;color:#ffffff;font-size:12px;letter-spacing:3px;text-transform:uppercase">Partner Portal</p>
      </td></tr>
      <tr><td height="4" bgcolor="#C5A059"></td></tr>
      <tr><td style="padding:34px 34px 26px;color:#333;font-size:15px;line-height:1.7">${inner}
        <p style="margin:24px 0 0">La'Von "Vaughn" Williams<br>Founder &amp; Chief Playmaker, Grown Folks&trade; Collective<br>
        ${PARTNER_PHONE} &middot; <a href="mailto:${PARTNER_EMAIL}" style="color:#9A7630">${PARTNER_EMAIL}</a></p>
      </td></tr>
      <tr><td style="padding:0 34px 30px;text-align:center">
        <img src="${SITE_URL}/email/gfc-logo.png" width="80" height="80" alt="Grown Folks&trade; Collective" style="display:inline-block;width:80px;height:80px;border:0">
        <p style="margin:8px 0 0;font-family:Georgia,serif;font-style:italic;color:#9A7630;font-size:15px">Where grown folks come out to play.&trade;</p>
      </td></tr>
    </table>
  </div>`;

const button = (href, label) => `
  <table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td bgcolor="#C5A059">
    <a href="${href}" style="display:inline-block;padding:14px 30px;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#002147;text-decoration:none">${label}</a>
  </td></tr></table>`;

const list = (items) =>
  `<ul style="margin:8px 0 0;padding-left:20px">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;

const send = async ({ to, subject, html }) => {
  if (!resend) {
    console.error(`Partner email not sent (RESEND_API_KEY missing): ${subject}`);
    return false;
  }
  await resend.emails.send({
    from: "Grown Folks™ Collective <partners@grownfolkscollective.com>",
    to,
    reply_to: PARTNER_EMAIL,
    subject,
    html,
  });
  return true;
};

const firstName = (kind, doc) => String(contactOf(kind, doc) || "").trim().split(/\s+/)[0] || "there";

// Sent when Vaughn approves a sponsor or a perk
export const sendInviteEmail = async (kind, doc, token) => {
  const name = escapeHtml(nameOf(kind, doc));
  const missing = progressOf(checklistFor(kind, doc)).missing;
  const intro =
    kind === "perk"
      ? `<p style="margin:0 0 14px">Your Member Perk for <strong>${name}</strong> is approved. Thank you for taking care of our members!</p>
         <p style="margin:0">Your partner portal is where you add your logo and a photo, confirm the details members see, and pause or update your perk anytime.</p>`
      : `<p style="margin:0 0 14px">We're excited to have <strong>${name}</strong> as a Grown Folks&trade; Collective partner.</p>
         <p style="margin:0">Your partner portal has everything in one place: your brand assets, event-day details, the Sponsor Agreement${doc.portal?.amountCents > 0 ? ", and payment" : ""}.</p>`;
  return send({
    to: doc.email,
    subject: kind === "perk" ? `Your Member Perk is approved, ${firstName(kind, doc)}` : `Welcome aboard, ${firstName(kind, doc)}: your GFC partner portal`,
    html: shell(`
      <p style="margin:0 0 14px;font-weight:bold;color:#002147">Hi ${escapeHtml(firstName(kind, doc))},</p>
      ${intro}
      ${missing.length ? `<p style="margin:16px 0 0">Here's what we need from you:</p>${list(missing)}` : ""}
      ${button(portalLink(token), "Open my partner portal")}
      <p style="margin:0;color:#777;font-size:13px">This link works once and expires in ${INVITE_DAYS} days. After that, request a new one anytime at ${SITE_URL.replace(/^https?:\/\//, "")}/partner.</p>`),
  });
};

// "Email me a sign-in link" from /partner
export const sendLoginEmail = async (email, links) => {
  const rows = links
    .map((l) => `<p style="margin:0 0 6px"><strong>${escapeHtml(l.name)}</strong> (${l.kind === "perk" ? "Member Perk" : "Sponsor"})</p>${button(l.url, "Open portal")}`)
    .join("");
  return send({
    to: email,
    subject: "Your GFC partner portal link",
    html: shell(`
      <p style="margin:0 0 14px">Here's your sign-in link. No password needed.</p>
      ${rows}
      <p style="margin:0;color:#777;font-size:13px">Each link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>`),
  });
};

// Friendly nudge for missing items
export const sendReminderEmail = async (kind, doc, token, missing, event) => {
  const when = event?.date
    ? ` before ${new Date(event.date).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" })}`
    : "";
  return send({
    to: doc.email,
    subject: `A few things for your GFC partnership, ${firstName(kind, doc)}`,
    html: shell(`
      <p style="margin:0 0 14px;font-weight:bold;color:#002147">Hi ${escapeHtml(firstName(kind, doc))},</p>
      <p style="margin:0">We're almost ready for <strong>${escapeHtml(nameOf(kind, doc))}</strong>. Here's what's still open${when}:</p>
      ${list(missing)}
      ${button(portalLink(token), "Finish in my portal")}
      <p style="margin:0;color:#777;font-size:13px">Questions? Just reply to this email.</p>`),
  });
};

// Heads-up to the team
export const notifyTeam = async (subject, lines = []) =>
  send({
    to: PARTNER_EMAIL,
    subject,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#002147">${lines.map((l) => `<p style="margin:0 0 6px">${l}</p>`).join("")}
      <p style="margin:12px 0 0"><a href="${SITE_URL}/admin">Open the dashboard</a></p></div>`,
  });

/* -------------------------------------------------------
   Reminders: every 4 days, up to 3 times, while items are
   missing. Sponsors stop after their event; perks stop
   once ended.
------------------------------------------------------- */
const REMIND_EVERY_MS = 4 * 24 * 3600 * 1000;
const MAX_REMINDERS = 3;

export const runPartnerReminders = async (now = new Date()) => {
  let sent = 0;
  const due = { $or: [{ "portal.lastReminderAt": null }, { "portal.lastReminderAt": { $lte: new Date(now - REMIND_EVERY_MS) } }] };
  const base = { isTest: { $ne: true }, "portal.invitedAt": { $ne: null, $lte: new Date(now - 2 * 24 * 3600 * 1000) }, "portal.remindersSent": { $lt: MAX_REMINDERS }, ...due };

  const groups = [
    ["sponsor", await Partnership.find({ ...base, status: { $in: ["accepted", "active"] } })],
    ["perk", await DiscountPartner.find({ ...base, status: { $in: ["approved", "paused"] } })],
  ];
  for (const [kind, docs] of groups) {
    for (const doc of docs) {
      const event = kind === "sponsor" ? await loadEvent(doc.portal?.eventId) : null;
      if (event && new Date(event.date) < now) continue; // event already happened
      const { missing } = progressOf(checklistFor(kind, doc));
      if (!missing.length) continue;
      try {
        const token = await issueLink(kind, doc, INVITE_DAYS * 24 * 60);
        await sendReminderEmail(kind, doc, token, missing, event);
        await KINDS[kind].updateOne({ _id: doc._id }, { $set: { "portal.lastReminderAt": now }, $inc: { "portal.remindersSent": 1 } });
        sent++;
      } catch (err) {
        console.error(`Partner reminder failed for ${doc.email}:`, err.message);
      }
    }
  }
  if (sent) console.log(`Partner reminders sent: ${sent}`);
  return sent;
};
