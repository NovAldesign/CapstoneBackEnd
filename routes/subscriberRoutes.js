import express from "express";
import Subscriber from "../models/subscriberSchema.js";
import { sendWelcomeEmail } from "../utilities/welcomeEmail.js";
import { sendPlannerWelcome } from "../utilities/hostingSpecials.js";
import { joinSelectFromNewsletter } from "./selectRoutes.js";
import { hasBoughtBefore } from "../utilities/promoCodes.js";

const router = express.Router();

const isCorporate = (source = "") => String(source).startsWith("corporate");

// Ticked "Tell me about GFC Select™": add them to the Select notify list too (its own list in the dashboard)
const maybeJoinSelect = (body) => {
  if (body.selectInterest !== true || isCorporate(body.source)) return;
  joinSelectFromNewsletter({
    fullName: body.fullName,
    email: body.email,
    gender: body.selectGender,
    phone: body.smsOptIn ? body.phoneNumber : "",
    textOk: Boolean(body.smsOptIn),
    source: `newsletter${body.source ? `:${String(body.source).slice(0, 40)}` : ""}`,
  });
};

router.post("/", async (req, res) => {
  try {
    const { fullName, email, smsOptIn, phoneNumber, smsConsentText, smsConsentVersion, source } = req.body;

    if (smsOptIn && (!phoneNumber || !phoneNumber.trim())) {
      return res.status(400).json({ error: "A valid phone number is required for SMS notifications." });
    }

    const newSubscriber = new Subscriber({
      fullName,
      email,
      smsOptIn: Boolean(smsOptIn),
      phoneNumber: smsOptIn ? phoneNumber : "",
      smsConsentAt: smsOptIn ? new Date() : null,
      smsConsentText: smsOptIn ? String(smsConsentText || "").slice(0, 600) : "",
      smsConsentVersion: smsOptIn ? String(smsConsentVersion || "").slice(0, 40) : "",
      source: String(source || "").slice(0, 120),
    });

    await newSubscriber.save();
    // Planners get $99 off a first hosted event; guests get $5 off a first ticket. Never blocks the signup.
    if (isCorporate(newSubscriber.source)) sendPlannerWelcome(newSubscriber);
    else sendWelcomeEmail(newSubscriber);
    maybeJoinSelect(req.body);
    // Hand the welcome code back so the site can put it in their bag right away
    const code = isCorporate(newSubscriber.source)
      ? undefined
      : (await hasBoughtBefore(newSubscriber.email).catch(() => false)) ? "WELCOMEBACK10" : "WELCOME5";
    return res.status(201).json({ message: "Successfully subscribed!", code });
  } catch (error) {
    if (error.code === 11000) {
      maybeJoinSelect(req.body); // already on the newsletter, but now wants Select news
      const existing = req.body.email
        ? await Subscriber.findOne({ email: String(req.body.email).trim().toLowerCase() }).catch(() => null)
        : null;
      // Already on the guest list but signing up as a planner: still send the planner savings
      if (isCorporate(req.body.source)) {
        if (existing && !existing.plannerCode) sendPlannerWelcome(existing);
      } else if (existing && !existing.welcomeSentAt) {
        // On the list but never got their $5 welcome (e.g. added before it existed): send it now, once
        sendWelcomeEmail(existing);
      }
      return res.status(400).json({ error: "This email address is already subscribed." });
    }
    return res.status(400).json({ error: error.message || "Error processing subscription." });
  }
});

export default router;
