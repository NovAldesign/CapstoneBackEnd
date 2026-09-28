import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, index: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, required: true, trim: true },
  dob: { type: Date, required: true },
  tier: { type: String, enum: ["Social", "Founding"], required: true },
  connectionGoals: {
    primaryInterest: { type: String, enum: ["Meet New People", "Play / Games", "Conversations", "Food Events", "Travel", "Local Events"], default: "Meet New People" },
    isolationBarrier: { type: String, default: "" }
  },
  // "pending" = applied but hasn't paid yet, "active" = paid, "canceled" = ended
  status: { type: String, enum: ["pending", "active", "canceled"], default: "pending", index: true },
  stripeCustomerId: { type: String, default: "" },
  stripeSubscriptionId: { type: String, default: "" },
  paidAt: { type: Date, default: null },
  // Agreement to auto-renewal, Terms, and Participation Waiver
  autoRenewAgreed: { type: Boolean, default: false },
  termsVersion: { type: String, default: "" },
  termsAcceptedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Membership", membershipSchema);