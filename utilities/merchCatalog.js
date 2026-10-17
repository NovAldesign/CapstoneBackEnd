import { getMerch, findVariant, merchCacheError, printfulReady } from "./printful.js";

// -------------------------------------------------------
// GFC merch, made to order by Printful
// Products, photos, sizes, colors and prices come straight from the Printful store.
// To add an item: design it in Printful, set its retail price there, and it shows on /shop
// within 10 minutes. To hide one, use "Ignore" on the product or variant in Printful.
// All amounts here are in cents ($6 = 600).
// -------------------------------------------------------
export const MERCH_SETTINGS = {
  shippingCents: 600, // flat shipping per order (US only)
  freeShippingOverCents: 7500, // free shipping on orders of $75+
  shipNote: "Made to order and shipped in about 1 to 2 weeks.",
};

export const shippingFor = (subtotalCents) =>
  subtotalCents >= MERCH_SETTINGS.freeShippingOverCents ? 0 : MERCH_SETTINGS.shippingCents;

export { getMerch, findVariant };

export const publicMerch = async () => {
  const items = await getMerch();
  return {
    open: items.length > 0,
    connected: printfulReady(),
    settings: { ...MERCH_SETTINGS },
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      image: i.image,
      variants: i.variants.map(({ id, size, color, priceCents, image }) => ({ id, size, color, priceCents, image })),
    })),
  };
};

export const merchStatus = async () => {
  const items = await getMerch({ fresh: true });
  return { connected: printfulReady(), products: items.length, error: merchCacheError() };
};
