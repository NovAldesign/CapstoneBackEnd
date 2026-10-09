import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import Event from "../models/eventSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";
import {
  KINDS, SITE_URL, PARTNER_EMAIL, PARTNER_PHONE, INVITE_DAYS, LINK_MINUTES, SESSION_DAYS,
  SPONSOR_TERMS_VERSION, PERK_TERMS_VERSION, TIER_PRICE_CENTS,
  tierOf, nameOf, contactOf, portalOpen, hashToken, checklistFor, progressOf, stepsFor, loadEvent,
  issueLink, portalLink, sendInviteEmail, sendLoginEmail, notifyTeam, escapeHtml, money,
} from "../utilities/partnerPortal.js";

// -------------------------------------------------------
// Partner portal: /api/partner
// Sponsors and Member Perks partners sign in with an emailed
// link (no password) and manage everything in one place.
// -------------------------------------------------------
const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const UPLOAD_FOLDER = "gfc/partners";
const HIDE = "-portal.loginTokenHash -portal.loginTokenExpires";

const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));
const isUrl = (v) => !v || /^https?:\/\/\S+$/i.test(v);
// "www.brand.com" → "https://www.brand.com" (people rarely type the https://)
const fixLink = (v, max = 200) => {
  const s = clean(v, max).replace(/\s+/g, "");
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
};
const isCloudinary = (v) => !v || (CLOUD_NAME ? new RegExp(`^https://res\\.cloudinary\\.com/${CLOUD_NAME}/`).test(v) : /^https:\/\/res\.cloudinary\.com\//.test(v));

const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many sign-in links requested. Please wait 15 minutes and try again." },
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

const signSession = (kind, doc) =>
  jwt.sign({ id: String(doc._id), role: "partner", kind, email: doc.email }, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });

// Signed-in partner only. Loads the record onto req.partner.
const partnerOnly = [
  protect,
  restrictTo("partner"),
  async (req, res, next) => {
    try {
      const kind = req.user.kind;
      if (!KINDS[kind] || !isId(req.user.id)) return res.status(401).json({ error: "Please sign in again." });
      const doc = await KINDS[kind].findById(req.user.id);
      if (!doc || !portalOpen(kind, doc)) {
        return res.status(403).json({ error: `This portal is closed. Questions? Email ${PARTNER_EMAIL}.` });
      }
      req.kind = kind;
      req.partner = doc;
      next();
    } catch (err) {
      next(err);
    }
  },
];

/* -------------------------------------------------------
   What the portal page shows
------------------------------------------------------- */
const portalView = async (kind, doc) => {
  const p = doc.portal || {};
  const event = kind === "sponsor" ? await loadEvent(p.eventId) : null;
  const checklist = checklistFor(kind, doc);
  const base = {
    kind,
    id: doc._id,
    name: nameOf(kind, doc),
    contactName: contactOf(kind, doc),
    email: doc.email,
    status: doc.status,
    steps: stepsFor(kind, doc, event),
    checklist,
    progress: progressOf(checklist),
    agreement: {
      signedAt: p.agreement?.signedAt || null,
      name: p.agreement?.name || "",
      version: p.agreement?.version || "",
      currentVersion: kind === "perk" ? PERK_TERMS_VERSION : SPONSOR_TERMS_VERSION,
    },
    gfcContact: { name: `La'Von "Vaughn" Williams`, phone: PARTNER_PHONE, email: PARTNER_EMAIL },
  };
  if (kind === "perk") {
    return {
      ...base,
      perk: {
        logo: doc.logo || "",
        photoUrl: p.photoUrl || "",
        confirmedAt: p.perkConfirmedAt || null,
        offer: doc.offer,
        offerType: doc.offerType,
        where: doc.where,
        address: doc.address,
        website: doc.website,
        category: doc.category,
        redeem: doc.redeem,
        promoCode: doc.promoCode,
        finePrint: doc.finePrint,
        startDate: doc.startDate,
        endDate: doc.endDate,
      },
    };
  }
  return {
    ...base,
    tier: tierOf(doc),
    tierLabel: doc.tierRequested || "Custom",
    eventsInterested: doc.eventsInterested || [],
    details: {
      logoUrl: p.logoUrl, photos: p.photos || [], brandColors: p.brandColors, blurb: p.blurb,
      website: p.website, instagram: p.instagram, facebook: p.facebook, tiktok: p.tiktok,
      onsiteName: p.onsiteName, onsitePhone: p.onsitePhone, tableNeeds: p.tableNeeds,
      signageNeeds: p.signageNeeds, samplingPlan: p.samplingPlan,
    },
    payment: { amountCents: p.amountCents || 0, paidAt: p.paidAt || null, receiptUrl: p.receiptUrl || "" },
    event: event
      ? { name: event.name, date: event.date, endDate: event.endDate, location: event.location || {}, loadIn: p.loadIn || "" }
      : p.loadIn
        ? { name: "", date: null, location: {}, loadIn: p.loadIn }
        : null,
    recap: { recapUrl: p.recapUrl, recapNote: p.recapNote, newsletterUrl: p.newsletterUrl },
  };
};

