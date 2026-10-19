import express from "express";
import SiteStats from "../models/siteStatsSchema.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

const router = express.Router();

const RATINGS = ["eventbriteRating", "meetupRating"];
const COUNTS = [
  "tiktok",
  "instagram",
  "facebook",
  "threads",
  "meetup",
  "email",
  "communityTotal",
  "eventsHosted",
  "soldOut",
];
const PUBLIC = [...RATINGS, ...COUNTS, "updatedAt"];

const pick = (doc) => Object.fromEntries(PUBLIC.map((k) => [k, doc[k]]));

const getStats = async () =>
  SiteStats.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

/* GET /api/site-stats — Public. Everything the website shows. */
router.get("/", async (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=60");
    res.json(pick(await getStats()));
  } catch (err) {
    console.error("Site stats load error:", err);
    res.status(500).json({ error: "Could not load site numbers." });
  }
});

/* PUT /api/site-stats — Admin. Save any of the numbers. */
router.put("/", protect, restrictTo("admin"), async (req, res) => {
  try {
    const updates = {};
    for (const k of RATINGS) {
      if (req.body[k] === undefined) continue;
      const n = Number(req.body[k]);
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        return res.status(400).json({ error: "Ratings must be between 0 and 5." });
      }
      updates[k] = Math.round(n * 10) / 10;
    }
    for (const k of COUNTS) {
      if (req.body[k] === undefined) continue;
      const n = Number(String(req.body[k]).replace(/[,+\s]/g, "") || 0);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "Counts must be 0 or more." });
      }
      updates[k] = Math.round(n);
    }

    const doc = await SiteStats.findOneAndUpdate(
      { key: "main" },
      { $set: updates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json(pick(doc));
  } catch (err) {
    console.error("Site stats save error:", err);
    res.status(500).json({ error: "Could not save site numbers." });
  }
});

export default router;
