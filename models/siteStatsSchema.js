import mongoose from "mongoose";

// The numbers shown around the website: platform ratings, follower counts and
// "By The Numbers". Edited in the admin dashboard (Reviews tab and Site Numbers tab).
// There's only ever one of these (key: "main").
const siteStatsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },

    // Ratings (home page "Real Voices")
    eventbriteRating: { type: Number, min: 0, max: 5, default: 4.9 },
    meetupRating: { type: Number, min: 0, max: 5, default: 4.8 },

    // Followers and members. 0 = hidden on the site.
    tiktok: { type: Number, min: 0, default: 1722 },
    instagram: { type: Number, min: 0, default: 0 },
    facebook: { type: Number, min: 0, default: 0 },
    threads: { type: Number, min: 0, default: 0 },
    meetup: { type: Number, min: 0, default: 199 },
    email: { type: Number, min: 0, default: 259 },

    // "Community Members" on About, Login and Partnership pages
    communityTotal: { type: Number, min: 0, default: 2370 },

    // About page "By The Numbers"
    eventsHosted: { type: Number, min: 0, default: 21 },
    soldOut: { type: Number, min: 0, default: 5 },
  },
  { timestamps: true }
);

export default mongoose.model("SiteStats", siteStatsSchema);
