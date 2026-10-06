import crypto from "crypto";
import TicketOrder from "../models/ticketOrderSchema.js";
import GuestEntry from "../models/guestEntrySchema.js";
import CheckIn from "../models/checkInSchema.js";

// ── One guest list per event, from every place tickets are sold ──
//   website   = paid website orders (TicketOrder), with the ?src= tag and code they used
//   eventbrite = attendees pulled live from Eventbrite (needs EVENTBRITE_PRIVATE_TOKEN)
//   posh, eventnoire, meetup, door, comp, ... = guests added by hand (GuestEntry)

const EB_CACHE_MS = 60 * 1000;
const ebCache = new Map(); // eventbriteId -> { at, data }

// Eventbrite attendees, grouped by order (one row per buyer)
export const fetchEventbriteOrders = async (eventbriteId) => {
  const token = process.env.EVENTBRITE_PRIVATE_TOKEN;
  if (!eventbriteId) return { ok: true, orders: [] };
  if (!token) return { ok: false, error: "Eventbrite isn't connected on the server.", orders: [] };

  const cached = ebCache.get(eventbriteId);
  if (cached && Date.now() - cached.at < EB_CACHE_MS) return cached.data;

  try {
    const attendees = [];
    let page = 1;
    let more = true;
    while (more && page <= 20) {
      const res = await fetch(
        `https://www.eventbriteapi.com/v3/events/${encodeURIComponent(eventbriteId)}/attendees/?page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Eventbrite answered ${res.status}`);
      const body = await res.json();
      attendees.push(...(body.attendees || []));
      more = Boolean(body.pagination?.has_more_items);
      page += 1;
    }

    const byOrder = new Map();
    attendees
      .filter((a) => !a.cancelled && !a.refunded && a.status !== "Not Attending")
      .forEach((a) => {
        const id = String(a.order_id || a.id);
        const o = byOrder.get(id) || {
          orderId: id,
          name: a.profile?.name || [a.profile?.first_name, a.profile?.last_name].filter(Boolean).join(" "),
          email: a.profile?.email || "",
          phone: a.profile?.cell_phone || "",
          tickets: 0,
          ticketNames: new Set(),
          paidCents: 0,
          boughtAt: a.created,
        };
        o.tickets += Number(a.quantity) || 1;
        if (a.ticket_class_name) o.ticketNames.add(a.ticket_class_name);
        o.paidCents += Number(a.costs?.gross?.value) || 0;
        byOrder.set(id, o);
      });

    const data = {
      ok: true,
      orders: [...byOrder.values()].map((o) => ({ ...o, ticketNames: [...o.ticketNames].join(", ") })),
    };
    ebCache.set(eventbriteId, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error("Eventbrite attendees error:", err.message);
    return { ok: false, error: "Couldn't reach Eventbrite right now. Showing website and added guests.", orders: [] };
  }
};

export const clearEventbriteCache = (eventbriteId) => ebCache.delete(eventbriteId);

// The whole guest list for one event
export const buildGuestList = async (event, { includeEventbrite = true } = {}) => {
  const eventId = String(event._id);
  const [orders, manual, checkIns, eb] = await Promise.all([
    TicketOrder.find({ status: "paid", "items.eventId": eventId }).sort({ createdAt: 1 }).lean(),
    GuestEntry.find({ eventId }).sort({ createdAt: 1 }).lean(),
    CheckIn.find({ eventId }).lean(),
    includeEventbrite ? fetchEventbriteOrders(event.eventbriteId) : Promise.resolve({ ok: true, orders: [] }),
  ]);
  const checked = new Map(checkIns.map((c) => [c.key, c]));

  const guests = [];
  orders.forEach((o) => {
    (o.items || []).forEach((item, i) => {
      if (String(item.eventId) !== eventId) return;
      const key = `web:${o._id}:${i}`;
      guests.push({
        key,
        name: o.buyerName || o.buyerEmail || "Website guest",
        email: o.buyerEmail || "",
        phone: o.buyerPhone || "",
        tickets: Number(item.quantity) || 1,
        ticketName: item.ticketName || "",
        paidCents: (Number(item.pricePaidEachCents) || 0) * (Number(item.quantity) || 1),
        source: "website",
        sourceDetail: o.source || "",
        code: o.promoCode || "",
        confirmation: o.confirmationCode || "",
        boughtAt: o.createdAt,
      });
    });
  });
  eb.orders.forEach((o) => {
    guests.push({
      key: `eb:${o.orderId}`,
      name: o.name || o.email || "Eventbrite guest",
      email: o.email,
      phone: o.phone,
      tickets: o.tickets,
      ticketName: o.ticketNames,
      paidCents: o.paidCents,
      source: "eventbrite",
      sourceDetail: "",
      code: "",
      confirmation: `EB ${o.orderId}`,
      boughtAt: o.boughtAt,
    });
  });
  manual.forEach((g) => {
    guests.push({
      key: `guest:${g._id}`,
      id: String(g._id),
      name: g.name,
      email: g.email,
      phone: g.phone,
      tickets: g.quantity,
      ticketName: "",
      paidCents: g.amountPaidCents || 0,
      source: g.source,
      sourceDetail: "",
      code: "",
      confirmation: "",
      notes: g.notes,
      boughtAt: g.createdAt,
      manual: true,
    });
  });

  guests.forEach((g) => {
    const c = checked.get(g.key);
    g.checkedIn = Math.min(g.tickets, c?.count || 0);
    g.checkedInAt = c?.lastAt || null;
  });
  guests.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const bySource = {};
  guests.forEach((g) => {
    const s = (bySource[g.source] ||= { tickets: 0, checkedIn: 0, paidCents: 0, orders: 0 });
    s.tickets += g.tickets;
    s.checkedIn += g.checkedIn;
    s.paidCents += g.paidCents;
    s.orders += 1;
  });

  return {
    guests,
    totals: {
      tickets: guests.reduce((n, g) => n + g.tickets, 0),
      checkedIn: guests.reduce((n, g) => n + g.checkedIn, 0),
      paidCents: guests.reduce((n, g) => n + g.paidCents, 0),
      orders: guests.length,
      bySource,
    },
    eventbrite: { connected: Boolean(event.eventbriteId), ok: eb.ok, error: eb.error || "" },
  };
};

// Check in (or undo) tickets for one guest. count = total checked in for that guest.
export const setCheckIn = async (eventId, key, count, by) => {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return CheckIn.findOneAndUpdate(
    { eventId: String(eventId), key: String(key) },
    { $set: { count: n, lastAt: n > 0 ? new Date() : null, by } },
    { upsert: true, new: true }
  ).lean();
};

/* ── Door link: a signed key per event, so a volunteer can check people in without your login ── */
const doorSecret = () => process.env.DOOR_SECRET || process.env.JWT_SECRET || "gfc-door";

export const doorKey = (eventId) =>
  crypto.createHmac("sha256", doorSecret()).update(`door:${eventId}`).digest("hex").slice(0, 20);

export const doorKeyValid = (eventId, key) => {
  const expected = doorKey(eventId);
  const given = String(key || "");
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

// The door link works from 2 days before the event until the day after it
export const doorOpen = (event) => {
  const t = new Date(event.date).getTime();
  const now = Date.now();
  return now >= t - 2 * 86400000 && now <= t + 36 * 3600000;
};
