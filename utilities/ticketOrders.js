import { Resend } from "resend";
import TicketOrder from "../models/ticketOrderSchema.js";
import Event from "../models/eventSchema.js";

// -------------------------------------------------------
// Website ticket orders: saves the order and sends
// (1) the buyer's ticket email and (2) the sale alert to the team.
// -------------------------------------------------------

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const TEAM_EMAIL = "events@grownfolkscollective.com";
const SITE_URL = "https://www.grownfolkscollective.com";
const TIME_ZONE = "America/New_York";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (cents = 0) => `$${(Number(cents) / 100).toFixed(2)}`;

const formatDateTime = (date) =>
  date
    ? new Date(date).toLocaleString("en-US", {
        timeZone: TIME_ZONE,
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date to be announced";

const formatTime = (date) =>
  date
    ? new Date(date).toLocaleTimeString("en-US", {
        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

const slugify = (text = "") =>
  String(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const eventUrl = (event) =>
  `${SITE_URL}/events/${slugify(event?.name || "event")}-${event?._id}`;

const addressLine = (loc = {}) => {
  const stateZip = [loc.state, loc.zip].filter(Boolean).join(" ");
  return [loc.address, loc.city, stateZip].filter(Boolean).join(", ");
};

const directionsUrl = (loc = {}) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [loc.name, addressLine(loc)].filter(Boolean).join(", ")
  )}`;

const calendarStamp = (date) =>
  new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const calendarUrl = (event) => {
  if (!event?.date) return "";
  const end = event.endDate || new Date(new Date(event.date).getTime() + 3 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name || "Grown Folks Collective event",
    dates: `${calendarStamp(event.date)}/${calendarStamp(end)}`,
    location: [event.location?.name, addressLine(event.location)].filter(Boolean).join(", "),
    details: `Your Grown Folks Collective ticket. Event details: ${eventUrl(event)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/* -------------------------------------------------------
   Step 1: claim the order (runs BEFORE ticket counts change).
   Returns null if this Stripe session was already handled,
   so a retried webhook never double-counts or double-emails.
------------------------------------------------------- */
export const claimTicketOrder = async (session) => {
  try {
    const details = session.customer_details || {};
    return await TicketOrder.create({
      stripeSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : "",
      buyerName: details.name || "",
      buyerEmail: details.email || session.customer_email || "",
      buyerPhone: details.phone || "",
      totalPaidCents: session.amount_total || 0,
      discountLabel: [
        session.metadata?.isBundleCheckout === "true" ? "Multi-event bundle discount" : "",
        session.metadata?.giftCode
          ? Number(session.metadata?.passUses) > 0
            ? `Holiday Pass ${session.metadata.giftCode} (${session.metadata.passUses} ${Number(session.metadata.passUses) === 1 ? "ticket" : "tickets"})`
            : `Gift card ${session.metadata.giftCode} ($${(Number(session.metadata.giftCreditCents || 0) / 100).toFixed(2)})`
          : "",
      ].filter(Boolean).join(" + "),
      promoCode: session.metadata?.promoCode || "",
      source: String(session.metadata?.source || "").slice(0, 40),
      termsAccepted: session.metadata?.termsAccepted === "yes",
      termsVersion: session.metadata?.termsVersion || "",
      termsAcceptedAt: session.metadata?.termsAcceptedAt ? new Date(session.metadata.termsAcceptedAt) : null,
    });
  } catch (err) {
    if (err?.code === 11000) return null; // already processed
    throw err;
  }
};

/* -------------------------------------------------------
   Step 2: fill in the order details and send both emails
   (runs AFTER ticket counts are updated).
------------------------------------------------------- */
export const completeTicketOrder = async (order, purchasedCart = []) => {
  const eventIds = [...new Set(purchasedCart.map((i) => String(i.eventId)))];
  const events = await Event.find({ _id: { $in: eventIds } }).select("-promoCodes");
  const findEvent = (id) => events.find((e) => String(e._id) === String(id));

  order.items = purchasedCart.map((item) => {
    const event = findEvent(item.eventId);
    return {
      eventId: String(item.eventId),
      eventName: event?.name || "",
      eventDate: event?.date,
      ticketTypeId: String(item.ticketTypeId || ""),
      ticketName: item.ticketName || "",
      quantity: Number(item.qty) || 1,
      pricePaidEachCents: Number(item.pricePaid) || 0,
    };
  });
  await order.save();

  if (!resend) {
    console.warn("RESEND_API_KEY is not set — skipping ticket emails.");
    return order;
  }

  const firstName = (order.buyerName || "").split(" ")[0] || "friend";
  const totalTickets = order.items.reduce((sum, i) => sum + i.quantity, 0);

  // ── Buyer ticket email: one block per event ──
  const eventBlocks = eventIds
    .map((id) => {
      const event = findEvent(id);
      const lines = order.items.filter((i) => i.eventId === String(id));
      const loc = event?.location || {};
      const ticketLines = lines
        .map(
          (i) =>
            `<li style="margin:0 0 4px;">${escapeHtml(i.ticketName)} × ${i.quantity}` +
            ` <span style="color:#666;">(${money(i.pricePaidEachCents)} each)</span></li>`
        )
        .join("");

      return `
        <div style="border:1px solid #E5DCC8;border-left:4px solid #C5A059;padding:18px 20px;margin:0 0 16px;background:#FFFFFF;">
          <h3 style="margin:0 0 8px;font-family:Georgia,serif;font-size:20px;color:#002147;">
            ${escapeHtml(event?.name || "Your GFC event")}
          </h3>
          <p style="margin:0 0 4px;font-size:15px;color:#002147;">
            <strong>${escapeHtml(formatDateTime(event?.date))}</strong>
            ${event?.endDate ? ` to ${escapeHtml(formatTime(event.endDate))}` : ""}
          </p>
          <p style="margin:0 0 12px;font-size:15px;color:#444;">
            ${escapeHtml(loc.name || "")}${loc.name && addressLine(loc) ? "<br/>" : ""}${escapeHtml(addressLine(loc))}
          </p>
          <ul style="margin:0 0 14px;padding-left:18px;font-size:15px;color:#002147;">${ticketLines}</ul>
          <p style="margin:0;font-size:14px;">
            ${event?.date ? `<a href="${calendarUrl(event)}" style="color:#9A7630;font-weight:bold;">Add to calendar</a> &nbsp;·&nbsp;` : ""}
            ${loc.name || loc.address ? `<a href="${directionsUrl(loc)}" style="color:#9A7630;font-weight:bold;">Get directions</a> &nbsp;·&nbsp;` : ""}
            <a href="${event ? eventUrl(event) : `${SITE_URL}/events`}" style="color:#9A7630;font-weight:bold;">Event details</a>
          </p>
        </div>`;
    })
    .join("");

  const buyerHtml = `
    <div style="background:#F5EFE3;padding:30px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#FAF7F0;">
        <div style="background:#002147;padding:28px 24px;text-align:center;border-bottom:3px solid #C5A059;">
          <p style="margin:0 0 6px;color:#C5A059;font-size:12px;letter-spacing:3px;text-transform:uppercase;">You're going!</p>
          <h1 style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:26px;">Your GFC Tickets</h1>
        </div>
        <div style="padding:26px 24px;">
          <p style="font-size:16px;color:#002147;margin:0 0 14px;">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 20px;">
            Thanks for grabbing your ${totalTickets === 1 ? "ticket" : "tickets"}! We can't wait to see you.
            Keep this email. It's your ticket.
          </p>

          <div style="background:#002147;color:#FFFFFF;text-align:center;padding:16px;margin:0 0 22px;">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#C5A059;">Confirmation code</p>
            <p style="margin:0;font-size:24px;font-weight:bold;letter-spacing:3px;">${escapeHtml(order.confirmationCode)}</p>
          </div>

          ${eventBlocks}

          <p style="font-size:15px;color:#002147;margin:6px 0 20px;">
            <strong>Total paid: ${money(order.totalPaidCents)}</strong>
            ${order.discountLabel ? `<br/><span style="color:#9A7630;font-size:14px;">${escapeHtml(order.discountLabel)} applied</span>` : ""}
          </p>

          <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 8px;">
            <strong>At check-in:</strong> just give your name or show this email.
            Bringing friends on your order? They can check in under your name.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px;">
            Questions or changes? Just reply to this email.
          </p>
          <p style="font-size:15px;color:#002147;margin:0;">See you soon,<br/><strong>Grown Folks Collective</strong></p>
        </div>
      </div>
    </div>`;

  // ── Team sale alert ──
  const itemRows = order.items
    .map((i) => {
      const event = findEvent(i.eventId);
      const ticket = event?.ticketTypes?.id?.(i.ticketTypeId);
      const left = ticket ? Math.max(0, (ticket.quantity || 0) - (ticket.sold || 0)) : "?";
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(i.eventName)}<br/>
            <span style="color:#666;font-size:13px;">${escapeHtml(formatDateTime(i.eventDate))}</span></td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(i.ticketName)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;">${money(i.pricePaidEachCents)} each</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${left}</td>
        </tr>`;
    })
    .join("");

  const stripeLink = order.stripePaymentIntentId
    ? `https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`
    : "https://dashboard.stripe.com/payments";

  const eventNames = [...new Set(order.items.map((i) => i.eventName))].join(" + ");

  const teamHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#002147;">
      <h2 style="border-bottom:2px solid #C5A059;padding-bottom:10px;">🎟️ New Website Ticket Sale</h2>
      <table style="border-collapse:collapse;font-size:15px;margin:0 0 18px;">
        <tr><td style="padding:4px 14px 4px 0;color:#666;">Buyer</td><td><strong>${escapeHtml(order.buyerName || "—")}</strong></td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#666;">Email</td><td><strong>${escapeHtml(order.buyerEmail || "—")}</strong></td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#666;">Phone</td><td><strong>${escapeHtml(order.buyerPhone || "—")}</strong></td></tr>
              <tr><td style="padding:4px 14px 4px 0;color:#666;">Code used</td><td><strong>${escapeHtml(order.promoCode || "None")}</strong></td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#666;">Confirmation</td><td><strong>${escapeHtml(order.confirmationCode)}</strong></td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#666;">Total paid</td><td><strong>${money(order.totalPaidCents)}</strong>${order.discountLabel ? ` (${escapeHtml(order.discountLabel)})` : ""}</td></tr>
      </table>
      <table style="border-collapse:collapse;font-size:14px;width:100%;max-width:720px;">
        <tr style="background:#002147;color:#fff;text-align:left;">
          <th style="padding:8px;">Event</th><th style="padding:8px;">Ticket</th>
          <th style="padding:8px;">Qty</th><th style="padding:8px;">Price</th><th style="padding:8px;">Left</th>
        </tr>
        ${itemRows}
      </table>
      <p style="margin:18px 0 6px;"><a href="${stripeLink}" style="color:#9A7630;font-weight:bold;">View payment in Stripe →</a></p>
      <p style="margin:0;color:#666;font-size:13px;">
        Heads up: website sales don't show in Eventbrite. If Eventbrite is close to selling out,
        lower its ticket quantity by ${totalTickets} so you don't oversell.
      </p>
    </div>`;

  const sends = [];
  if (order.buyerEmail) {
    sends.push(
      resend.emails
        .send({
          from: "Grown Folks Collective <noreply@grownfolkscollective.com>",
          to: order.buyerEmail,
          reply_to: TEAM_EMAIL,
          subject: `🎟️ Your tickets: ${eventNames} (${order.confirmationCode})`,
          html: buyerHtml,
        })
        .catch((err) => console.error("Buyer ticket email failed:", err.message))
    );
  }
  sends.push(
    resend.emails
      .send({
        from: "GFC Ticket Sales <noreply@grownfolkscollective.com>",
        to: TEAM_EMAIL,
        ...(order.buyerEmail && { reply_to: order.buyerEmail }),
        subject: `🎟️ Ticket sale: ${order.buyerName || "New buyer"}, ${eventNames} (${totalTickets})`,
        html: teamHtml,
      })
      .catch((err) => console.error("Team sale email failed:", err.message))
  );
  await Promise.all(sends);

  return order;
};
