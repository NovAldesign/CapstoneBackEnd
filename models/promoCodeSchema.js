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
    source: { type: String, enum: ["artist", "manual"], default: "manual" },
    artistId: { type: String, default: "" },

    // Rules (same meaning as in utilities/promoCodes.js)
    oncePerOrder: { type: Boolean, default: false }, // discount one ticket, not every ticket
    firstTimeOnly: { type: Boolean, default: false }, // only for emails that never bought a GFC ticket
    collectEmail: { type: Boolean, default: false }, // the bag asks for the buyer's email
    maxUses: { type: Number, default: 0 }, // 0 = no limit (counts paid orders)
    eventsOnOrBefore: { type: String, default: null }, // "YYYY-MM-DD": only events on or before this date
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

const PromoCode = mongoose.model("PromoCode", promoCodeSchema);
export default PromoCode;