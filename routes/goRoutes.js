import express from "express";
import LinkClick from "../models/linkClickSchema.js";

// ── Public: count a click on a /go/<code> short link (the site calls this before redirecting) ──
const router = express.Router();
const dayEt = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

router.post("/:code", async (req, res) => {
  const code = String(req.params.code || "").toLowerCase();
  const src = String(req.body?.src || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  if (!/^[a-z0-9-]{1,40}$/.test(code)) return res.status(400).json({ ok: false });
  try {
    await LinkClick.updateOne(
      { code, src, day: dayEt() },
      { $inc: { count: 1 }, $set: { lastAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("Link click error:", err.message);
  }
  res.json({ ok: true });
});

export default router;
