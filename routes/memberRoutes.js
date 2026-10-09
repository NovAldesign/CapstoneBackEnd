import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import { Resend } from "resend";
import Membership, { INTEREST_OPTIONS } from "../models/membershipSchema.js";
import DiscountPartner from "../models/discountPartnerSchema.js";
import MemberCredit from "../models/memberCreditSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";
import { creditSummary, grantCredit, MONTHLY_CREDIT_CENTS } from "../utilities/memberCredit.js";

// -------------------------------------------------------
// Member login (magic link) + member dashboard
// Mounted at /api/member
// -------------------------------------------------------
const router = express.Router();

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SITE_URL = process.env.FRONTEND_URL || "https://www.grownfolkscollective.com";
const TEAM_EMAIL = "community@grownfolkscollective.com";
const LINK_MINUTES = 20;
const SESSION_DAYS = 30;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const clean = (value, max = 120) => String(value ?? "").trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Max 5 login emails per 15 minutes from one device
const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login links requested. Please wait 15 minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many tries. Please wait a few minutes and request a new link." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Logged-in member only. Loads their record onto req.member.
const memberOnly = [
  protect,
  restrictTo("member"),
  async (req, res, next) => {
    try {
      const member = await Membership.findById(req.user.id);
      if (!member || member.status === "pending") {
        return res.status(401).json({ error: "Please log in again." });
      }
      req.member = member;
      next();
    } catch (err) {
      next(err);
    }
  },
];

const emailShell = (inner) => `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#F8F9FA;padding:20px">
    <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-collapse:collapse">
      <tr><td bgcolor="#002147" style="padding:28px 20px;text-align:center">
        <h1 style="font-family:Georgia,serif;color:#C5A059;font-size:1.7rem;margin:0;font-weight:normal;letter-spacing:2px">Grown Folks&trade; Collective</h1>
      </td></tr>
      <tr><td height="4" bgcolor="#C5A059"></td></tr>
      <tr><td style="padding:36px 36px 32px;color:#333;font-size:15px;line-height:1.7">${inner}</td></tr>
      <tr><td style="padding:0 36px 30px;text-align:center">
        <img src="${SITE_URL}/email/gfc-logo.png" width="80" height="80" alt="Grown Folks&trade; Collective" style="display:inline-block;width:80px;height:80px;border:0">
        <p style="margin:8px 0 0;font-family:Georgia,serif;font-style:italic;color:#9A7630;font-size:15px">Where grown folks come out to play.&trade;</p>
      </td></tr>
    </table>
  </div>`;

const button = (href, label) => `
  <table cellpadding="0" cellspacing="0" style="margin:26px 0"><tr><td bgcolor="#C5A059">
    <a href="${href}" style="display:inline-block;padding:14px 30px;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#002147;text-decoration:none">${label}</a>
  </td></tr></table>`;

