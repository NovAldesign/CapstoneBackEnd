import crypto from "crypto";
import { shopStripHtml, shopStripText } from "./shopStrip.js";
import mongoose from "mongoose";
import { mailer } from "./mailer.js";
import PromoCode from "../models/promoCodeSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import { codeExists, normalizeCode } from "./promoCodes.js";

// -------------------------------------------------------
// Bring your folks: the GFC referral program
// - Anyone who has bought a ticket gets their own share code (e.g. JASMINE).
//   It goes out in their day-after email.
// - A friend using it gets $5 off their FIRST GFC ticket (events without food).
// - A friend counts once their event has happened and the order is still paid.
//   Each friend (email) counts once, ever.
// - Every 2 friends = 1 free ticket for the guest (one ticket, any event without food,
//   good for 90 days). Progress and reward emails go out automatically.
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const LOGO = `${SITE_URL}/email/gfc-logo.png`;
const TIME_ZONE = "America/New_York";
export const FRIENDS_PER_REWARD = 2;
const FRIEND_OFF = 5;
const REWARD_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;

const Referrer =
  mongoose.models.Referrer ||
  mongoose.model(
    "Referrer",
    new mongoose.Schema(
      {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        name: { type: String, default: "", trim: true },
        code: { type: String, required: true, unique: true },
        friends: { type: Number, default: 0 }, // friends counted so far
        rewards: [{ code: String, earnedAt: Date }], // free-ticket codes earned
      },
      { timestamps: true }
    )
  );

// One row per friend counted, so a friend never counts twice
const ReferralCount =
  mongoose.models.ReferralCount ||
  mongoose.model(
    "ReferralCount",
    new mongoose.Schema(
      {
        friendEmail: { type: String, required: true, unique: true, lowercase: true, trim: true },
        referrerEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
        orderId: { type: String, required: true },
        code: { type: String, default: "" },
      },
      { timestamps: true }
    )
  );

const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const firstName = (name = "") => String(name).trim().split(/\s+/)[0] || "friend";
const longDay = (date) =>
  new Date(date).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const shareLink = (code) => `${SITE_URL}/events?code=${code}`;

// JASMINE, then JASMINE2, JASMINE3... never reusing any code that ever existed
const pickCode = async (name) => {
  const base = (normalizeCode(firstName(name)).replace(/[0-9]/g, "") || "FRIEND").slice(0, 10);
  const candidates = [base, ...Array.from({ length: 30 }, (_, i) => `${base}${i + 2}`)];
  for (const c of candidates) {
    if (c.length < 3) continue;
    if (!(await codeExists(c))) return c;
  }
  return `${base.slice(0, 6)}${crypto.randomInt(1000, 9999)}`;
};

// The guest's share code (made the first time it's needed). Returns null on failure.
export const getShareCode = async (email, name = "") => {
  const clean = String(email || "").toLowerCase().trim();
  if (!clean) return null;
  try {
    const existing = await Referrer.findOne({ email: clean }).lean();
    if (existing) return existing.code;
    for (let tries = 0; tries < 3; tries++) {
      const code = await pickCode(name);
      try {
        await PromoCode.create({
          code,
          label: `Referral: ${name || clean}`,
          type: "amount",
          value: FRIEND_OFF,
          active: true,
          oncePerOrder: true,
          firstTimeOnly: true,
          noFood: true,
          noBundle: true,
          source: "referral",
          referrerEmail: clean,
          notes: `${firstName(name)}'s share code: friends get $${FRIEND_OFF} off their first ticket`,
        });
        await Referrer.create({ email: clean, name, code });
        return code;
      } catch (err) {
        if (err.code !== 11000) throw err;
        const again = await Referrer.findOne({ email: clean }).lean(); // made by another run
        if (again) return again.code;
      }
    }
  } catch (err) {
    console.error("Share code:", err.message);
  }
  return null;
};

