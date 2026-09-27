import PromoCode from "../models/promoCodeSchema.js";

// =======================================================
// GFC TICKET CODES
// Artist codes are now created automatically when you approve an artist.
// For other codes (partners, sales, tests): copy one line below, change it, and push.
//
//   code:     what people type (letters/numbers, no spaces)
//   label:    who it belongs to (shows in your sale alerts + report)
//   type:     "tracking" (no discount, just counts sales)
//             "percent"  (value = % off each ticket, e.g. 10)
//             "amount"   (value = dollars off each ticket, e.g. 5)
//   events:   words from the event name it works for, e.g. ["acoustic"]
//             leave [] to work for every event
//   active:   true / false (turn a code off without deleting it)
//   expires:  "YYYY-MM-DD" (last day it works) or null
// =======================================================

export const PROMO_CODES = [
  { code: "GFCTEST", label: "Test code (tracking only)", type: "tracking", value: 0, events: [], active: true, expires: null },

  // Oct 30 showcase artists (tracking only, $15 per ticket sold, up to $75)
  { code: "ARIA", label: "Artist: Aria Alicia, Oct 30 showcase", type: "tracking", value: 0, events: ["acoustic"], active: true, expires: "2026-10-30" },
];

export const normalizeCode = (code = "") =>
  String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const isLive = (promo) => {
  if (!promo || !promo.active) return false;
  if (promo.expires) {
    const lastDay = new Date(`${promo.expires}T23:59:59-05:00`);
    if (new Date() > lastDay) return false;
  }
  return true;
};

// Any code with this name, even if it's off or expired (so codes are never reused)
export const codeExists = async (code) => {
  const wanted = normalizeCode(code);
  if (!wanted) return null;
  const fromFile = PROMO_CODES.find((p) => normalizeCode(p.code) === wanted);
  if (fromFile) return fromFile;
  return PromoCode.findOne({ code: wanted }).lean();
};

// Returns the code if it exists, is on, and hasn't expired
export const findPromoCode = async (code) => {
  const promo = await codeExists(code);
  return isLive(promo) ? promo : null;
};

// Does this code work for this event?
export const promoAppliesToEvent = (promo, event) => {
  if (!promo) return false;
  const id = String(event?._id || "");
  const hasIds = Array.isArray(promo.eventIds) && promo.eventIds.length > 0;
  const hasWords = Array.isArray(promo.events) && promo.events.length > 0;
  if (!hasIds && !hasWords) return true;
  if (hasIds && promo.eventIds.map(String).includes(id)) return true;
  if (hasWords) {
    const name = String(event?.name || event?.title || "").toLowerCase();
    return promo.events.some((word) => {
      const w = String(word).toLowerCase();
      return w === id.toLowerCase() || name.includes(w);
    });
  }
  return false;
};

// Price of one ticket (in cents) after the code
export const applyPromoToCents = (promo, cents) => {
  if (!promo) return cents;
  if (promo.type === "percent") {
    return Math.max(0, Math.round(cents * (1 - Number(promo.value || 0) / 100)));
  }
  if (promo.type === "amount") {
    return Math.max(0, cents - Math.round(Number(promo.value || 0) * 100));
  }
  return cents; // tracking codes don't change the price
};

// Short description for the bag, e.g. "10% off" or "$5 off each ticket"
export const describePromo = (promo) => {
  if (!promo) return "";
  if (promo.type === "percent") return `${promo.value}% off`;
  if (promo.type === "amount") return `$${promo.value} off each ticket`;
  return "Code applied";
};

// Every code for the report (file codes + saved codes)
export const allPromoCodes = async () => {
  const saved = await PromoCode.find().sort({ createdAt: 1 }).lean();
  return [...PROMO_CODES, ...saved];
};

// Suggest a code for an artist and event, e.g. "Aria Alicia" -> ARIA.
// Reuses a code that already works for this event; otherwise finds a free one.
export const suggestArtistCode = async (artistName, event) => {
  const words = String(artistName || "").split(/\s+/).map(normalizeCode).filter(Boolean);
  const first = (words[0] || "ARTIST").slice(0, 12);
  const full = words.join("").slice(0, 14);
  const candidates = [first, full];
  for (let n = 2; n <= 20; n++) candidates.push(`${first.slice(0, 10)}${n}`);

  for (const c of candidates) {
    if (!c) continue;
    const existing = await codeExists(c);
    if (!existing) return c;
    if (isLive(existing) && promoAppliesToEvent(existing, event)) return c;
  }
  return `${first.slice(0, 8)}${Date.now().toString().slice(-4)}`;
};