import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import Event from "../models/eventSchema.js";
import GuestEntry from "../models/guestEntrySchema.js";
import { buildGuestList, setCheckIn, doorKeyValid, doorOpen } from "../utilities/guestList.js";

// ── Door check-in for volunteers: /api/door/:eventId?key=... (no login, signed key per event) ──
const router = express.Router();
const DOOR_SOURCES = ["door", "posh", "eventnoire", "meetup", "comp", "partner", "other"];

router.use(rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));

const loadEvent = async (req, res) => {
  const { eventId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(eventId) || !doorKeyValid(eventId, req.query.key)) {
    res.status(403).json({ error: "This check-in link isn't valid. Ask Vaughn for a new one." });
    return null;
  }
  const event = await Event.findById(eventId).select("name date endDate location eventbriteId").lean();
  if (!event) {
    res.status(404).json({ error: "Event not found." });
    return null;
  }
  if (!doorOpen(event)) {
    res.status(403).json({ error: "This check-in link only works from 2 days before the event until the day after." });
    return null;
  }
  return event;
};

// Volunteers see names, ticket counts and where each ticket came from (no emails, phones or prices)
const doorGuest = (g) => ({
  key: g.key,
  name: g.name,
  tickets: g.tickets,
  ticketName: g.ticketName,
  source: g.source,
  sourceDetail: g.sourceDetail,
  code: g.code,
  confirmation: g.confirmation,
  checkedIn: g.checkedIn,
  checkedInAt: g.checkedInAt,
  manual: Boolean(g.manual),
});

router.get("/:eventId", async (req, res) => {
  try {
    const event = await loadEvent(req, res);
    if (!event) return;
    const list = await buildGuestList(event);
    res.json({
      event: { id: String(event._id), name: event.name, date: event.date, location: event.location?.name || "" },
      guests: list.guests.map(doorGuest),
      totals: { tickets: list.totals.tickets, checkedIn: list.totals.checkedIn, bySource: list.totals.bySource },
      eventbrite: list.eventbrite,
      door: true,
    });
  } catch (err) {
    console.error("Door list error:", err.message);
    res.status(500).json({ error: "Couldn't load the guest list. Pull down to try again." });
  }
});

router.post("/:eventId/checkin", async (req, res) => {
  try {
    const event = await loadEvent(req, res);
    if (!event) return;
    const key = String(req.body?.key || "").slice(0, 120);
    if (!/^(web|eb|guest):/.test(key)) return res.status(400).json({ error: "Unknown guest." });
    const saved = await setCheckIn(event._id, key, req.body?.count, "door");
    res.json({ ok: true, key, count: saved.count, lastAt: saved.lastAt });
  } catch (err) {
    console.error("Door check-in error:", err.message);
    res.status(500).json({ error: "Check-in didn't save. Try again." });
  }
});

router.post("/:eventId/walkin", async (req, res) => {
  try {
    const event = await loadEvent(req, res);
    if (!event) return;
    const name = String(req.body?.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Add their name." });
    const quantity = Math.min(20, Math.max(1, Math.floor(Number(req.body?.quantity) || 1)));
    const source = DOOR_SOURCES.includes(req.body?.source) ? req.body.source : "door";
    const guest = await GuestEntry.create({
      eventId: String(event._id),
      name,
      phone: String(req.body?.phone || "").trim().slice(0, 30),
      quantity,
      source,
      amountPaidCents: Math.max(0, Math.round((Number(req.body?.amountPaid) || 0) * 100)),
      addedBy: "door",
    });
    // Walk-ins are here, so check them in right away
    if (req.body?.checkIn !== false) await setCheckIn(event._id, `guest:${guest._id}`, quantity, "door");
    res.status(201).json({ ok: true, key: `guest:${guest._id}` });
  } catch (err) {
    console.error("Door walk-in error:", err.message);
    res.status(500).json({ error: "Couldn't add them. Try again." });
  }
});

export default router;
