import mongoose from "mongoose";

export const INTEREST_OPTIONS = ["Meet New People", "Play / Games", "Conversations", "Food Events", "Travel", "Local Events"];

const membershipSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, index: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, required: true, trim: true },
  dob: { type: Date, required: true },
  tier: { type: String, enum: ["Social", "Founding"], required: true },
  connectionGoals: {
    primaryInterest: { type: String, enum: INTEREST_OPTIONS, default: "Meet New People" },
    isolationBarrier: { type: String, default: "" }
  },
  // Everything they're into (picked on the member dashboard)
  interests: { type: [{ type: String, enum: INTEREST_OPTIONS }], default: [] },

  // "pending" = applied but hasn't paid yet, "active" = paid, "paused" = taking 1–2 months off, "canceled" = ended
  status: { type: String, enum: ["pending", "active", "paused", "canceled"], default: "pending", index: true },
  stripeCustomerId: { type: String, default: "" },
  stripeSubscriptionId: { type: String, default: "" },
  paidAt: { type: Date, default: null },

  // Test account made from the admin dashboard (never billed; safe to delete)
  isTest: { type: Boolean, default: false },

  // Kept in sync with Stripe so the dashboard can show them
  pausedUntil: { type: Date, default: null },      // pause ends and billing restarts
  cancelAtPeriodEnd: { type: Boolean, default: false },
  currentPeriodEnd: { type: Date, default: null }, // next billing date (or when a canceled membership ends)

  // Member login (magic link, no password). Only the hash is stored.
  loginTokenHash: { type: String, default: undefined, select: false },
  loginTokenExpires: { type: Date, default: undefined, select: false },
  lastLoginAt: { type: Date, default: null },

  // Agreement to auto-renewal, Terms, and Participation Waiver
  autoRenewAgreed: { type: Boolean, default: false },
  termsVersion: { type: String, default: "" },
  termsAcceptedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Membership", membershipSchema);