/* -------------------------------------------------------
   POST /api/partner/login-link  — Public
   Same answer either way, so nobody can check who's a partner.
------------------------------------------------------- */
router.post("/login-link", linkLimiter, async (req, res) => {
  const generic = {
    message: `If that email belongs to a GFC partner, a sign-in link is on its way. It works once, for ${LINK_MINUTES} minutes.`,
  };
  try {
    const email = clean(req.body.email, 120).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: "Please enter the email you used with GFC." });

    const links = [];
    for (const kind of ["sponsor", "perk"]) {
      const docs = await KINDS[kind].find({ email });
      for (const doc of docs.filter((d) => portalOpen(kind, d))) {
        const token = await issueLink(kind, doc, LINK_MINUTES);
        links.push({ kind, name: nameOf(kind, doc), url: portalLink(token) });
      }
    }
    if (links.length) await sendLoginEmail(email, links);
    res.json(generic);
  } catch (err) {
    console.error("Partner login link error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   POST /api/partner/verify  — Public
   Body: { token } → { token: <session>, partner }
------------------------------------------------------- */
router.post("/verify", verifyLimiter, async (req, res) => {
  try {
    const raw = clean(req.body.token, 200);
    if (!/^[a-f0-9]{64}$/.test(raw)) {
      return res.status(400).json({ error: "This link isn't valid. Please request a new one." });
    }
    const match = { "portal.loginTokenHash": hashToken(raw), "portal.loginTokenExpires": { $gt: new Date() } };
    for (const kind of ["sponsor", "perk"]) {
      const doc = await KINDS[kind].findOne(match);
      if (!doc) continue;
      // Use up the link: only one request can win
      const used = await KINDS[kind].updateOne(
        { _id: doc._id, ...match },
        { $unset: { "portal.loginTokenHash": 1, "portal.loginTokenExpires": 1 }, $set: { "portal.lastLoginAt": new Date() } }
      );
      if (used.modifiedCount !== 1 || !portalOpen(kind, doc)) break;
      return res.json({ token: signSession(kind, doc), partner: { kind, id: doc._id, name: nameOf(kind, doc) } });
    }
    res.status(400).json({ error: "This link has expired or was already used. Please request a new one." });
  } catch (err) {
    console.error("Partner verify error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* -------------------------------------------------------
   GET /api/partner/me  — the portal
------------------------------------------------------- */
router.get("/me", partnerOnly, async (req, res) => {
  try {
    // Other partnerships under the same email (a sponsor that also offers a perk)
    const others = [];
    for (const kind of ["sponsor", "perk"]) {
      const docs = await KINDS[kind].find({ email: req.partner.email }).select("companyName businessName status").lean();
      docs
        .filter((d) => portalOpen(kind, d) && !(kind === req.kind && String(d._id) === String(req.partner._id)))
        .forEach((d) => others.push({ kind, id: d._id, name: nameOf(kind, d) }));
    }
    res.json({ portal: await portalView(req.kind, req.partner), others });
  } catch (err) {
    console.error("Partner portal error:", err);
    res.status(500).json({ error: "Couldn't load your portal. Please refresh." });
  }
});

// Switch to another partnership under the same email
router.post("/switch", partnerOnly, async (req, res) => {
  const { kind, id } = req.body || {};
  if (!KINDS[kind] || !isId(id)) return res.status(400).json({ error: "Not found." });
  const doc = await KINDS[kind].findById(id);
  if (!doc || doc.email !== req.partner.email || !portalOpen(kind, doc)) return res.status(404).json({ error: "Not found." });
  res.json({ token: signSession(kind, doc), partner: { kind, id: doc._id, name: nameOf(kind, doc) } });
});

/* -------------------------------------------------------
   GET /api/partner/upload-signature  — Cloudinary upload
------------------------------------------------------- */
router.get("/upload-signature", partnerOnly, (req, res) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    return res.status(500).json({ error: "Uploads aren't set up yet. Email your files to " + PARTNER_EMAIL + "." });
  }
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = `folder=${UPLOAD_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + API_SECRET).digest("hex");
  res.json({ cloudName: CLOUD_NAME, apiKey: API_KEY, timestamp, folder: UPLOAD_FOLDER, signature });
});

/* -------------------------------------------------------
   PATCH /api/partner/me  — save details
------------------------------------------------------- */
const SPONSOR_FIELDS = {
  blurb: 600, brandColors: 120, website: 200, instagram: 120, facebook: 200, tiktok: 120,
  onsiteName: 80, onsitePhone: 30, tableNeeds: 600, signageNeeds: 600, samplingPlan: 1000,
};
const PERK_FIELDS = { offer: 160, address: 200, website: 200, promoCode: 40, finePrint: 1000 };
const pick = (v, allowed) => (allowed.includes(v) ? v : undefined);

router.patch("/me", partnerOnly, async (req, res) => {
  try {
    const b = req.body || {};
    const doc = req.partner;
    const kind = req.kind;
    const p = doc.portal;

    if (kind === "sponsor") {
      // Partial saves are fine: partners can finish later
      for (const [key, max] of Object.entries(SPONSOR_FIELDS)) {
        if (b[key] !== undefined) p[key] = ["website", "facebook"].includes(key) ? fixLink(b[key], max) : clean(b[key], max);
      }
      if (b.logoUrl !== undefined) {
        if (!isCloudinary(b.logoUrl)) return res.status(400).json({ error: "Please upload your logo here in the portal." });
        p.logoUrl = clean(b.logoUrl, 400);
      }
      if (Array.isArray(b.photos)) {
        const photos = b.photos.map((u) => clean(u, 400)).filter(Boolean).slice(0, 8);
        if (!photos.every(isCloudinary)) return res.status(400).json({ error: "Please upload photos here in the portal." });
        p.photos = photos;
      }
    } else {
      const before = { offer: doc.offer, redeem: doc.redeem, promoCode: doc.promoCode, finePrint: doc.finePrint };
      for (const [key, max] of Object.entries(PERK_FIELDS)) {
        if (b[key] !== undefined) doc[key] = clean(b[key], max);
      }
      if (b.offerType !== undefined) doc.offerType = pick(b.offerType, ["percent", "dollar", "freebie", "other"]) || doc.offerType;
      if (b.where !== undefined) doc.where = pick(b.where, ["in-store", "online", "both"]) || doc.where;
      if (b.redeem !== undefined) doc.redeem = pick(b.redeem, ["show-membership", "promo-code", "mention", "other"]) || doc.redeem;
      if (b.endDate !== undefined) {
        const d = b.endDate ? new Date(b.endDate) : null;
        if (d && Number.isNaN(d.getTime())) return res.status(400).json({ error: "Please pick a valid end date." });
        doc.endDate = d;
      }
      if (!doc.offer) return res.status(400).json({ error: "Please describe your discount." });
      if ((b.confirm === true || p.perkConfirmedAt) && doc.redeem === "promo-code" && !doc.promoCode) {
        return res.status(400).json({ error: "Please add the promo code members should use." });
      }
      if (b.logo !== undefined) {
        const logo = String(b.logo || "");
        if (logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > 120000)) {
          return res.status(400).json({ error: "Logo must be a PNG, JPG or WebP image under 90 KB." });
        }
        doc.logo = logo;
      }
      if (b.photoUrl !== undefined) {
        if (!isCloudinary(b.photoUrl)) return res.status(400).json({ error: "Please upload your photo here in the portal." });
        p.photoUrl = clean(b.photoUrl, 400);
      }
      if (b.confirm === true) p.perkConfirmedAt = new Date();

      // Let the team know when what members see changes on a live perk
      const changed = Object.keys(before).filter((k) => String(before[k] || "") !== String(doc[k] || ""));
      if (changed.length && p.perkConfirmedAt && b.confirm !== true) {
        notifyTeam(`Member Perk updated: ${doc.businessName}`, [
          `<strong>${escapeHtml(doc.businessName)}</strong> changed: ${changed.join(", ")}.`,
          `Offer now: ${escapeHtml(doc.offer)}`,
        ]).catch(() => {});
      }
    }

    await doc.save();
    res.json({ portal: await portalView(kind, doc) });
  } catch (err) {
    console.error("Partner save error:", err);
    res.status(400).json({ error: err.name === "ValidationError" ? "Please check your entries and try again." : "Couldn't save. Please try again." });
  }
});

/* -------------------------------------------------------
   POST /api/partner/agree  — one-click e-sign
   Body: { name }
------------------------------------------------------- */
router.post("/agree", partnerOnly, async (req, res) => {
  try {
    const name = clean(req.body?.name, 120);
    if (name.length < 2) return res.status(400).json({ error: "Type your full name to sign." });
    if (req.body?.agree !== true) return res.status(400).json({ error: "Check the box to agree." });
    const doc = req.partner;
    doc.portal.agreement = {
      name,
      signedAt: new Date(),
      version: req.kind === "perk" ? PERK_TERMS_VERSION : SPONSOR_TERMS_VERSION,
      ip: clean(req.headers["x-forwarded-for"]?.split(",")[0] || req.ip, 60),
    };
    await doc.save();
    notifyTeam(`${req.kind === "perk" ? "Member Perk terms" : "Sponsor Agreement"} signed: ${nameOf(req.kind, doc)}`, [
      `${escapeHtml(name)} signed for <strong>${escapeHtml(nameOf(req.kind, doc))}</strong>.`,
    ]).catch(() => {});
    res.json({ portal: await portalView(req.kind, doc) });
  } catch (err) {
    console.error("Partner agree error:", err);
    res.status(500).json({ error: "Couldn't save your signature. Please try again." });
  }
});

/* -------------------------------------------------------
   Sponsor payment (Stripe Checkout)
------------------------------------------------------- */
const receiptFor = async (session) => {
  try {
    const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!piId) return "";
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    return pi.latest_charge?.receipt_url || "";
  } catch {
    return "";
  }
};

// Marks a sponsor paid from a completed Checkout session (portal return or webhook). Safe to repeat.
export const markSponsorPaid = async (session) => {
  if (session?.metadata?.partnerPortal !== "sponsor" || session.payment_status !== "paid") return null;
  const id = session.metadata.partnerId;
  if (!isId(id)) return null;
  const doc = await KINDS.sponsor.findById(id);
  if (!doc) return null;
  if (doc.portal.paidAt) return doc;
  doc.portal.paidAt = new Date();
  doc.portal.stripeSessionId = session.id;
  doc.portal.receiptUrl = await receiptFor(session);
  if (doc.status === "accepted") doc.status = "active";
  await doc.save();
  notifyTeam(`Sponsor paid: ${doc.companyName} (${money(session.amount_total)})`, [
    `<strong>${escapeHtml(doc.companyName)}</strong> paid ${money(session.amount_total)} for their sponsorship.`,
  ]).catch(() => {});
  return doc;
};

router.post("/pay", partnerOnly, async (req, res) => {
  try {
    if (req.kind !== "sponsor") return res.status(400).json({ error: "Nothing to pay." });
    if (!stripe) return res.status(500).json({ error: "Payments aren't available right now." });
    const doc = req.partner;
    const amount = doc.portal.amountCents || 0;
    if (amount <= 0) return res.status(400).json({ error: "Your amount isn't set yet. We'll let you know." });
    if (doc.portal.paidAt) return res.status(400).json({ error: "You're already paid. Thank you!" });
    if (!doc.portal.agreement?.signedAt) return res.status(400).json({ error: "Please sign the Sponsor Agreement first." });

    const tier = tierOf(doc);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: doc.email,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${tier === "custom" ? "" : tier[0].toUpperCase() + tier.slice(1) + " "}Sponsorship: ${doc.companyName}`.slice(0, 120),
            description: "Grown Folks™ Collective event partnership",
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      invoice_creation: { enabled: true },
      metadata: { partnerPortal: "sponsor", partnerId: String(doc._id) },
      success_url: `${SITE_URL}/partner?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/partner`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Partner pay error:", err);
    res.status(500).json({ error: "Couldn't start the payment. Please try again." });
  }
});

// After Stripe sends them back: confirm right away (the webhook also does this)
router.post("/pay/confirm", partnerOnly, async (req, res) => {
  try {
    const sessionId = clean(req.body?.sessionId, 200);
    if (!stripe || !/^cs_/.test(sessionId)) return res.status(400).json({ error: "Not found." });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.partnerId !== String(req.partner._id)) return res.status(404).json({ error: "Not found." });
    const doc = (await markSponsorPaid(session)) || req.partner;
    res.json({ portal: await portalView("sponsor", await KINDS.sponsor.findById(doc._id)) });
  } catch (err) {
    console.error("Partner pay confirm error:", err);
    res.status(500).json({ error: "Couldn't confirm your payment yet. Refresh in a minute." });
  }
});

/* -------------------------------------------------------
   POST /api/partner/perk/status — pause, resume or end a perk
------------------------------------------------------- */
router.post("/perk/status", partnerOnly, async (req, res) => {
  try {
    if (req.kind !== "perk") return res.status(400).json({ error: "Not available." });
    const doc = req.partner;
    const action = req.body?.action;
    const next = { pause: ["approved", "paused"], resume: ["paused", "approved"], end: [null, "ended"] }[action];
    if (!next) return res.status(400).json({ error: "Pick pause, resume or end." });
    if (doc.status === "ended") return res.status(400).json({ error: `This perk has ended. Email ${PARTNER_EMAIL} to bring it back.` });
    if (next[0] && doc.status !== next[0]) return res.status(400).json({ error: "That isn't available right now." });
    doc.status = next[1];
    await doc.save();
    notifyTeam(`Member Perk ${action === "end" ? "ended" : action === "pause" ? "paused" : "resumed"}: ${doc.businessName}`, [
      `<strong>${escapeHtml(doc.businessName)}</strong> ${action === "end" ? "ended" : action === "pause" ? "paused" : "resumed"} their Member Perk from the partner portal.`,
    ]).catch(() => {});
    res.json({ portal: await portalView("perk", doc) });
  } catch (err) {
    console.error("Perk status error:", err);
    res.status(500).json({ error: "Couldn't update your perk. Please try again." });
  }
});

/* =======================================================
   ADMIN
======================================================= */
const admin = [protect, restrictTo("admin")];

const adminRow = async (kind, doc, eventsById) => {
  const event = kind === "sponsor" && doc.portal?.eventId ? eventsById.get(doc.portal.eventId) || (await loadEvent(doc.portal.eventId)) : null;
  const checklist = checklistFor(kind, doc);
  return {
    kind,
    _id: doc._id,
    isTest: Boolean(doc.isTest),
    name: nameOf(kind, doc),
    contactName: contactOf(kind, doc),
    email: doc.email,
    phone: doc.phone,
    status: doc.status,
    tier: kind === "sponsor" ? tierOf(doc) : undefined,
    tierLabel: kind === "sponsor" ? doc.tierRequested : undefined,
    defaultAmountCents: kind === "sponsor" ? TIER_PRICE_CENTS[tierOf(doc)] || 0 : undefined,
    portalOpen: portalOpen(kind, doc),
    steps: stepsFor(kind, doc, event),
    checklist,
    progress: progressOf(checklist),
    event: event ? { _id: event._id, name: event.name, date: event.date } : null,
    portal: {
      invitedAt: doc.portal?.invitedAt || null,
      lastLoginAt: doc.portal?.lastLoginAt || null,
      remindersSent: doc.portal?.remindersSent || 0,
      lastReminderAt: doc.portal?.lastReminderAt || null,
      amountCents: doc.portal?.amountCents || 0,
      paidAt: doc.portal?.paidAt || null,
      receiptUrl: doc.portal?.receiptUrl || "",
      eventId: doc.portal?.eventId || "",
      loadIn: doc.portal?.loadIn || "",
      recapUrl: doc.portal?.recapUrl || "",
      recapNote: doc.portal?.recapNote || "",
      newsletterUrl: doc.portal?.newsletterUrl || "",
      logoUrl: doc.portal?.logoUrl || "",
      photos: doc.portal?.photos || [],
      photoUrl: doc.portal?.photoUrl || "",
      blurb: doc.portal?.blurb || "",
      brandColors: doc.portal?.brandColors || "",
      website: doc.portal?.website || "",
      instagram: doc.portal?.instagram || "",
      facebook: doc.portal?.facebook || "",
      tiktok: doc.portal?.tiktok || "",
      onsiteName: doc.portal?.onsiteName || "",
      onsitePhone: doc.portal?.onsitePhone || "",
      tableNeeds: doc.portal?.tableNeeds || "",
      signageNeeds: doc.portal?.signageNeeds || "",
      samplingPlan: doc.portal?.samplingPlan || "",
      agreement: doc.portal?.agreement?.signedAt ? { name: doc.portal.agreement.name, signedAt: doc.portal.agreement.signedAt, version: doc.portal.agreement.version } : null,
    },
  };
};

// Upcoming events (for "which event is this sponsor at?")
const upcomingEvents = () =>
  Event.find({ date: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) }, status: { $in: ["published", "draft"] } })
    .sort({ date: 1 })
    .select("name date")
    .limit(60)
    .lean();