/* -------------------------------------------------------
   POST /api/member/login-link  — Public
   Body: { email }
   Emails a one-time login link. Always gives the same
   answer, so nobody can check who is a member.
------------------------------------------------------- */
router.post("/login-link", linkLimiter, async (req, res) => {
  const generic = {
    message: `If that email belongs to a GFC member, a login link is on its way. It works once, for ${LINK_MINUTES} minutes.`,
  };
  try {
    const email = clean(req.body.email).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: "Please enter the email you used to join." });

    const member = await Membership.findOne({ email });
    if (!member || member.status === "pending") return res.json(generic);

    const token = crypto.randomBytes(32).toString("hex");
    member.loginTokenHash = hashToken(token);
    member.loginTokenExpires = new Date(Date.now() + LINK_MINUTES * 60 * 1000);
    await member.save({ validateBeforeSave: false });

    const link = `${SITE_URL}/member/login/${token}`;
    if (resend) {
      await resend.emails.send({
        from: "Grown Folks™ Collective <noreply@grownfolkscollective.com>",
        to: member.email,
        reply_to: TEAM_EMAIL,
        subject: "Your GFC member login link",
        html: emailShell(`
          <p style="margin:0 0 14px;font-weight:bold;color:#002147">Hi ${escapeHtml(member.firstName)},</p>
          <p style="margin:0">Tap below to open your member dashboard. No password needed.</p>
          ${button(link, "Log in")}
          <p style="margin:0;color:#777;font-size:13px">This link works once and expires in ${LINK_MINUTES} minutes.
          If you didn't ask for it, you can ignore this email.</p>`),
      });
    } else {
      console.error("Member login link: RESEND_API_KEY is missing, email not sent.");
    }
    res.json(generic);
  } catch (err) {
    console.error("Member login link error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   POST /api/member/verify  — Public
   Body: { token }  →  { token: <session JWT>, user }
------------------------------------------------------- */
router.post("/verify", verifyLimiter, async (req, res) => {
  try {
    const raw = clean(req.body.token, 200);
    if (!/^[a-f0-9]{64}$/.test(raw)) {
      return res.status(400).json({ error: "This login link isn't valid. Please request a new one." });
    }

    const linkMatch = { loginTokenHash: hashToken(raw), loginTokenExpires: { $gt: new Date() } };
    const member = await Membership.findOne(linkMatch);
    // Use up the link; only one request can win, so it only ever works once
    const used = member
      ? await Membership.updateOne(
          { _id: member._id, ...linkMatch },
          { $unset: { loginTokenHash: 1, loginTokenExpires: 1 }, $set: { lastLoginAt: new Date() } }
        )
      : null;
    if (!member || used.modifiedCount !== 1 || member.status === "pending") {
      return res.status(400).json({ error: "This login link has expired or was already used. Please request a new one." });
    }

    const token = jwt.sign({ id: member._id, role: "member", email: member.email }, process.env.JWT_SECRET, {
      expiresIn: `${SESSION_DAYS}d`,
    });
    res.json({
      token,
      user: { id: member._id, role: "member", name: member.firstName, email: member.email, tier: member.tier },
    });
  } catch (err) {
    console.error("Member verify error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   Stripe helpers
------------------------------------------------------- */
const periodEndOf = (sub) => {
  const sec = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return sec ? new Date(sec * 1000) : null;
};

// Copy what Stripe says onto the member record (also used by the webhook)
export const syncFromSubscription = (member, sub) => {
  if (!sub) return member;
  member.currentPeriodEnd = periodEndOf(sub) || member.currentPeriodEnd;
  member.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  const resumes = sub.pause_collection?.resumes_at;
  if (sub.status === "canceled") {
    member.status = "canceled";
    member.pausedUntil = null;
  } else if (sub.pause_collection) {
    member.status = "paused";
    // We set resumes_at to the day before the first bill they'll pay again
    member.pausedUntil = resumes ? new Date((resumes + 24 * 3600) * 1000) : member.pausedUntil;
  } else if (["active", "trialing", "past_due"].includes(sub.status)) {
    member.status = "active";
    member.pausedUntil = null;
  }
  return member;
};

const loadSubscription = async (member) => {
  if (!stripe || !member.stripeSubscriptionId) return null;
  try {
    return await stripe.subscriptions.retrieve(member.stripeSubscriptionId);
  } catch (err) {
    console.error(`Stripe subscription lookup failed for ${member.email}:`, err.message);
    return null;
  }
};

const addMonths = (date, n) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};

const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

const memberView = (m) => ({
  id: m._id,
  firstName: m.firstName,
  lastName: m.lastName,
  email: m.email,
  phone: m.phone,
  birthday: ymd(m.dob),
  tier: m.tier,
  status: m.status,
  memberSince: m.paidAt || m.createdAt,
  nextBillingDate: m.status === "active" && !m.cancelAtPeriodEnd ? m.currentPeriodEnd : null,
  currentPeriodEnd: m.currentPeriodEnd,
  cancelAtPeriodEnd: m.cancelAtPeriodEnd,
  pausedUntil: m.pausedUntil,
  primaryInterest: m.connectionGoals?.primaryInterest || "",
  interests: m.interests?.length ? m.interests : m.connectionGoals?.primaryInterest ? [m.connectionGoals.primaryInterest] : [],
  monthlyCreditCents: MONTHLY_CREDIT_CENTS[m.tier] || MONTHLY_CREDIT_CENTS.Social,
  canManageBilling: Boolean(m.stripeSubscriptionId),
});

/* -------------------------------------------------------
   GET /api/member/me  — dashboard data
------------------------------------------------------- */
router.get("/me", memberOnly, async (req, res) => {
  try {
    const member = req.member;
    const sub = await loadSubscription(member);
    if (sub) {
      syncFromSubscription(member, sub);
      if (member.isModified()) await member.save({ validateBeforeSave: false });
    }
    const credit = await creditSummary(member._id);
    res.json({ member: memberView(member), credit, interestOptions: INTEREST_OPTIONS });
  } catch (err) {
    console.error("Member dashboard error:", err);
    res.status(500).json({ error: "Couldn't load your dashboard. Please refresh." });
  }
});

/* -------------------------------------------------------
   PATCH /api/member/me  — update name, phone, email,
   birthday, interests
------------------------------------------------------- */
router.patch("/me", memberOnly, async (req, res) => {
  try {
    const m = req.member;
    const b = req.body || {};
    const oldEmail = m.email;

    if (b.firstName !== undefined) {
      const v = clean(b.firstName, 60);
      if (!v) return res.status(400).json({ error: "Please enter your first name." });
      m.firstName = v;
    }
    if (b.lastName !== undefined) {
      const v = clean(b.lastName, 60);
      if (!v) return res.status(400).json({ error: "Please enter your last name." });
      m.lastName = v;
    }
    if (b.phone !== undefined) {
      const v = clean(b.phone, 30);
      if (v.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "Please enter a 10-digit phone number." });
      if (v !== m.phone && (await Membership.exists({ phone: v, _id: { $ne: m._id } }))) {
        return res.status(409).json({ error: "That phone number is already linked to another membership." });
      }
      m.phone = v;
    }
    if (b.email !== undefined) {
      const v = clean(b.email).toLowerCase();
      if (!isEmail(v)) return res.status(400).json({ error: "Please enter a valid email." });
      if (v !== oldEmail && (await Membership.exists({ email: v, _id: { $ne: m._id } }))) {
        return res.status(409).json({ error: "That email is already linked to another membership." });
      }
      m.email = v;
    }
    if (b.birthday !== undefined) {
      const v = clean(b.birthday, 10);
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "Please enter your birthday." });
      }
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18 || age > 110) return res.status(400).json({ error: "Please check your birthday." });
      m.dob = d;
    }
    if (b.interests !== undefined) {
      const list = Array.isArray(b.interests) ? [...new Set(b.interests.filter((i) => INTEREST_OPTIONS.includes(i)))] : [];
      m.interests = list;
      if (list.length) m.connectionGoals.primaryInterest = list[0];
    }

    await m.save();

    // Keep Stripe receipts going to the right inbox, and tell the old inbox about the change
    if (m.email !== oldEmail) {
      if (stripe && m.stripeCustomerId) {
        stripe.customers.update(m.stripeCustomerId, { email: m.email }).catch((e) => console.error("Stripe email update:", e.message));
      }
      if (resend) {
        resend.emails
          .send({
            from: "Grown Folks™ Collective <noreply@grownfolkscollective.com>",
            to: oldEmail,
            reply_to: TEAM_EMAIL,
            subject: "Your GFC membership email was changed",
            html: emailShell(`
              <p style="margin:0 0 14px">Hi ${escapeHtml(m.firstName)},</p>
              <p style="margin:0 0 14px">The email on your GFC membership was changed to <strong>${escapeHtml(m.email)}</strong>.
              Your login links and receipts will go there from now on.</p>
              <p style="margin:0">Didn't make this change? Reply to this email right away and we'll fix it.</p>`),
          })
          .catch((e) => console.error("Email change notice:", e.message));
      }
    }

    res.json({ member: memberView(m) });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.phone) {
      return res.status(409).json({ error: "That phone number is already linked to another membership." });
    }
    if (err.code === 11000 && err.keyPattern?.email) {
      return res.status(409).json({ error: "That email is already linked to another membership." });
    }
    console.error("Member update error:", err);
    res.status(500).json({ error: "Couldn't save your changes. Please try again." });
  }
});

