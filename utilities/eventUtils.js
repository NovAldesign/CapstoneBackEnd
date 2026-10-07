// ─────────────────────────────────────────────────────────────
// eventUtils.js
// Shared helpers for the Events list page and the Event Detail page:
// loading + merging Eventbrite data, pricing, categories, links.
// ─────────────────────────────────────────────────────────────
import { fetchGfcEvents } from "./eventService";

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  "https://capstonebackend-production-87ed.up.railway.app";

export const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=800";

// ── TEXT HELPERS ─────────────────────────────────────────────
export const stripHtml = (html = "") => {
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
};

export const truncate = (text = "", max = 150) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max)}…`;
};

// ── LINKS ────────────────────────────────────────────────────
export const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const eventKey = (event) => event?._id || event?.eventbriteId;

// e.g. /events/grown-folks-game-night-6650f1c2a9...
export const eventPath = (event) =>
  `/events/${slugify(event?.title || event?.name || "event")}-${eventKey(event)}`;

// The id is always the last dash-separated piece of the slug
export const idFromSlug = (slug = "") => slug.split("-").pop();

export const getDirectionsUrl = (location = {}) => {
  const query = [location.name, location.address, location.city, location.state]
    .filter(Boolean)
    .join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
};

// ── PRICING ──────────────────────────────────────────────────
// Ticket names containing these words are treated as sale tickets
const SALE_RE = /early|sale|special|promo|flash|limited|discount/i;
// Ticket names containing "member" are shown as a separate member price
const MEMBER_RE = /member/i;

export const parseCleanPrice = (ticket = {}) => {
  if (ticket.priceInCents != null) return Number(ticket.priceInCents) / 100;
  if (ticket.cost?.value != null) return Number(ticket.cost.value) / 100;
  if (ticket.free) return 0;
  const rawNum = Number(ticket.price || 0);
  return rawNum > 0 && rawNum < 1 ? rawNum * 100 : rawNum;
};

export const formatMoney = (amount = 0) =>
  Number(amount) % 1 === 0 ? `$${Number(amount)}` : `$${Number(amount).toFixed(2)}`;

export const formatShortDate = (value) =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Remaining spots for one ticket type, or null if counts aren't available
export const getTierRemaining = (t = {}) => {
  const direct = t.quantityAvailable ?? t.quantity_available ?? t.remaining;
  if (direct != null) return Number(direct);
  const total = t.quantityTotal ?? t.quantity_total ?? t.capacity ?? t.quantity;
  if (total == null) return null;
  const sold = t.quantitySold ?? t.quantity_sold ?? t.sold ?? 0;
  return Math.max(0, Number(total) - Number(sold));
};

// "available" | "sold-out" | "ended" | "upcoming" | "hidden"
export const getTierStatus = (t = {}, now = new Date()) => {
  if (t.hidden || t.isHidden) return "hidden";
  const status = String(t.onSaleStatus || t.on_sale_status || "").toUpperCase();
  const start = t.salesStart || t.sales_start;
  const end = t.salesEnd || t.sales_end;
  if (status === "SOLD_OUT") return "sold-out";
  // Eventbrite's status is a snapshot from the last sync, so a passed start date wins
  if (status === "NOT_YET_ON_SALE" && !(start && new Date(start) <= now)) return "upcoming";
  if (status === "UNAVAILABLE") return "ended";
  if (start && new Date(start) > now) return "upcoming";
  if (end && new Date(end) < now) return "ended";
  const left = getTierRemaining(t);
  if (left !== null && left <= 0) return "sold-out";
  return "available";
};

export const TIER_STATUS_LABELS = {
  "sold-out": "Sold out",
  ended: "Sales ended",
  upcoming: "Not on sale yet",
};

const cheapest = (list) =>
  list.length ? [...list].sort((a, b) => parseCleanPrice(a) - parseCleanPrice(b))[0] : null;

/**
 * Turns every ticket type into ONE clean price for display.
 *  - A sale ticket that's on sale → sale price, regular price crossed out
 *  - When the sale ticket ends or sells out → regular price automatically
 *  - Several regular prices → "From $X"
 *  - Member tickets → shown separately as "Members $X"
 */
export const getPriceDisplay = (tiers = [], now = new Date()) => {
  const visible = tiers.filter((t) => getTierStatus(t, now) !== "hidden");
  if (!visible.length) return { type: "none", label: "Tickets coming soon" };

  const available = visible.filter((t) => getTierStatus(t, now) === "available");
  if (!available.length) {
    const upcoming = visible.some((t) => getTierStatus(t, now) === "upcoming");
    return upcoming
      ? { type: "upcoming", label: "Tickets on sale soon" }
      : { type: "sold-out", label: "Sold Out" };
  }

  const isMember = (t) => MEMBER_RE.test(t.name || "");
  const isSale = (t) => SALE_RE.test(t.name || "");

  const publicAvailable = available.filter((t) => !isMember(t));
  const pool = publicAvailable.length ? publicAvailable : available;
  const memberTier = publicAvailable.length ? cheapest(available.filter(isMember)) : null;
  const extras = { memberPrice: memberTier ? parseCleanPrice(memberTier) : null };

  const saleTier = cheapest(pool.filter(isSale));
  // Compare against the regular ticket even if it isn't on sale yet
  const regularRef = cheapest(visible.filter((t) => !isMember(t) && !isSale(t)));

  if (saleTier && regularRef && parseCleanPrice(saleTier) < parseCleanPrice(regularRef)) {
    return {
      type: "sale",
      price: parseCleanPrice(saleTier),
      originalPrice: parseCleanPrice(regularRef),
      badge: saleTier.name,
      endsAt: saleTier.salesEnd || saleTier.sales_end || null,
      ...extras,
    };
  }

  const prices = pool.map(parseCleanPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === 0) return { type: "free", price: 0, ...extras };
  return { type: min === max ? "single" : "from", price: min, ...extras };
};

// Total spots left across available tickets (null if unknown)
export const getSpotsLeft = (tiers = [], now = new Date()) => {
  const available = tiers.filter((t) => getTierStatus(t, now) === "available");
  if (!available.length) return null;
  const counts = available.map(getTierRemaining);
  if (counts.some((c) => c === null)) return null;
  return counts.reduce((sum, c) => sum + c, 0);
};

// ── CATEGORIES ───────────────────────────────────────────────
export const CATEGORIES = [
  { id: "game-night", label: "Game Nights", re: /game|uno|spades|trivia|bingo|domino/i },
  { id: "conversations", label: "Conversations", re: /conversation|mocktail|talk/i },
  { id: "dinners", label: "Dinners & Food", re: /dinner|brunch|bbq|cookout|lunch|food|supper/i },
  { id: "travel", label: "Travel", re: /trip|travel|getaway|retreat|cruise/i },
];
export const OTHER_CATEGORY = { id: "other", label: "Experiences" };

// Matches the eventType choices in your eventSchema.js
const EVENT_TYPE_MAP = {
  "Game Night": "game-night",
  "Spades Tournament": "game-night",
  "Luxury Bingo": "game-night",
  "Intentional Conversations Over Dinner": "dinners",
  "Group Travel": "travel",
};

export const getCategory = (event = {}) => {
  const fromType = EVENT_TYPE_MAP[event.eventType];
  if (fromType) return CATEGORIES.find((c) => c.id === fromType);
  if (event.category) {
    const match = CATEGORIES.find(
      (c) => c.id === event.category || c.label.toLowerCase() === String(event.category).toLowerCase()
    );
    if (match) return match;
  }
  const text = event.title || event.name || "";
  return CATEGORIES.find((c) => c.re.test(text)) || OTHER_CATEGORY;
};

// ── DATE FILTERS ─────────────────────────────────────────────
export const WHEN_OPTIONS = [
  { id: "all", label: "All upcoming" },
  { id: "week", label: "Next 7 days" },
  { id: "month", label: "This month" },
  { id: "next-month", label: "Next month" },
];

export const matchesWhen = (event, when, now = new Date()) => {
  if (when === "all") return true;
  const d = new Date(event.date);
  if (when === "week") return d - now <= 7 * 24 * 60 * 60 * 1000;
  if (when === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (when === "next-month") {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return d.getMonth() === next.getMonth() && d.getFullYear() === next.getFullYear();
  }
  return true;
};

// ── LOADING ──────────────────────────────────────────────────
const isPublished = (e) => e?.status?.toLowerCase() === "published";
export const isUpcoming = (e, now = new Date()) => new Date(e.endDate || e.date) >= now;

// Merges the Eventbrite asset package (image, title, description, tickets) into the event
export const enrichEvent = async (event) => {
  let ext = null;
  if (event?.eventbriteId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/events/external/${event.eventbriteId}`);
      if (res.ok) ext = await res.json();
    } catch (err) {
      console.error("Error loading Eventbrite asset package:", err);
    }
  }
  const description = ext?.description || event.description || "";
  return {
    ...event,
    title: ext?.title || event.name || "GFC Experience",
    description,
    plainDescription: stripHtml(description),
    image: ext?.image || event.coverImage || FALLBACK_IMAGE,
    tiers: event.ticketTypes?.length ? event.ticketTypes : ext?.ticketTiers || [],
  };
};

export const loadUpcomingEvents = async () => {
  const data = await fetchGfcEvents();
  const now = new Date();
  const upcoming = (Array.isArray(data) ? data : [])
    .filter((e) => e && isPublished(e) && isUpcoming(e, now))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  return Promise.all(upcoming.map(enrichEvent));
};

export const loadEventById = async (id) => {
  const data = await fetchGfcEvents();
  const match = (Array.isArray(data) ? data : []).find(
    (e) => e && isPublished(e) && (String(e._id) === id || String(e.eventbriteId) === id)
  );
  return match ? enrichEvent(match) : null;
};