router.get("/admin/overview", admin, async (req, res) => {
  try {
    const events = await upcomingEvents();
    const eventsById = new Map(events.map((e) => [String(e._id), e]));
    const sponsors = await KINDS.sponsor.find().sort({ createdAt: -1 }).limit(300).select(HIDE);
    const perks = await KINDS.perk.find().sort({ createdAt: -1 }).limit(300).select(HIDE);
    res.json({
      sponsors: await Promise.all(sponsors.map((d) => adminRow("sponsor", d, eventsById))),
      perks: await Promise.all(perks.map((d) => adminRow("perk", d, eventsById))),
      events,
    });
  } catch (err) {
    console.error("Partner overview error:", err);
    res.status(500).json({ error: "Couldn't load partners." });
  }
});

// Approve (if needed) and email the portal link
router.post("/admin/:kind/:id/invite", admin, async (req, res) => {
  try {
    const { kind, id } = req.params;
    if (!KINDS[kind] || !isId(id)) return res.status(404).json({ error: "Not found." });
    const doc = await KINDS[kind].findById(id);
    if (!doc) return res.status(404).json({ error: "Not found." });
    if (doc.status === "declined") return res.status(400).json({ error: "This one is declined. Change the status first." });

    if (kind === "perk" && doc.status === "pending") doc.status = "approved";
    if (kind === "sponsor" && ["pending", "contacted"].includes(doc.status)) doc.status = "accepted";
    if (kind === "sponsor" && !doc.portal.amountCents && !doc.portal.paidAt) doc.portal.amountCents = TIER_PRICE_CENTS[tierOf(doc)] || 0;
    doc.portal.invitedAt = doc.portal.invitedAt || new Date();
    doc.portal.lastReminderAt = new Date(); // first reminder comes a few days later
    await doc.save();

    const token = await issueLink(kind, doc, INVITE_DAYS * 24 * 60);
    const sent = await sendInviteEmail(kind, doc, token);
    if (!sent) return res.status(500).json({ error: "Approved, but the email didn't send (email isn't set up on the server)." });
    const events = await upcomingEvents();
    res.json({ item: await adminRow(kind, doc, new Map(events.map((e) => [String(e._id), e]))), message: `Portal link sent to ${doc.email}.` });
  } catch (err) {
    console.error("Partner invite error:", err);
    res.status(500).json({ error: "Couldn't send the portal link." });
  }
});

