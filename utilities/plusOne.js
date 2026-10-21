import { memberPriceCents, isFoodEvent } from "./memberCredit.js";

// -------------------------------------------------------
// "Plus One" deal: buy 2, save $8
// Made on Eventbrite as its own ticket type with "Plus One" in the name
// (e.g. "Plus One General Admission"), priced at 2 tickets minus $8.
// One Plus One purchase = 2 guests on the door list and in artist credit.
// Rules (website checkout):
//   - No codes, no multi-event bundle discount in an order with a Plus One.
//     Artist/tracking codes still count toward the performer's sales.
//   - Members get whichever is cheaper: the Plus One price, or 2 tickets at their member price.
//   - Gift cards, Holiday Passes and member event credit still work (they're payment, not discounts).
//   - Not sold for food events.
// MUST match src/Services/memberPricing.js on the frontend.
// -------------------------------------------------------
export const PLUS_ONE_SAVE_CENTS = 800;
export const PLUS_ONE_GUESTS = 2;

export const isPlusOne = (ticketName = "") => /plus\s*-?\s*one/i.test(String(ticketName));

// Group tickets admit more than one person: "Group of 5", "Table of 4", "Party of 6", "4-Pack".
// Group tickets follow the normal discount rules; only the head count changes.
const GROUP_PATTERNS = [
  /\b(?:group|table|party|crew|squad)\s+(?:of|for)\s+(\d{1,2})\b/i,
  /\b(\d{1,2})\s*-?\s*(?:pack|person|people|guests)\b/i,
];
export const groupSize = (ticketName = "") => {
  for (const re of GROUP_PATTERNS) {
    const m = String(ticketName).match(re);
    if (m && Number(m[1]) >= 2 && Number(m[1]) <= 50) return Number(m[1]);
  }
  return 0;
};

// People admitted by one ticket of this type
export const guestsPerTicket = (ticketName = "") =>
  isPlusOne(ticketName) ? PLUS_ONE_GUESTS : groupSize(ticketName) || 1;

// People admitted by one ticket on a saved order line (fixes older group orders saved as 1)
export const lineGuests = (item = {}) =>
  Math.max(Number(item.guests) || 1, guestsPerTicket(item.ticketName || item.ticketTypeName || ""));

// A regular ticket's price, worked out from the Plus One price
export const regularPriceFromPlusOne = (plusOneCents) =>
  Math.round((Number(plusOneCents) + PLUS_ONE_SAVE_CENTS) / PLUS_ONE_GUESTS);

// Best price for a member buying a Plus One (cents)
export const plusOneMemberCents = (tier, plusOneCents, eventName) => {
  const twoAtMemberPrice = PLUS_ONE_GUESTS * memberPriceCents(tier, regularPriceFromPlusOne(plusOneCents), eventName);
  return Math.min(Number(plusOneCents), twoAtMemberPrice);
};

export const plusOneAllowed = (eventName = "") => !isFoodEvent(eventName);
