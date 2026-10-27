import express from "express";
import mongoose from "mongoose";
import ArtistApplication from "../models/artistApplicationSchema.js";
import Event from "../models/eventSchema.js";
import { socialHandle } from "./artistRoutes.js";
import {
  PLATFORMS,
  fmtLiveWhen,
  sendLiveConfirmation,
  sendNeedsDateNotice,
} from "../utilities/liveSetup.js";

// ── Public: an artist's private Live setup page (/live-setup/:id?t=TOKEN on the site) ──
const router = express.Router();
const clean = (v, max = 300) => String(v ?? "").trim().slice(0, max);

const findLive = async (req) => {
  const token = String(req.query.t || req.body?.t || "");
  if (!mongoose.Types.ObjectId.isValid(req.params.id) || token.length < 20) return null;
  const application = await ArtistApplication.findById(req.params.id);
  if (!application || application.status !== "approved") return null;
  if (!application.live?.token || application.live.token !== token) return null;
  return application;
};

const eventFor = async (application) =>
  mongoose.Types.ObjectId.isValid(application.eventId)
    ? Event.findById(application.eventId).select("name date").lean()
    : null;

const view = (application, event) => {
  const live = application.live || {};
  const now = Date.now();
  return {
    firstName: application.firstName,
    artistName: application.artistName,
    role: application.role || "artist",
    event: event ? { name: event.name, date: event.date } : null,
    status: live.status,
    options: (live.options || [])
      .filter((d) => new Date(d).getTime() > now)
      .map((d) => ({ value: new Date(d).toISOString(), label: fmtLiveWhen(d) })),
    questions: live.questions || [],
    answers: {
      date: live.date ? new Date(live.date).toISOString() : "",
      dateLabel: live.date ? fmtLiveWhen(live.date) : "",
      platform: live.platform || "",
      handle: live.handle || "",
      phone: live.phone || application.phone || "",
      plug: live.plug || "",
      extraQuestion: live.extraQuestion || "",
      customRequest: live.customRequest || "",
      notes: live.notes || [],
    },
    handles: { instagram: socialHandle(application.instagram), tiktok: socialHandle(application.tiktok) },
    past: Boolean(live.date && new Date(live.date).getTime() < now - 60 * 60 * 1000),
    artistChose: Boolean(live.artistChose),
    approved: Boolean(live.approvedAt),
  };
};

/* GET /api/lives/:id?t=TOKEN — what the form needs */
router.get("/:id", async (req, res) => {
  try {
    const application = await findLive(req);
    if (!application) return res.status(404).json({ error: "This Live link isn't valid. Reply to your email from Vaughn and we'll send a new one." });
    res.json(view(application, await eventFor(application)));
  } catch (err) {
    console.error("Live setup load error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* POST /api/lives/:id/approve?t=TOKEN — they tapped "Yes, this time works" in their email */
router.post("/:id/approve", async (req, res) => {
  try {
    const application = await findLive(req);
    if (!application) return res.status(404).json({ error: "This Live link isn't valid. Reply to your email from Vaughn and we'll send a new one." });
    const live = application.live;
    if (live.status !== "confirmed" || !live.date) return res.status(400).json({ error: "There's no Live time to approve yet." });
    if (!live.approvedAt) {
      live.approvedAt = new Date();
      await application.save();
    }
    res.json({ ok: true, approved: true, ...view(application, await eventFor(application)) });
  } catch (err) {
    console.error("Live approve error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/* POST /api/lives/:id?t=TOKEN — save their picks and email the confirmation */
router.post("/:id", async (req, res) => {
  try {
    const application = await findLive(req);
    if (!application) return res.status(404).json({ error: "This Live link isn't valid. Reply to your email from Vaughn and we'll send a new one." });
    const live = application.live;
    const b = req.body || {};

    // The platform you picked when setting the Live up (TikTok if none)
    const platform = PLATFORMS[live.platform] ? live.platform : "tiktok";
    const handle = socialHandle(b.handle);
    if (!handle) return res.status(400).json({ error: `Add your ${PLATFORMS[platform]} handle so we can invite you.` });

    const wantsOther = b.date === "other";
    const customRequest = clean(b.customRequest, 400);
    let date = null;
    if (wantsOther) {
      if (!customRequest) return res.status(400).json({ error: "Tell us a few days and times that work for you." });
    } else {
      const picked = new Date(b.date || "");
      date = (live.options || []).find((d) => new Date(d).getTime() === picked.getTime());
      if (!date) return res.status(400).json({ error: "Pick one of the dates, or choose \"None of these work\"." });
      if (new Date(date).getTime() < Date.now()) return res.status(400).json({ error: "That date has passed. Please pick another." });
    }

    const wasConfirmed = live.status === "confirmed";
    live.artistChose = false; // they picked it themselves on the page, so no approval needed
    const before = `${live.date ? new Date(live.date).getTime() : ""}|${live.platform}`;
    live.platform = platform;
    live.handle = handle;
    live.phone = clean(b.phone, 40);
    live.plug = clean(b.plug, 400);
    live.extraQuestion = clean(b.extraQuestion, 300);
    live.notes = (live.questions || []).map((_, i) => clean((b.notes || [])[i], 400));
    live.customRequest = wantsOther ? customRequest : "";

    let emailSent = false;
    if (wantsOther) {
      live.status = "needs-date";
      live.date = null;
      await application.save();
      await sendNeedsDateNotice(application).catch((e) => console.error("Live notice email error:", e.message));
    } else {
      live.status = "confirmed";
      live.date = date;
      live.confirmedAt = live.confirmedAt || new Date();
      await application.save();
      const changed = before !== `${new Date(date).getTime()}|${platform}`;
      try {
        emailSent = await sendLiveConfirmation(application, await eventFor(application), { updated: wasConfirmed && changed });
        if (emailSent) {
          live.confirmationSentAt = new Date();
          await application.save();
        }
      } catch (e) {
        console.error("Live confirmation email error:", e.message);
      }
    }

    res.json({ ok: true, emailSent, ...view(application, await eventFor(application)) });
  } catch (err) {
    console.error("Live setup save error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
