import mongoose from "mongoose";

const contactSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, "First name is required"],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, "Last name is required"],
    trim: true
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    default: ""
  },
  reason: {
    type: String,
    required: [true, "Reason for contact is required"]
  },
  message: {
    type: String,
    required: [true, "Message payload is required"],
    trim: true
  },
  // Captures structural details dynamically if the user selects "Plan an Event for Me"
  eventDetails: {
    eventType: { type: String, default: "" },
    guestCount: { type: String, default: "" },
    preferredDate: { type: String, default: "" },
    budget: { type: String, default: "" }
  },
  status: {
    type: String,
    enum: ["unread", "read", "archived"],
    default: "unread"
  }
}, { 
  timestamps: true 
});

const Contact = mongoose.model("Contact", contactSchema);
export default Contact;