const makeRewardCode = () => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return `FREE${[...crypto.randomBytes(6)].map((b) => chars[b % chars.length]).join("")}`;
};

const wrap = (body) => `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:620px;">
    ${body}
    <p>Vaughn<br/>Chief Playmaker<br/>Grown Folks&trade; Collective</p>
    <p><img src="${LOGO}" width="110" alt="Grown Folks Collective" style="display:block;width:110px;height:auto;border:0;"></p>
    <p style="font-style:italic;color:#9A7630;">Where grown folks come out to play.&trade;</p>
    ${shopStripHtml()}
  </div>`;
const codeBox = (code) =>
  `<p style="margin:16px 0;"><span style="display:inline-block;border:2px dashed #C5A059;padding:10px 22px;font-size:22px;font-weight:bold;letter-spacing:3px;color:#002147;">${code}</span></p>`;
const signoff = ["Vaughn", "Chief Playmaker", "Grown Folks™ Collective", "", "Where grown folks come out to play.™", "", shopStripText()];

export const buildProgressEmail = ({ name, friendName, shareCode, towardNext }) => {
  const left = FRIENDS_PER_REWARD - towardNext;
  const friend = friendName ? escapeHtml(firstName(friendName)) : "A friend";
  return {
    subject: `${friendName ? firstName(friendName) : "A friend"} came out with your code!`,
    html: wrap(`
      <p>Hi ${escapeHtml(firstName(name))},</p>
      <p>${friend} came out to a Grown Folks&trade; event with your code <strong>${shareCode}</strong>. Thank you for bringing your folks!</p>
      <p style="font-size:18px;"><strong>${towardNext} of ${FRIENDS_PER_REWARD}</strong> friends. Just <strong>${left} more</strong> and your next ticket is free.</p>
      <p>Keep sharing your code. Your friends get $${FRIEND_OFF} off their first ticket:</p>
      ${codeBox(shareCode)}
      <p style="font-size:14px;color:#555;">Or send them this link, which adds it for them: <a href="${shareLink(shareCode)}" style="color:#9A7630;">${shareLink(shareCode)}</a></p>
      <p>See you soon,</p>`),
    text: [
      `Hi ${firstName(name)},`,
      "",
      `${friendName ? firstName(friendName) : "A friend"} came out to a Grown Folks™ event with your code ${shareCode}. Thank you for bringing your folks!`,
      "",
      `${towardNext} of ${FRIENDS_PER_REWARD} friends. Just ${left} more and your next ticket is free.`,
      "",
      `Keep sharing your code. Your friends get $${FRIEND_OFF} off their first ticket: ${shareCode}`,
      `Or send them this link: ${shareLink(shareCode)}`,
      "",
      "See you soon,",
      ...signoff,
    ].join("\n"),
  };
};

export const buildRewardEmail = ({ name, rewardCode, shareCode, expiresAt }) => ({
  subject: `You earned a free ticket, ${firstName(name)}!`,
  html: wrap(`
    <p>Hi ${escapeHtml(firstName(name))},</p>
    <p>You did it! ${FRIENDS_PER_REWARD} friends came out with your code, so <strong>your next ticket is on us</strong>.</p>
    ${codeBox(rewardCode)}
    <p style="font-size:14px;color:#555;margin-top:0;">One free ticket to any event that doesn't include food. Use it by <strong>${escapeHtml(longDay(expiresAt))}</strong>. Enter it in your bag at checkout.</p>
    <p style="margin:20px 0;"><a href="${SITE_URL}/events?code=${rewardCode}" style="display:inline-block;background:#002147;color:#ffffff;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px;">Pick your free event</a></p>
    <p>Your code <strong>${shareCode}</strong> keeps working. Every ${FRIENDS_PER_REWARD} more friends earns you another free ticket.</p>
    <p>Thank you for bringing your folks,</p>`),
  text: [
    `Hi ${firstName(name)},`,
    "",
    `You did it! ${FRIENDS_PER_REWARD} friends came out with your code, so your next ticket is on us: ${rewardCode}`,
    `One free ticket to any event that doesn't include food. Use it by ${longDay(expiresAt)}.`,
    `Pick your free event: ${SITE_URL}/events?code=${rewardCode}`,
    "",
    `Your code ${shareCode} keeps working. Every ${FRIENDS_PER_REWARD} more friends earns you another free ticket.`,
    "",
    "Thank you for bringing your folks,",
    ...signoff,
  ].join("\n"),
});

