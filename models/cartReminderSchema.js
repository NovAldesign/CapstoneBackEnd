import mongoose from "mongoose";

// One row per "you left something in your bag" email, so nobody gets the same reminder twice.
const CartReminderSchema = new mongoose.Schema(
  {
    stripeSessionId: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    kind: { type: String, default: "" }, // tickets, merch, digital, gift, pass
    items: [{ type: String }],
    amountCents: { type: Number, default: 0 },
    recoveryUrl: { type: String, default: "" },
    skipped: { type: String, default: "" }, // why no email went out (already bought, opted out, sent recently)
    recovered: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.CartReminder || mongoose.model("CartReminder", CartReminderSchema);
