import mongoose from 'mongoose';

const TravelInterestSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    interestedTrips: {
      type: [String],
      default: [],
      // e.g. ['Virgin Voyages Cruise', 'Weekend Retreat']
    },
    groupSize: {
      type: String,
      default: '',
      // 'Just me', 'Me + 1', 'Me + 2 or more'
    },
    budgetRange: {
      type: String,
      default: '',
    },
    isMember: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'booked', 'passed'],
      default: 'new',
    },
  },
  { timestamps: true }
);

const TravelInterest = mongoose.model('TravelInterest', TravelInterestSchema);

export default TravelInterest;