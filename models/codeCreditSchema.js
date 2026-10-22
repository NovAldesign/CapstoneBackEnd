import mongoose from "mongoose";

// Credit a performer's code for tickets that didn't come through the website with their code:
// Eventbrite orders, guests added by hand (Posh, Eventnoire, door). One credit per guest-list row.
// (Website orders are credited by changing the order's code instead.)
const codeCreditSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, index: true },
    key: { type: String, required: true, unique: true }, // guest-list row, e.g. "eb:123" or "guest:<id>"
    code: { type: String, required: true, uppercase: true, trim: true, index: true },
    tickets: { type: Number, required: true, min: 1, max: 50 },
    guestName: { type: String, default: "", trim: true },
    addedBy: { type: String, default: "admin" },
  },
  { timestamps: true }
);

export default mongoose.model("CodeCredit", codeCreditSchema);
