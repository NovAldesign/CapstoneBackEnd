import crypto from "crypto";
import mongoose from "mongoose";

// -------------------------------------------------------
// Marketing email opt-outs (US CAN-SPAM)
// Every promotional email the site sends (welcome, day-after, we miss you, membership
// offer, referral progress) carries:
//   - an Unsubscribe link (and the one-click header Gmail and Apple Mail show)
//   - the business mailing address
// Before sending one, check isOptedOut(email). Ticket receipts, gift cards, earned
// rewards and day-before reminders are service emails and still go out.
//
// Set MAILING_ADDRESS on Railway to the business mailing address (a PO box works),
// e.g. "Grown Folks Collective, PO Box 1234, Atlanta, GA 30303".
// -------------------------------------------------------
const API_URL = (process.env.BACKEND_URL || "https://capstonebackend-production-87ed.up.railway.app").replace(/\/$/, "");
const SECRET = () => process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || "gfc-unsubscribe";
export const MAILING_ADDRESS = process.env.MAILING_ADDRESS || "Grown Folks Collective, 8735 Dunwoody Place, Suite R, Atlanta, GA 30350";

const EmailOptOut =
  mongoose.models.EmailOptOut ||
  mongoose.model(
    "EmailOptOut",
    new mongoose.Schema(
      {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        source: { type: String, default: "" }, // which email they unsubscribed from
      },
      { timestamps: true }
    )
  );
export { EmailOptOut };

const clean = (email = "") => String(email).trim().toLowerCase();
const b64 = (s) => Buffer.from(s).toString("base64url");
export const unb64 = (s) => {
  try {
    return Buffer.from(String(s), "base64url").toString("utf8");
  } catch {
    return "";
  }
};
export const unsubToken = (email) =>
  crypto.createHmac("sha256", SECRET()).update(clean(email)).digest("base64url").slice(0, 32);
export const validToken = (email, token) => {
  const want = unsubToken(email);
  const got = String(token || "");
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
};

export const unsubscribeUrl = (email, source = "") =>
  `${API_URL}/api/unsubscribe?e=${b64(clean(email))}&t=${unsubToken(email)}${source ? `&s=${encodeURIComponent(source)}` : ""}`;

export const isOptedOut = async (email) => Boolean(email && (await EmailOptOut.exists({ email: clean(email) })));

export const optOut = async (email, source = "") =>
  EmailOptOut.updateOne({ email: clean(email) }, { $setOnInsert: { email: clean(email), source } }, { upsert: true });

export const optIn = async (email) => EmailOptOut.deleteOne({ email: clean(email) });

// Headers for one-click unsubscribe (Gmail, Yahoo, Apple Mail)
export const unsubHeaders = (email, source = "") => ({
  "List-Unsubscribe": `<${unsubscribeUrl(email, source)}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

// The footer every marketing email ends with
export const marketingFooterHtml = (email, source = "") => `
    <p style="font-size:11.5px;line-height:1.6;color:#888;margin:22px 0 0;border-top:1px solid #EEE;padding-top:12px;">
      You're getting this because you came out with or signed up for Grown Folks&trade; Collective.
      <a href="${unsubscribeUrl(email, source)}" style="color:#888;">Unsubscribe</a> from these emails anytime. You'll still get your tickets and event reminders.<br/>
      ${MAILING_ADDRESS.replace(/&/g, "&amp;").replace(/</g, "&lt;")}
    </p>`;
export const marketingFooterText = (email, source = "") =>
  [
    "",
    "You're getting this because you came out with or signed up for Grown Folks™ Collective.",
    `Unsubscribe: ${unsubscribeUrl(email, source)}`,
    MAILING_ADDRESS,
  ].join("\n");

// Adds the footer + one-click headers to a { subject, html, text } message
export const asMarketing = (message, email, source = "") => ({
  ...message,
  html: `${message.html}${marketingFooterHtml(email, source)}`,
  text: `${message.text || ""}\n${marketingFooterText(email, source)}`,
  headers: { ...(message.headers || {}), ...unsubHeaders(email, source) },
});
