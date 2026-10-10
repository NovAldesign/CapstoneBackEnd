import express from "express";
import mongoose from "mongoose";
import ArtistApplication from "../models/artistApplicationSchema.js";
import Event from "../models/eventSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import PromoCode from "../models/promoCodeSchema.js";
import DiscountPartner from "../models/discountPartnerSchema.js";
import Partnership from "../models/partnershipSchema.js";
import HostingInquiry from "../models/hostingInquirySchema.js";
import GroupBooking from "../models/groupBookingSchema.js";
import Contact from "../models/contactSchema.js";
import Review from "../models/reviewSchema.js";
import SelectApplication from "../models/selectApplicationSchema.js";
import Subscriber from "../models/subscriberSchema.js";
import Membership from "../models/membershipSchema.js";
import { PROMO_CODES, normalizeCode, describePromo, isLive } from "../utilities/promoCodes.js";
import { approveApplication, declineApplication } from "./artistRoutes.js";
import GuestEntry, { GUEST_SOURCES } from "../models/guestEntrySchema.js";
import { buildGuestList, setCheckIn, doorKey, clearEventbriteCache } from "../utilities/guestList.js";

// ── Admin dashboard API: /api/admin-hub (admin login required, see server.js) ──
const router = express.Router();

const PAY_PER_TICKET = 15; // dollars per ticket sold with an artist's or host's code
const PAY_CAP = 75;
const MUSIC_EVENT = /showcase|live music|acoustic|open mic|concert|jam session/i;
const DAY = 24 * 60 * 60 * 1000;

const isId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const soldFor = (event) => (event.ticketTypes || []).reduce((n, t) => n + (Number(t.sold) || 0), 0);
const capacityFor = (event) =>
  Number(event.capacity) || (event.ticketTypes || []).reduce((n, t) => n + (Number(t.quantity) || 0), 0);
const fullName = (doc) => [doc.firstName, doc.lastName].filter(Boolean).join(" ");

// Tickets sold per { code, eventId } from paid website orders
const codeSalesByEvent = async (codes = null) => {
  const match = { status: "paid", promoCode: { $nin: ["", null] } };
  if (codes) match.promoCode = { $in: codes };
  const rows = await TicketOrder.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $group: { _id: { code: "$promoCode", eventId: "$items.eventId" }, tickets: { $sum: "$items.quantity" } } },
  ]);
  const map = new Map();
  rows.forEach((r) => map.set(`${r._id.code}|${r._id.eventId}`, r.tickets));
  return map;
};

