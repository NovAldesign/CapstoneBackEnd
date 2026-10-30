import mongoose from "mongoose";

// DJs who want to spin at Scratched & Stirred™, the Grown Folks DJ night (launching 2027).
// They join the list at /perform/dj. One record per email; signing up again updates it.
// Keep ERAS, EQUIPMENT and NIGHTS in sync with src/Pages/DJs.jsx in the frontend.
export const DJ_ERAS = [
  "70s & 80s Soul and Funk",
  "90s R&B",
  "90s Hip Hop",
  "2000s R&B",
  "2000s Hip Hop",
  "Old School House",
  "House & Dance",
  "Afrobeats & Amapiano",
  "Reggae & Dancehall",
  "Line Dance & Southern Soul",
  "Neo-Soul",
  "Gospel House",
];
export const DJ_EQUIPMENT = [
  "I bring my full setup (controller and speakers)",
  "I bring my controller, I need speakers",
  "I need everything provided",
];
export const DJ_NIGHTS = ["Friday nights", "Saturday nights", "Weeknights", "Daytime events"];

const djApplicationSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },

    djName: { type: String, required: true, trim: true, maxlength: 80 },
    instagram: { type: String, default: "", trim: true, maxlength: 80 },
    tiktok: { type: String, default: "", trim: true, maxlength: 80 },
    mixLinks: [{ type: String, trim: true, maxlength: 300 }],

    eras: [{ type: String, trim: true }],
    otherStyles: { type: String, default: "", trim: true, maxlength: 200 },
    yearsSpinning: { type: String, default: "", trim: true, maxlength: 20 },
    equipment: { type: String, default: "", trim: true, maxlength: 80 },
    nights: [{ type: String, trim: true }],
    about: { type: String, default: "", trim: true, maxlength: 1200 },
    alsoBooks: { type: Boolean, default: false }, // open to private and corporate gigs

    notify: { type: Boolean, default: true },
    agreedAt: { type: Date, default: null },
    source: { type: String, default: "", trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

const DjApplication = mongoose.models.DjApplication || mongoose.model("DjApplication", djApplicationSchema);
export default DjApplication;
