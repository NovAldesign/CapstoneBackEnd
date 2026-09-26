// =======================================================
// GFC TICKET CODES
// To add a code: copy one line in PROMO_CODES, change it, and push.
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
  { code: "ARTISTA", label: "Showcase artist A, Oct 30", type: "tracking", value: 0, events: ["acoustic"], active: true, expires: "2026-10-30" },
];

const normalize = (code = "") => String(code).trim().toUpperCase().replace(/\s+/g, "");

// Returns the code if it exists, is on, and hasn't expired
export const findPromoCode = (code) => {
  const wanted = normalize(code);
  if (!wanted) return null;
  const promo = PROMO_CODES.find((p) => normalize(p.code) === wanted);
  if (!promo || !promo.active) return null;
  if (promo.expires) {
    const lastDay = new Date(`${promo.expires}T23:59:59-05:00`);
    if (new Date() > lastDay) return null;
  }
  return promo;
};

// Does this code work for this event?
export const promoAppliesToEvent = (promo, event) => {
  if (!promo) return false;
  if (!promo.events || promo.events.length === 0) return true;
  const name = String(event?.name || event?.title || "").toLowerCase();
  const id = String(event?._id || "");
  return promo.events.some((word) => {
    const w = String(word).toLowerCase();
    return w === id.toLowerCase() || name.includes(w);
  });
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