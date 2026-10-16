import crypto from "crypto";
import mongoose from "mongoose";

// Printable downloads (Karaoke Bingo cards). The token is the buyer's private download link.
const DigitalItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, default: "" },
    priceCents: { type: Number, default: 0 },
    files: [{ type: String }],
  },
  { _id: false }
);

const DigitalOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, default: "" },
    token: { type: String, unique: true, index: true },
    buyerName: { type: String, default: "", trim: true },
    buyerEmail: { type: String, default: "", lowercase: true, trim: true },
    items: [DigitalItemSchema],
    totalPaidCents: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    lastDownloadAt: { type: Date, default: null },
    source: { type: String, default: "" },
    status: { type: String, enum: ["paid", "refunded"], default: "paid" },
  },
  { timestamps: true }
);

DigitalOrderSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    this.orderNumber = `GFC-D${code}`;
  }
  if (!this.token) this.token = crypto.randomBytes(24).toString("hex");
  next();
});

export default mongoose.models.DigitalOrder || mongoose.model("DigitalOrder", DigitalOrderSchema);
