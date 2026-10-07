// -------------------------------------------------------
// GFC shop: Holiday Passes, gift cards and sale days.
// To change a price or a sale date, edit this file and push.
// All prices are in cents ($65 = 6500). Times are Eastern.
// -------------------------------------------------------

// Sale days
export const SALES = [
  {
    key: "blackfriday",
    label: "Black Friday",
    start: "2026-11-27T00:00:00-05:00",
    end: "2026-11-29T23:59:59-05:00", // Fri to Sun
    blurb: "Holiday Passes are on sale all weekend.",
  },
  {
    key: "cybermonday",
    label: "Cyber Monday",
    start: "2026-11-30T00:00:00-05:00",
    end: "2026-11-30T23:59:59-05:00",
    blurb: "Every $50 in gift cards comes with a $10 bonus card for you.",
  },
];

// Holiday Passes: prepaid tickets to our regular nights
export const PASSES = [
  {
    id: "pass3",
    name: "Holiday Pass: 3 Nights",
    uses: 3,
    priceCents: 6500,
    blackFridayCents: 5500,
    valueCents: 7500,
  },
  {
    id: "pass5",
    name: "Holiday Pass: 5 Nights",
    uses: 5,
    priceCents: 9900,
    blackFridayCents: 8500,
    valueCents: 12500,
  },
];

// What a pass covers
export const PASS_RULES = {
  expires: "2027-03-31T23:59:59-04:00", // good for events through Mar 31, 2027
  maxCoverCents: 3500, // covers a ticket up to $35 (more than any regular ticket)
  // Event names a pass works for (Game Night, Karaoke Bingo, Acoustic & Infused)
  include: /game night|karaoke bingo|acoustic\s*(&|and)\s*infused/i,
  // Never covered, even if the name also matches above
  exclude: /friendsgiving|holiday table|dinner|gfc select|private/i,
};

// Gift cards
export const GIFT_AMOUNTS = [2500, 5000, 7500, 10000];
export const CYBER_MONDAY_BONUS = { perCents: 5000, bonusCents: 1000 }; // $10 bonus per $50
export const BONUS_EXPIRES = "2027-03-31T23:59:59-04:00"; // promotional bonus cards expire; paid gift cards never do

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
export const activeSale = (now = new Date()) =>
  SALES.find((s) => now >= new Date(s.start) && now <= new Date(s.end)) || null;

export const nextSale = (now = new Date()) =>
  SALES.filter((s) => new Date(s.start) > now).sort((a, b) => new Date(a.start) - new Date(b.start))[0] || null;

export const findPass = (id) => PASSES.find((p) => p.id === id) || null;

// Today's price for a pass
export const passPrice = (pass, now = new Date()) =>
  activeSale(now)?.key === "blackfriday" ? pass.blackFridayCents : pass.priceCents;

// Bonus card for a gift card bought on Cyber Monday
export const giftBonusCents = (amountCents, now = new Date()) =>
  activeSale(now)?.key === "cybermonday"
    ? Math.floor(amountCents / CYBER_MONDAY_BONUS.perCents) * CYBER_MONDAY_BONUS.bonusCents
    : 0;

// Does a Holiday Pass work for this event?
export const passCoversEvent = (event, expiresAt = PASS_RULES.expires) => {
  const name = String(event?.name || event?.eventName || "");
  if (!PASS_RULES.include.test(name) || PASS_RULES.exclude.test(name)) return false;
  const date = event?.date || event?.eventDate;
  return !date || new Date(date) <= new Date(expiresAt);
};

// Public view of the catalog for the website
export const publicCatalog = (now = new Date()) => {
  const sale = activeSale(now);
  const upcoming = nextSale(now);
  return {
    sale: sale ? { key: sale.key, label: sale.label, end: sale.end, blurb: sale.blurb } : null,
    nextSale: upcoming ? { key: upcoming.key, label: upcoming.label, start: upcoming.start, blurb: upcoming.blurb } : null,
    passes: PASSES.map((p) => ({
      id: p.id,
      name: p.name,
      uses: p.uses,
      priceCents: passPrice(p, now),
      regularCents: p.priceCents,
      valueCents: p.valueCents,
      onSale: passPrice(p, now) < p.priceCents,
    })),
    passRules: { expires: PASS_RULES.expires, maxCoverCents: PASS_RULES.maxCoverCents },
    giftAmounts: GIFT_AMOUNTS.map((a) => ({ amountCents: a, bonusCents: giftBonusCents(a, now) })),
    sales: SALES.map((s) => ({ key: s.key, label: s.label, start: s.start, end: s.end, blurb: s.blurb })),
  };
};
