import mongoose from "mongoose";

// Clicks on grownfolkscollective.com/go/<code> short links, one row per link + tag + day (Eastern).
// No personal info: just counts.
const linkClickSchema = new mongoose.Schema({
  code: { type: String, required: true },
  src: { type: String, default: "" },   // the ?src= tag, e.g. "lawncare" for one prospect
  day: { type: String, required: true }, // YYYY-MM-DD, Atlanta time
  count: { type: Number, default: 0 },
  lastAt: { type: Date },
});
linkClickSchema.index({ code: 1, src: 1, day: 1 }, { unique: true });

export default mongoose.model("LinkClick", linkClickSchema);