/* =======================================================
   TODAY: everything waiting on you
======================================================= */
router.get("/inbox", async (req, res) => {
  try {
    const now = new Date();
    const [
      artists, perks, partners, hosting, groups, messages, reviews, select, newSubscribers, pendingMembers, upcoming,
    ] = await Promise.all([
      ArtistApplication.find({ status: "pending" }).sort({ createdAt: -1 }).limit(25)
        .select("role artistName firstName lastName eventName createdAt").lean(),
      DiscountPartner.find({ status: "pending" }).sort({ createdAt: -1 }).limit(25)
        .select("businessName offer createdAt").lean(),
      Partnership.find({ status: "pending" }).sort({ createdAt: -1 }).limit(25)
        .select("companyName tierRequested createdAt").lean(),
      HostingInquiry.find({ status: "new" }).sort({ createdAt: -1 }).limit(25)
        .select("firstName lastName organization guestCount preferredDate createdAt").lean(),
      GroupBooking.find({ status: "new" }).sort({ createdAt: -1 }).limit(25)
        .select("firstName lastName occasion groupSize eventTitle createdAt").lean(),
      Contact.find({ status: "unread" }).sort({ createdAt: -1 }).limit(25)
        .select("firstName lastName reason createdAt").lean(),
      Review.find({ status: "pending" }).sort({ createdAt: -1 }).limit(25)
        .select("name rating createdAt").lean(),
      SelectApplication.countDocuments({ status: "new" }),
      Subscriber.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * DAY) } }),
      Membership.countDocuments({ status: "pending" }),
      Event.find({ status: "published", date: { $gte: now } }).sort({ date: 1 }).limit(6)
        .select("name date capacity ticketTypes").lean(),
    ]);

    const items = [
      ...artists.map((a) => ({
        type: a.role === "host" ? "host" : "artist",
        tab: "showcases",
        id: String(a._id),
        title: a.artistName,
        detail: `${a.role === "host" ? "Wants to host" : "Wants to perform"} · ${a.eventName || "Any showcase"}`,
        createdAt: a.createdAt,
      })),
      ...perks.map((p) => ({ type: "perk", tab: "perks", id: String(p._id), title: p.businessName, detail: p.offer, createdAt: p.createdAt })),
      ...partners.map((p) => ({ type: "partner", tab: "partners", id: String(p._id), title: p.companyName, detail: `${p.tierRequested || "Partnership"} inquiry`, createdAt: p.createdAt })),
      ...hosting.map((h) => ({
        type: "hosting", tab: "private", id: String(h._id),
        title: h.organization || fullName(h),
        detail: `Private event · ${h.guestCount || "?"} guests${h.preferredDate ? ` · ${h.preferredDate}` : ""}`,
        createdAt: h.createdAt,
      })),
      ...groups.map((g) => ({
        type: "group", tab: "groups", id: String(g._id), title: fullName(g),
        detail: `${g.occasion || "Group"} · party of ${g.groupSize || "?"}${g.eventTitle ? ` · ${g.eventTitle}` : ""}`,
        createdAt: g.createdAt,
      })),
      ...messages.map((m) => ({ type: "message", tab: "messages", id: String(m._id), title: fullName(m), detail: m.reason || "Message", createdAt: m.createdAt })),
      ...reviews.map((r) => ({ type: "review", tab: "reviews", id: String(r._id), title: r.name, detail: `${r.rating}★ review waiting for approval`, createdAt: r.createdAt })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      counts: {
        artists: artists.filter((a) => a.role !== "host").length,
        hosts: artists.filter((a) => a.role === "host").length,
        perks: perks.length,
        partners: partners.length,
        hosting: hosting.length,
        groups: groups.length,
        messages: messages.length,
        reviews: reviews.length,
        select,
        pendingMembers,
        newSubscribers,
      },
      items,
      upcoming: upcoming.map((e) => ({
        id: String(e._id),
        name: e.name,
        date: e.date,
        sold: soldFor(e),
        capacity: capacityFor(e),
      })),
    });
  } catch (err) {
    console.error("Admin inbox error:", err.message);
    res.status(500).json({ error: "Couldn't load your inbox." });
  }
});

/* =======================================================
   SHOWCASES: lineups, approvals, ticket sales by code, payouts
======================================================= */
router.get("/showcases", async (req, res) => {
  try {
    const since = new Date(Date.now() - 45 * DAY);
    const events = (await Event.find({ status: { $ne: "cancelled" }, date: { $gte: since } })
      .sort({ date: 1 })
      .select("name date capacity ticketTypes status eventbriteId")
      .lean()).filter((e) => MUSIC_EVENT.test(e.name || ""));
    // Showcases with website ticket orders (a copy with none can be removed)
    const ordered = new Set((await TicketOrder.distinct("items.eventId", { status: "paid" })).map(String));

    const apps = await ArtistApplication.find({ status: { $in: ["pending", "approved"] } })
      .sort({ createdAt: 1 })
      .select("-reviewToken")
      .lean();
    const codes = apps.map((a) => a.promoCode).filter(Boolean);
    const sales = await codeSalesByEvent(codes.length ? codes : ["__none__"]);

    const person = (a) => {
      const tickets = a.promoCode && a.eventId ? sales.get(`${a.promoCode}|${a.eventId}`) || 0 : 0;
      return {
        id: String(a._id),
        role: a.role || "artist",
        status: a.status,
        artistName: a.artistName,
        name: fullName(a),
        email: a.email,
        phone: a.phone,
        genres: a.genres,
        bio: a.bio,
        headshotUrl: a.headshotUrl,
        instagram: a.instagram,
        tiktok: a.tiktok,
        links: a.performanceLinks || [],
        eventId: a.eventId,
        eventName: a.eventName,
        equipmentNotes: a.equipmentNotes,
        needsPower: a.needsPower,
        payoutMethod: a.payoutMethod,
        payoutHandle: a.payoutHandle,
        featureConsent: a.featureConsent,
        code: a.promoCode,
        tickets,
        owed: Math.min(PAY_CAP, tickets * PAY_PER_TICKET),
        payoutPaidAt: a.payoutPaidAt,
        payoutAmount: a.payoutAmount,
        bookingEmailSentAt: a.bookingEmailSentAt,
        adminNotes: a.adminNotes,
        createdAt: a.createdAt,
      };
    };

    const eventIds = new Set(events.map((e) => String(e._id)));
    res.json({
      payPerTicket: PAY_PER_TICKET,
      payCap: PAY_CAP,
      showcases: events.map((e) => {
        const id = String(e._id);
        const booked = apps.filter((a) => a.status === "approved" && String(a.eventId) === id).map(person);
        return {
          id,
          name: e.name,
          date: e.date,
          past: new Date(e.date) < new Date(),
          sold: soldFor(e),
          capacity: capacityFor(e),
          eventbrite: Boolean(e.eventbriteId),
          // Empty copy (no tickets, nobody booked or applied): safe to remove
          removable: soldFor(e) === 0 && !ordered.has(id) && !apps.some((a) => String(a.eventId) === id),
          artists: booked.filter((p) => p.role !== "host"),
          hosts: booked.filter((p) => p.role === "host"),
          applicants: apps.filter((a) => a.status === "pending" && String(a.eventId) === id).map(person),
        };
      }),
      // Pending applications that picked "any showcase" or an event not listed above
      unassigned: apps.filter((a) => a.status === "pending" && !eventIds.has(String(a.eventId))).map(person),
    });
  } catch (err) {
    console.error("Admin showcases error:", err.message);
    res.status(500).json({ error: "Couldn't load showcases." });
  }
});

