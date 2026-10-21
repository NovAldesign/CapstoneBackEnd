import express from "express";
import Stripe from "stripe";
import GiftCard from "../models/giftCardSchema.js";
import MerchOrder from "../models/merchOrderSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";
import {
  publicCatalog,
  findPass,
  passPrice,
  activeSale,
  passesOpen,
  GIFT_AMOUNTS,
  giftBonusCents,
  PASS_RULES,
} from "../utilities/shopCatalog.js";
import { publicMerch, getMerch, findVariant, shippingFor, merchStatus, MERCH_SETTINGS } from "../utilities/merchCatalog.js";
import { createDraftOrder, registerWebhook, storeInfo, printfulReady } from "../utilities/printful.js";
import crypto from "crypto";
import { recoveryOptions } from "../utilities/cartRecovery.js";
import PromoCode from "../models/promoCodeSchema.js";
import {
  makeCode,
  createCardsFromSession,
  deliverNewCards,
  sendCardToRecipient,
  normalizeCardCode,
  describeCard,
  money,
} from "../utilities/giftCards.js";
import { mailer } from "../utilities/mailer.js";
import fs from "fs";
import path from "path";
import DigitalOrder from "../models/digitalOrderSchema.js";
import Subscriber from "../models/subscriberSchema.js";
import { DOWNLOADS_DIR, LICENSE, SAMPLE, findDigital, publicDigital, fileLabel } from "../utilities/digitalCatalog.js";

// -------------------------------------------------------
// /api/shop — Holiday Passes, gift cards, Printful merch and printable downloads
// -------------------------------------------------------
const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const resend = mailer; // shared sender: spaced out, retried, failures logged
const SITE = () => process.env.FRONTEND_URL || "https://grownfolkscollective.com";
const TEAM_EMAIL = "events@grownfolkscollective.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max = 120) => String(v || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const cleanSource = (v) => String(v || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40).toLowerCase();
const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Shown above the Pay button in Stripe Checkout
const NO_REFUND_CARDS = "Karaoke Bingo downloads are non-refundable. Your files are delivered right after checkout. See grownfolkscollective.com/refund-policy";
const FINAL_SALE_MERCH = "Merch is made to order, so all sales are final.";
// Buyers must check "I understand Karaoke Bingo downloads are non-refundable" on our site first
const NEEDS_AGREEMENT = "Please check the box to confirm you understand Karaoke Bingo downloads are non-refundable.";
const agreedNoRefund = (body) => body?.agreeNoRefund === true;
// The visitor's real IP (Railway sits in front of the app, so it arrives in x-forwarded-for)
const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 64);

// Karaoke Bingo cards bought together with merch: this much off the cards only
export const COMBO_PERCENT = 10;
const comboPrice = (cents) => Math.round(cents * (1 - COMBO_PERCENT / 100));

// Delivery date: "YYYY-MM-DD" → 9 AM Eastern that day (today or past = send now)
const sendAtFrom = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return new Date();
  const d = new Date(`${ymd}T09:00:00-05:00`);
  const max = new Date(Date.now() + 366 * 86400000);
  if (Number.isNaN(d.getTime()) || d > max) return new Date();
  return d < new Date() ? new Date() : d;
};

/* GET /api/shop/catalog — passes, gift amounts, sale days, merch */
router.get("/catalog", wrap(async (req, res) => {
  res.json({ ...publicCatalog(), merch: await publicMerch(), digital: publicDigital(), comboPercent: COMBO_PERCENT });
}));

/* -------------------------------------------------------
   POST /api/shop/checkout — a Holiday Pass or a gift card
   Body: { product: "pass3"|"pass5"|"gift", amountCents, isGift,
           recipientName, recipientEmail, fromName, message, sendDate, source }
------------------------------------------------------- */
router.post("/checkout", async (req, res, next) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Checkout isn't set up yet." });
    const b = req.body || {};
    const now = new Date();
    const sale = activeSale(now);
    const isGift = b.isGift === true || b.isGift === "true";

    let name, description, unitCents, meta;
    if (b.product === "gift") {
      const amount = Number(b.amountCents);
      if (!GIFT_AMOUNTS.includes(amount)) return res.status(400).json({ error: "Please choose a gift card amount." });
      const bonus = giftBonusCents(amount, now);
      name = `Grown Folks™ Collective ${money(amount)} Gift Card`;
      description = bonus
        ? `Good toward any GFC event. Cyber Monday: you also get a ${money(bonus)} bonus card.`
        : "Good toward any GFC event ticket. Never expires.";
      unitCents = amount;
      meta = { shopKind: "gift", productId: "gift", amountCents: String(amount), bonusCents: String(bonus) };
    } else {
      const pass = findPass(b.product);
      if (!pass) return res.status(400).json({ error: "Please choose a gift card." });
      if (!passesOpen(now)) return res.status(400).json({ error: "Holiday Passes aren't on sale yet. Gift cards are available now." });
      unitCents = passPrice(pass, now);
      name = `${pass.name} (Grown Folks™ Collective)`;
      description = `${pass.uses} tickets to Game Night, Karaoke Bingo or Acoustic & Infused™ through Mar 31, 2027.`;
      meta = { shopKind: "pass", productId: pass.id, productName: pass.name, uses: String(pass.uses) };
    }

    if (isGift) {
      const email = clean(b.recipientEmail, 200).toLowerCase();
      if (!clean(b.recipientName)) return res.status(400).json({ error: "Add the name of the person you're gifting." });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Add a valid email for the person you're gifting." });
      Object.assign(meta, {
        isGift: "yes",
        recipientName: clean(b.recipientName, 80),
        recipientEmail: email,
        fromName: clean(b.fromName, 80),
        message: clean(b.message, 400),
        sendAt: sendAtFrom(b.sendDate).toISOString(),
      });
    }
    meta.saleKey = sale?.key || "";
    meta.source = cleanSource(b.source);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price_data: { currency: "usd", product_data: { name, description }, unit_amount: unitCents }, quantity: 1 }],
      success_url: `${SITE()}/gift/success?session_id={CHECKOUT_SESSION_ID}`,
      ...recoveryOptions(),
      cancel_url: `${SITE()}/gift?cancelled=true`,
      metadata: meta,
    });
    res.status(201).json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   POST /api/shop/checkout/merch — merch, made to order by Printful
   Body: { items: [{ variantId, quantity }], digital: ["single-rnb", ...], source }
   Karaoke Bingo cards bought with merch are 10% off (the cards only, never the merch).
   Shipping and free shipping are based on the merch alone.
