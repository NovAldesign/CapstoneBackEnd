import mongoose from "mongoose";

// -------------------------------------------------------
// Partner portal details, shared by sponsors (Partnership)
// and Member Perks partners (DiscountPartner).
// Stored as `portal` on each record.
// -------------------------------------------------------
const str = (max) => ({ type: String, default: "", trim: true, maxlength: max });

const partnerPortalSchema = new mongoose.Schema(
  {
    // Magic-link sign-in (one-time link, like the member dashboard)
    loginTokenHash: { type: String, default: undefined, index: true },
    loginTokenExpires: { type: Date, default: undefined },
    lastLoginAt: { type: Date, default: null },
    invitedAt: { type: Date, default: null },

    // Brand assets (Cloudinary URLs)
    logoUrl: str(400),
    photos: { type: [String], default: [] },
    brandColors: str(120),

    // Sponsor details
    blurb: str(600),
    website: str(200),
    instagram: str(120),
    facebook: str(200),
    tiktok: str(120),
    onsiteName: str(80),
    onsitePhone: str(30),
    tableNeeds: str(600),
    signageNeeds: str(600),
    samplingPlan: str(1000),

    // Perk details
    photoUrl: str(400), // storefront or product photo
    perkConfirmedAt: { type: Date, default: null },

    // Agreement (one-click e-sign)
    agreement: {
      name: str(120),
      signedAt: { type: Date, default: null },
      version: str(40),
      ip: str(60),
      readInFull: { type: Boolean, default: false }, // scrolled to the end before signing
    },

    // Sponsor payment
    amountCents: { type: Number, default: 0, min: 0 },
    paidAt: { type: Date, default: null },
    stripeSessionId: str(200),
    receiptUrl: str(500),

    // Event day (set by GFC)
    eventId: str(40),
    loadIn: str(120),

    // After the event (set by GFC)
    recapUrl: str(400),
    recapNote: str(1000),
    newsletterUrl: str(400),

    // Reminder emails for missing items
    remindersSent: { type: Number, default: 0 },
    lastReminderAt: { type: Date, default: null },
  },
  { _id: false }
);

export default partnerPortalSchema;