// Remove an empty duplicate showcase (sets it to cancelled so it disappears everywhere)
router.post("/showcases/:id/remove", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Not found." });
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Not found." });
    const id = String(event._id);
    const hasPeople = await ArtistApplication.exists({ eventId: id, status: { $in: ["pending", "approved"] } });
    const hasOrders = await TicketOrder.exists({ "items.eventId": id, status: "paid" });
    if (soldFor(event) > 0 || hasPeople || hasOrders) {
      return res.status(400).json({ error: "This showcase has tickets or performers, so it can't be removed here." });
    }
    event.status = "cancelled";
    await event.save({ validateBeforeSave: false });
    res.json({ ok: true });
  } catch (err) {
    console.error("Remove showcase error:", err.message);
    res.status(500).json({ error: "Couldn't remove it." });
  }
});

const findApplication = async (id) => (isId(id) ? ArtistApplication.findById(id) : null);

router.post("/applications/:id/approve", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: "Application not found." });
    const result = await approveApplication(application, {
      eventId: req.body?.eventId,
      code: req.body?.code,
      sendEmail: req.body?.sendEmail !== false,
    });
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
    res.json({ ok: true, code: result.code, link: result.link, emailNote: result.emailNote, emailSent: result.emailSent });
  } catch (err) {
    console.error("Admin approve error:", err.message);
    res.status(500).json({ error: "Couldn't approve. Please try again." });
  }
});

router.post("/applications/:id/decline", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: "Application not found." });
    await declineApplication(application);
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin decline error:", err.message);
    res.status(500).json({ error: "Couldn't decline. Please try again." });
  }
});

// Mark a payout paid (or undo), and save private notes
router.patch("/applications/:id", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: "Application not found." });
    const b = req.body || {};
    if (typeof b.paid === "boolean") {
      application.payoutPaidAt = b.paid ? new Date() : null;
      application.payoutAmount = b.paid ? Math.max(0, Math.min(1000, Number(b.amount) || 0)) : 0;
    }
    if (typeof b.adminNotes === "string") application.adminNotes = clean(b.adminNotes, 1000);
    // Fix typos in what shows on the event page (Meet the Artists)
    if (typeof b.bio === "string") application.bio = clean(b.bio, 600);
    await application.save();
    res.json({ ok: true, payoutPaidAt: application.payoutPaidAt, payoutAmount: application.payoutAmount, adminNotes: application.adminNotes, bio: application.bio });
  } catch (err) {
    console.error("Admin application update error:", err.message);
    res.status(500).json({ error: "Couldn't save. Please try again." });
  }
});