/* -------------------------------------------------------
   Membership changes (all through Stripe)
------------------------------------------------------- */
const needsBilling = (req, res) => {
  if (!stripe || !req.member.stripeSubscriptionId) {
    res.status(400).json({ error: `We couldn't find your billing details. Email ${TEAM_EMAIL} and we'll take care of it.` });
    return true;
  }
  return false;
};

const notifyTeam = (subject, member, detail) => {
  if (!resend) return;
  resend.emails
    .send({
      from: "GFC Registration Monitor <noreply@grownfolkscollective.com>",
      to: TEAM_EMAIL,
      subject: `${subject}: ${member.firstName} ${member.lastName}`,
      html: `<div style="font-family:sans-serif;padding:20px;color:#002147">
        <h2 style="border-bottom:2px solid #C5A059;padding-bottom:10px">${escapeHtml(subject)}</h2>
        <p><strong>Name:</strong> ${escapeHtml(member.firstName)} ${escapeHtml(member.lastName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(member.email)}</p>
        <p><strong>Tier:</strong> ${escapeHtml(member.tier)}</p>
        <p>${escapeHtml(detail)}</p>
        <p style="color:#888;font-size:12px">Done by the member on their dashboard.</p></div>`,
    })
    .catch((e) => console.error("Team notice failed:", e.message));
};

