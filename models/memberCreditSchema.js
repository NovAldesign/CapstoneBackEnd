import mongoose from "mongoose";

// -------------------------------------------------------
// Member event credit, one row per change.
//   earned  = monthly credit from a paid membership month ($40 Social / $70 Founding)
//   bonus   = birthday bonus ($25) or a credit you add by hand
//   used    = spent on tickets (cents is negative)
//   expired = left over after its rollover month (cents is negative)
// "earned" and "bonus" rows are lots: remainingCents goes down as it's used,
// and whatever is left on expiresAt expires. Oldest lots are used first.
// -------------------------------------------------------
const memberCreditSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "Membership", required: true, index: true },
    type: { type: String, enum: ["earned", "bonus", "used", "expired"], required: true },
    cents: { type: Number, required: true },
    remainingCents: { type: Number, default: 0 }, // lots only
    expiresAt: { type: Date, default: null },     // lots only
    note: { type: String, default: "", maxlength: 200 },
    // Makes each grant/use happen once, e.g. "invoice:in_123", "birthday:2026", "order:GFC-AB12"
    key: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

memberCreditSchema.index({ member: 1, type: 1, expiresAt: 1 });

export default mongoose.model("MemberCredit", memberCreditSchema);
