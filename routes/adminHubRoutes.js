import express from "express";
import LinkClick from "../models/linkClickSchema.js";
import crypto from "crypto";
import mongoose from "mongoose";
import ArtistApplication from "../models/artistApplicationSchema.js";
import Event from "../models/eventSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import CodeCredit from "../models/codeCreditSchema.js";
import { guestsPerTicket } from "../utilities/plusOne.js";
import { sendOrderEmails } from "../utilities/ticketOrders.js";
import PromoCode from "../models/promoCodeSchema.js";
import DiscountPartner from "../models/discountPartnerSchema.js";
import Partnership from "../models/partnershipSchema.js";
import HostingInquiry from "../models/hostingInquirySchema.js";
import GroupBooking from "../models/groupBookingSchema.js";
import Contact from "../models/contactSchema.js";
import Review from "../models/reviewSchema.js";
import SelectApplication from "../models/selectApplicationSchema.js";
import Subscriber from "../models/subscriberSchema.js";
import Scout from "../models/scoutSchema.js";
import Membership from "../models/membershipSchema.js";
import CrmProfile from "../models/crmProfileSchema.js";
import { PROMO_CODES, normalizeCode, describePromo, isLive, codeExists } from "../utilities/promoCodes.js";
import { approveApplication, declineApplication } from "./artistRoutes.js";
import GuestEntry, { GUEST_SOURCES } from "../models/guestEntrySchema.js";
import { buildGuestList, setCheckIn, doorKey, clearEventbriteCache } from "../utilities/guestList.js";
import {
  PLATFORMS, MAX_OPTIONS, MAX_QUESTIONS, TIME_ZONE,
  newLiveToken, liveLink, parseEtLocal, toEtLocal, fmtLiveWhen, defaultQuestions, sendLiveConfirmation, sendLiveInvite,
} from "../utilities/liveSetup.js";
import { socialHandle } from "./artistRoutes.js";

// ── Admin dashboard API: /api/admin-hub (admin login required, see server.js) ──
const router = express.Router();

const PAY_PER_TICKET = 15; // dollars per ticket sold with an artist's or host's code
const PAY_CAP = 75;
const MUSIC_EVENT = /showcase|live music|acoustic|open mic|concert|jam session/i;
const DAY = 24 * 60 * 60 * 1000;

const isId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
// Counted in people: a "Group of 5" ticket is 5, a Plus One is 2
const soldFor = (event) => (event.ticketTypes || []).reduce((n, t) => n + (Number(t.sold) || 0) * guestsPerTicket(t.name), 0);
const capacityFor = (event) =>
  Number(event.capacity) || (event.ticketTypes || []).reduce((n, t) => n + (Number(t.quantity) || 0) * guestsPerTicket(t.name), 0);
const fullName = (doc) => [doc.firstName, doc.lastName].filter(Boolean).join(" ");