// GFC-side details: amount, event, load-in, recap, manual payment
router.patch("/admin/:kind/:id", admin, async (req, res) => {
  try {
    const { kind, id } = req.params;
    if (!KINDS[kind] || !isId(id)) return res.status(404).json({ error: "Not found." });
    const doc = await KINDS[kind].findById(id);
    if (!doc) return res.status(404).json({ error: "Not found." });
    const b = req.body || {};
    const p = doc.portal;

    if (kind === "sponsor") {
      if (b.amountCents !== undefined) {
        const cents = Math.round(Number(b.amountCents));
        if (!Number.isFinite(cents) || cents < 0 || cents > 5000000) return res.status(400).json({ error: "Enter an amount between $0 and $50,000." });
        if (p.paidAt && cents !== p.amountCents) return res.status(400).json({ error: "They've already paid. Mark it unpaid first to change the amount." });
        p.amountCents = cents;
      }
      if (b.eventId !== undefined) {
        if (b.eventId && !isId(b.eventId)) return res.status(400).json({ error: "Pick an event." });
        p.eventId = b.eventId || "";
      }
      if (b.loadIn !== undefined) p.loadIn = clean(b.loadIn, 120);
      if (b.recapUrl !== undefined) p.recapUrl = fixLink(b.recapUrl, 400);
      if (b.recapNote !== undefined) p.recapNote = clean(b.recapNote, 1000);
      if (b.newsletterUrl !== undefined) p.newsletterUrl = fixLink(b.newsletterUrl, 400);
      if (![p.recapUrl, p.newsletterUrl].every(isUrl)) return res.status(400).json({ error: "Links need to start with https://." });
      // Paid by check, Zelle or cash
      if (b.markPaid === true && !p.paidAt) {
        p.paidAt = new Date();
        if (doc.status === "accepted") doc.status = "active";
      }
      if (b.markPaid === false) {
        p.paidAt = null;
        p.receiptUrl = "";
      }
    }
    await doc.save();
    const events = await upcomingEvents();
    res.json({ item: await adminRow(kind, doc, new Map(events.map((e) => [String(e._id), e]))) });
  } catch (err) {
    console.error("Partner admin save error:", err);
    res.status(400).json({ error: "Couldn't save." });
  }
});

