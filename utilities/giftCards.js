import crypto from "crypto";
import { Resend } from "resend";
import GiftCard from "../models/giftCardSchema.js";
import { PASS_RULES, BONUS_EXPIRES, passCoversEvent } from "./shopCatalog.js";

// -------------------------------------------------------
// Gift cards, Holiday Passes and bonus cards:
// codes, what they cover at checkout, redeeming, and emails.
// -------------------------------------------------------

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const TEAM_EMAIL = "events@grownfolkscollective.com";
const SITE_URL = "https://www.grownfolkscollective.com";
const TIME_ZONE = "America/New_York";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const money = (cents = 0) => {
  const d = Number(cents) / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
};

const longDate = (date) =>
  new Date(date).toLocaleDateString("en-US", { timeZone: TIME_ZONE, month: "long", day: "numeric", year: "numeric" });

// GIFT-7K2M-QX9D (no 0/O/1/I so codes are easy to read aloud)
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const chunk = () => Array.from(crypto.randomBytes(4), (b) => CHARS[b % CHARS.length]).join("");
export const makeCode = (kind) => `${kind === "pass" ? "PASS" : kind === "bonus" ? "BONUS" : "GIFT"}-${chunk()}-${chunk()}`;

export const normalizeCardCode = (code = "") => String(code).trim().toUpperCase().replace(/\s+/g, "");
export const looksLikeCard = (code = "") => /^(GIFT|PASS|BONUS)-/.test(normalizeCardCode(code));

// An active card with something left on it
export const findUsableCard = async (code) => {
  const clean = normalizeCardCode(code);
  if (!looksLikeCard(clean)) return null;
  const card = await GiftCard.findOne({ code: clean });
  if (!card || card.status !== "active") return null;
  if (card.expiresAt && card.expiresAt < new Date()) return null;
  if (card.kind === "pass" ? card.usesLeft <= 0 : card.balanceCents <= 0) return null;
  return card;
};

export const cardCoversEvent = (card, event) =>
  card.kind === "pass" ? passCoversEvent(event, card.expiresAt || PASS_RULES.expires) : true;

/* -------------------------------------------------------
   How much a card takes off an order.
   units: one entry per ticket { cents, event } (price after codes and bundle).
   Passes pay for the most expensive eligible tickets first, up to maxCoverCents each.
   Gift and bonus cards pay down the total up to their balance.
------------------------------------------------------- */
export const cardCredit = (card, units = []) => {
  if (!card) return { creditCents: 0, uses: 0 };
  if (card.kind === "pass") {
    const cap = card.maxCoverCents || PASS_RULES.maxCoverCents;
    const covered = units
      .filter((u) => cardCoversEvent(card, u.event))
      .map((u) => Math.min(u.cents, cap))
      .sort((a, b) => b - a)
      .slice(0, card.usesLeft);
    return { creditCents: covered.reduce((s, c) => s + c, 0), uses: covered.length };
  }
  const total = units.reduce((s, u) => s + u.cents, 0);
  return { creditCents: Math.min(card.balanceCents, total), uses: 0 };
};

export const describeCard = (card) =>
  card.kind === "pass"
    ? `${card.label || "Holiday Pass"} · ${card.usesLeft} ${card.usesLeft === 1 ? "ticket" : "tickets"} left`
    : `${card.kind === "bonus" ? "Bonus card" : "Gift card"} · ${money(card.balanceCents)} left`;

// Take the amount off the card once the order is paid (safe to call once per order)
export const redeemCard = async (code, { cents = 0, uses = 0, confirmationCode = "", stripeSessionId = "" } = {}) => {
  const clean = normalizeCardCode(code);
  const card = await GiftCard.findOne({ code: clean });
  if (!card) return null;
  if (card.redemptions.some((r) => r.stripeSessionId && r.stripeSessionId === stripeSessionId)) return card; // already done
  const field = card.kind === "pass" ? "usesLeft" : "balanceCents";
  const amount = card.kind === "pass" ? uses : cents;
  const entry = { confirmationCode, stripeSessionId, cents, uses, at: new Date() };
  const updated = await GiftCard.findOneAndUpdate(
    { _id: card._id, [field]: { $gte: amount } },
    { $inc: { [field]: -amount }, $push: { redemptions: entry } },
    { new: true }
  );
  if (updated) return updated;
  // Two orders raced for the same balance: honor the order, empty the card, and flag it
  console.warn(`Card ${clean} was short at redemption; setting it to zero.`);
  return GiftCard.findByIdAndUpdate(card._id, { $set: { [field]: 0 }, $push: { redemptions: entry } }, { new: true });
};