------------------------------------------------------- */
router.post("/checkout/merch", async (req, res, next) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Checkout isn't set up yet." });
    const catalog = await getMerch();
    if (!catalog.length) return res.status(400).json({ error: "Merch isn't available right now." });
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : [];
    if (!items.length) return res.status(400).json({ error: "Your bag is empty." });

    const lines = [];
    for (const it of items) {
      const found = findVariant(catalog, it.variantId);
      if (!found) return res.status(400).json({ error: "An item in your bag isn't available anymore. Please refresh and try again." });
      const qty = Math.floor(Number(it.quantity));
      if (!qty || qty < 1 || qty > 10) return res.status(400).json({ error: "Choose between 1 and 10 of each item." });
      const { item, variant } = found;
      lines.push({ productId: item.id, variantId: variant.id, name: item.name, size: variant.size, color: variant.color, qty, cents: variant.priceCents });
    }
    const subtotal = lines.reduce((s, l) => s + l.cents * l.qty, 0);
    const shipping = shippingFor(subtotal);

    const digitalIds = [...new Set((Array.isArray(req.body?.digital) ? req.body.digital : []).map(String))].slice(0, 20);
    const cards = digitalIds.map(findDigital);
    if (cards.some((p) => !p)) return res.status(400).json({ error: "A Karaoke Bingo item in your bag isn't available anymore. Please refresh and try again." });
    const cardLines = cards.map((p) => ({ ...p, paidCents: comboPrice(p.priceCents) }));
    if (cardLines.length && !agreedNoRefund(req.body)) return res.status(400).json({ error: NEEDS_AGREEMENT });

    const metadata = { shopKind: "merch", source: cleanSource(req.body?.source), shippingCents: String(shipping), lineCount: String(lines.length) };
    lines.forEach((l, i) => {
      metadata[`m_${i}`] = JSON.stringify({ v: l.variantId, i: l.productId, q: l.qty, p: l.cents });
    });
    if (cardLines.length) {
      metadata.digital = cardLines.map((c) => `${c.id}:${c.paidCents}`).join(",");
      metadata.noRefundAgreedAt = new Date().toISOString();
      metadata.noRefundAgreedIp = clientIp(req);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US"] },
      ...(cardLines.length && { billing_address_collection: "required" }), // address check on bingo downloads
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: shipping ? "Standard shipping" : "Free shipping",
            fixed_amount: { amount: shipping, currency: "usd" },
          },
        },
      ],
      line_items: [
        ...lines.map((l) => ({
          price_data: {
            currency: "usd",
            product_data: {
              name: `${l.name}${l.size ? ` · ${l.size}` : ""}${l.color ? ` · ${l.color}` : ""}`,
              description: MERCH_SETTINGS.shipNote,
            },
            unit_amount: l.cents,
          },
          quantity: l.qty,
        })),
        ...cardLines.map((c) => ({
          price_data: {
            currency: "usd",
            product_data: {
              name: `${c.name} (${COMBO_PERCENT}% off with merch)`,
              description: `Printable download, sent by email right after checkout. Non-refundable. Regular price ${money(c.priceCents)}.`,
            },
            unit_amount: c.paidCents,
          },
          quantity: 1,
        })),
      ],
      success_url: `${SITE()}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      ...recoveryOptions(),
      custom_text: { submit: { message: cardLines.length ? `${FINAL_SALE_MERCH} ${NO_REFUND_CARDS}` : FINAL_SALE_MERCH } },
      cancel_url: `${SITE()}/shop?cancelled=true#merch`,
      metadata,
    });
    res.status(201).json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   Printable downloads (Karaoke Bingo cards)
------------------------------------------------------- */
const MAX_DOWNLOADS = 100; // per order, across all its files

