import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    ticketType: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    buyerName: {
      type: String,
      required: true,
    },
    buyerEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: true,
      // in cents
    },
    subtotal: {
      type: Number,
      required: true,
      // in cents
    },
    discount: {
      type: Number,
      default: 0,
      // in cents
    },
    total: {
      type: Number,
      required: true,
      // in cents
    },
    promoCode: {
      type: String,
      default: null,
    },
    stripePaymentIntentId: {
      type: String,
      required: true,
      unique: true,
    },
    stripeClientSecret: {
      type: String,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'refunded'],
      default: 'pending',
    },
    confirmationCode: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

// Auto-generate confirmation code before saving
OrderSchema.pre('save', function (next) {
  if (!this.confirmationCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'GFC-';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    this.confirmationCode = code;
  }
  next();
});

const Order = mongoose.model('Order', OrderSchema);

export default Order;