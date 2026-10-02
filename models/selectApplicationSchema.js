import mongoose from "mongoose";

// GFC Select — applications for the curated 30+ singles masquerade.
// Answers are private: only the GFC team sees them.
const selectApplicationSchema = new mongoose.Schema(
  {
    // About you
    firstName: { type: String, required: true, trim: true, maxlength: 40 },
    lastName: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    birthdate: { type: Date, required: true },
    gender: { type: String, enum: ["man", "woman"], required: true }, // room is 20 men / 20 women
    area: { type: String, default: "", trim: true, maxlength: 60 }, // side of town
    occupation: { type: String, default: "", trim: true, maxlength: 80 },
    instagram: { type: String, default: "", trim: true, maxlength: 60 },
    heardFrom: { type: String, default: "", trim: true, maxlength: 80 },
    referredBy: { type: String, default: "", trim: true, maxlength: 80 },

    // Dating
    lookingFor: { type: String, default: "", trim: true, maxlength: 80 },
    isSingle: { type: Boolean, default: false },
    whyNow: { type: String, default: "", trim: true, maxlength: 800 },
    firstDate: { type: String, default: "", trim: true, maxlength: 800 },
    matters: { type: String, default: "", trim: true, maxlength: 800 },
    learnLater: { type: String, default: "", trim: true, maxlength: 800 },

    // Bingo card prompts: [{ prompt, answer }]
    bingo: [
      {
        _id: false,
        prompt: { type: String, trim: true, maxlength: 80 },
        answer: { type: String, trim: true, maxlength: 160 },
      },
    ],

    // Food
    allergies: [{ type: String, trim: true, maxlength: 40 }],
    allergyOther: { type: String, default: "", trim: true, maxlength: 200 },
    diet: [{ type: String, trim: true, maxlength: 40 }],

    // Agreements (all must be true to apply)
    agreed: { type: Boolean, default: false },

    // Your review
    status: {
      type: String,
      enum: ["new", "selected", "waitlist", "not_this_time"],
      default: "new",
      index: true,
    },
    notes: { type: String, default: "", maxlength: 2000 }, // private team notes
    source: { type: String, default: "", trim: true, maxlength: 60 }, // ?src= tracking
  },
  { timestamps: true }
);

export default mongoose.model("SelectApplication", selectApplicationSchema);
