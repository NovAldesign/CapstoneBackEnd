import Membership from "../models/membershipSchema.js";
import MemberCredit from "../models/memberCreditSchema.js";

// -------------------------------------------------------
// Member event credit rules (decided Oct 1)
// - Each paid month: Social $40, Founding $70
// - Unused credit rolls over one month, then expires
// - Oldest credit is used first
// - Birthday month: +$25 (active members)
// - Paused members earn nothing new but can use what they have
// -------------------------------------------------------
export const MONTHLY_CREDIT_CENTS = { Social: 4000, Founding: 7000 };
export const BIRTHDAY_BONUS_CENTS = 2500;
export const TIME_ZONE = "America/New_York";

const addMonths = (date, n) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  // Jan 31 + 1 month = Feb 28/29, not Mar 3
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};

// Year and month (0-11) right now in Atlanta
const atlantaYearMonth = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "numeric" }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === "year").value),
    month: Number(parts.find((p) => p.type === "month").value) - 1,
  };
};

// Start of the next month in Atlanta (05:00 UTC covers both EST and EDT)
const startOfNextMonth = (year, month) => new Date(Date.UTC(year, month + 1, 1, 5));

const lotQuery = (memberId, now = new Date()) => ({
  member: memberId,
  type: { $in: ["earned", "bonus"] },
  remainingCents: { $gt: 0 },
  expiresAt: { $gt: now },
});

// Add a lot of credit once (the key makes repeats harmless)
export const grantCredit = async ({ memberId, type = "bonus", cents, expiresAt, note = "", key }) => {
  if (!memberId || !(cents > 0) || !key) return null;
  try {
    return await MemberCredit.create({ member: memberId, type, cents, remainingCents: cents, expiresAt, note, key });
  } catch (err) {
    if (err.code === 11000) return MemberCredit.findOne({ key }); // already granted
    throw err;
  }
};

// Find the member a Stripe invoice belongs to
const memberForInvoice = async (invoice) => {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (subId) {
    const m = await Membership.findOne({ stripeSubscriptionId: subId });
    if (m) return m;
  }
  if (customerId) {
    const m = await Membership.findOne({ stripeCustomerId: customerId });
    if (m) return m;
  }
  // The very first invoice can arrive before checkout.session.completed saves the IDs
  const email = String(invoice.customer_email || "").toLowerCase();
  return email ? Membership.findOne({ email }) : null;
};

/* -------------------------------------------------------
   Stripe invoice.paid → this month's credit
   Credit is good for the month it was paid for plus one
   rollover month: it expires one month after the next
   billing date.
------------------------------------------------------- */
export const grantMonthlyCreditFromInvoice = async (invoice) => {
  if (!invoice?.id || invoice.status !== "paid") return null;
  if (!["subscription_create", "subscription_cycle"].includes(invoice.billing_reason)) return null;

  const member = await memberForInvoice(invoice);
  if (!member) {
    console.warn(`Member credit: no member found for invoice ${invoice.id}`);
    return null;
  }
  const cents = MONTHLY_CREDIT_CENTS[member.tier] || MONTHLY_CREDIT_CENTS.Social;

  const periodEndSec = invoice.lines?.data?.[0]?.period?.end;
  const paidAt = new Date((invoice.status_transitions?.paid_at || invoice.created || Date.now() / 1000) * 1000);
  const nextBilling = periodEndSec ? new Date(periodEndSec * 1000) : addMonths(paidAt, 1);
  const expiresAt = addMonths(nextBilling, 1);

  const monthLabel = paidAt.toLocaleDateString("en-US", { timeZone: TIME_ZONE, month: "long", year: "numeric" });
  return grantCredit({
    memberId: member._id,
    type: "earned",
    cents,
    expiresAt,
    note: `${member.tier === "Founding" ? "Founding" : "Social Pass"} credit for ${monthLabel}`,
    key: `invoice:${invoice.id}`,
  });
};

