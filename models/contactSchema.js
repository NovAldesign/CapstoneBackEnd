import mongoose from 'mongoose';

const ContactSchema = new mongoose.Schema(
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
    reason: {
      type: String,
      required: true,
      enum: [
        'General Inquiry',
        'Event Question',
        'Membership Question',
        'Sponsorship / Partnership',
        'Media or Press',
        'Plan an Event for Me',
      ],
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    eventDetails: {
      eventType: { type: String, default: '' },
      guestCount: { type: String, default: '' },
      preferredDate: { type: String, default: '' },
      budget: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ['new', 'read', 'responded', 'archived'],
      default: 'new',
    },
    notificationSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Contact = mongoose.model('Contact', ContactSchema);

export default Contact;