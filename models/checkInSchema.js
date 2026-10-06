import mongoose from "mongoose";

// Door check-ins for every kind of guest (website order, Eventbrite attendee, or a guest added by hand).
// key: "web:<orderId>:<item index>", "eb:<attendee id>", or "guest:<guest id>"
const checkInSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    count: { type: Number, default: 0, min: 0 }, // tickets checked in for this guest
    lastAt: { type: Date, default: null },
    by: { type: String, default: "" }, // "admin" or "door"
  },
  { timestamps: true }
);

checkInSchema.index({ eventId: 1, key: 1 }, { unique: true });

export default mongoose.model("CheckIn", checkInSchema);
