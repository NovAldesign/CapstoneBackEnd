import mongoose from "mongoose";

// Industry scouts: label reps, managers, A&R, booking agents, producers.
// They sign up at /scouts, get a free ticket to the showcases they pick,
// and (if they say yes) hear about new showcases first.
export const SCOUT_TITLES = [
  "A&R",
  "Artist Manager",
  "Label Owner or Executive",
  "Booking Agent",
  "Producer",
  "Publisher",
  "Talent Scout",
  "Gallery or Curator",
  "Other",
];

export const SCOUT_INTERESTS = [
  "Artists to sign",
  "Artists to manage",
  "Talent to book",
  "Collaborators",
  "Visual artists",
];

const scoutSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },

    company: { type: String, default: "", trim: true, maxlength: 120 },
    title: { type: String, default: "Other", trim: true, maxlength: 60 },
    lookingFor: [{ type: String, trim: true }],
    genres: { type: String, default: "", trim: true, maxlength: 200 },
    website: { type: String, default: "", trim: true, maxlength: 300 },
    instagram: { type: String, default: "", trim: true, maxlength: 80 },

    // Showcases they're on the guest list for (event ids)
    eventIds: [{ type: String }],
    // OK to email them when new showcases are added
    notify: { type: Boolean, default: true },

    agreedAt: { type: Date, default: Date.now },
    source: { type: String, default: "", trim: true, maxlength: 120 },
    adminNotes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

export default mongoose.model("Scout", scoutSchema);
