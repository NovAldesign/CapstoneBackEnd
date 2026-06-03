import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, index: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, required: true, trim: true },
  dob: { type: Date, required: true },
  tier: { type: String, enum: ["Social", "Founding"], required: true },
  connectionGoals: {
    primaryInterest: { type: String, enum: ["Meet New People", "Play / Games", "Local Events"], default: "Meet New People" },
    isolationBarrier: { type: String, default: "" }
  },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Membership", membershipSchema);