// POST /api/shop/checkout/digital — Body: { items: ["single-rnb", ...], source }
router.post("/checkout/digital", async (req, res, next) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Checkout isn't set up yet." });
    const ids = [...new Set((Array.isArray(req.body?.items) ? req.body.items : []).map(String))].slice(0, 20);
    const products = ids.map(findDigital);
    if (!products.length || products.some((p) => !p)) return res.status(400).json({ error: "Please choose a download." });
    if (!agreedNoRefund(req.body)) return res.status(400).json({ error: NEEDS_AGREEMENT });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_creation: "always",
      billing_address_collection: "required", // lets the card issuer check the address (fraud screening)
      line_items: products.map((p) => ({
        price_data: {
          currency: "usd",
          product_data: { name: p.name, description: `Printable download. ${LICENSE}` },
          unit_amount: p.priceCents,
        },
        quantity: 1,
      })),
      success_url: `${SITE()}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      ...recoveryOptions(),
      custom_text: { submit: { message: NO_REFUND_CARDS } },
      cancel_url: `${SITE()}/shop?cancelled=true#bingo`,
      metadata: { shopKind: "digital", items: products.map((p) => p.id).join(","), source: cleanSource(req.body?.source), noRefundAgreedAt: new Date().toISOString(), noRefundAgreedIp: clientIp(req) },
    });
    res.status(201).json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

const sendFile = (res, file, downloadName) => {
  const full = path.join(DOWNLOADS_DIR, path.basename(file));
  if (!fs.existsSync(full)) return res.status(404).json({ error: "That file isn't ready yet. Email events@grownfolkscollective.com and we'll send it." });
  res.set("Cache-Control", "private, no-store");
  // Open PDFs in the browser (easy to print on phones); the name is kept for saving
  if (/\.pdf$/i.test(full)) {
    res.type("application/pdf");
    res.set("Content-Disposition", `inline; filename="${downloadName || path.basename(file)}"`);
    return res.sendFile(full);
  }
  return res.download(full, downloadName || path.basename(file));
};

// Every file in an order, once each, in catalog order
// Files saved with the order, plus anything added to that product since (so past buyers get new host sheets too)
const orderFiles = (order) => [...new Set(order.items.flatMap((i) => [...(i.files || []), ...(findDigital(i.productId)?.files || [])]))];

const findOrderByToken = async (token) => {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return null;
  const order = await DigitalOrder.findOne({ token });
  return order && order.status === "paid" ? order : null;
};

// GET /api/shop/downloads/:token — what's in an order (for the download page)
router.get("/downloads/:token", wrap(async (req, res) => {
  const order = await findOrderByToken(req.params.token);
  if (!order) return res.status(404).json({ error: "We couldn't find that download link." });
  res.json({
    orderNumber: order.orderNumber,
    license: LICENSE,
    left: Math.max(0, MAX_DOWNLOADS - order.downloads),
    items: order.items.map((i) => ({ id: i.productId, name: i.name })),
    files: orderFiles(order).map((f) => ({ file: f, label: fileLabel(f) })),
  });
}));

// GET /api/shop/download/:token/:file — one PDF from the order
router.get("/download/:token/:file", wrap(async (req, res) => {
  const order = await findOrderByToken(req.params.token);
  if (!order) return res.status(404).json({ error: "We couldn't find that download link." });
  const file = String(req.params.file || "");
  if (!orderFiles(order).includes(file)) return res.status(404).json({ error: "That file isn't part of this order." });
  if (order.downloads >= MAX_DOWNLOADS) {
    return res.status(429).json({ error: "This link has reached its download limit. Email events@grownfolkscollective.com and we'll help." });
  }
  order.downloads += 1;
  order.lastDownloadAt = new Date();
  order.downloadLog = [
    ...(order.downloadLog || []),
    { at: order.lastDownloadAt, file, ip: clientIp(req), userAgent: String(req.headers["user-agent"] || "").slice(0, 300) },
  ].slice(-200);
  await order.save();
  return sendFile(res, file, `GFC-${file}`);
}));

