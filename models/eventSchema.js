import mongoose from 'mongoose';

/* -------------------------------------------------------
   Ticket Type Sub-Schema
------------------------------------------------------- */
const TicketTypeSchema = new mongoose.Schema({
  name: {
    type:     String,
    required: true,
  },
  price: {
    type:     Number,
    required: true,
    min:      0,
  },
  quantity: {
    type:     Number,
    required: true,
    min:      0,
  },
  sold: {
    type:    Number,
    default: 0,
  },
  description: {
    type:    String,
    default: '',
  },
});

TicketTypeSchema.virtual('remaining').get(function () {
  return this.quantity - this.sold;
});

TicketTypeSchema.virtual('soldOut').get(function () {
  return this.sold >= this.quantity;
});

/* -------------------------------------------------------
   Promo Code Sub-Schema
------------------------------------------------------- */
const PromocodeSchema = new mongoose.Schema({
  code: {
    type:      String,
    required:  true,
    uppercase: true,
    trim:      true,
  },
  discountType: {
    type:     String,
    enum:     ['percent', 'fixed'],
    required: true,
  },
  discountValue: {
    type:     Number,
    required: true,
  },
  maxUses: {
    type:    Number,
    default: null,
  },
  uses: {
    type:    Number,
    default: 0,
  },
  expiresAt: {
    type:    Date,
    default: null,
  },
  active: {
    type:    Boolean,
    default: true,
  },
});

/* -------------------------------------------------------
   Event Schema
------------------------------------------------------- */
const EventSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: true,
      trim:     true,
    },
    description: {
      type:     String,
      required: true,
    },
    date: {
      type:     Date,
      required: true,
    },
    endDate: {
      type:     Date,
      required: true,
    },
    location: {
      name:    { type: String, required: true },
      address: { type: String, default: '' },
      city:    { type: String, default: 'Atlanta' },
      state:   { type: String, default: 'GA' },
    },
    coverImage: {
      type:    String,
      default: '',
    },
    ticketTypes: [TicketTypeSchema],
    promoCodes:  [PromocodeSchema],
    capacity: {
      type:     Number,
      required: true,
      default:  36,
    },
    status: {
      type:    String,
      enum:    ['draft', 'published', 'cancelled', 'completed'],
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
      type:    Boolean,
      default: false,
    },
    featuredSponsor: {
      type:    String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

/* -------------------------------------------------------
   Event Virtuals
------------------------------------------------------- */
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