/* -------------------------------------------------------
   Create cards after a shop payment (from the Stripe webhook)
------------------------------------------------------- */
export const createCardsFromSession = async (session) => {
  const m = session.metadata || {};
  const details = session.customer_details || {};
  const buyerEmail = (details.email || session.customer_email || "").toLowerCase();
  const isGift = m.isGift === "yes";
  const base = {
    purchaserName: details.name || "",
    purchaserEmail: buyerEmail,
    isGift,
    recipientName: isGift ? m.recipientName || "" : details.name || "",
    recipientEmail: isGift ? (m.recipientEmail || "").toLowerCase() : buyerEmail,
    fromName: m.fromName || details.name || "",
    message: m.message || "",
    sendAt: isGift && m.sendAt ? new Date(m.sendAt) : new Date(),
    stripeSessionId: session.id,
    paidCents: session.amount_total || 0,
    saleKey: m.saleKey || "",
    source: m.source || "",
  };

  const created = [];
  try {
    if (m.shopKind === "pass") {
      created.push(
        await GiftCard.create({
          ...base,
          code: makeCode("pass"),
          kind: "pass",
          productId: m.productId,
          label: m.productName || "Holiday Pass",
          initialUses: Number(m.uses) || 0,
          usesLeft: Number(m.uses) || 0,
          maxCoverCents: PASS_RULES.maxCoverCents,
          expiresAt: new Date(PASS_RULES.expires),
        })
      );
    } else if (m.shopKind === "gift") {
      const amount = Number(m.amountCents) || 0;
      created.push(
        await GiftCard.create({
          ...base,
          code: makeCode("gift"),
          kind: "gift",
          productId: "gift",
          label: `${money(amount)} Gift Card`,
          initialCents: amount,
          balanceCents: amount,
        })
      );
      const bonus = Number(m.bonusCents) || 0;
      if (bonus > 0) {
        // The Cyber Monday bonus always goes to the buyer
        created.push(
          await GiftCard.create({
            ...base,
            paidCents: 0,
            isGift: false,
            recipientName: details.name || "",
            recipientEmail: buyerEmail,
            message: "",
            sendAt: new Date(),
            code: makeCode("bonus"),
            kind: "bonus",
            productId: "bonus",
            label: `${money(bonus)} Cyber Monday Bonus`,
            initialCents: bonus,
            balanceCents: bonus,
            expiresAt: new Date(BONUS_EXPIRES),
          })
        );
      }
    }
  } catch (err) {
    if (err?.code === 11000) return null; // Stripe retried; cards already exist
    throw err;
  }
  return created;
};

/* -------------------------------------------------------
   Emails
------------------------------------------------------- */
const shell = (kicker, title, body) => `
  <div style="background:#F5EFE3;padding:30px 12px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#FAF7F0;">
      <div style="background:#0E2340;padding:28px 24px;text-align:center;border-bottom:3px solid #C5A059;">
        <p style="margin:0 0 6px;color:#C5A059;font-size:12px;letter-spacing:3px;text-transform:uppercase;">${kicker}</p>
        <h1 style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:26px;">${title}</h1>
      </div>
      <div style="padding:26px 24px;">${body}
        <p style="font-size:14px;color:#9A7630;font-style:italic;font-family:Georgia,serif;margin:22px 0 0;">Where grown folks come out to play.™</p>
      </div>
    </div>
  </div>`;

const codeBlock = (card) => `
  <div style="background:#0E2340;color:#FFFFFF;text-align:center;padding:18px;margin:0 0 20px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#C5A059;">${escapeHtml(card.label)}</p>
    <p style="margin:0 0 6px;font-size:26px;font-weight:bold;letter-spacing:3px;">${escapeHtml(card.code)}</p>
    <p style="margin:0;font-size:14px;color:#DCE3EE;">${
      card.kind === "pass"
        ? `Good for ${card.initialUses} tickets to Game Night, Karaoke Bingo or Acoustic &amp; Infused${card.expiresAt ? ` through ${escapeHtml(longDate(card.expiresAt))}` : ""}`
        : `${money(card.initialCents)} toward any GFC event${card.expiresAt ? ` · use by ${escapeHtml(longDate(card.expiresAt))}` : " · never expires"}`
    }</p>
  </div>`;

const howTo = `
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 6px;"><strong>How to use it</strong></p>
  <ol style="font-size:15px;line-height:1.6;color:#444;margin:0 0 18px;padding-left:20px;">
    <li>Pick an event at <a href="${SITE_URL}/events" style="color:#9A7630;font-weight:bold;">grownfolkscollective.com/events</a>.</li>
    <li>Add your tickets to the bag.</li>
    <li>Tap <strong>Have a code?</strong> and enter the code above. Anything left stays on the code for next time.</li>
  </ol>`;

const send = (payload) =>
  resend ? resend.emails.send(payload).catch((err) => console.error("Gift email failed:", err.message)) : null;