const send = (to, message) =>
  mailer.emails.send({
    from: "Vaughn | Grown Folks Collective <community@grownfolkscollective.com>",
    to,
    reply_to: "community@grownfolkscollective.com",
    ...message,
  });

// Runs on a timer (server.js): count friends whose event has happened, send progress
// and reward emails. Never throws.
export const runReferrals = async (now = new Date()) => {
  if (!mailer) return 0;
  const codes = await PromoCode.find({ source: "referral" }).select("code referrerEmail").lean();
  if (!codes.length) return 0;
  const owner = new Map(codes.map((c) => [c.code, c.referrerEmail]));

  const orders = await TicketOrder.find({
    status: "paid",
    promoCode: { $in: [...owner.keys()] },
    createdAt: { $gte: new Date(now.getTime() - 120 * DAY) },
  })
    .select("buyerEmail buyerName promoCode items.eventDate")
    .lean();

  let counted = 0;
  for (const order of orders) {
    try {
      const friend = String(order.buyerEmail || "").toLowerCase();
      const referrerEmail = owner.get(order.promoCode);
      if (!friend || !referrerEmail || friend === referrerEmail) continue;
      // Counts once every event in the order has happened (order still paid)
      const dates = (order.items || []).map((i) => i.eventDate).filter(Boolean);
      if (!dates.length || dates.some((d) => new Date(d) > now)) continue;
      if (await ReferralCount.exists({ friendEmail: friend })) continue;

      await ReferralCount.create({ friendEmail: friend, referrerEmail, orderId: String(order._id), code: order.promoCode });
      const ref = await Referrer.findOneAndUpdate({ email: referrerEmail }, { $inc: { friends: 1 } }, { new: true });
      if (!ref) continue;
      counted++;

      const towardNext = ref.friends % FRIENDS_PER_REWARD;
      if (towardNext !== 0) {
        await send(ref.email, buildProgressEmail({ name: ref.name, friendName: order.buyerName, shareCode: ref.code, towardNext }));
        continue;
      }

      // Every FRIENDS_PER_REWARD friends: a free ticket
      const expiresAt = new Date(now.getTime() + REWARD_DAYS * DAY);
      let rewardCode = "";
      for (let tries = 0; tries < 5 && !rewardCode; tries++) {
        const candidate = makeRewardCode();
        try {
          await PromoCode.create({
            code: candidate,
            label: `Referral reward: 1 free ticket (${ref.name || ref.email})`,
            type: "percent",
            value: 100,
            active: true,
            expiresAt,
            oncePerOrder: true,
            maxUses: 1,
            collectEmail: true,
            noFood: true,
            noBundle: true,
            source: "reward",
            referrerEmail: ref.email,
            notes: `Earned for ${ref.friends} referred friends`,
          });
          rewardCode = candidate;
        } catch (err) {
          if (err.code !== 11000) throw err;
        }
      }
      if (!rewardCode) continue;
      await Referrer.updateOne({ _id: ref._id }, { $push: { rewards: { code: rewardCode, earnedAt: now } } });
      await send(ref.email, buildRewardEmail({ name: ref.name, rewardCode, shareCode: ref.code, expiresAt }));
    } catch (err) {
      if (err.code !== 11000) console.error("Referral count:", err.message);
    }
  }
  return counted;
};
