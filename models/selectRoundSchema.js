import mongoose from "mongoose";

// GFC Select™ application window ("the doors").
// Only one round is used at a time: the most recently updated one.
//   before opensAt          -> "soon"   (notify me only)
//   opensAt .. closesAt     -> "open"   (application form shows)
//   after closesAt          -> "closed" (notify me for next time)
const selectRoundSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true, maxlength: 80 }, // e.g. "January 2027"
    opensAt: { type: Date },
    closesAt: { type: Date },
    eventDate: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("SelectRound", selectRoundSchema);