// The card itself, to the person who will use it
export const sendCardToRecipient = async (card) => {
  if (!resend || !card.recipientEmail) return false;
  const first = (card.recipientName || "").split(" ")[0] || "friend";
  const from = card.isGift ? card.fromName || card.purchaserName || "Someone who loves you" : "";
  const note = card.isGift && card.message
    ? `<div style="border-left:4px solid #C5A059;background:#FFFFFF;padding:14px 18px;margin:0 0 20px;font-family:Georgia,serif;font-size:17px;color:#0E2340;font-style:italic;">“${escapeHtml(card.message)}”<br/><span style="font-family:Arial,sans-serif;font-style:normal;font-size:14px;color:#666;">— ${escapeHtml(from)}</span></div>`
    : "";
  const intro = card.isGift
    ? `<strong>${escapeHtml(from)}</strong> sent you a night out with Grown Folks™ Collective, Atlanta's alcohol-free social club for the 30+ crowd. Game nights, Karaoke Bingo and live music, with good people and no pressure.`
    : card.kind === "bonus"
      ? "Thanks for gifting a night out on Cyber Monday. Here's a little something for you."
      : "Thanks for your order. Here's your code. Keep this email.";
  const html = shell(
    card.isGift ? "A gift for you" : card.kind === "pass" ? "Your Holiday Pass" : "Your gift card",
    card.isGift ? "You've been gifted a night out" : escapeHtml(card.label),
    `<p style="font-size:16px;color:#0E2340;margin:0 0 14px;">Hi ${escapeHtml(first)},</p>
     <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 20px;">${intro}</p>
     ${note}${codeBlock(card)}${howTo}
     <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 18px;">Questions? Just reply to this email.</p>
     <p style="font-size:15px;color:#0E2340;margin:0;">See you soon,<br/><strong>Vaughn</strong><br/><span style="color:#666;font-size:14px;">Grown Folks™ Collective</span></p>`
  );
  await send({
    from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
    to: card.recipientEmail,
    reply_to: TEAM_EMAIL,
    subject: card.isGift
      ? `🎁 ${from} sent you a night out with Grown Folks™ Collective`
      : `🎟️ Your ${card.label} (${card.code})`,
    html,
  });
  await GiftCard.updateOne({ _id: card._id }, { $set: { sentAt: new Date() } });
  return true;
};

// Receipt to the buyer when the card is a gift for someone else
const sendGiftReceipt = async (card) => {
  if (!resend || !card.purchaserEmail) return;
  const when = card.sendAt && card.sendAt > new Date() ? `on ${escapeHtml(longDate(card.sendAt))}` : "just now";
  const html = shell(
    "Gift sent",
    "Thanks for gifting a night out",
    `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">
       We ${card.sendAt && card.sendAt > new Date() ? "will email" : "emailed"} <strong>${escapeHtml(card.recipientName || card.recipientEmail)}</strong>
       (${escapeHtml(card.recipientEmail)}) their ${escapeHtml(card.label)} ${when}.</p>
     <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;">Keep this code in case they need it again:</p>
     ${codeBlock(card)}
     <p style="font-size:14px;color:#444;margin:0 0 16px;">Total paid: <strong>${money(card.paidCents)}</strong></p>
     <p style="font-size:15px;color:#0E2340;margin:0;">Thank you,<br/><strong>Vaughn</strong></p>`
  );
  await send({
    from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
    to: card.purchaserEmail,
    reply_to: TEAM_EMAIL,
    subject: `🎁 Your gift for ${card.recipientName || card.recipientEmail} is set`,
    html,
  });
};

// Team alert
const sendTeamAlert = async (cards) => {
  if (!resend || !cards.length) return;
  const rows = cards
    .map(
      (c) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(c.label)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(c.code)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(c.purchaserName || c.purchaserEmail)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${c.isGift ? `Gift to ${escapeHtml(c.recipientName || c.recipientEmail)}` : "For themselves"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${money(c.paidCents)}</td>
      </tr>`
    )
    .join("");
  await send({
    from: "GFC Shop <noreply@grownfolkscollective.com>",
    to: TEAM_EMAIL,
    subject: `🎁 Shop sale: ${cards[0].label} (${money(cards[0].paidCents)})`,
    html: `<div style="font-family:Arial,sans-serif;color:#0E2340;padding:20px;">
      <h2 style="border-bottom:2px solid #C5A059;padding-bottom:8px;">🎁 New gift card / pass sale</h2>
      <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
      <p style="color:#666;font-size:13px;">See every card in the dashboard under Gifts &amp; merch.</p></div>`,
  });
};

// Everything that happens right after a pass or gift card is paid for
export const deliverNewCards = async (cards = []) => {
  if (!cards || !cards.length) return;
  for (const card of cards) {
    const due = !card.sendAt || card.sendAt <= new Date();
    if (card.isGift) {
      if (due) await sendCardToRecipient(card);
      await sendGiftReceipt(card);
    } else {
      await sendCardToRecipient(card);
    }
  }
  await sendTeamAlert(cards.filter((c) => c.kind !== "bonus"));
};

// Gifts scheduled for a later date (runs every few minutes from server.js)
export const deliverScheduledGifts = async () => {
  const due = await GiftCard.find({
    isGift: true,
    sentAt: null,
    status: "active",
    sendAt: { $lte: new Date() },
  }).limit(25);
  for (const card of due) {
    try {
      await sendCardToRecipient(card);
    } catch (err) {
      console.error(`Scheduled gift ${card.code} failed:`, err.message);
    }
  }
  return due.length;
};
