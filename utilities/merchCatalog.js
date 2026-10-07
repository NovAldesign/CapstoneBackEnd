// -------------------------------------------------------
// GFC merch pre-sale
// Design your items in Printful first, then add one entry per item below and push.
//
// - id: short, unique, no spaces (e.g. "tee-cream")
// - image: put the Printful mockup in frontend/public/merch/ and use "/merch/tee-cream.jpg"
// - priceCents: regular price. presaleCents: price during the pre-sale.
// - sizes / colors: leave [] if the item has none
// - printful: the Printful product + variant names, so orders are easy to place later
// All prices are in cents ($35 = 3500).
// -------------------------------------------------------

export const MERCH_PRESALE = {
  start: "2026-11-01T00:00:00-04:00",
  end: "2026-12-06T23:59:59-05:00", // last day to pre-order
  shipBy: "Ships by Dec 19",
  shippingCents: 600, // flat shipping per order (US only)
  freeShippingOverCents: 7500, // free shipping on orders of $75+
};

export const MERCH = [
  // Example (remove the // to turn it on):
  // {
  //   id: "tee-cream",
  //   name: "Grown Folks™ Tee",
  //   description: "Soft cream tee with the gold GFC script.",
  //   image: "/merch/tee-cream.jpg",
  //   priceCents: 3500,
  //   presaleCents: 2800,
  //   sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
  //   colors: [],
  //   printful: "Bella+Canvas 3001 · Heather Dust",
  // },
];

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
export const presaleOpen = (now = new Date()) =>
  MERCH.length > 0 && now >= new Date(MERCH_PRESALE.start) && now <= new Date(MERCH_PRESALE.end);

export const findMerch = (id) => MERCH.find((m) => m.id === id) || null;

export const merchPrice = (item, now = new Date()) =>
  presaleOpen(now) && item.presaleCents ? item.presaleCents : item.priceCents;

export const shippingFor = (subtotalCents) =>
  subtotalCents >= MERCH_PRESALE.freeShippingOverCents ? 0 : MERCH_PRESALE.shippingCents;

export const publicMerch = (now = new Date()) => ({
  open: presaleOpen(now),
  presale: {
    start: MERCH_PRESALE.start,
    end: MERCH_PRESALE.end,
    shipBy: MERCH_PRESALE.shipBy,
    shippingCents: MERCH_PRESALE.shippingCents,
    freeShippingOverCents: MERCH_PRESALE.freeShippingOverCents,
  },
  items: MERCH.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description || "",
    image: m.image || "",
    priceCents: merchPrice(m, now),
    regularCents: m.priceCents,
    sizes: m.sizes || [],
    colors: m.colors || [],
  })),
});
