import express from "express";
import { optOut, optIn, validToken, unb64 } from "../utilities/optOut.js";

// -------------------------------------------------------
// /api/unsubscribe — the link at the bottom of every marketing email
//   GET  → a page asking them to confirm (link scanners can't unsubscribe anyone)
//   POST → unsubscribes (also the one-click POST from Gmail / Apple Mail)
//   POST ?again=1 → resubscribes, if they change their mind
// -------------------------------------------------------
const router = express.Router();
const SITE_URL = "https://www.grownfolkscollective.com";

const escapeHtml = (v = "") => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/><title>${title} | Grown Folks Collective</title>
<style>
body{margin:0;background:#F5EFE3;font-family:Arial,Helvetica,sans-serif;color:#002147;}
.card{max-width:520px;margin:60px auto;background:#fff;border-top:4px solid #C5A059;padding:32px 28px;line-height:1.6;}
h1{font-family:Georgia,serif;font-size:26px;margin:0 0 12px;}
p{color:#444;font-size:15px;}
button{background:#002147;color:#fff;border:0;padding:13px 24px;font-size:15px;font-weight:bold;border-radius:4px;cursor:pointer;}
button:focus-visible{outline:3px solid #C5A059;outline-offset:2px;}
a{color:#9A7630;font-weight:bold;}
.tag{font-style:italic;color:#9A7630;font-family:Georgia,serif;margin-top:24px;}
</style></head><body><div class="card">${body}<p class="tag">Where grown folks come out to play.™</p></div></body></html>`;

const parse = (req) => {
  const email = unb64(req.query.e);
  const ok = email && validToken(email, req.query.t);
  return { email: ok ? email : "", source: String(req.query.s || "").slice(0, 40) };
};

router.get("/", (req, res) => {
  const { email, source } = parse(req);
  if (!email) return res.status(400).send(page("Link not valid", "<h1>That link isn't valid</h1><p>Reply to any of our emails and we'll take you off the list.</p>"));
  const qs = `e=${encodeURIComponent(req.query.e)}&t=${encodeURIComponent(req.query.t)}${source ? `&s=${encodeURIComponent(source)}` : ""}`;
  return res.send(page("Unsubscribe", `
    <h1>Unsubscribe?</h1>
    <p>Stop event offers and updates to <strong>${escapeHtml(email)}</strong>. You'll still get your ticket emails, gift cards and day-before reminders for events you've booked.</p>
    <form method="POST" action="/api/unsubscribe?${qs}"><button type="submit">Unsubscribe me</button></form>`));
});

router.post("/", async (req, res) => {
  const { email, source } = parse(req);
  if (!email) return res.status(400).send(page("Link not valid", "<h1>That link isn't valid</h1><p>Reply to any of our emails and we'll take you off the list.</p>"));
  try {
    const qs = `e=${encodeURIComponent(req.query.e)}&t=${encodeURIComponent(req.query.t)}`;
    if (req.query.again === "1") {
      await optIn(email);
      return res.send(page("Welcome back", `<h1>You're back on the list</h1><p>We'll keep you posted on new events at <strong>${escapeHtml(email)}</strong>.</p><p><a href="${SITE_URL}/events">See upcoming events</a></p>`));
    }
    await optOut(email, source);
    return res.send(page("Unsubscribed", `
      <h1>You're unsubscribed</h1>
      <p>We won't send event offers or updates to <strong>${escapeHtml(email)}</strong>. Your ticket emails and reminders for events you book will still come through.</p>
      <form method="POST" action="/api/unsubscribe?${qs}&again=1"><button type="submit">Oops, keep me on the list</button></form>`));
  } catch (err) {
    console.error("Unsubscribe error:", err.message);
    return res.status(500).send(page("Try again", "<h1>Something went wrong</h1><p>Please try the link again, or reply to any of our emails and we'll take you off the list.</p>"));
  }
});

export default router;
