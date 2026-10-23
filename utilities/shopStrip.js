import { passesOpen, activeSale } from "./shopCatalog.js";

// -------------------------------------------------------
// The small "shop" strip at the bottom of every automatic email:
// gift cards, merch, and Holiday Passes (only once passes are on sale, from Black Friday).
// -------------------------------------------------------
const SITE_URL = "https://www.grownfolkscollective.com";
const link = "color:#9A7630;font-weight:bold;text-decoration:none;";

export const shopStripHtml = (now = new Date()) => {
  const sale = activeSale(now);
  const items = [
    `<a href="${SITE_URL}/gift" style="${link}">Give a night out</a>: gift cards, delivered on the day you choose`,
    `<a href="${SITE_URL}/shop" style="${link}">Wear it</a>: Grown Folks&trade; merch`,
    passesOpen(now)
      ? `<a href="${SITE_URL}/gift" style="${link}">Holiday Passes</a>: 3 or 5 nights out${sale ? `, ${sale.label} pricing now` : ""}`
      : `<a href="${SITE_URL}/shop#bingo" style="${link}">Karaoke Bingo</a>: printable cards for your own game night`,
  ];
  return `<div style="border-top:1px solid #E5DCC8;margin:26px 0 0;padding:14px 0 0;font-size:13px;line-height:1.7;color:#555;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9A7630;font-weight:bold;margin-bottom:4px;">From the Grown Folks&trade; shop</div>
      ${items.map((i) => `<div>${i}</div>`).join("")}
    </div>`;
};

export const shopStripText = (now = new Date()) => {
  const sale = activeSale(now);
  return [
    "FROM THE GROWN FOLKS™ SHOP",
    `Give a night out: gift cards, delivered on the day you choose: ${SITE_URL}/gift`,
    `Wear it: Grown Folks™ merch: ${SITE_URL}/shop`,
    passesOpen(now)
      ? `Holiday Passes: 3 or 5 nights out${sale ? `, ${sale.label} pricing now` : ""}: ${SITE_URL}/gift`
      : `Karaoke Bingo: printable cards for your own game night: ${SITE_URL}/shop#bingo`,
  ].join("\n");
};
