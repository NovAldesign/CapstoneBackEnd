import mongoose from "mongoose";

// Merch pre-orders. Paid on our site, then placed in Printful after the pre-sale closes.
const MerchItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, default: "" },
    size: { type: String, default: "" },
    color: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    priceCents: { type: Number, default: 0 },
    printful: { type: String, default: "" },
  },
  { _id: false }
);

const MerchOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, default: "" },
    buyerName: { type: String, default: "", trim: true },
    buyerEmail: { type: String, default: "", lowercase: true, trim: true },
    buyerPhone: { type: String, default: "", trim: true },
    shipping: {
      name: { type: String, default: "" },
      line1: { type: String, default: "" },
      line2: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "US" },
    },
    items: [MerchItemSchema],
    subtotalCents: { type: Number, default: 0 },
    shippingCents: { type: Number, default: 0 },
    totalPaidCents: { type: Number, default: 0 },
    source: { type: String, default: "" },
    status: {
      type: String,
      enum: ["preorder", "ordered", "shipped", "cancelled"],
      default: "preorder",
    },
    adminNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

MerchOrderSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    this.orderNumber = `GFC-M${code}`;
  }
  next();
});

export default mongoose.models.MerchOrder || mongoose.model("MerchOrder", MerchOrderSchema);