// POST /api/shop/sample — Body: { fullName, email } → joins the email list, returns the sample link
router.post("/sample", wrap(async (req, res) => {
  const fullName = clean(req.body?.fullName, 80);
  const email = clean(req.body?.email, 200).toLowerCase();
  if (!fullName) return res.status(400).json({ error: "Add your name." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Add a valid email." });
  await Subscriber.updateOne(
    { email },
    { $setOnInsert: { fullName, email, source: "bingo-sample", createdAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true, url: "/api/shop/sample/file" });
}));

// GET /api/shop/sample/file — the free 2-card sample
router.get("/sample/file", (req, res) => sendFile(res, SAMPLE.file, "GFC-Karaoke-Bingo-Sample.pdf"));

/* GET /api/shop/card/:code — balance check (no personal details) */
router.get("/card/:code", wrap(async (req, res) => {
  const card = await GiftCard.findOne({ code: normalizeCardCode(req.params.code) }).lean();
  if (!card) return res.status(404).json({ error: "We couldn't find that code. Check it and try again." });
  const expired = card.expiresAt && new Date(card.expiresAt) < new Date();
  res.json({
    code: card.code,
    kind: card.kind,
    label: card.label,
    balanceCents: card.balanceCents,
    usesLeft: card.usesLeft,
    expiresAt: card.expiresAt,
    status: expired ? "expired" : card.status,
    description: describeCard(card),
  });
}));

/* GET /api/shop/order/:sessionId — what the success page shows */
router.get("/order/:sessionId", wrap(async (req, res) => {
  const id = String(req.params.sessionId || "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: "Bad order link." });
  const cards = await GiftCard.find({ stripeSessionId: id }).lean();
  if (cards.length) {
    const main = cards.find((c) => c.kind !== "bonus") || cards[0];
    const bonus = cards.find((c) => c.kind === "bonus");
    return res.json({
      type: main.kind,
      label: main.label,
      isGift: main.isGift,
      recipientName: main.recipientName,
      sendAt: main.sendAt,
      // Show the code only when it's the buyer's own card
      code: main.isGift ? "" : main.code,
      bonus: bonus ? { label: bonus.label, code: bonus.code } : null,
    });
  }
  const order = await MerchOrder.findOne({ stripeSessionId: id }).lean();
  const digital = await DigitalOrder.findOne({ stripeSessionId: id }).lean();
  if (order) {
    return res.json({
      type: "merch",
      orderNumber: order.orderNumber,
      ticketCode: order.ticketCode || "",
      ticketPercent: SHOP_TICKET_PERCENT,
      items: order.items.map((i) => ({ name: i.name, size: i.size, quantity: i.quantity })),
      downloadsToken: digital?.token || "",
    });
  }
  if (digital) {
    return res.json({ type: "digital", orderNumber: digital.orderNumber, ticketCode: digital.ticketCode || "", ticketPercent: SHOP_TICKET_PERCENT, token: digital.token, items: digital.items.map((i) => ({ id: i.productId, name: i.name })) });
  }
  res.json({ type: "pending" }); // the webhook may still be on its way
}));

// -------------------------------------------------------
// Shop thank-you: every merch or Karaoke Bingo order earns 5% off event tickets
// (one order, any event, good for 60 days). Gift cards and passes don't earn it.
// -------------------------------------------------------
export const SHOP_TICKET_PERCENT = 5;
const TICKET_CODE_DAYS = 60;

const makeTicketCode = async (orderNumber) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const expires = new Date(Date.now() + TICKET_CODE_DAYS * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  for (let tries = 0; tries < 5; tries++) {
    let code = "SHOP5"; // letters and numbers only (codes are matched without dashes or spaces)
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    try {
      await PromoCode.create({
        code,
        label: `${SHOP_TICKET_PERCENT}% off tickets (shop order ${orderNumber})`,
        type: "percent",
        value: SHOP_TICKET_PERCENT,
        maxUses: 1,
        expires,
        notes: `Earned with shop order ${orderNumber}`,
      });
      return { code, expires };
    } catch (err) {
      if (err?.code !== 11000) {
        console.error("Shop ticket code failed:", err.message);
        return null;
      }
    }
  }
  return null;
};

const ticketCodeHtml = (tc) =>
  tc?.code
    ? `<div style="margin:22px 0;padding:16px 18px;background:#fff;border:2px dashed #C5A059;border-radius:10px;">
        <p style="margin:0 0 6px;font-weight:bold;">🎟️ Thank-you gift: ${SHOP_TICKET_PERCENT}% off your next event tickets</p>
        <p style="margin:0 0 10px;">Code <strong style="font-size:18px;letter-spacing:1px;">${escapeHtml(tc.code)}</strong> · one order, any GFC event, good through ${escapeHtml(tc.expires)}.</p>
        <a href="${SITE()}/events?code=${encodeURIComponent(tc.code)}" style="color:#0E2340;font-weight:bold;">Pick your event →</a>
      </div>`
    : "";

// Save a Karaoke Bingo order and email the download link.
// Used for card-only checkouts and for cards bought together with merch.
const createDigitalOrder = async (session, lines, { totalPaidCents, withTicketCode, withMerch = "" }) => {
  const m = session.metadata || {};
  const d = session.customer_details || {};
  const items = lines.map(({ product: p, paidCents }) => ({ productId: p.id, name: p.name, priceCents: paidCents, files: p.files }));
  if (!items.length) return null;
  let order;
  try {
    order = await DigitalOrder.create({
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : "",
      buyerName: d.name || "",
      buyerEmail: d.email || "",
      items,
      totalPaidCents,
      source: m.source || "",
      noRefundAgreedAt: m.noRefundAgreedAt ? new Date(m.noRefundAgreedAt) : null,
      noRefundAgreedIp: m.noRefundAgreedIp || "",
    });
  } catch (err) {
    if (err?.code === 11000) return null;
    throw err;
  }
  const tc = withTicketCode ? await makeTicketCode(order.orderNumber) : null;
  if (tc) {
    order.ticketCode = tc.code;
    await order.save();
  }
  if (resend) {
    const link = `${SITE()}/downloads/${order.token}`;
    const list = order.items.map((i) => `<li>${escapeHtml(i.name)}</li>`).join("");
    const first = (order.buyerName || "").split(" ")[0] || "friend";
    await Promise.all([
      order.buyerEmail &&
        resend.emails
          .send({
            from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
            to: order.buyerEmail,
            reply_to: TEAM_EMAIL,
            subject: `Your Karaoke Bingo cards are ready (${order.orderNumber})`,
            html: `<div style="font-family:Arial,sans-serif;color:#0E2340;max-width:600px;margin:0 auto;padding:24px;background:#FAF7F0;">
              <h2 style="font-family:Georgia,serif;border-bottom:3px solid #C5A059;padding-bottom:10px;">Let's get the room singing, ${escapeHtml(first)}!</h2>
              <p>Order <strong>${escapeHtml(order.orderNumber)}</strong>${withMerch ? ` (bought with merch order ${escapeHtml(withMerch)}, ${COMBO_PERCENT}% off your cards)` : ""}</p><ul>${list}</ul>
              <p style="margin:24px 0;"><a href="${link}" style="background:#0E2340;color:#fff;padding:14px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Download your cards</a></p>
              <p>Save this email. Your link works any time you need to print again.</p>
              <p style="font-size:13px;color:#5F6672;">Karaoke Bingo downloads are non-refundable. If your link gives you any trouble, reply to this email and we'll help you get your files.</p>
              ${ticketCodeHtml(tc)}
              <p style="font-size:13px;color:#5F6672;">${escapeHtml(LICENSE)}</p>
              <p>Questions? Just reply to this email.</p>
              <p><img src="https://www.grownfolkscollective.com/email/gfc-logo.png" width="90" alt="Grown Folks Collective" style="display:block;width:90px;border-radius:50%;"></p>
              <p style="font-family:Georgia,serif;font-style:italic;color:#9A7630;">Where grown folks come out to play.™</p></div>`,
          })
          .catch((e) => console.error("Download buyer email failed:", e.message)),
      resend.emails
        .send({
          from: "GFC Shop <noreply@grownfolkscollective.com>",
          to: TEAM_EMAIL,
          subject: `🎤 Bingo download sold: ${order.buyerName || "New buyer"} (${money(order.totalPaidCents)})${withMerch ? " with merch" : ""}`,
          html: `<div style="font-family:Arial,sans-serif;color:#0E2340;"><h2>🎤 ${escapeHtml(order.orderNumber)}</h2><ul>${list}</ul><p>${escapeHtml(order.buyerEmail)}</p></div>`,
        })
        .catch((e) => console.error("Download team email failed:", e.message)),
    ]);
  }
  return order;
};

// Save a paid merch order in Printful as a draft (never confirmed automatically)
const sendToPrintful = async (order) => {
  if (!printfulReady()) {
    order.printfulError = "Printful isn't connected yet";
    await order.save();
    return order;
  }
  try {
    const pfOrder = await createDraftOrder(order);
    order.printfulOrderId = String(pfOrder?.id || "");
    order.printfulStatus = pfOrder?.status || "draft";
    order.printfulError = "";
    order.status = "draft";
  } catch (err) {
    console.error("Printful draft failed:", err.message);
    order.printfulError = err.message.slice(0, 300);
  }
  await order.save();
  return order;
};

/* -------------------------------------------------------
   Printful webhook: shipping and status updates
   Registered from the dashboard (Gifts & merch → Connect shipping updates).
------------------------------------------------------- */
const webhookKey = () =>
  crypto.createHash("sha256").update(`printful:${process.env.PRINTFUL_API_KEY || ""}:${process.env.JWT_SECRET || ""}`).digest("hex").slice(0, 32);

router.post("/printful/webhook/:key", wrap(async (req, res) => {
  if (!printfulReady() || req.params.key !== webhookKey()) return res.status(404).end();
  const { type, data = {} } = req.body || {};
  const pfOrder = data.order || {};
  const order = await MerchOrder.findOne(
    pfOrder.external_id ? { orderNumber: pfOrder.external_id } : { printfulOrderId: String(pfOrder.id || "") }
  );
  if (!order) return res.json({ ok: true, unknown: true });
  if (pfOrder.status) order.printfulStatus = pfOrder.status;

  if (type === "order_updated" && ["pending", "inprocess", "partial", "onhold"].includes(pfOrder.status) && order.status !== "shipped") {
    order.status = "ordered";
  }
  if (type === "order_canceled" || type === "order_failed") {
    order.printfulError = type === "order_failed" ? (data.reason || "Printful couldn't fulfill this order") : "Canceled in Printful";
    if (resend) {
      await resend.emails.sendOrThrow({
        from: "GFC Shop <noreply@grownfolkscollective.com>",
        to: TEAM_EMAIL,
        subject: `⚠️ Printful ${type === "order_failed" ? "failed" : "canceled"}: ${order.orderNumber}`,
        html: `<p>${escapeHtml(order.printfulError)}</p><p>${escapeHtml(order.buyerName)} · ${escapeHtml(order.buyerEmail)}</p>`,
      }).catch(() => {});
    }
  }
  if (type === "package_shipped") {
    const sh = data.shipment || {};
    const firstTime = order.status !== "shipped";
    order.status = "shipped";
    order.tracking = {
      carrier: sh.carrier || sh.service || "",
      number: sh.tracking_number || "",
      url: sh.tracking_url || "",
      shippedAt: new Date(),
    };
    if (firstTime && resend && order.buyerEmail) {
      const first = (order.buyerName || "").split(" ")[0] || "friend";
      const track = order.tracking.url
        ? `<p style="margin:24px 0;"><a href="${escapeHtml(order.tracking.url)}" style="background:#0E2340;color:#fff;padding:14px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Track your package</a></p>`
        : "";
      await resend.emails.sendOrThrow({
        from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
        to: order.buyerEmail,
        reply_to: TEAM_EMAIL,
        subject: `Your Grown Folks™ order shipped (${order.orderNumber})`,
        html: `<div style="font-family:Arial,sans-serif;color:#0E2340;max-width:600px;margin:0 auto;padding:24px;background:#FAF7F0;">
          <h2 style="font-family:Georgia,serif;border-bottom:3px solid #C5A059;padding-bottom:10px;">It's on the way, ${escapeHtml(first)}!</h2>
          <p>Order <strong>${escapeHtml(order.orderNumber)}</strong> shipped${order.tracking.carrier ? ` with ${escapeHtml(order.tracking.carrier)}` : ""}.</p>
          ${order.tracking.number ? `<p>Tracking number: <strong>${escapeHtml(order.tracking.number)}</strong></p>` : ""}${track}
          <p>Questions? Just reply to this email.</p>
          <p><img src="https://www.grownfolkscollective.com/email/gfc-logo.png" width="90" alt="Grown Folks Collective" style="display:block;width:90px;border-radius:50%;"></p>
          <p style="font-family:Georgia,serif;font-style:italic;color:#9A7630;">Where grown folks come out to play.™</p></div>`,
      }).catch((e) => console.error("Shipping email failed:", e.message));
    }
  }
  await order.save();
  res.json({ ok: true });
}));

/* -------------------------------------------------------
   Stripe webhook handler for shop payments.
   Called from POST /api/events/webhook/stripe when metadata.shopKind is set.
------------------------------------------------------- */
export const handleShopSession = async (session) => {
  const m = session.metadata || {};
  if (m.shopKind === "pass" || m.shopKind === "gift") {
    const cards = await createCardsFromSession(session);
    if (!cards) return { duplicate: true };
    try {
      await deliverNewCards(cards);
    } catch (err) {
      console.error("Gift card emails failed:", err.message);
    }
    return { cards: cards.length };
  }
  if (m.shopKind === "merch") {
    const d = session.customer_details || {};
    const ship = session.shipping_details || session.collected_information?.shipping_details || {};
    const addr = ship.address || {};
    const catalog = await getMerch();
    const items = [];
    for (let i = 0; i < Number(m.lineCount || 0); i++) {
      if (!m[`m_${i}`]) continue;
      const l = JSON.parse(m[`m_${i}`]);
      const found = findVariant(catalog, l.v);
      items.push({
        productId: l.i || found?.item.id || "",
        variantId: String(l.v || ""),
        name: found?.item.name || "Merch item",
        size: found?.variant.size || "",
        color: found?.variant.color || "",
        quantity: l.q,
        priceCents: l.p,
        printful: found?.variant.name || "",
      });
    }
    // Karaoke Bingo cards bought in the same checkout ("id:paidCents,...")
    const cardLines = String(m.digital || "")
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const [id, cents] = pair.split(":");
        const product = findDigital(id);
        return product ? { product, paidCents: Number(cents) || comboPrice(product.priceCents) } : null;
      })
      .filter(Boolean);
    const cardsTotal = cardLines.reduce((s, c) => s + c.paidCents, 0);

    let order;
    try {
      order = await MerchOrder.create({
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : "",
        buyerName: d.name || ship.name || "",
        buyerEmail: d.email || "",
        buyerPhone: d.phone || "",
        shipping: {
          name: ship.name || d.name || "",
          line1: addr.line1 || "",
          line2: addr.line2 || "",
          city: addr.city || "",
          state: addr.state || "",
          postalCode: addr.postal_code || "",
          country: addr.country || "US",
        },
        items,
        subtotalCents: items.reduce((s, i) => s + i.priceCents * i.quantity, 0),
        shippingCents: Number(m.shippingCents) || 0,
        totalPaidCents: Math.max(0, (session.amount_total || 0) - cardsTotal),
        source: m.source || "",
        status: "paid",
      });
    } catch (err) {
      if (err?.code === 11000) return { duplicate: true };
      throw err;
    }
    await sendToPrintful(order);
    if (cardLines.length) {
      await createDigitalOrder(session, cardLines, { totalPaidCents: cardsTotal, withTicketCode: false, withMerch: order.orderNumber });
    }
    const tc = await makeTicketCode(order.orderNumber);
    if (tc) {
      order.ticketCode = tc.code;
      await order.save();
    }
    if (resend) {
      const list = order.items
        .map((i) => `<li>${escapeHtml(i.name)}${i.size ? ` · ${escapeHtml(i.size)}` : ""}${i.color ? ` · ${escapeHtml(i.color)}` : ""} × ${i.quantity}</li>`)
        .join("");
      const first = (order.buyerName || "").split(" ")[0] || "friend";
      const printfulLine = order.printfulOrderId
        ? `<p>✅ Saved in Printful as draft #${escapeHtml(order.printfulOrderId)}. <strong>Open Printful → Orders and click Confirm</strong> to send it to production.</p>`
        : `<p>⚠️ This order did NOT reach Printful (${escapeHtml(order.printfulError || "unknown error")}). Open the dashboard → Gifts &amp; merch and tap "Send to Printful", or place it by hand.</p>`;
      await Promise.all([
        order.buyerEmail &&
          resend.emails
            .send({
              from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
              to: order.buyerEmail,
              reply_to: TEAM_EMAIL,
              subject: `Your Grown Folks™ order (${order.orderNumber})`,
              html: `<div style="font-family:Arial,sans-serif;color:#0E2340;max-width:600px;margin:0 auto;padding:24px;background:#FAF7F0;">
                <h2 style="font-family:Georgia,serif;border-bottom:3px solid #C5A059;padding-bottom:10px;">Thanks for your order, ${escapeHtml(first)}!</h2>
                <p>Order <strong>${escapeHtml(order.orderNumber)}</strong></p><ul>${list}</ul>
                <p>Total paid: <strong>${money(order.totalPaidCents)}</strong></p>
                <p>${escapeHtml(MERCH_SETTINGS.shipNote)} We'll email your tracking number when it ships.</p>
                ${cardLines.length ? `<p>🎤 Your Karaoke Bingo cards (${COMBO_PERCENT}% off with your merch) come in a separate email with your download link.</p>` : ""}
                ${ticketCodeHtml(tc)}
                <p>Questions? Just reply to this email.</p>
                <p><img src="https://www.grownfolkscollective.com/email/gfc-logo.png" width="90" alt="Grown Folks Collective" style="display:block;width:90px;border-radius:50%;"></p>
                <p style="font-family:Georgia,serif;font-style:italic;color:#9A7630;">Where grown folks come out to play.™</p></div>`,
            })
            .catch((e) => console.error("Merch buyer email failed:", e.message)),
        resend.emails
          .send({
            from: "GFC Shop <noreply@grownfolkscollective.com>",
            to: TEAM_EMAIL,
            subject: `🛍️ Merch order: ${order.buyerName || "New buyer"} (${money(order.totalPaidCents)})${order.printfulOrderId ? "" : " ⚠️ not in Printful"}`,
            html: `<div style="font-family:Arial,sans-serif;color:#0E2340;"><h2>🛍️ New merch order ${escapeHtml(order.orderNumber)}</h2><ul>${list}</ul>
              <p>${escapeHtml(order.shipping.name)}<br/>${escapeHtml(order.shipping.line1)} ${escapeHtml(order.shipping.line2)}<br/>${escapeHtml(order.shipping.city)}, ${escapeHtml(order.shipping.state)} ${escapeHtml(order.shipping.postalCode)}</p>${printfulLine}</div>`,
          })
          .catch((e) => console.error("Merch team email failed:", e.message)),
      ]);
    }
    return { merch: order.orderNumber };
  }
  if (m.shopKind === "digital") {
    const products = String(m.items || "").split(",").map(findDigital).filter(Boolean);
    const order = await createDigitalOrder(session, products.map((p) => ({ product: p, paidCents: p.priceCents })), {
      totalPaidCents: session.amount_total || 0,
      withTicketCode: true,
    });
    return order ? { digital: order.orderNumber } : { duplicate: true };
  }
  return { ignored: true };
};

/* -------------------------------------------------------
   Admin: /api/shop/admin/...
------------------------------------------------------- */
const admin = [protect, restrictTo("admin")];

router.get("/admin/cards", ...admin, wrap(async (req, res) => {
  const cards = await GiftCard.find({}).sort({ createdAt: -1 }).limit(1000).lean();
  const sold = cards.filter((c) => c.paidCents > 0);
  res.json({
    cards,
    totals: {
      soldCents: sold.reduce((s, c) => s + c.paidCents, 0),
      passes: cards.filter((c) => c.kind === "pass").length,
      giftCards: cards.filter((c) => c.kind === "gift").length,
      outstandingCents: cards.filter((c) => c.kind !== "pass" && c.status === "active").reduce((s, c) => s + c.balanceCents, 0),
      ticketsLeftOnPasses: cards.filter((c) => c.kind === "pass" && c.status === "active").reduce((s, c) => s + c.usesLeft, 0),
    },
  });
}));

// Make a comp card (prize, partner, make-good)
router.post("/admin/cards", ...admin, wrap(async (req, res) => {
  const b = req.body || {};
  const kind = b.kind === "pass" ? "pass" : "gift";
  const email = clean(b.recipientEmail, 200).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: "That email doesn't look right." });
  let card;
  if (kind === "pass") {
    const uses = Math.min(10, Math.max(1, Math.floor(Number(b.uses) || 1)));
    card = await GiftCard.create({
      code: makeCode("pass"), kind, productId: "comp", label: `Holiday Pass: ${uses} ${uses === 1 ? "Night" : "Nights"}`,
      initialUses: uses, usesLeft: uses, maxCoverCents: PASS_RULES.maxCoverCents, expiresAt: new Date(PASS_RULES.expires),
      recipientName: clean(b.recipientName, 80), recipientEmail: email, createdBy: "admin", message: clean(b.note, 400),
    });
  } else {
    const cents = Math.round(Number(b.amount) * 100);
    if (!cents || cents < 100 || cents > 50000) return res.status(400).json({ error: "Enter an amount from $1 to $500." });
    card = await GiftCard.create({
      code: makeCode("gift"), kind, productId: "comp", label: `${money(cents)} Gift Card`,
      initialCents: cents, balanceCents: cents, recipientName: clean(b.recipientName, 80), recipientEmail: email,
      createdBy: "admin", message: clean(b.note, 400),
    });
  }
  if (email && b.sendNow) await sendCardToRecipient(card);
  res.status(201).json(card);
}));

