import mongoose from "mongoose";

// Guests added by hand: tickets sold on Posh, Eventnoire or Meetup, comps, and walk-ins at the door
export const GUEST_SOURCES = ["posh", "eventnoire", "meetup", "allevents", "door", "comp", "partner", "other"];

const guestEntrySchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, default: "", lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, default: "", trim: true, maxlength: 30 },
    quantity: { type: Number, default: 1, min: 1, max: 50 },
    source: { type: String, enum: GUEST_SOURCES, default: "door" },
    amountPaidCents: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: "", trim: true, maxlength: 500 },
    addedBy: { type: String, default: "" }, // "admin" or "door"
  },
  { timestamps: true }
);

export default mongoose.model("GuestEntry", guestEntrySchema);