// Tickets sold per { code, eventId } from paid website orders
const codeSalesByEvent = async (codes = null) => {
  const match = { status: "paid", promoCode: { $nin: ["", null] } };
  if (codes) match.promoCode = { $in: codes };
  const rows = await TicketOrder.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $group: { _id: { code: "$promoCode", eventId: "$items.eventId" }, tickets: { $sum: { $multiply: ["$items.quantity", { $ifNull: ["$items.guests", 1] }] } } } },
  ]);
  const map = new Map();
  rows.forEach((r) => map.set(`${r._id.code}|${r._id.eventId}`, r.tickets));
  // Plus tickets credited by hand (Eventbrite, Posh, door) from the guest list
  const credits = await CodeCredit.find(codes ? { code: { $in: codes } } : {}).lean();
  credits.forEach((c) => {
    const k = `${c.code}|${c.eventId}`;
    map.set(k, (map.get(k) || 0) + c.tickets);
  });
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
        detail: `${a.role === "host" ? "Wants to host" : a.role === "visual" ? "Wants to create live art" : "Wants to perform"} · ${a.eventName || "Any showcase"}`,
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

    const todaysLives = await livesToday().catch(() => []);
    res.json({
      livesToday: todaysLives,
      counts: {
        livesToday: todaysLives.length,
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
// Roster: people saved for later, plus everyone who has performed or hosted before.
// Nothing here is deleted, so you can book them again.
const buildRoster = async (apps, person) => {
  const saved = await ArtistApplication.find({ status: "roster" })
    .sort({ rosteredAt: -1 })
    .select("-reviewToken")
    .lean();

  const approved = apps.filter((a) => a.status === "approved" && isId(a.eventId));
  const events = await Event.find({ _id: { $in: [...new Set(approved.map((a) => a.eventId))] } })
    .select("name date status")
    .lean();
  const byId = new Map(events.map((e) => [String(e._id), e]));
  const now = new Date();

  // One row per person (same email + role), newest show first
  const groups = new Map();
  for (const a of approved) {
    const e = byId.get(String(a.eventId));
    if (!e || e.status === "cancelled") continue;
    const key = `${String(a.email || "").toLowerCase()}|${a.role || "artist"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ a, e });
  }
  const past = [];
  for (const rows of groups.values()) {
    const pastRows = rows.filter(({ e }) => new Date(e.date) < now).sort((x, y) => new Date(y.e.date) - new Date(x.e.date));
    if (!pastRows.length) continue;
    const next = rows.filter(({ e }) => new Date(e.date) >= now).sort((x, y) => new Date(x.e.date) - new Date(y.e.date))[0];
    past.push({
      ...person(pastRows[0].a),
      shows: pastRows.map(({ e }) => ({ name: e.name, date: e.date })),
      bookedNext: next ? { name: next.e.name, date: next.e.date } : null,
    });
  }
  past.sort((x, y) => new Date(y.shows[0].date) - new Date(x.shows[0].date));

  return { saved: saved.map(person), past };
};

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
        galleryHidden: Boolean(a.galleryHidden),
        code: a.promoCode,
        tickets,
        owed: Math.min(PAY_CAP, tickets * PAY_PER_TICKET),
        payoutPaidAt: a.payoutPaidAt,
        payoutAmount: a.payoutAmount,
        bookingEmailSentAt: a.bookingEmailSentAt,
        adminNotes: a.adminNotes,
        rosterNote: a.rosterNote || "",
        rosteredAt: a.rosteredAt,
        history: (a.history || []).map((h) => ({ eventName: h.eventName, note: h.note, at: h.at })),
        hasLive: Boolean(a.live?.status),
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
          artists: booked.filter((p) => p.role !== "host" && p.role !== "visual"),
          hosts: booked.filter((p) => p.role === "host"),
          visuals: booked.filter((p) => p.role === "visual"),
          applicants: apps.filter((a) => a.status === "pending" && String(a.eventId) === id).map(person),
        };
      }),
      // Pending applications that picked "any showcase" or an event not listed above
      unassigned: apps.filter((a) => a.status === "pending" && !eventIds.has(String(a.eventId))).map(person),
      roster: await buildRoster(apps, person),
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

// Move someone off a show to the Roster (saved for later). Keeps everything they sent.
router.post("/applications/:id/roster", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: "Application not found." });
    if (!["pending", "approved"].includes(application.status)) {
      return res.status(400).json({ error: "Only booked or new applications can be moved to the roster." });
    }
    const event = isId(application.eventId)
      ? await Event.findById(application.eventId).select("name date").lean()
      : null;
    if (application.status === "approved" && event && new Date(event.date) < new Date()) {
      return res.status(400).json({ error: "That show already happened. They're already on the Roster under Performed before." });
    }
    const note = clean(req.body?.note, 300);
    const oldEventId = String(application.eventId || "");

    if (application.status === "approved" && oldEventId) {
      application.history.push({ eventId: oldEventId, eventName: application.eventName || event?.name || "", note });
      // Their ticket code for that show stops working (sales so far stay on record)
      await PromoCode.updateMany({ artistId: String(application._id), eventIds: oldEventId }, { active: false });
      application.promoCode = "";
      application.bookingEmailSentAt = null;
    }
    // Their Live was for that show, so take it off the schedule (details are kept)
    if (req.body?.cancelLive !== false && application.live?.status) application.live.status = "";

    application.status = "roster";
    application.rosterNote = note;
    application.rosteredAt = new Date();
    application.eventId = "";
    application.eventName = "";
    await application.save();
    res.json({ ok: true });
  } catch (err) {
    console.error("Roster move error:", err.message);
    res.status(500).json({ error: "Couldn't move them to the roster. Please try again." });
  }
});

// Book someone who already performed: make a new booking so their past show stays in their history
const copyForRebooking = async (application) => {
  const src = application.toObject();
  for (const k of ["_id", "__v", "createdAt", "updatedAt", "live", "history", "promoCode", "bookingEmailSentAt",
    "payoutPaidAt", "payoutAmount", "reviewedAt", "rosterNote", "rosteredAt"]) delete src[k];
  return new ArtistApplication({ ...src, status: "pending", reviewToken: crypto.randomBytes(24).toString("hex") });
};

router.post("/applications/:id/approve", async (req, res) => {
  try {
    let application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: "Application not found." });
    if (application.status === "approved" && isId(application.eventId)) {
      const current = await Event.findById(application.eventId).select("date").lean();
      if (current && new Date(current.date) < new Date()) application = await copyForRebooking(application);
    }
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
    // Display name on the event page, emails and gallery (can't be blank)
    if (typeof b.artistName === "string") {
      const name = clean(b.artistName, 80);
      if (!name) return res.status(400).json({ error: "Name can't be blank." });
      application.artistName = name;
    }
    // Show or hide them in the "On Our Stage" gallery on the Perform pages
    if (typeof b.galleryHidden === "boolean") application.galleryHidden = b.galleryHidden;
    await application.save();
    res.json({ ok: true, payoutPaidAt: application.payoutPaidAt, payoutAmount: application.payoutAmount, adminNotes: application.adminNotes, bio: application.bio, artistName: application.artistName, galleryHidden: application.galleryHidden });
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
        // Plus One tickets count as 2
        tickets: { $sum: { $sum: { $map: { input: "$items", as: "i", in: { $multiply: ["$$i.quantity", { $ifNull: ["$$i.guests", 1] }] } } } } },
        lastUsed: { $max: "$createdAt" },
      },
    },
  ]);
  const map = new Map();
  rows.forEach((r) => map.set(r._id, r));
  // Tickets credited by hand from the guest list
  const credits = await CodeCredit.aggregate([{ $group: { _id: "$code", tickets: { $sum: "$tickets" }, orders: { $sum: 1 }, lastUsed: { $max: "$createdAt" } } }]);
  credits.forEach((c) => {
    const r = map.get(c._id) || { _id: c._id, orders: 0, tickets: 0, lastUsed: null };
    map.set(c._id, { ...r, orders: r.orders + c.orders, tickets: r.tickets + c.tickets, lastUsed: r.lastUsed && r.lastUsed > c.lastUsed ? r.lastUsed : c.lastUsed });
  });
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
    const [saved, usage] = await Promise.all([PromoCode.find({ source: { $nin: ["thankyou", "winback", "referral", "reward", "addon"] } }).sort({ createdAt: -1 }).lean(), codeUsage()]);
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

// Industry scouts (from /scouts), with the showcases they're on the list for
router.get("/scouts", async (req, res) => {
  try {
    const items = await Scout.find().sort({ createdAt: -1 }).limit(5000).lean();
    const ids = [...new Set(items.flatMap((s) => s.eventIds || []))].filter(isId);
    const events = await Event.find({ _id: { $in: ids } }).select("name date").lean();
    const byId = new Map(events.map((e) => [String(e._id), { id: String(e._id), name: e.name, date: e.date }]));
    res.json({ items: items.map((s) => ({ ...s, showcases: (s.eventIds || []).map((id) => byId.get(id)).filter(Boolean) })) });
  } catch (err) {
    console.error("Admin scouts error:", err.message);
    res.status(500).json({ error: "Couldn't load scouts." });
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
      ? { status: { $nin: ["cancelled", "draft"] }, date: { $lt: dayAgo, $gte: new Date(Date.now() - 180 * DAY) } }
      : { status: { $nin: ["cancelled", "draft"] }, date: { $gte: dayAgo } };
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

// Real ticket totals (website + Eventbrite + added by hand) for the Events list
router.get("/events/totals", async (req, res) => {
  try {
    const ids = String(req.query.ids || "").split(",").filter(isId).slice(0, 80);
    if (!ids.length) return res.json({ totals: {} });
    const events = await Event.find({ _id: { $in: ids } }).select("name date eventbriteId capacity ticketTypes status").lean();
    const rows = await mapLimit(events, 4, async (e) => {
      try {
        const list = await buildGuestList(e);
        return [String(e._id), { tickets: list.totals.tickets, paidCents: list.totals.paidCents, eventbriteOk: list.eventbrite.ok !== false }];
      } catch {
        return [String(e._id), null];
      }
    });
    res.json({ totals: Object.fromEntries(rows.filter(([, v]) => v)) });
  } catch (err) {
    console.error("Admin event totals error:", err.message);
    res.status(500).json({ error: "Couldn't load ticket totals." });
  }
});

const findEvent = async (id) =>
  isId(id) ? Event.findById(id).select("name date endDate location eventbriteId capacity ticketTypes status").lean() : null;

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

// Credit a guest-list row to a performer's code (buyer forgot to enter it).
// Website orders: the order's code is changed. Eventbrite / added-by-hand guests: a credit is saved.
// Send code "" to remove the credit.
router.post("/events/:id/credit-code", async (req, res) => {
  try {
    const event = await findEvent(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found." });
    const key = clean(req.body?.key, 120);
    const raw = clean(req.body?.code, 40);
    const code = normalizeCode(raw);
    if (code && !(await codeExists(code))) return res.status(400).json({ error: `There's no code called ${raw.toUpperCase()}. Check the spelling in Codes.` });

    if (key.startsWith("web:")) {
      const orderId = key.split(":")[1];
      if (!isId(orderId)) return res.status(400).json({ error: "Unknown order." });
      const order = await TicketOrder.findById(orderId);
      if (!order) return res.status(404).json({ error: "Order not found." });
      if ((order.promoCode || "") !== code) {
        order.codeHistory.push({ from: order.promoCode || "", to: code, at: new Date(), by: "admin" });
        order.promoCode = code;
        await order.save();
      }
      return res.json({ ok: true, key, code, kind: "order" });
    }

    if (!/^(eb|guest):/.test(key)) return res.status(400).json({ error: "Unknown guest." });
    if (!code) {
      await CodeCredit.deleteOne({ key });
      return res.json({ ok: true, key, code: "", kind: "credit" });
    }
    const tickets = Math.min(50, Math.max(1, Math.floor(Number(req.body?.tickets) || 1)));
    await CodeCredit.findOneAndUpdate(
      { key },
      { eventId: String(event._id), key, code, tickets, guestName: clean(req.body?.name, 120), addedBy: "admin" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, key, code, kind: "credit" });
  } catch (err) {
    console.error("Credit code error:", err.message);
    res.status(500).json({ error: "Couldn't update the code." });
  }
});

// Send a website order's ticket email again (optionally to a different address)
router.post("/orders/:id/resend-ticket", async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Order not found." });
    const order = await TicketOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    const to = clean(req.body?.to, 120).toLowerCase();
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: "That email address doesn't look right." });
    await sendOrderEmails(order, { to });
    if (order.ticketEmailError) return res.status(502).json({ error: `The ticket email didn't send: ${order.ticketEmailError}` });
    res.json({ ok: true, sentTo: to || order.buyerEmail, sentAt: order.ticketEmailSentAt });
  } catch (err) {
    console.error("Resend ticket error:", err.message);
    res.status(500).json({ error: "Couldn't resend the ticket email." });
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

// Clicks on /go short links in a date range (e.g. how many times the pitch deck link was opened)
router.get("/link-clicks", async (req, res) => {
  try {
    const from = YMD_RE.test(req.query.from || "") ? req.query.from : new Date(Date.now() - 30 * DAY).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const to = YMD_RE.test(req.query.to || "") ? req.query.to : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const rows = await LinkClick.aggregate([
      { $match: { day: { $gte: from, $lte: to } } },
      { $group: { _id: { code: "$code", src: "$src" }, clicks: { $sum: "$count" }, lastAt: { $max: "$lastAt" } } },
      { $sort: { clicks: -1 } },
      { $limit: 100 },
    ]);
    res.json({ from, to, links: rows.map((r) => ({ code: r._id.code, src: r._id.src, clicks: r.clicks, lastAt: r.lastAt })) });
  } catch (err) {
    console.error("Link clicks error:", err.message);
    res.status(500).json({ error: "Couldn't load link clicks." });
  }
});

router.get("/reports", async (req, res) => {
  try {
    const from = YMD_RE.test(req.query.from || "") ? new Date(`${req.query.from}T00:00:00-04:00`) : new Date(Date.now() - 30 * DAY);
    const to = YMD_RE.test(req.query.to || "") ? new Date(`${req.query.to}T23:59:59-04:00`) : new Date();
    // Drafts are left out: a draft copy's buyers are counted on its published event
    const events = await Event.find({ status: { $nin: ["cancelled", "draft"] }, date: { $gte: from, $lte: to } })
      .sort({ date: 1 }).limit(60)
      .select("name date capacity ticketTypes eventbriteId status").lean();

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

/* =======================================================
   CRM: one profile per person (by email), built from every
   place they show up, plus Vaughn's notes and Brevo checkbox
======================================================= */
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CRM_TEXT = { nickname: 60, howWeMet: 200, referredBy: 120, birthday: 20, favoriteGame: 120, interests: 300, sideOfTown: 80 };
const SOURCE_LABEL = {
  ticket: "Ticket buyer", guest: "Guest list", subscriber: "Newsletter", member: "Member",
  scout: "Industry scout", artist: "Performer", contact: "Contact form",
};
const normEmail = (e) => String(e || "").trim().toLowerCase();
const profileOut = (p) => p ? {
  addedToBrevo: Boolean(p.addedToBrevo), addedToBrevoAt: p.addedToBrevoAt || null,
  nickname: p.nickname || "", howWeMet: p.howWeMet || "", referredBy: p.referredBy || "", birthday: p.birthday || "",
  favoriteGame: p.favoriteGame || "", interests: p.interests || "", sideOfTown: p.sideOfTown || "",
  tags: p.tags || [], notes: [...(p.notes || [])].sort((a, b) => new Date(b.at) - new Date(a.at)).map((n) => ({ id: String(n._id), text: n.text, at: n.at })),
} : {
  addedToBrevo: false, addedToBrevoAt: null, nickname: "", howWeMet: "", referredBy: "", birthday: "",
  favoriteGame: "", interests: "", sideOfTown: "", tags: [], notes: [],
};

const buildPeople = async () => {
  const people = new Map();
  const touch = (email, { name = "", phone = "", source, at = null, birthday = "" }) => {
    const key = normEmail(email);
    if (!EMAIL_RE.test(key)) return null;
    let p = people.get(key);
    if (!p) { p = { email: key, name: "", phone: "", sources: new Set(), events: new Map(), lastSeen: null, firstSeen: null, memberBirthday: "" }; people.set(key, p); }
    if (name && !p.name) p.name = String(name).trim();
    if (phone && !p.phone) p.phone = String(phone).trim();
    if (birthday && !p.memberBirthday) p.memberBirthday = birthday;
    if (source) p.sources.add(source);
    if (at) {
      const d = new Date(at);
      if (!p.lastSeen || d > p.lastSeen) p.lastSeen = d;
      if (!p.firstSeen || d < p.firstSeen) p.firstSeen = d;
    }
    return p;
  };
  const addEvent = (p, { id, name, date, checkedIn = false, how }) => {
    if (!p || !id) return;
    const prev = p.events.get(id);
    p.events.set(id, { id, name: name || prev?.name || "", date: date || prev?.date || null, checkedIn: Boolean(checkedIn || prev?.checkedIn), how: prev?.how || how });
  };

  const [orders, guests, subs, members, scouts, apps, contacts] = await Promise.all([
    TicketOrder.find({ status: "paid" }).select("buyerEmail buyerName buyerPhone eventId eventName eventDate items checkedIn createdAt").lean(),
    GuestEntry.find({ email: { $ne: "" } }).select("email name phone eventId source createdAt").lean(),
    Subscriber.find({}).select("email fullName phoneNumber createdAt").lean(),
    Membership.find({ isTest: { $ne: true } }).select("email firstName lastName phone dob status submittedAt").lean(),
    Scout.find({}).select("email firstName lastName phone createdAt").lean(),
    ArtistApplication.find({}).select("email firstName lastName phone eventId status createdAt").lean(),
    Contact.find({}).select("email firstName lastName phone createdAt").lean(),
  ]);

  const eventIds = new Set();
  orders.forEach((o) => { if (o.eventId) eventIds.add(String(o.eventId)); (o.items || []).forEach((i) => i.eventId && eventIds.add(String(i.eventId))); });
  guests.forEach((g) => g.eventId && eventIds.add(String(g.eventId)));
  const evs = await Event.find({ _id: { $in: [...eventIds].filter(isId) } }).select("name date").lean();
  const evById = new Map(evs.map((e) => [String(e._id), e]));

  for (const o of orders) {
    const p = touch(o.buyerEmail, { name: o.buyerName, phone: o.buyerPhone, source: "ticket", at: o.createdAt });
    const ids = new Set([o.eventId, ...(o.items || []).map((i) => i.eventId)].filter(Boolean).map(String));
    for (const id of ids) {
      const e = evById.get(id);
      addEvent(p, { id, name: e?.name || o.eventName, date: e?.date || o.eventDate, checkedIn: o.checkedIn, how: "Ticket" });
    }
  }
  for (const g of guests) {
    const p = touch(g.email, { name: g.name, phone: g.phone, source: "guest", at: g.createdAt });
    const e = evById.get(String(g.eventId));
    addEvent(p, { id: String(g.eventId), name: e?.name, date: e?.date, how: "Guest list" });
  }
  subs.forEach((s) => touch(s.email, { name: s.fullName, phone: s.phoneNumber, source: "subscriber", at: s.createdAt }));
  members.forEach((m) => touch(m.email, {
    name: fullName(m), phone: m.phone, source: "member", at: m.submittedAt,
    birthday: m.dob ? new Date(m.dob).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "",
  }));
  scouts.forEach((s) => touch(s.email, { name: fullName(s), phone: s.phone, source: "scout", at: s.createdAt }));
  apps.forEach((a) => touch(a.email, { name: fullName(a), phone: a.phone, source: "artist", at: a.createdAt }));
  contacts.forEach((c) => touch(c.email, { name: fullName(c), phone: c.phone, source: "contact", at: c.createdAt }));

  const profiles = await CrmProfile.find({}).lean();
  const byEmail = new Map(profiles.map((p) => [p.email, p]));
  // People Vaughn added notes for who aren't anywhere else (shouldn't happen, but keep them)
  for (const pr of profiles) if (!people.has(pr.email)) touch(pr.email, { at: pr.createdAt });

  return [...people.values()].map((p) => {
    const events = [...p.events.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const prof = profileOut(byEmail.get(p.email));
    return {
      email: p.email,
      name: p.name || p.email.split("@")[0],
      phone: p.phone,
      sources: [...p.sources].map((s) => SOURCE_LABEL[s] || s),
      events,
      eventCount: events.length,
      lastEvent: events.find((e) => e.date && new Date(e.date) <= new Date()) || null,
      lastSeen: p.lastSeen,
      firstSeen: p.firstSeen,
      memberBirthday: p.memberBirthday,
      ...prof,
    };
  });
};

// GET /crm/people — everyone, newest activity first
router.get("/crm/people", async (_req, res) => {
  try {
    const people = await buildPeople();
    people.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    const tags = [...new Set(people.flatMap((p) => p.tags))].sort();
    res.json({ people, tags });
  } catch (err) {
    console.error("CRM list error:", err.message);
    res.status(500).json({ error: "Couldn't load people." });
  }
});

// PATCH /crm/people/:email — edit details, tags, Brevo checkbox, add or remove a note
router.patch("/crm/people/:email", async (req, res) => {
  try {
    const email = normEmail(decodeURIComponent(req.params.email));
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "That email doesn't look right." });
    const b = req.body || {};
    const profile = (await CrmProfile.findOne({ email })) || new CrmProfile({ email });
    for (const [k, max] of Object.entries(CRM_TEXT)) if (typeof b[k] === "string") profile[k] = clean(b[k], max);
    if (Array.isArray(b.tags)) {
      profile.tags = [...new Set(b.tags.map((t) => clean(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
    }
    if (typeof b.addedToBrevo === "boolean") {
      if (b.addedToBrevo && !profile.addedToBrevo) profile.addedToBrevoAt = new Date();
      if (!b.addedToBrevo) profile.addedToBrevoAt = null;
      profile.addedToBrevo = b.addedToBrevo;
    }
    if (typeof b.addNote === "string" && b.addNote.trim()) profile.notes.push({ text: clean(b.addNote, 1000), at: new Date() });
    if (typeof b.removeNote === "string" && isId(b.removeNote)) profile.notes = profile.notes.filter((n) => String(n._id) !== b.removeNote);
    await profile.save();
    res.json({ email, ...profileOut(profile.toObject()) });
  } catch (err) {
    console.error("CRM update error:", err.message);
    res.status(500).json({ error: "Couldn't save. Please try again." });
  }
});

// POST /crm/brevo — mark many people as added (or not added) to Brevo at once
router.post("/crm/brevo", async (req, res) => {
  try {
    const emails = [...new Set((Array.isArray(req.body?.emails) ? req.body.emails : []).map(normEmail).filter((e) => EMAIL_RE.test(e)))].slice(0, 2000);
    const added = req.body?.added !== false;
    if (!emails.length) return res.status(400).json({ error: "Pick at least one person." });
    const now = new Date();
    if (added) {
      // Keep the original "added" date for anyone already marked
      const already = new Set((await CrmProfile.find({ email: { $in: emails }, addedToBrevo: true }).select("email").lean()).map((p) => p.email));
      const todo = emails.filter((e) => !already.has(e));
      if (todo.length) {
        await CrmProfile.bulkWrite(todo.map((email) => ({
          updateOne: { filter: { email }, update: { $set: { addedToBrevo: true, addedToBrevoAt: now } }, upsert: true },
        })));
      }
    } else {
      await CrmProfile.updateMany({ email: { $in: emails } }, { $set: { addedToBrevo: false, addedToBrevoAt: null } });
    }
    res.json({ ok: true, count: emails.length, added });
  } catch (err) {
    console.error("CRM Brevo bulk error:", err.message);
    res.status(500).json({ error: "Couldn't save. Please try again." });
  }
});

/* =======================================================
   LIVES: TikTok Lives with booked artists and hosts
   Set date choices + questions → copy their private link → they pick a date
   and platform and get a confirmation. On the day, the questions are here.
======================================================= */
const ymdEt = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

const livePerson = (a, event) => {
  const live = a.live || {};
  return {
    id: String(a._id),
    role: a.role || "artist",
    artistName: a.artistName,
    name: fullName(a),
    email: a.email,
    phone: a.phone,
    headshotUrl: a.headshotUrl,
    instagram: socialHandle(a.instagram),
    tiktok: socialHandle(a.tiktok),
    code: a.promoCode,
    event: event ? { id: String(event._id), name: event.name, date: event.date } : null,
    live: {
      status: live.status || "",
      link: live.token ? liveLink(a) : "",
      options: (live.options || []).map((d) => ({ value: toEtLocal(d), label: fmtLiveWhen(d) })),
      questions: live.questions || [],
      notes: live.notes || [],
      date: live.date || null,
      dateValue: toEtLocal(live.date),
      dateLabel: live.date ? fmtLiveWhen(live.date) : "",
      today: Boolean(live.date && ymdEt(live.date) === ymdEt(new Date())),
      platform: live.platform || "",
      handle: live.handle || "",
      livePhone: live.phone || "",
      plug: live.plug || "",
      extraQuestion: live.extraQuestion || "",
      customRequest: live.customRequest || "",
      invitedAt: live.invitedAt,
      confirmedAt: live.confirmedAt,
      confirmationSentAt: live.confirmationSentAt,
      inviteSentAt: live.inviteSentAt,
      completedAt: live.completedAt || null,
    },
    defaultQuestions: defaultQuestions(a, event),
  };
};

// Lives happening today (also shown on the Today tab)
const livesToday = async () => {
  const start = new Date(Date.now() - 18 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 30 * 60 * 60 * 1000);
  const apps = await ArtistApplication.find({ "live.status": "confirmed", "live.completedAt": null, "live.date": { $gte: start, $lte: end } }).lean();
  const ids = apps.map((a) => a.eventId).filter(isId);
  const events = new Map((await Event.find({ _id: { $in: ids } }).select("name date").lean()).map((e) => [String(e._id), e]));
  return apps
    .map((a) => livePerson(a, events.get(String(a.eventId))))
    .filter((p) => p.live.today)
    .sort((x, y) => new Date(x.live.date) - new Date(y.live.date));
};

router.get("/lives", async (req, res) => {
  try {
    const since = new Date(Date.now() - 2 * DAY);
    const events = (await Event.find({ status: { $ne: "cancelled" }, date: { $gte: since } })
      .sort({ date: 1 }).select("name date").lean()).filter((e) => MUSIC_EVENT.test(e.name || ""));
    const byId = new Map(events.map((e) => [String(e._id), e]));
    const apps = await ArtistApplication.find({
      status: "approved",
      $or: [{ eventId: { $in: [...byId.keys()] } }, { "live.date": { $gte: since } }, { "live.completedAt": { $gte: new Date(Date.now() - 120 * DAY) } }],
    }).lean();
    const allIds = apps.map((a) => a.eventId).filter((id) => isId(id) && !byId.has(String(id)));
    if (allIds.length) (await Event.find({ _id: { $in: allIds } }).select("name date").lean()).forEach((e) => byId.set(String(e._id), e));

    const people = apps
      .map((a) => livePerson(a, byId.get(String(a.eventId))))
      .sort((x, y) =>
        new Date(x.live.date || x.event?.date || 0) - new Date(y.live.date || y.event?.date || 0));
    res.json({ people, platforms: PLATFORMS, maxOptions: MAX_OPTIONS, maxQuestions: MAX_QUESTIONS });
  } catch (err) {
    console.error("Admin lives error:", err.message);
    res.status(500).json({ error: "Couldn't load Lives." });
  }
});

// Set up or edit a Live: date choices, questions, and (optionally) the final date + platform
router.post("/lives/:id", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application || application.status !== "approved") return res.status(404).json({ error: "Booked artist not found." });
    const b = req.body || {};
    const live = application.live;
    const now = Date.now();
    // TikTok, Instagram or Facebook. You choose it when you set the Live up; the artist's page and emails follow it.
    if (PLATFORMS[b.platform]) live.platform = b.platform;
    else if (!live.platform) live.platform = "tiktok";
    if (typeof b.handle === "string" && b.handle.trim()) live.handle = socialHandle(b.handle);

    if (Array.isArray(b.options)) {
      const options = b.options.map(parseEtLocal).filter((d) => d && d.getTime() > now).slice(0, MAX_OPTIONS);
      if (!options.length && !b.date) return res.status(400).json({ error: "Add at least one date in the future." });
      live.options = options;
    }
    if (Array.isArray(b.questions)) {
      const questions = b.questions.map((q) => clean(q, 300)).filter(Boolean).slice(0, MAX_QUESTIONS);
      if (!questions.length) return res.status(400).json({ error: "Add at least one question." });
      // Keep their notes lined up with questions that didn't change
      const oldNotes = new Map((live.questions || []).map((q, i) => [q, (live.notes || [])[i] || ""]));
      live.notes = questions.map((q) => oldNotes.get(q) || "");
      live.questions = questions;
    }

    // You set the final date yourself (they replied by email, or none of the dates worked)
    let sendEmail = false;
    if (b.date) {
      const date = parseEtLocal(b.date);
      if (!date) return res.status(400).json({ error: "That date doesn't look right." });
      const changed = !live.date || new Date(live.date).getTime() !== date.getTime();
      live.date = date;
      live.status = "confirmed";
      live.confirmedAt = live.confirmedAt || new Date();
      live.customRequest = "";
      sendEmail = b.sendConfirmation !== false && (changed || b.sendConfirmation === true);
    }

    if (!live.token) live.token = newLiveToken();
    const isNew = !live.status;
    if (!live.status) { live.status = "invited"; live.invitedAt = new Date(); }
    // New Lives email the artist their link automatically; edits only when you tick "Email them their link"
    const sendInvite = live.status === "invited" && !b.date && (b.sendInvite === true || (isNew && b.sendInvite !== false));
    await application.save();

    let inviteSent = false;
    if (sendInvite) {
      const ev = isId(application.eventId) ? await Event.findById(application.eventId).select("name date").lean() : null;
      try {
        inviteSent = await sendLiveInvite(application, ev);
        if (inviteSent) { live.inviteSentAt = new Date(); await application.save(); }
      } catch (e) {
        console.error("Admin live invite email error:", e.message);
      }
    }

    let emailSent = false;
    if (sendEmail) {
      const event = isId(application.eventId) ? await Event.findById(application.eventId).select("name date").lean() : null;
      try {
        emailSent = await sendLiveConfirmation(application, event, { updated: Boolean(live.confirmationSentAt) });
        if (emailSent) { live.confirmationSentAt = new Date(); await application.save(); }
      } catch (e) {
        console.error("Admin live confirmation email error:", e.message);
      }
    }
    const event = isId(application.eventId) ? await Event.findById(application.eventId).select("name date").lean() : null;
    res.json({ ok: true, emailSent, inviteSent, person: livePerson(application.toObject(), event) });
  } catch (err) {
    console.error("Admin live save error:", err.message);
    res.status(500).json({ error: "Couldn't save the Live. Please try again." });
  }
});

// Check a Live off as done (it moves to Archived), or undo that
router.post("/lives/:id/done", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: "Not found." });
    // Works for any booked artist, even one whose Live was done outside the dashboard (never set up here)
    if (!application.live) application.live = {};
    application.live.completedAt = req.body?.done === false ? null : new Date();
    await application.save();
    const event = isId(application.eventId) ? await Event.findById(application.eventId).select("name date").lean() : null;
    res.json({ ok: true, person: livePerson(application.toObject(), event) });
  } catch (err) {
    console.error("Admin live done error:", err.message);
    res.status(500).json({ error: "Couldn't update it. Please try again." });
  }
});

// Clear a Live (cancelled, or start over). The old link stops working.
router.delete("/lives/:id", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);
    if (!application) return res.status(404).json({ error: "Not found." });
    application.live = {};
    await application.save();
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin live clear error:", err.message);
    res.status(500).json({ error: "Couldn't clear it." });
  }
});

export default router;