/* =======================================================
   DISCOUNT CODES: create, edit, pause (no coding needed)
======================================================= */
const TYPES = ["tracking", "percent", "amount"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// Usage per code: paid orders and tickets
const codeUsage = async () => {
  const rows = await TicketOrder.aggregate([
    { $match: { status: "paid", promoCode: { $nin: ["", null] } } },
    {
      $group: {
        _id: "$promoCode",
        orders: { $sum: 1 },
        tickets: { $sum: { $sum: "$items.quantity" } },
        lastUsed: { $max: "$createdAt" },
      },
    },
  ]);
  const map = new Map();
  rows.forEach((r) => map.set(r._id, r));
  return map;
};

const shapeCode = (p, usage, { builtIn = false } = {}) => {
  const code = normalizeCode(p.code);
  const u = usage.get(code) || {};
  return {
    code,
    label: p.label || "",
    type: p.type || "tracking",
    value: Number(p.value) || 0,
    eventIds: (p.eventIds || []).map(String),
    events: p.events || [],
    eventsOnOrBefore: p.eventsOnOrBefore || "",
    expires: p.expires || "",
    active: p.active !== false,
    live: isLive(p),
    oncePerOrder: Boolean(p.oncePerOrder),
    firstTimeOnly: Boolean(p.firstTimeOnly),
    collectEmail: Boolean(p.collectEmail),
    maxUses: Number(p.maxUses) || 0,
    source: builtIn ? "built-in" : p.source || "manual",
    builtIn,
    notes: p.notes || "",
    description: describePromo(p),
    orders: u.orders || 0,
    tickets: u.tickets || 0,
    lastUsed: u.lastUsed || null,
    createdAt: p.createdAt || null,
  };
};

router.get("/codes", async (req, res) => {
  try {
    const [saved, usage] = await Promise.all([PromoCode.find().sort({ createdAt: -1 }).lean(), codeUsage()]);
    const savedNames = new Set(saved.map((p) => normalizeCode(p.code)));
    const builtIn = PROMO_CODES.filter((p) => !savedNames.has(normalizeCode(p.code)));
    res.json({
      codes: [
        ...saved.map((p) => shapeCode(p, usage)),
        ...builtIn.map((p) => shapeCode(p, usage, { builtIn: true })),
      ],
    });
  } catch (err) {
    console.error("Admin codes error:", err.message);
    res.status(500).json({ error: "Couldn't load codes." });
  }
});

// Turn the form into a safe update
const readCode = (b = {}) => {
  const out = {};
  if (b.label !== undefined) out.label = clean(b.label, 120);
  if (b.type !== undefined) {
    if (!TYPES.includes(b.type)) return { error: "Pick a code type." };
    out.type = b.type;
  }
  if (b.value !== undefined) {
    const v = Number(b.value);
    if (!Number.isFinite(v) || v < 0) return { error: "The discount needs to be a number." };
    out.value = v;
  }
  if (out.type === "percent" && out.value > 100) return { error: "A percent discount can't be more than 100%." };
  if (out.type === "amount" && out.value > 500) return { error: "That dollar discount looks too high." };
  if (b.eventIds !== undefined) {
    out.eventIds = (Array.isArray(b.eventIds) ? b.eventIds : []).map(String).filter(isId).slice(0, 50);
    out.events = []; // dashboard codes use exact events
  }
  if (b.expires !== undefined) {
    if (b.expires && !YMD.test(b.expires)) return { error: "The end date doesn't look right." };
    out.expires = b.expires || null;
  }
  if (b.eventsOnOrBefore !== undefined) {
    if (b.eventsOnOrBefore && !YMD.test(b.eventsOnOrBefore)) return { error: "The event date limit doesn't look right." };
    out.eventsOnOrBefore = b.eventsOnOrBefore || null;
  }
  ["active", "oncePerOrder", "firstTimeOnly", "collectEmail"].forEach((k) => {
    if (b[k] !== undefined) out[k] = Boolean(b[k]);
  });
  if (b.maxUses !== undefined) {
    const m = Math.floor(Number(b.maxUses) || 0);
    if (m < 0 || m > 100000) return { error: "The use limit doesn't look right." };
    out.maxUses = m;
  }
  if (b.notes !== undefined) out.notes = clean(b.notes, 500);
  // Free tickets need the buyer's email
  if (out.type === "percent" && out.value >= 100) out.collectEmail = true;
  return { data: out };
};

router.post("/codes", async (req, res) => {
  try {
    const code = normalizeCode(req.body?.code);
    if (code.length < 3 || code.length > 20) return res.status(400).json({ error: "Codes need 3–20 letters or numbers." });
    const taken =
      (await PromoCode.exists({ code })) ||
      (PROMO_CODES.some((p) => normalizeCode(p.code) === code) && !req.body?.takeOver);
    if (taken) return res.status(409).json({ error: `${code} already exists. Pick another name.` });

    const { data, error } = readCode({ type: "amount", value: 0, ...req.body });
    if (error) return res.status(400).json({ error });
    if (data.type !== "tracking" && !(data.value > 0)) return res.status(400).json({ error: "Add how much the discount is." });

    const saved = await PromoCode.create({ ...data, code, source: "manual" });
    res.status(201).json({ code: shapeCode(saved.toObject(), await codeUsage()) });
  } catch (err) {
    console.error("Admin create code error:", err.message);
    res.status(500).json({ error: "Couldn't save the code." });
  }
});

// Move a built-in code (from utilities/promoCodes.js) into the dashboard so it can be edited
router.post("/codes/:code/take-over", async (req, res) => {
  try {
    const code = normalizeCode(req.params.code);
    const fromFile = PROMO_CODES.find((p) => normalizeCode(p.code) === code);
    if (!fromFile) return res.status(404).json({ error: "That built-in code wasn't found." });
    if (await PromoCode.exists({ code })) return res.status(409).json({ error: "It's already in the dashboard." });
    const { code: _ignore, ...rest } = fromFile;
    const saved = await PromoCode.create({ ...rest, code, source: "manual" });
    res.status(201).json({ code: shapeCode(saved.toObject(), await codeUsage()) });
  } catch (err) {
    console.error("Admin take over code error:", err.message);
    res.status(500).json({ error: "Couldn't move the code." });
  }
});

router.patch("/codes/:code", async (req, res) => {
  try {
    const code = normalizeCode(req.params.code);
    const promo = await PromoCode.findOne({ code });
    if (!promo) return res.status(404).json({ error: "Code not found. Built-in codes need to be moved to the dashboard first." });
    const { data, error } = readCode({ type: promo.type, value: promo.value, ...req.body });
    if (error) return res.status(400).json({ error });
    Object.assign(promo, data);
    await promo.save();
    res.json({ code: shapeCode(promo.toObject(), await codeUsage()) });
  } catch (err) {
    console.error("Admin update code error:", err.message);
    res.status(500).json({ error: "Couldn't save the code." });
  }
});

// Delete only codes nobody has used (otherwise pause them, so the sales history keeps its label)
router.delete("/codes/:code", async (req, res) => {
  try {
    const code = normalizeCode(req.params.code);
    const promo = await PromoCode.findOne({ code });
    if (!promo) return res.status(404).json({ error: "Code not found." });
    if (await TicketOrder.exists({ promoCode: code })) {
      return res.status(409).json({ error: "This code has been used, so it can't be deleted. Pause it instead." });
    }
    await promo.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete code error:", err.message);
    res.status(500).json({ error: "Couldn't delete the code." });
  }
});

/* =======================================================
   PARTNERSHIPS, PRIVATE EVENTS, GROUPS, MESSAGES, SUBSCRIBERS
   One list + update pattern for each inbox.
======================================================= */
const INBOXES = {
  partners: {
    model: Partnership,
    statuses: ["pending", "contacted", "accepted", "active", "declined", "expired"],
  },
  private: {
    model: HostingInquiry,
    statuses: ["new", "contacted", "quoted", "booked", "closed"],
  },
  groups: {
    model: GroupBooking,
    statuses: ["new", "contacted", "confirmed", "closed"],
  },
  messages: {
    model: Contact,
    statuses: ["unread", "read", "archived"],
  },
};

router.get("/list/:kind", async (req, res) => {
  try {
    const box = INBOXES[req.params.kind];
    if (!box) return res.status(404).json({ error: "Unknown list." });
    const items = await box.model.find().sort({ createdAt: -1 }).limit(500).select("-portal.loginTokenHash -portal.loginTokenExpires").lean();
    res.json({ statuses: box.statuses, items });
  } catch (err) {
    console.error("Admin list error:", err.message);
    res.status(500).json({ error: "Couldn't load the list." });
  }
});

router.patch("/list/:kind/:id", async (req, res) => {
  try {
    const box = INBOXES[req.params.kind];
    if (!box || !isId(req.params.id)) return res.status(404).json({ error: "Not found." });
    const update = {};
    if (req.body?.status !== undefined) {
      if (!box.statuses.includes(req.body.status)) return res.status(400).json({ error: "Pick a valid status." });
      update.status = req.body.status;
    }
    if (typeof req.body?.adminNotes === "string" && req.params.kind !== "messages") update.adminNotes = clean(req.body.adminNotes, 2000);
    const item = await box.model.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select("-portal.loginTokenHash -portal.loginTokenExpires").lean();
    if (!item) return res.status(404).json({ error: "Not found." });
    res.json({ item });
  } catch (err) {
    console.error("Admin list update error:", err.message);
    res.status(500).json({ error: "Couldn't save." });
  }
});

router.get("/subscribers", async (req, res) => {
  try {
    const items = await Subscriber.find().sort({ createdAt: -1 }).limit(5000).lean();
    res.json({ items });
  } catch (err) {
    console.error("Admin subscribers error:", err.message);
    res.status(500).json({ error: "Couldn't load subscribers." });
  }
});

/* =======================================================
   GUEST LISTS + CHECK-IN (every ticket, from every place it was sold)
======================================================= */
const SITE = process.env.FRONTEND_URL || "https://www.grownfolkscollective.com";
const doorUrl = (eventId) => `${SITE.replace(/\/$/, "")}/checkin/${eventId}?key=${doorKey(String(eventId))}`;

// Events for the Guest lists tab
router.get("/events", async (req, res) => {
  try {
    const past = req.query.when === "past";
    const now = new Date();
    const dayAgo = new Date(Date.now() - DAY);
    const query = past
      ? { status: { $ne: "cancelled" }, date: { $lt: dayAgo, $gte: new Date(Date.now() - 180 * DAY) } }
      : { status: { $ne: "cancelled" }, date: { $gte: dayAgo } };
    const events = await Event.find(query).sort({ date: past ? -1 : 1 }).limit(60)
      .select("name date capacity ticketTypes status eventbriteId location").lean();
    res.json({
      now,
      events: events.map((e) => ({
        id: String(e._id),
        name: e.name,
        date: e.date,
        status: e.status,
        sold: soldFor(e),
        capacity: capacityFor(e),
        eventbrite: Boolean(e.eventbriteId),
        location: e.location?.name || "",
      })),
    });
  } catch (err) {
    console.error("Admin events error:", err.message);
    res.status(500).json({ error: "Couldn't load events." });
  }
});

const findEvent = async (id) =>
  isId(id) ? Event.findById(id).select("name date endDate location eventbriteId capacity ticketTypes").lean() : null;

router.get("/events/:id/guests", async (req, res) => {
  try {
    const event = await findEvent(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found." });
    if (req.query.refresh) clearEventbriteCache(event.eventbriteId);
    const list = await buildGuestList(event);
    res.json({
      event: { id: String(event._id), name: event.name, date: event.date, location: event.location?.name || "", capacity: capacityFor(event) },
      ...list,
      doorUrl: doorUrl(event._id),
      sources: GUEST_SOURCES,
    });
  } catch (err) {
    console.error("Admin guest list error:", err.message);
    res.status(500).json({ error: "Couldn't load the guest list." });
  }
});

router.post("/events/:id/checkin", async (req, res) => {
  try {
    const event = await findEvent(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found." });
    const key = String(req.body?.key || "").slice(0, 120);
    if (!/^(web|eb|guest):/.test(key)) return res.status(400).json({ error: "Unknown guest." });
    const saved = await setCheckIn(event._id, key, req.body?.count, "admin");
    res.json({ ok: true, key, count: saved.count, lastAt: saved.lastAt });
  } catch (err) {
    console.error("Admin check-in error:", err.message);
    res.status(500).json({ error: "Check-in didn't save." });
  }
});

// Add a guest by hand (Posh, Eventnoire, comps, walk-ins)
router.post("/events/:id/guests", async (req, res) => {
  try {
    const event = await findEvent(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found." });
    const b = req.body || {};
    const name = clean(b.name, 120);
    if (!name) return res.status(400).json({ error: "Add their name." });
    const guest = await GuestEntry.create({
      eventId: String(event._id),
      name,
      email: clean(b.email, 120).toLowerCase(),
      phone: clean(b.phone, 30),
      quantity: Math.min(50, Math.max(1, Math.floor(Number(b.quantity) || 1))),
      source: GUEST_SOURCES.includes(b.source) ? b.source : "other",
      amountPaidCents: Math.max(0, Math.round((Number(b.amountPaid) || 0) * 100)),
      notes: clean(b.notes, 500),
      addedBy: "admin",
    });
    res.status(201).json({ ok: true, id: String(guest._id) });
  } catch (err) {
    console.error("Admin add guest error:", err.message);
    res.status(500).json({ error: "Couldn't add the guest." });
  }
});

router.delete("/events/:id/guests/:guestId", async (req, res) => {
  try {
    if (!isId(req.params.guestId)) return res.status(404).json({ error: "Guest not found." });
    await GuestEntry.deleteOne({ _id: req.params.guestId, eventId: String(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete guest error:", err.message);
    res.status(500).json({ error: "Couldn't remove the guest." });
  }
});

/* =======================================================
   REPORTS: tickets, revenue, attendance and where tickets came from
======================================================= */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// Run a few at a time so Eventbrite isn't flooded
const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
};

router.get("/reports", async (req, res) => {
  try {
    const from = YMD_RE.test(req.query.from || "") ? new Date(`${req.query.from}T00:00:00-04:00`) : new Date(Date.now() - 30 * DAY);
    const to = YMD_RE.test(req.query.to || "") ? new Date(`${req.query.to}T23:59:59-04:00`) : new Date();
    const events = await Event.find({ status: { $ne: "cancelled" }, date: { $gte: from, $lte: to } })
      .sort({ date: 1 }).limit(60)
      .select("name date capacity ticketTypes eventbriteId").lean();

    const now = Date.now();
    const rows = await mapLimit(events, 4, async (e) => {
      const list = await buildGuestList(e);
      const past = new Date(e.date).getTime() < now;
      return {
        id: String(e._id),
        name: e.name,
        date: e.date,
        past,
        capacity: capacityFor(e),
        tickets: list.totals.tickets,
        checkedIn: list.totals.checkedIn,
        paidCents: list.totals.paidCents,
        bySource: list.totals.bySource,
        eventbriteError: list.eventbrite.ok ? "" : list.eventbrite.error,
        websiteTags: list.guests.filter((g) => g.source === "website")
          .reduce((m, g) => { const t = g.sourceDetail || "direct"; m[t] = (m[t] || 0) + g.tickets; return m; }, {}),
        codes: list.guests.filter((g) => g.code)
          .reduce((m, g) => { m[g.code] = (m[g.code] || 0) + g.tickets; return m; }, {}),
      };
    });

    const sum = (fn) => rows.reduce((n, r) => n + fn(r), 0);
    const merge = (key) => rows.reduce((m, r) => {
      Object.entries(r[key]).forEach(([k, v]) => {
        if (typeof v === "number") m[k] = (m[k] || 0) + v;
        else {
          const t = (m[k] ||= { tickets: 0, checkedIn: 0, paidCents: 0, orders: 0 });
          Object.keys(t).forEach((f) => { t[f] += v[f] || 0; });
        }
      });
      return m;
    }, {});

    // Attendance only counts past events where you used check-in
    const tracked = rows.filter((r) => r.past && r.checkedIn > 0);
    res.json({
      from, to,
      totals: {
        events: rows.length,
        tickets: sum((r) => r.tickets),
        paidCents: sum((r) => r.paidCents),
        trackedEvents: tracked.length,
        trackedTickets: tracked.reduce((n, r) => n + r.tickets, 0),
        trackedCheckedIn: tracked.reduce((n, r) => n + r.checkedIn, 0),
      },
      bySource: merge("bySource"),
      websiteTags: merge("websiteTags"),
      codes: merge("codes"),
      events: rows,
    });
  } catch (err) {
    console.error("Admin reports error:", err.message);
    res.status(500).json({ error: "Couldn't build the report." });
  }
});

export default router;