router.post("/admin/cards/:id/resend", ...admin, wrap(async (req, res) => {
  const card = await GiftCard.findById(req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found." });
  if (!card.recipientEmail) return res.status(400).json({ error: "This card has no email to send to." });
  await sendCardToRecipient(card);
  res.json({ ok: true });
}));

router.patch("/admin/cards/:id", ...admin, wrap(async (req, res) => {
  const set = {};
  if (["active", "void"].includes(req.body?.status)) set.status = req.body.status;
  const card = await GiftCard.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
  if (!card) return res.status(404).json({ error: "Card not found." });
  res.json(card);
}));

router.get("/admin/merch-orders", ...admin, wrap(async (req, res) => {
  const orders = await MerchOrder.find({}).sort({ createdAt: -1 }).limit(1000).lean();
  res.json({ orders, merch: await merchStatus() });
}));

// Try again to save an order in Printful as a draft
router.post("/admin/merch-orders/:id/printful", ...admin, wrap(async (req, res) => {
  const order = await MerchOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.printfulOrderId) return res.status(400).json({ error: "This order is already in Printful." });
  await sendToPrintful(order);
  if (!order.printfulOrderId) return res.status(502).json({ error: `Printful said: ${order.printfulError}` });
  res.json(order);
}));

// Check the Printful connection and turn on shipping updates (tracking emails)
router.post("/admin/printful/connect", ...admin, wrap(async (req, res) => {
  if (!printfulReady()) return res.status(400).json({ error: "Add PRINTFUL_API_KEY in Railway first, then try again." });
  const store = await storeInfo();
  const base = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
  await registerWebhook(`${base.replace(/\/$/, "")}/api/shop/printful/webhook/${webhookKey()}`);
  const status = await merchStatus();
  res.json({ ok: true, store, ...status });
}));

