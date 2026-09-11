const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email address is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  smsOptIn: {
    type: Boolean,
    default: false
  },
  phoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        // If user opted into SMS, phone number cannot be empty
        if (this.smsOptIn && (!v || v.trim().length === 0)) {
          return false;
        }
        // Basic phone number format validation (accepts standard formats like 512-555-0654 or (512) 555-0654)
        if (this.smsOptIn) {
          return /^\+?[1-9]\d{1,14}$|^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(v);
        }
        return true;
      },
      message: 'Please provide a valid phone number to receive text messages.'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Subscriber', subscriberSchema);