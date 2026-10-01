import mongoose from "mongoose";

// Guest reviews for the home page "Real Voices" section.
// Guests submit from the website (status: pending). You approve them in the
// admin dashboard, or paste in reviews from Google, Eventbrite or Meetup.
const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, default: "", lowercase: true, trim: true }, // never shown on the site
    event: { type: String, default: "", trim: true, maxlength: 80 }, // e.g. "Game Night"
    rating: { type: Number, min: 1, max: 5, default: 5 },
    text: { type: String, required: true, trim: true, maxlength: 1500 },

    source: {
      type: String,
      enum: ["website", "google", "eventbrite", "meetup", "other"],
      default: "website",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "hidden"],
      default: "pending",
    },
    featured: { type: Boolean, default: false }, // the big card on the home page
    canShare: { type: Boolean, default: true }, // guest said OK to post it
  },
  { timestamps: true }
);

reviewSchema.index({ status: 1, featured: -1, createdAt: -1 });

export default mongoose.model("Review", reviewSchema);