/* -------------------------------------------------------
   Birthday bonus: once a year, in their birthday month,
   for active members. Good through the end of that month.
------------------------------------------------------- */
export const grantBirthdayBonuses = async (now = new Date()) => {
  const { year, month } = atlantaYearMonth(now);
  // dob is saved as a date at midnight UTC, so use the UTC month
  const members = (await Membership.find({ status: "active" }).select("_id firstName tier dob").lean())
    .filter((m) => m.dob && new Date(m.dob).getUTCMonth() === month);

  let granted = 0;
  for (const m of members) {
    const row = await grantCredit({
      memberId: m._id,
      type: "bonus",
      cents: BIRTHDAY_BONUS_CENTS,
      expiresAt: startOfNextMonth(year, month),
      note: `Happy birthday! ${year} birthday bonus`,
      key: `birthday:${m._id}:${year}`,
    });
    if (row && row.createdAt > new Date(now.getTime() - 60 * 1000)) granted++;
  }
  return granted;
};

/* -------------------------------------------------------
   Move leftover credit past its date to "expired"
------------------------------------------------------- */
export const expireOldCredit = async (now = new Date()) => {
  const lots = await MemberCredit.find({
    type: { $in: ["earned", "bonus"] },
    remainingCents: { $gt: 0 },
    expiresAt: { $lte: now },
  });
  for (const lot of lots) {
    const left = lot.remainingCents;
    const updated = await MemberCredit.findOneAndUpdate(
      { _id: lot._id, remainingCents: left },
      { $set: { remainingCents: 0 } }
    );
    if (!updated) continue; // used at the same moment; next run picks it up
    await grantExpiredRow(lot, left);
  }
  return lots.length;
};

const grantExpiredRow = async (lot, cents) => {
  try {
    await MemberCredit.create({
      member: lot.member,
      type: "expired",
      cents: -cents,
      note: `Unused from: ${lot.note || "credit"}`,
      key: `expired:${lot._id}`,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
};

// Daily upkeep (expiry + birthday bonuses), run from server.js
export const runCreditUpkeep = async () => {
  const expired = await expireOldCredit();
  const birthdays = await grantBirthdayBonuses();
  if (expired || birthdays) console.log(`Member credit upkeep: ${expired} expired, ${birthdays} birthday bonuses`);
};

export const creditBalanceCents = async (memberId, now = new Date()) => {
  const lots = await MemberCredit.find(lotQuery(memberId, now)).select("remainingCents").lean();
  return lots.reduce((s, l) => s + l.remainingCents, 0);
};

/* -------------------------------------------------------
   Spend credit, oldest first. Happens once per key.
   Returns how much was actually taken.
------------------------------------------------------- */
export const useCredit = async (memberId, cents, { key, note = "" } = {}) => {
  if (!(cents > 0) || !key) return 0;
  const done = await MemberCredit.findOne({ key: `use:${key}` }).lean();
  if (done) return -done.cents;

  let left = cents;
  const lots = await MemberCredit.find(lotQuery(memberId)).sort({ expiresAt: 1, createdAt: 1 });
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.remainingCents);
    const updated = await MemberCredit.findOneAndUpdate(
      { _id: lot._id, remainingCents: { $gte: take } },
      { $inc: { remainingCents: -take } }
    );
    if (updated) left -= take;
  }
  const taken = cents - left;
  if (taken > 0) {
    await MemberCredit.create({ member: memberId, type: "used", cents: -taken, note, key: `use:${key}` });
  }
  return taken;
};

/* -------------------------------------------------------
   What the dashboard shows
------------------------------------------------------- */
export const creditSummary = async (memberId, now = new Date()) => {
  const lots = await MemberCredit.find(lotQuery(memberId, now)).sort({ expiresAt: 1 }).lean();
  const balanceCents = lots.reduce((s, l) => s + l.remainingCents, 0);

  let nextExpiring = null;
  if (lots.length) {
    const first = lots[0].expiresAt.getTime();
    nextExpiring = {
      cents: lots.filter((l) => l.expiresAt.getTime() === first).reduce((s, l) => s + l.remainingCents, 0),
      date: lots[0].expiresAt,
    };
  }

  const history = await MemberCredit.find({ member: memberId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("type cents note expiresAt createdAt")
    .lean();

  return { balanceCents, nextExpiring, history };
};
