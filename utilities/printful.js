// -------------------------------------------------------
// Printful (Manual order / API store)
// Railway variables:
//   PRINTFUL_API_KEY   private token from printful.com/dashboard/api
//   PRINTFUL_STORE_ID  only needed if the token covers more than one store
// Products, photos, variants and retail prices all come from the Printful store,
// so adding or editing a product in Printful updates the website on its own.
// -------------------------------------------------------
const API = "https://api.printful.com";
const CACHE_MS = 10 * 60 * 1000;

export const printfulReady = () => Boolean(process.env.PRINTFUL_API_KEY);

export const pf = async (path, { method = "GET", body } = {}) => {
  if (!printfulReady()) throw new Error("Printful isn't connected. Add PRINTFUL_API_KEY in Railway.");
  const headers = { Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`, "Content-Type": "application/json" };
  if (process.env.PRINTFUL_STORE_ID) headers["X-PF-Store-Id"] = process.env.PRINTFUL_STORE_ID;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.code && data.code >= 300)) {
    const msg = data?.error?.message || (typeof data.result === "string" ? data.result : "") || `Printful error ${res.status}`;
    throw new Error(msg);
  }
  return data.result;
};

const cents = (v) => Math.round(Number(v || 0) * 100);
const previewOf = (v) =>
  (v.files || []).find((f) => f.type === "preview")?.preview_url || v.product?.image || "";

// One store product → what the shop shows
const toItem = (detail) => {
  const p = detail.sync_product || {};
  const variants = (detail.sync_variants || [])
    .filter((v) => !v.is_ignored && v.synced !== false && v.availability_status !== "discontinued" && cents(v.retail_price) > 0)
    .map((v) => ({
      id: String(v.id),
      name: v.name || p.name,
      size: v.size || "",
      color: v.color || "",
      priceCents: cents(v.retail_price),
      image: previewOf(v),
    }));
  return {
    id: String(p.id),
    name: p.name || "",
    image: p.thumbnail_url || variants[0]?.image || "",
    variants,
  };
};

let cache = { at: 0, items: [], error: "" };

// Every product in the Printful store that has at least one priced variant
export const getMerch = async ({ fresh = false } = {}) => {
  if (!printfulReady()) return [];
  if (!fresh && cache.at && Date.now() - cache.at < CACHE_MS) return cache.items;
  try {
    const list = (await pf("/store/products?limit=100")) || [];
    const details = await Promise.all(list.filter((p) => !p.is_ignored).map((p) => pf(`/store/products/${p.id}`)));
    const items = details.map(toItem).filter((i) => i.variants.length);
    cache = { at: Date.now(), items, error: "" };
  } catch (err) {
    console.error("Printful catalog failed:", err.message);
    cache = { ...cache, at: Date.now() - CACHE_MS + 60 * 1000, error: err.message }; // try again in a minute
  }
  return cache.items;
};

export const merchCacheError = () => cache.error;

export const findVariant = (items, variantId) => {
  for (const item of items) {
    const v = item.variants.find((x) => x.id === String(variantId));
    if (v) return { item, variant: v };
  }
  return null;
};

// A paid order becomes a DRAFT in Printful. Nothing is charged or made until Vaughn clicks Confirm in Printful.
export const createDraftOrder = (order) =>
  pf("/orders", {
    method: "POST",
    body: {
      external_id: order.orderNumber,
      shipping: "STANDARD",
      recipient: {
        name: order.shipping.name || order.buyerName,
        address1: order.shipping.line1,
        address2: order.shipping.line2 || undefined,
        city: order.shipping.city,
        state_code: order.shipping.state,
        country_code: order.shipping.country || "US",
        zip: order.shipping.postalCode,
        email: order.buyerEmail || undefined,
        phone: order.buyerPhone || undefined,
      },
      items: order.items.map((i) => ({
        sync_variant_id: Number(i.variantId),
        quantity: i.quantity,
        retail_price: (i.priceCents / 100).toFixed(2),
      })),
      retail_costs: { shipping: (order.shippingCents / 100).toFixed(2) },
    },
  });

export const registerWebhook = (url) =>
  pf("/webhooks", { method: "POST", body: { url, types: ["package_shipped", "order_updated", "order_failed", "order_canceled"] } });

export const storeInfo = async () => {
  const stores = await pf("/stores");
  const id = Number(process.env.PRINTFUL_STORE_ID) || null;
  const store = (stores || []).find((s) => !id || s.id === id) || {};
  return { id: store.id, name: store.name, type: store.type };
};
