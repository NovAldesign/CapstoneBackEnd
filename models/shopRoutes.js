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
  GIFT_AMOUNTS,
  giftBonusCents,
  PASS_RULES,
} from "../utilities/shopCatalog.js";
import { publicMerch, presaleOpen, findMerch, merchPrice, shippingFor } from "../utilities/merchCatalog.js";
import {
  makeCode,
  createCardsFromSession,
  deliverNewCards,
  sendCardToRecipient,
  normalizeCardCode,
  describeCard,
  money,
} from "../utilities/giftCards.js";
import { Resend } from "resend";

// -------------------------------------------------------
// /api/shop — Holiday Passes, gift cards and merch pre-orders
// -------------------------------------------------------
const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SITE = () => process.env.FRONTEND_URL || "https://grownfolkscollective.com";
const TEAM_EMAIL = "events@grownfolkscollective.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max = 120) => String(v || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const cleanSource = (v) => String(v || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40).toLowerCase();
const escapeHtml = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Delivery date: "YYYY-MM-DD" → 9 AM Eastern that day (today or past = send now)
const sendAtFrom = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return new Date();
  const d = new Date(`${ymd}T09:00:00-05:00`);
  const max = new Date(Date.now() + 366 * 86400000);
  if (Number.isNaN(d.getTime()) || d > max) return new Date();
  return d < new Date() ? new Date() : d;
};

/* GET /api/shop/catalog — passes, gift amounts, sale days, merch */
router.get("/catalog", (req, res) => {
  res.json({ ...publicCatalog(), merch: publicMerch() });
});

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
      if (!pass) return res.status(400).json({ error: "Please choose a Holiday Pass." });
      unitCents = passPrice(pass, now);
      name = `${pass.name} (Grown Folks™ Collective)`;
      description = `${pass.uses} tickets to Game Night, Karaoke Bingo or Acoustic & Infused through Mar 31, 2027.`;
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
      cancel_url: `${SITE()}/gift?cancelled=true`,
      metadata: meta,
    });
    res.status(201).json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   POST /api/shop/checkout/merch — merch pre-order
   Body: { items: [{ id, size, color, quantity }], source }
