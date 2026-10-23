import mongoose from "mongoose";

// -------------------------------------------------------
// "Become a member" offers sent after a ticket purchase (utilities/memberOffer.js).
// One row per offer. If the guest joins before expiresAt, what they paid for that
// order comes back as member credit (once).
// -------------------------------------------------------
const memberOfferSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: "", trim: true },
    orderId: { type: String, required: true, unique: true }, // the purchase that triggered it
    eventName: { type: String, default: "" },
    creditCents: { type: Number, default: 0 }, // what they paid for that order
    status: { type: String, enum: ["due", "sent", "skipped"], default: "due", index: true },
    dueAt: { type: Date, required: true }, // next morning, 10 AM Eastern
    sentAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }, // join by this date to get the credit
    eventsAttended: { type: Number, default: 0 },
    spentCents: { type: Number, default: 0 },
    skipReason: { type: String, default: "" },
    joinedAt: { type: Date, default: null }, // first membership payment from this offer
    creditDueAt: { type: Date, default: null }, // 30 days after joining
    forfeitedAt: { type: Date, default: null }, // canceled before the 30 days were up
    redeemedAt: { type: Date, default: null }, // credit added
    memberId: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("MemberOffer", memberOfferSchema);
