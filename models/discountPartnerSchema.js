import mongoose from "mongoose";

// Member Perks: local businesses that offer a discount to GFC members
const discountPartnerSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, default: "", trim: true, maxlength: 30 },
    website: { type: String, default: "", trim: true, maxlength: 200 }, // website or Instagram
    category: { type: String, default: "", trim: true, maxlength: 60 },

    // Where members can use it
    where: { type: String, enum: ["in-store", "online", "both"], default: "in-store" },
    address: { type: String, default: "", trim: true, maxlength: 200 },

    // The offer
    offerType: { type: String, enum: ["percent", "dollar", "freebie", "other"], default: "percent" },
    offer: { type: String, required: true, trim: true, maxlength: 160 }, // e.g. "15% off your order"
    redeem: { type: String, enum: ["show-membership", "promo-code", "mention", "other"], default: "show-membership" },
    promoCode: { type: String, default: "", trim: true, maxlength: 40 },
    finePrint: { type: String, default: "", trim: true, maxlength: 1000 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null }, // null = ongoing

    agreed: { type: Boolean, default: false },
    agreedAt: { type: Date, default: null },

    // Admin
    status: { type: String, enum: ["pending", "approved", "paused", "declined"], default: "pending" },
    notes: { type: String, default: "", maxlength: 2000 },
    source: { type: String, default: "", trim: true, maxlength: 60 },
  },
  { timestamps: true }
);

export default mongoose.model("DiscountPartner", discountPartnerSchema);
