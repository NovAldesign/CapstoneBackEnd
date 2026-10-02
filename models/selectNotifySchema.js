import mongoose from "mongoose";

// GFC Select™ "notify me when the doors open" list
const selectNotifySchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, default: "", trim: true, maxlength: 30 },
    gender: { type: String, enum: ["man", "woman", ""], default: "" },
    textOk: { type: Boolean, default: false }, // agreed to text reminders
    source: { type: String, default: "", trim: true, maxlength: 60 },
    emailLog: [
      {
        _id: false,
        subject: { type: String, maxlength: 200 },
        sentAt: { type: Date },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("SelectNotify", selectNotifySchema);
