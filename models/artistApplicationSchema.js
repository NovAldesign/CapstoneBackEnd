import mongoose from "mongoose";

// Artists applying to perform at GFC showcases.
// Approved artists (with permission) appear in "Meet the Artists" on the event page.
const artistApplicationSchema = new mongoose.Schema(
  {
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
    signedAt: { type: Date, default: Date.now },

    // Review
    status: {
      type: String,
      enum: ["pending", "approved", "declined"],
      default: "pending",
    },
     reviewToken: { type: String, required: true },
    reviewedAt: { type: Date, default: null },

    // Set when you approve
    promoCode: { type: String, default: "", trim: true },
    bookingEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const ArtistApplication = mongoose.model("ArtistApplication", artistApplicationSchema);
export default ArtistApplication;