import mongoose from "mongoose";

// Group outings: birthdays, reunions, friend groups coming to a GFC event
const groupBookingSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },

    occasion: { type: String, default: "", trim: true },
    eventId: { type: String, default: "" },
    eventTitle: { type: String, default: "", trim: true },
    groupSize: { type: Number, min: 1, max: 200 },

    songRequests: { type: String, default: "", trim: true },
    bringingCake: { type: Boolean, default: false },
    wantsMocktails: { type: Boolean, default: false },
    notes: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["new", "contacted", "confirmed", "closed"],
      default: "new",
    },
  },
  { timestamps: true }
);

const GroupBooking = mongoose.model("GroupBooking", groupBookingSchema);
export default GroupBooking;