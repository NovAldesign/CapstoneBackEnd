import mongoose from "mongoose";

// Artists, hosts and live visual artists applying for GFC showcases.
// Approved artists (with permission) appear in "Meet the Artists" on the event page.
const artistApplicationSchema = new mongoose.Schema(
  {
    // "artist" = singer or musician · "host" = runs the night (MC) · "visual" = live painter or sketch artist
    role: { type: String, enum: ["artist", "host", "visual"], default: "artist" },

    // Private contact info
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },

    // Public "Meet the Artists" info
    artistName: { type: String, required: true, trim: true },
    genres: { type: String, default: "", trim: true },
    hometown: { type: String, default: "", trim: true },
    bio: { type: String, default: "", trim: true },
    headshotUrl: { type: String, default: "" },
    instagram: { type: String, default: "", trim: true },
    tiktok: { type: String, default: "", trim: true },
    otherSocial: { type: String, default: "", trim: true },
    performanceLinks: [{ type: String, trim: true }],

    // Booking details
    eventId: { type: String, default: "" },
    eventName: { type: String, default: "", trim: true },
    equipmentNotes: { type: String, default: "", trim: true },
    needsPower: { type: Boolean, default: false },
    payoutMethod: { type: String, enum: ["Zelle", "Cash App", ""], default: "" },
    payoutHandle: { type: String, default: "", trim: true },

    // Agreement
    termsAccepted: { type: Boolean, required: true },
    agreementVersion: { type: String, default: "" }, // Performer Agreement version they signed
    featureConsent: { type: Boolean, default: false },
    signatureName: { type: String, required: true, trim: true },
    // They confirmed they're the artist and completed and signed the form themselves
    selfAttested: { type: Boolean, default: false },
    signedIp: { type: String, default: "" },
    signedAt: { type: Date, default: Date.now },

    // Review
    // roster = saved for later: off the lineup, but everything they sent is kept
    // so you can book them again (Showcases tab > Roster)
    status: {
      type: String,
      enum: ["pending", "approved", "declined", "roster"],
      default: "pending",
    },
    rosterNote: { type: String, default: "", trim: true }, // e.g. "Out for surgery. Hosting after the new year."
    rosteredAt: { type: Date, default: null },
    // Shows they were taken off of (kept so you can see their past with us)
    history: [
      {
        eventId: { type: String, default: "" },
        eventName: { type: String, default: "" },
        note: { type: String, default: "" },
        at: { type: Date, default: Date.now },
      },
    ],
     reviewToken: { type: String, required: true },
    reviewedAt: { type: Date, default: null },

    // Set when you approve
    promoCode: { type: String, default: "", trim: true },
    bookingEmailSentAt: { type: Date, default: null },

    // Payout after the show (set from the dashboard)
    payoutPaidAt: { type: Date, default: null },
    payoutAmount: { type: Number, default: 0 }, // dollars
    adminNotes: { type: String, default: "", trim: true },
    // Hide from the "On Our Stage" gallery on the Perform pages (still shows on their event page)
    galleryHidden: { type: Boolean, default: false },

    // Instagram/TikTok Live before the show. Set up in the dashboard (Lives tab);
    // the artist picks a date and platform on their private /live-setup link.
    live: {
      token: { type: String, default: "" },
      // "" = not set up · invited = link sent · confirmed = date picked · needs-date = none of the dates worked
      status: { type: String, enum: ["", "invited", "confirmed", "needs-date"], default: "" },
      options: [{ type: Date }], // date choices offered
      questions: [{ type: String, trim: true }], // what we'll ask on the Live
      notes: [{ type: String, trim: true }], // their optional talking points, one per question
      date: { type: Date, default: null },
      platform: { type: String, enum: ["", "instagram", "tiktok", "facebook"], default: "" },
      handle: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true },
      plug: { type: String, default: "", trim: true }, // what they want to promote
      extraQuestion: { type: String, default: "", trim: true }, // a question they'd love to be asked
      customRequest: { type: String, default: "", trim: true }, // other times that work, when none did
      invitedAt: { type: Date, default: null },
      confirmedAt: { type: Date, default: null },
      confirmationSentAt: { type: Date, default: null },
      inviteSentAt: { type: Date, default: null }, // when we emailed them their Live link
      completedAt: { type: Date, default: null }, // you checked "Done": it moves to Archived
      artistChose: { type: Boolean, default: false }, // you entered a time the artist gave you; the email asks them to approve it
      approvedAt: { type: Date, default: null }, // they tapped "Yes, this time works"
    },
  },
  { timestamps: true }
);

const ArtistApplication = mongoose.model("ArtistApplication", artistApplicationSchema);
export default ArtistApplication;