router.patch("/admin/merch-orders/:id", ...admin, wrap(async (req, res) => {
  const set = {};
  if (["paid", "draft", "preorder", "ordered", "shipped", "cancelled"].includes(req.body?.status)) set.status = req.body.status;
  if (typeof req.body?.adminNotes === "string") set.adminNotes = req.body.adminNotes.slice(0, 1000);
  const order = await MerchOrder.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json(order);
}));

// GET /api/shop/admin/digital-orders/:orderNumber/evidence
// { text }: a plain-text summary to paste into a Stripe dispute: what they agreed to, what they got, when they downloaded.
router.get("/admin/digital-orders/:orderNumber/evidence", ...admin, wrap(async (req, res) => {
  const order = await DigitalOrder.findOne({ orderNumber: String(req.params.orderNumber).toUpperCase() }).lean();
  if (!order) return res.status(404).json({ error: "Order not found." });
  const et = (d) => (d ? new Date(d).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET" : "not recorded");
  const lines = [
    `Order ${order.orderNumber}: digital download (printable Karaoke Bingo PDFs), delivered instantly by private link and email.`,
    `Buyer: ${order.buyerName || "(no name)"} <${order.buyerEmail}>. Paid ${money(order.totalPaidCents)} on ${et(order.createdAt)}.`,
    `Stripe session: ${order.stripeSessionId}${order.stripePaymentIntentId ? `, payment ${order.stripePaymentIntentId}` : ""}.`,
    `Items: ${order.items.map((i) => i.name).join("; ")}.`,
    `Before paying, the buyer checked a required box: "I understand Karaoke Bingo downloads are non-refundable. My files are delivered right after checkout." Agreed ${et(order.noRefundAgreedAt)}${order.noRefundAgreedIp ? ` from IP ${order.noRefundAgreedIp}` : ""}. Policy: grownfolkscollective.com/refund-policy`,
    `Files downloaded ${order.downloads} time(s).`,
    ...(order.downloadLog || []).map((d) => `  ${et(d.at)}  ${d.file}  IP ${d.ip || "?"}  ${d.userAgent ? `(${d.userAgent.slice(0, 120)})` : ""}`),
  ];
  res.json({ orderNumber: order.orderNumber, text: lines.join("\n") });
}));

router.get("/admin/digital-orders", ...admin, wrap(async (req, res) => {
  const orders = await DigitalOrder.find({}).sort({ createdAt: -1 }).limit(1000).lean();
  res.json({ orders, totalCents: orders.filter((o) => o.status === "paid").reduce((s, o) => s + o.totalPaidCents, 0) });
}));

export default router;
