import mongoose from "mongoose";

const subscriberSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, "Full name is required"],
    trim: true,
  },
  email: {
    type: String,
    required: [true, "Email address is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
  },
  smsOptIn: {
    type: Boolean,
    default: false,
  },
  phoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (this.smsOptIn && (!v || v.trim().length === 0)) {
          return false;
        }
        if (this.smsOptIn) {
          return /^\+?[1-9]\d{1,14}$|^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(v);
        }
        return true;
      },
      message: "Please provide a valid phone number to receive text messages.",
    },
  },
  // Proof of text-message consent (required by the TCPA)
  smsConsentAt: { type: Date, default: null },
  smsConsentText: { type: String, default: "" },
  smsConsentVersion: { type: String, default: "" },
  source: { type: String, default: "", trim: true }, // where they signed up (footer, blog:slug)
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Subscriber", subscriberSchema);