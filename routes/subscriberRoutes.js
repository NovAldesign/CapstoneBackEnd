import express from "express";
import Subscriber from "../models/subscriberSchema.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { fullName, email, smsOptIn, phoneNumber } = req.body;

    if (smsOptIn && (!phoneNumber || !phoneNumber.trim())) {
      return res.status(400).json({ error: "A valid phone number is required for SMS notifications." });
    }

    const newSubscriber = new Subscriber({
      fullName,
      email,
      smsOptIn: Boolean(smsOptIn),
      phoneNumber: smsOptIn ? phoneNumber : "",
    });

    await newSubscriber.save();
    return res.status(201).json({ message: "Successfully subscribed!" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "This email address is already subscribed." });
    }
    return res.status(400).json({ error: error.message || "Error processing subscription." });
  }
});

export default router;