const fmt = (d) => new Date(d).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" });

/* POST /api/member/pause  Body: { months: 1 | 2 }
   They keep this month (already paid). The next 1 or 2 bills are skipped,
   then billing restarts on its own. */
router.post("/pause", memberOnly, async (req, res) => {
  try {
    if (needsBilling(req, res)) return;
    const months = Number(req.body.months) === 2 ? 2 : 1;
    const m = req.member;
    if (m.status !== "active") return res.status(400).json({ error: "Only an active membership can be paused." });
    if (m.cancelAtPeriodEnd) return res.status(400).json({ error: "Your membership is set to end. Keep it first, then you can pause instead." });

    const sub = await stripe.subscriptions.retrieve(m.stripeSubscriptionId);
    const periodEnd = periodEndOf(sub) || addMonths(new Date(), 1);
    // Bills on periodEnd (and the month after, for 2 months) are skipped; the next one is charged
    const restartBill = addMonths(periodEnd, months);
    const resumesAt = new Date(restartBill.getTime() - 24 * 3600 * 1000); // the day before that bill

    const updated = await stripe.subscriptions.update(m.stripeSubscriptionId, {
      pause_collection: { behavior: "void", resumes_at: Math.floor(resumesAt.getTime() / 1000) },
    });
    syncFromSubscription(m, updated);
    await m.save({ validateBeforeSave: false });

    notifyTeam("Membership paused", m, `Paused for ${months} month${months === 1 ? "" : "s"}. Billing restarts ${fmt(restartBill)}.`);
    res.json({
      member: memberView(m),
      message: `You're paused. You won't be charged on ${fmt(periodEnd)}${months === 2 ? " or the month after" : ""}. Billing restarts ${fmt(restartBill)}.`,
    });
  } catch (err) {
    console.error("Pause error:", err);
    res.status(500).json({ error: "Couldn't pause your membership. Please try again." });
  }
});

/* POST /api/member/resume — end a pause early */
router.post("/resume", memberOnly, async (req, res) => {
  try {
    if (needsBilling(req, res)) return;
    const m = req.member;
    const updated = await stripe.subscriptions.update(m.stripeSubscriptionId, { pause_collection: "" });
    syncFromSubscription(m, updated);
    m.status = "active";
    m.pausedUntil = null;
    await m.save({ validateBeforeSave: false });
    notifyTeam("Membership resumed", m, "Ended their pause early.");
    res.json({ member: memberView(m), message: "Welcome back! Your membership is active again." });
  } catch (err) {
    console.error("Resume error:", err);
    res.status(500).json({ error: "Couldn't resume your membership. Please try again." });
  }
});

/* POST /api/member/cancel — ends at the end of the paid month */
router.post("/cancel", memberOnly, async (req, res) => {
  try {
    if (needsBilling(req, res)) return;
    const m = req.member;
    const reason = clean(req.body.reason, 500);
    const updated = await stripe.subscriptions.update(m.stripeSubscriptionId, {
      cancel_at_period_end: true,
      ...(m.status === "paused" && { pause_collection: "" }),
      ...(reason && { metadata: { cancelReason: reason.slice(0, 450) } }),
    });
    syncFromSubscription(m, updated);
    await m.save({ validateBeforeSave: false });
    const ends = m.currentPeriodEnd ? fmt(m.currentPeriodEnd) : "the end of your paid month";
    notifyTeam("Membership set to end", m, `Ends ${ends}. Reason: ${reason || "(none given)"}`);
    res.json({
      member: memberView(m),
      message: `Your membership will end on ${ends}. You keep your perks and credit until then.`,
    });
  } catch (err) {
    console.error("Cancel error:", err);
    res.status(500).json({ error: "Couldn't update your membership. Please try again." });
  }
});

/* POST /api/member/keep — undo a cancel before it takes effect */
router.post("/keep", memberOnly, async (req, res) => {
  try {
    if (needsBilling(req, res)) return;
    const m = req.member;
    const updated = await stripe.subscriptions.update(m.stripeSubscriptionId, { cancel_at_period_end: false });
    syncFromSubscription(m, updated);
    await m.save({ validateBeforeSave: false });
    notifyTeam("Membership kept", m, "Changed their mind and kept their membership.");
    res.json({ member: memberView(m), message: "You're staying! Your membership will keep renewing." });
  } catch (err) {
    console.error("Keep error:", err);
    res.status(500).json({ error: "Couldn't update your membership. Please try again." });
  }
});