/* -------------------------------------------------------
   Test partner (like the test member): a fake sponsor or perk
   under your email, to click through the portal.
   POST   /api/partner/admin/test  { email, kind: "sponsor"|"perk", tier }
   DELETE /api/partner/admin/test  { email }
------------------------------------------------------- */
router.post("/admin/test", admin, async (req, res) => {
  try {
    const email = clean(req.body?.email, 120).toLowerCase();
    const kind = req.body?.kind === "perk" ? "perk" : "sponsor";
    const tier = ["Bronze", "Silver", "Gold"].includes(req.body?.tier) ? req.body.tier : "Silver";
    if (!isEmail(email)) return res.status(400).json({ error: "Enter an email you can open." });

    const Model = KINDS[kind];
    if (await Model.exists({ email, isTest: { $ne: true } })) {
      return res.status(409).json({ error: `That email belongs to a real ${kind === "perk" ? "Member Perk partner" : "sponsor"}. Use a different inbox (like you+test@gmail.com).` });
    }

    let doc = await Model.findOne({ email, isTest: true });
    if (!doc) doc = new Model({ email, isTest: true });
    if (kind === "sponsor") {
      const next = await Event.findOne({ status: "published", date: { $gte: new Date() } }).sort({ date: 1 }).select("_id").lean();
      doc.set({
        companyName: `Test Sponsor Co (${tier})`,
        contactPerson: "Test Partner",
        phone: "000-000-0000",
        tierRequested: tier,
        eventsInterested: ["Karaoke Bingo"],
        details: "Test sponsor from the dashboard. Safe to delete.",
        status: "accepted",
        portal: { invitedAt: new Date(), lastReminderAt: new Date(), amountCents: 100, eventId: next ? String(next._id) : "", loadIn: "5:30 PM, side entrance (test)" },
      });
    } else {
      doc.set({
        businessName: "Test Perk Shop",
        contactName: "Test Partner",
        phone: "000-000-0000",
        category: "Test",
        where: "in-store",
        address: "123 Test St, Atlanta, GA",
        offerType: "percent",
        offer: "15% off your order (test)",
        redeem: "show-membership",
        promoCode: "",
        finePrint: "",
        endDate: null,
        logo: "",
        agreed: true,
        agreedAt: new Date(),
        status: "approved",
        source: "test",
        portal: { invitedAt: new Date(), lastReminderAt: new Date() },
      });
    }
    await doc.save();

    const token = await issueLink(kind, doc, INVITE_DAYS * 24 * 60);
    const emailed = await sendInviteEmail(kind, doc, token).catch(() => false);
    res.json({
      kind,
      email,
      link: portalLink(token),
      emailed: Boolean(emailed),
      amountCents: kind === "sponsor" ? 100 : 0,
    });
  } catch (err) {
    console.error("Test partner error:", err);
    res.status(500).json({ error: "Couldn't make the test partner." });
  }
});

router.delete("/admin/test", admin, async (req, res) => {
  try {
    const email = clean(req.body?.email, 120).toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ error: "Enter the test email." });
    const a = await KINDS.sponsor.deleteMany({ email, isTest: true });
    const b = await KINDS.perk.deleteMany({ email, isTest: true });
    const n = a.deletedCount + b.deletedCount;
    if (!n) return res.status(404).json({ error: "No test partner with that email." });
    res.json({ deleted: n });
  } catch (err) {
    console.error("Delete test partner error:", err);
    res.status(500).json({ error: "Couldn't delete it." });
  }
});

export default router;
