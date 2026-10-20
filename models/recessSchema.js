import mongoose from "mongoose";

// Recess Talks: a monthly speaker series on play, joy and inner-child healing.
// Speakers apply at /recess (authors, professors, therapists, coaches, creatives).
// Guests join the interest list to hear when tickets open.

export const SPEAKER_TYPES = [
  "Author",
  "Professor or Educator",
  "Therapist or Counselor",
  "Coach",
  "Wellness Practitioner",
  "Artist or Creative",
  "Other",
];

export const BOOK_OPTIONS = ["Sell and sign books", "Sign books only", "No books", "Not sure yet"];
export const AVAILABILITY = ["Saturday mornings", "Saturday afternoons"];

const speakerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },

    speakerType: { type: String, default: "Other", trim: true, maxlength: 60 },
    organization: { type: String, default: "", trim: true, maxlength: 150 }, // school, practice, publisher
    about: { type: String, default: "", trim: true, maxlength: 1200 }, // background and credentials

    talkTitle: { type: String, required: true, trim: true, maxlength: 150 },
    talkSummary: { type: String, required: true, trim: true, maxlength: 2000 },
    interactive: { type: String, default: "", trim: true, maxlength: 1200 }, // how they'd bring play into it

    bookTitles: { type: String, default: "", trim: true, maxlength: 400 },
    books: { type: String, default: "Not sure yet", trim: true, maxlength: 40 },
    website: { type: String, default: "", trim: true, maxlength: 300 },
    instagram: { type: String, default: "", trim: true, maxlength: 80 },
    videoLink: { type: String, default: "", trim: true, maxlength: 300 }, // a past talk or interview

    availability: [{ type: String, trim: true }],
    notes: { type: String, default: "", trim: true, maxlength: 1000 },

    // They confirmed they're the speaker and agreed to the Code of Conduct
    agreedAt: { type: Date, default: Date.now },
    source: { type: String, default: "", trim: true, maxlength: 120 },

    status: { type: String, enum: ["new", "talking", "booked", "not-now"], default: "new" },
    adminNotes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

const interestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    source: { type: String, default: "", trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

export const RecessSpeaker = mongoose.model("RecessSpeaker", speakerSchema);
export const RecessInterest = mongoose.model("RecessInterest", interestSchema);
