import mongoose from "mongoose";

// One record per website ticket purchase (Stripe Checkout).
// Doubles as the guest list for check-in.
const TicketOrderItemSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    eventName: { type: String, default: "" },
    eventDate: { type: Date },
    ticketTypeId: { type: String, default: "" },
    ticketName: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    pricePaidEachCents: { type: Number, default: 0 },
  },
  { _id: false }
);

const TicketOrderSchema = new mongoose.Schema(
  {
    confirmationCode: { type: String, unique: true },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, default: "" },

    buyerName: { type: String, default: "", trim: true },
    buyerEmail: { type: String, default: "", lowercase: true, trim: true },
    buyerPhone: { type: String, default: "", trim: true },

    items: [TicketOrderItemSchema],
    totalPaidCents: { type: Number, default: 0 },
    discountLabel: { type: String, default: "" },
    promoCode: { type: String, default: "", uppercase: true, trim: true },
    // Logged-in member who placed the order (member pricing / event credit)
    memberId: { type: String, default: "", index: true },
    // Where the buyer came from on the website (the ?src= tag, e.g. threads-m, ig, email)
    source: { type: String, default: "", trim: true },

    // Checkout agreement (Terms, Refund Policy, Participation Waiver)
    termsAccepted: { type: Boolean, default: false },
    termsVersion: { type: String, default: "" },
    termsAcceptedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["paid", "refunded", "cancelled"],
      default: "paid",
    },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TicketOrderSchema.pre("save", function (next) {
  if (!this.confirmationCode) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "GFC-";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    this.confirmationCode = code;
  }
  next();
});

const TicketOrder = mongoose.model("TicketOrder", TicketOrderSchema);
export default TicketOrder;