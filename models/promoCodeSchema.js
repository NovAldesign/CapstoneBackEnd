import mongoose from "mongoose";

// Ticket codes created automatically (e.g. when an artist is approved).
// Hand-made codes can still live in utilities/promoCodes.js.
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
  },
  { timestamps: true }
);

const PromoCode = mongoose.model("PromoCode", promoCodeSchema);
export default PromoCode;