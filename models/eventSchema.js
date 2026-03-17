import mongoose from 'mongoose';

const TicketTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    // e.g. 'General Admission', 'VIP', 'Founding Member'
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    // stored in cents for Stripe — e.g. 5000 = $50.00
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  sold: {
    type: Number,
    default: 0,
  },
  description: {
    type: String,
    default: '',
  },
});

TicketTypeSchema.virtual('remaining').get(function () {
  return this.quantity - this.sold;
});

TicketTypeSchema.virtual('soldOut').get(function () {
  return this.sold >= this.quantity;
});

const PromocodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  discountType: {
    type: String,
    enum: ['percent', 'fixed'],
    required: true,
    // 'percent' = e.g. 20% off
    // 'fixed'   = e.g. $10 off (stored in cents)
  },
  discountValue: {
    type: Number,
    required: true,
  },
  maxUses: {
    type: Number,
    default: null,
  },
  uses: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  active: {
    type: Boolean,
    default: true,
  },
});

const EventSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    location: {
      name: { type: String, required: true },
      address: { type: String, default: '' },
      city: { type: String, default: 'Atlanta' },
      state: { type: String, default: 'GA' },
    },
    coverImage: {
      type: String,
      default: '',
    },
    ticketTypes: [TicketTypeSchema],
    promoCodes: [PromocodeSchema],
    capacity: {
      type: Number,
      required: true,
      default: 36,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled', 'completed'],
      default: 'published',
    },
    eventType: {
      type: String,
      enum: [
        'Game Night',
        'Spades Tournament',
        'Luxury Bingo',
        'Intentional Conversations Over Dinner',
        'Social Mixer',
        'Group Travel',
        'Other',
      ],
      default: 'Other',
    },
    isFree: {
      type: Boolean,
      default: false,
    },
    featuredSponsor: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

EventSchema.virtual('totalSold').get(function () {
  return this.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
});

EventSchema.virtual('isSoldOut').get(function () {
  return this.ticketTypes.every((t) => t.sold >= t.quantity);
});

EventSchema.virtual('isUpcoming').get(function () {
  return new Date(this.date) >= new Date();
});

const Event = mongoose.model('Event', EventSchema);

export default Event;