------------------------------------------------------- */
router.post("/checkout/merch", async (req, res, next) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Checkout isn't set up yet." });
    if (!presaleOpen()) return res.status(400).json({ error: "The merch pre-sale isn't open right now." });
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 20) : [];
    if (!items.length) return res.status(400).json({ error: "Your merch bag is empty." });

    const lines = [];
    for (const it of items) {
      const product = findMerch(it.id);
      if (!product) return res.status(400).json({ error: "An item in your bag isn't available anymore." });
      const qty = Math.floor(Number(it.quantity));
      if (!qty || qty < 1 || qty > 10) return res.status(400).json({ error: "Choose between 1 and 10 of each item." });
      const size = clean(it.size, 10);
      const color = clean(it.color, 30);
      if (product.sizes?.length && !product.sizes.includes(size)) return res.status(400).json({ error: `Pick a size for ${product.name}.` });
      if (product.colors?.length && !product.colors.includes(color)) return res.status(400).json({ error: `Pick a color for ${product.name}.` });
      lines.push({ id: product.id, name: product.name, size, color, qty, cents: merchPrice(product) });
    }
    const subtotal = lines.reduce((s, l) => s + l.cents * l.qty, 0);
    const shipping = shippingFor(subtotal);

    const metadata = { shopKind: "merch", source: cleanSource(req.body?.source), shippingCents: String(shipping), lineCount: String(lines.length) };
    lines.forEach((l, i) => {
      metadata[`m_${i}`] = JSON.stringify({ id: l.id, s: l.size, c: l.color, q: l.qty, p: l.cents });
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: shipping ? "Standard shipping" : "Free shipping",
            fixed_amount: { amount: shipping, currency: "usd" },
          },
        },
      ],
      line_items: lines.map((l) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${l.name}${l.size ? ` · ${l.size}` : ""}${l.color ? ` · ${l.color}` : ""}`,
            description: "Pre-order. Made to order after the pre-sale closes.",
          },
          unit_amount: l.cents,
        },
        quantity: l.qty,
      })),
      success_url: `${SITE()}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE()}/shop?cancelled=true`,
      metadata,
    });
    res.status(201).json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

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
  if (order) {
    return res.json({ type: "merch", orderNumber: order.orderNumber, items: order.items.map((i) => ({ name: i.name, size: i.size, quantity: i.quantity })) });
  }
  res.json({ type: "pending" }); // the webhook may still be on its way
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
    const items = [];
    for (let i = 0; i < Number(m.lineCount || 0); i++) {
      if (!m[`m_${i}`]) continue;
      const l = JSON.parse(m[`m_${i}`]);
      const p = findMerch(l.id);
      items.push({ productId: l.id, name: p?.name || l.id, size: l.s || "", color: l.c || "", quantity: l.q, priceCents: l.p, printful: p?.printful || "" });
    }
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
        totalPaidCents: session.amount_total || 0,
        source: m.source || "",
      });
    } catch (err) {
      if (err?.code === 11000) return { duplicate: true };
      throw err;
    }
    if (resend) {
      const list = order.items
        .map((i) => `<li>${escapeHtml(i.name)}${i.size ? ` · ${escapeHtml(i.size)}` : ""}${i.color ? ` · ${escapeHtml(i.color)}` : ""} × ${i.quantity}</li>`)
        .join("");
      const first = (order.buyerName || "").split(" ")[0] || "friend";
      await Promise.all([
        order.buyerEmail &&
          resend.emails
            .send({
              from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
              to: order.buyerEmail,
              reply_to: TEAM_EMAIL,
              subject: `🛍️ Your GFC merch pre-order (${order.orderNumber})`,
              html: `<div style="font-family:Arial,sans-serif;color:#0E2340;max-width:600px;margin:0 auto;padding:24px;background:#FAF7F0;">
                <h2 style="font-family:Georgia,serif;border-bottom:3px solid #C5A059;padding-bottom:10px;">Thanks for your pre-order, ${escapeHtml(first)}!</h2>
                <p>Order <strong>${escapeHtml(order.orderNumber)}</strong></p><ul>${list}</ul>
                <p>Total paid: <strong>${money(order.totalPaidCents)}</strong></p>
                <p>Every item is made to order after the pre-sale closes. We'll email you a tracking number when it ships.</p>
                <p>Questions? Just reply to this email.</p>
                <p style="font-family:Georgia,serif;font-style:italic;color:#9A7630;">Where grown folks come out to play.™</p></div>`,
            })
            .catch((e) => console.error("Merch buyer email failed:", e.message)),
        resend.emails
          .send({
            from: "GFC Shop <noreply@grownfolkscollective.com>",
            to: TEAM_EMAIL,
            subject: `🛍️ Merch pre-order: ${order.buyerName || "New buyer"} (${money(order.totalPaidCents)})`,
            html: `<div style="font-family:Arial,sans-serif;color:#0E2340;"><h2>🛍️ New merch pre-order ${escapeHtml(order.orderNumber)}</h2><ul>${list}</ul>
              <p>${escapeHtml(order.shipping.name)}<br/>${escapeHtml(order.shipping.line1)} ${escapeHtml(order.shipping.line2)}<br/>${escapeHtml(order.shipping.city)}, ${escapeHtml(order.shipping.state)} ${escapeHtml(order.shipping.postalCode)}</p></div>`,
          })
          .catch((e) => console.error("Merch team email failed:", e.message)),
      ]);
    }
    return { merch: order.orderNumber };
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
  res.json({ orders, merch: publicMerch() });
}));

router.patch("/admin/merch-orders/:id", ...admin, wrap(async (req, res) => {
  const set = {};
  if (["preorder", "ordered", "shipped", "cancelled"].includes(req.body?.status)) set.status = req.body.status;
  if (typeof req.body?.adminNotes === "string") set.adminNotes = req.body.adminNotes.slice(0, 1000);
  const order = await MerchOrder.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json(order);
}));

export default router;
