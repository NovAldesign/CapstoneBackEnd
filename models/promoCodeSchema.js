import mongoose from "mongoose";

// Ticket codes made in the dashboard (Discount Codes) or automatically
// when an artist or host is approved. A saved code with the same name as
// a code in utilities/promoCodes.js takes its place.
const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String, default: "", trim: true },
    type: { type: String, enum: ["tracking", "percent", "amount"], default: "tracking" },
    value: { type: Number, default: 0 },
    events: [{ type: String, trim: true }], // words from event names, e.g. "acoustic"
    eventIds: [{ type: String, trim: true }], // exact event IDs
    active: { type: Boolean, default: true },
    expires: { type: String, default: null }, // "YYYY-MM-DD" (last day it works)
    expiresAt: { type: Date, default: null }, // exact moment it stops working (e.g. 48-hour thank-you codes)
    source: { type: String, enum: ["artist", "manual", "thankyou", "winback", "referral", "reward", "addon"], default: "manual" }, // addon = 15-minute "add another event" code from the thank-you page. // thankyou = day-after email, winback = "we miss you", referral = a guest's share code, reward = free ticket earned by referrals
    artistId: { type: String, default: "" },

    // Rules (same meaning as in utilities/promoCodes.js)
    oncePerOrder: { type: Boolean, default: false }, // discount one ticket, not every ticket
    firstTimeOnly: { type: Boolean, default: false }, // only for emails that never bought a GFC ticket
    collectEmail: { type: Boolean, default: false }, // the bag asks for the buyer's email
    maxUses: { type: Number, default: 0 }, // 0 = no limit (counts paid orders)
    eventsOnOrBefore: { type: String, default: null }, // "YYYY-MM-DD": only events on or before this date
    noFood: { type: Boolean, default: false }, // doesn't work for food events
    noBundle: { type: Boolean, default: false }, // no multi-event bundle discount with it
    returningOnly: { type: Boolean, default: false }, // only for emails that HAVE bought before
    oncePerEmail: { type: Boolean, default: false }, // one paid order per email
    notes: { type: String, default: "", trim: true },
    referrerEmail: { type: String, default: "", lowercase: true, trim: true }, // referral codes: whose code it is
  },
  { timestamps: true }
);

const PromoCode = mongoose.model("PromoCode", promoCodeSchema);
export default PromoCode;