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
export const guestsPerTicket = (ticketName = "") => (isPlusOne(ticketName) ? PLUS_ONE_GUESTS : 1);

// A regular ticket's price, worked out from the Plus One price
export const regularPriceFromPlusOne = (plusOneCents) =>
  Math.round((Number(plusOneCents) + PLUS_ONE_SAVE_CENTS) / PLUS_ONE_GUESTS);

// Best price for a member buying a Plus One (cents)
export const plusOneMemberCents = (tier, plusOneCents, eventName) => {
  const twoAtMemberPrice = PLUS_ONE_GUESTS * memberPriceCents(tier, regularPriceFromPlusOne(plusOneCents), eventName);
  return Math.min(Number(plusOneCents), twoAtMemberPrice);
};

export const plusOneAllowed = (eventName = "") => !isFoodEvent(eventName);