/* -------------------------------------------------------
   GET /api/member/perks — approved Member Perks,
   including promo codes (members only)
------------------------------------------------------- */
router.get("/perks", memberOnly, async (req, res) => {
  try {
    const now = new Date();
    const perks = await DiscountPartner.find({
      status: "approved",
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .sort({ businessName: 1 })
      .select("businessName website category where address offer redeem promoCode finePrint endDate logo")
      .lean();
    res.json(perks);
  } catch (err) {
    console.error("Member perks error:", err);
    res.status(500).json({ error: "Couldn't load member perks." });
  }
});

/* -------------------------------------------------------
   POST /api/member/admin/credit  — Admin only
   Body: { email, dollars, note, months? }
   Add credit by hand (for example, this month's credit for
   members who joined before credit tracking started).
------------------------------------------------------- */
router.post("/admin/credit", protect, restrictTo("admin"), async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const cents = Math.round(Number(req.body.dollars) * 100);
    const months = Math.min(Math.max(Number(req.body.months) || 2, 1), 12);
    if (!(cents > 0) || cents > 50000) return res.status(400).json({ error: "Enter an amount between $0.01 and $500." });
    const member = await Membership.findOne({ email });
    if (!member) return res.status(404).json({ error: "No member with that email." });

    const lot = await grantCredit({
      memberId: member._id,
      type: "bonus",
      cents,
      expiresAt: addMonths(new Date(), months),
      note: clean(req.body.note, 150) || "Credit added by GFC",
      key: `admin:${member._id}:${crypto.randomUUID()}`,
    });
    res.status(201).json({ ok: true, credit: lot, summary: await creditSummary(member._id) });
  } catch (err) {
    console.error("Admin credit error:", err);
    res.status(500).json({ error: "Couldn't add credit." });
  }
});

/* -------------------------------------------------------
   Test member — Admin only
   POST   /api/member/admin/test-member  Body: { email, tier }
          Makes (or resets) a fake active member that is never billed,
          with one month of credit, so you can log in at /login and test.
   DELETE /api/member/admin/test-member  Body: { email }
------------------------------------------------------- */
router.post("/admin/test-member", protect, restrictTo("admin"), async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: "Enter an email inbox you can open." });
    const tier = req.body.tier === "Social" ? "Social" : "Founding";

    let member = await Membership.findOne({ email });
    if (member && !member.isTest) {
      return res.status(409).json({ error: "That email belongs to a real member. Use a different inbox for testing." });
    }
    if (member) await MemberCredit.deleteMany({ member: member._id });
    else {
      member = new Membership({
        firstName: "Test",
        lastName: "Member",
        email,
        phone: `000-000-${String(Date.now()).slice(-4)}`,
        dob: new Date("1985-06-15T12:00:00Z"),
        tier,
        isTest: true,
        connectionGoals: { primaryInterest: "Play / Games", isolationBarrier: "TEST ACCOUNT" },
      });
    }
    const now = new Date();
    Object.assign(member, {
      tier,
      status: "active",
      paidAt: member.paidAt || now,
      currentPeriodEnd: addMonths(now, 1),
      pausedUntil: null,
      cancelAtPeriodEnd: false,
    });
    await member.save({ validateBeforeSave: false });

    await grantCredit({
      memberId: member._id,
      type: "earned",
      cents: MONTHLY_CREDIT_CENTS[tier],
      expiresAt: addMonths(now, 2),
      note: "Test credit",
      key: `test:${member._id}:${crypto.randomUUID()}`,
    });
    res.status(201).json({ ok: true, email, tier, summary: await creditSummary(member._id) });
  } catch (err) {
    console.error("Test member error:", err);
    res.status(500).json({ error: "Couldn't create the test member." });
  }
});

router.delete("/admin/test-member", protect, restrictTo("admin"), async (req, res) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const member = await Membership.findOne({ email, isTest: true });
    if (!member) return res.status(404).json({ error: "No test member with that email." });
    await MemberCredit.deleteMany({ member: member._id });
    await member.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete test member error:", err);
    res.status(500).json({ error: "Couldn't delete the test member." });
  }
});

export default router;
