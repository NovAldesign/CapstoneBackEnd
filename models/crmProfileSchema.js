import mongoose from "mongoose";

// CRM profile: Vaughn's own notes about a person, keyed by email.
// Everything else (tickets, guest lists, signups) is pulled live from the
// other collections; this only stores what Vaughn adds by hand.
const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const crmProfileSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },

    // Brevo tracking
    addedToBrevo: { type: Boolean, default: false },
    addedToBrevoAt: { type: Date, default: null },

    // Details to help remember people
    nickname: { type: String, default: "", trim: true, maxlength: 60 },
    howWeMet: { type: String, default: "", trim: true, maxlength: 200 },
    referredBy: { type: String, default: "", trim: true, maxlength: 120 },
    birthday: { type: String, default: "", trim: true, maxlength: 20 }, // free text, e.g. "Oct 17" or "1985-10-17"
    favoriteGame: { type: String, default: "", trim: true, maxlength: 120 },
    interests: { type: String, default: "", trim: true, maxlength: 300 },
    sideOfTown: { type: String, default: "", trim: true, maxlength: 80 },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
    notes: [noteSchema],
  },
  { timestamps: true }
);

export default mongoose.model("CrmProfile", crmProfileSchema);
