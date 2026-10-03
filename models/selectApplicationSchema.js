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
    friendName: { type: String, default: "", trim: true, maxlength: 80 }, // applying with a friend
    friendEmail: { type: String, default: "", lowercase: true, trim: true, maxlength: 120 },
    friendGender: { type: String, default: "" }, // man | woman

    // Dating
    lookingFor: { type: String, default: "", trim: true, maxlength: 80 },
    isSingle: { type: Boolean, default: false },
    whyNow: { type: String, default: "", trim: true, maxlength: 800 },
    firstDate: { type: String, default: "", trim: true, maxlength: 800 },
    matters: { type: String, default: "", trim: true, maxlength: 800 },
    learnLater: { type: String, default: "", trim: true, maxlength: 800 },
    hasKids: { type: String, default: "" }, // yes | no
    wantsKids: { type: String, default: "" }, // yes | no | open | done
    ageMin: { type: Number, default: null }, // ages they'd like to meet
    ageMax: { type: Number, default: null },
    nightGoal: { type: String, default: "" }, // one | few | friends | out

    // What you value: each rated 1 (not important) to 5 (essential)
    values: {
      faith: { type: Number, min: 1, max: 5 },
      family: { type: Number, min: 1, max: 5 },
      friends: { type: Number, min: 1, max: 5 },
      finances: { type: Number, min: 1, max: 5 },
      career: { type: Number, min: 1, max: 5 },
      health: { type: Number, min: 1, max: 5 },
      adventure: { type: Number, min: 1, max: 5 },
      growth: { type: Number, min: 1, max: 5 },
      fun: { type: Number, min: 1, max: 5 },
      community: { type: Number, min: 1, max: 5 },
    },
    valuesWhy: { type: String, default: "", trim: true, maxlength: 800 },

    // How you connect
    social: { type: String, default: "" }, // room | few | mix
    conflict: { type: String, default: "" }, // now | later | show
    pace: { type: String, default: "" }, // slow | steady | fast
    roles: { type: String, default: "" }, // lead | partner | flex
    weekend: { type: String, default: "" }, // out | home | mix
    giveLove: [{ type: String }], // 2 of: words, time, service, gifts, touch
    receiveLove: [{ type: String }],

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

    // Emails sent from the dashboard (e.g. "You've been selected")
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

export default mongoose.model("SelectApplication", selectApplicationSchema);
