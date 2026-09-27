import express from "express";
import mongoose from "mongoose";
import Event from "../models/eventSchema.js";
import TicketOrder from "../models/ticketOrderSchema.js";
import {
  allPromoCodes,
  findPromoCode,
} from "../utilities/promoCodes.js";

const router = express.Router();

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (cents = 0) => `$${(Number(cents) / 100).toFixed(2)}`;

/* -------------------------------------------------------
   POST /api/promo-codes/validate  — Public
   Body: { code, eventIds: [...] }
   Tells the bag whether a code works for the events in it.
------------------------------------------------------- */
router.post("/validate", async (req, res) => {
  try {   
     const promo = await findPromoCode(req.body.code);
    if (!promo) {
      return res.status(404).json({ valid: false, error: "That code isn't valid or has expired." });
    }

    const ids = (Array.isArray(req.body.eventIds) ? req.body.eventIds : [])
      .map(String)
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .slice(0, 40);
    const events = ids.length ? await Event.find({ _id: { $in: ids } }).select("name") : [];
    const eligibleEventIds = events
      .filter((e) => promoAppliesToEvent(promo, e))
      .map((e) => String(e._id));

    return res.json({
      valid: true,
      code: promo.code.toUpperCase(),
      type: promo.type,
      value: Number(promo.value) || 0,
      description: describePromo(promo),
      appliesToAllEvents: !promo.events || promo.events.length === 0,
      eligibleEventIds,
    });
  } catch (err) {
    console.error("Promo validate error:", err.message);
    return res.status(500).json({ valid: false, error: "Couldn't check that code. Please try again." });
  }
});

/* -------------------------------------------------------
   GET /api/promo-codes/report?key=YOUR_ADMIN_REPORT_KEY
   Private — tickets sold per code (open it in your browser)
------------------------------------------------------- */
router.get("/report", async (req, res) => {
  const key = process.env.ADMIN_REPORT_KEY;
  if (!key || req.query.key !== key) {
    return res.status(401).send("Not authorized.");
  }

  try {
        const orders = await TicketOrder.find({ promoCode: { $nin: ["", null] }, status: "paid" })
      .sort({ createdAt: -1 })
      .lean();

    const byCode = new Map();
        for (const p of await allPromoCodes()) {
      byCode.set(p.code.toUpperCase(), { label: p.label, active: p.active, orders: [] });
    }
    for (const o of orders) {
      const code = String(o.promoCode).toUpperCase();
      if (!byCode.has(code)) byCode.set(code, { label: "(code removed from list)", active: false, orders: [] });
      byCode.get(code).orders.push(o);
    }

    const sections = [...byCode.entries()]
      .map(([code, info]) => {
        const tickets = info.orders.reduce(
          (sum, o) => sum + (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0),
          0
        );
        const revenue = info.orders.reduce((sum, o) => sum + (o.totalPaidCents || 0), 0);
        const rows = info.orders
          .map((o) => {
            const qty = (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
            const events = [...new Set((o.items || []).map((i) => i.eventName))].join(", ");
            return `<tr>
              <td>${escapeHtml(new Date(o.createdAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }))}</td>
              <td>${escapeHtml(o.buyerName || "—")}</td>
              <td>${escapeHtml(o.buyerEmail || "—")}</td>
              <td>${escapeHtml(events)}</td>
              <td style="text-align:center;">${qty}</td>
              <td>${money(o.totalPaidCents)}</td>
              <td>${escapeHtml(o.confirmationCode || "")}</td>
            </tr>`;
          })
          .join("");
        return `
          <section style="margin:0 0 28px;">
            <h2 style="margin:0 0 4px;font-size:20px;">${escapeHtml(code)}
              <span style="font-weight:normal;color:#666;font-size:15px;"> · ${escapeHtml(info.label || "")}${info.active ? "" : " (off)"}</span>
            </h2>
            <p style="margin:0 0 10px;"><strong>${tickets}</strong> ticket${tickets === 1 ? "" : "s"} ·
              ${info.orders.length} order${info.orders.length === 1 ? "" : "s"} · ${money(revenue)}</p>
            ${
              rows
                ? `<table><tr><th>Date</th><th>Buyer</th><th>Email</th><th>Event</th><th>Tickets</th><th>Paid</th><th>Confirmation</th></tr>${rows}</table>`
                : `<p style="color:#888;margin:0;">No sales yet.</p>`
            }
          </section>`;
      })
      .join("");

    res.send(`<!doctype html><html><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <meta name="robots" content="noindex"/>
      <title>GFC Code Report</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#002147;padding:24px;max-width:1000px;margin:0 auto;}
        h1{border-bottom:3px solid #C5A059;padding-bottom:10px;}
        table{border-collapse:collapse;width:100%;font-size:14px;}
        th{background:#002147;color:#fff;text-align:left;padding:8px;}
        td{padding:8px;border-bottom:1px solid #eee;}
      </style></head><body>
      <h1>🎟️ Ticket Code Report</h1>
      <p style="color:#666;">Website ticket sales by code. Refresh the page for the latest numbers.</p>
      ${sections || "<p>No codes yet.</p>"}
    </body></html>`);
  } catch (err) {
    console.error("Promo report error:", err.message);
    res.status(500).send("Couldn't load the report.");
  }
});

export default router;