import mongoose from "mongoose";

// Gift cards (dollar balance), Holiday Passes (prepaid tickets)
// and bonus cards (Cyber Monday). One code = one card.
const RedemptionSchema = new mongoose.Schema(
  {
    confirmationCode: { type: String, default: "" },
    stripeSessionId: { type: String, default: "" },
    cents: { type: Number, default: 0 },
    uses: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const GiftCardSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    kind: { type: String, enum: ["gift", "pass", "bonus"], required: true },
    label: { type: String, default: "" },
    productId: { type: String, default: "" }, // pass3, pass5, gift

    // Gift and bonus cards: dollar balance
    initialCents: { type: Number, default: 0 },
    balanceCents: { type: Number, default: 0 },
    // Holiday Passes: tickets left
    initialUses: { type: Number, default: 0 },
    usesLeft: { type: Number, default: 0 },
    maxCoverCents: { type: Number, default: 0 }, // most a pass pays for one ticket

    expiresAt: { type: Date, default: null },
    status: { type: String, enum: ["active", "void"], default: "active" },

    // Who bought it, and who it's for
    purchaserName: { type: String, default: "", trim: true },
    purchaserEmail: { type: String, default: "", lowercase: true, trim: true },
    isGift: { type: Boolean, default: false },
    recipientName: { type: String, default: "", trim: true },
    recipientEmail: { type: String, default: "", lowercase: true, trim: true },
    fromName: { type: String, default: "", trim: true },
    message: { type: String, default: "", maxlength: 400 },
    sendAt: { type: Date, default: null }, // when to email the recipient
    sentAt: { type: Date, default: null },

    stripeSessionId: { type: String },
    paidCents: { type: Number, default: 0 },
    saleKey: { type: String, default: "" }, // blackfriday, cybermonday
    source: { type: String, default: "" },
    createdBy: { type: String, default: "" }, // "admin" for comp cards

    redemptions: [RedemptionSchema],
  },
  { timestamps: true }
);

// A Stripe payment creates each kind of card once, even if Stripe retries the webhook
GiftCardSchema.index(
  { stripeSessionId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { stripeSessionId: { $type: "string" } } }
);
GiftCardSchema.index({ sendAt: 1, sentAt: 1 });

export default mongoose.models.GiftCard || mongoose.model("GiftCard", GiftCardSchema);
