import mongoose from "mongoose";

// Play. Sip. Toast. — requests to host a GFC event at someone else's place
// (apartment communities, offices, teams)
const hostingInquirySchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },

    organization: { type: String, default: "", trim: true }, // property or company name
    clientType: { type: String, enum: ["residents", "corporate", "other"], default: "residents" },
    package: { type: String, default: "", trim: true },
    guestCount: { type: Number, min: 1, max: 1000 },
    preferredDate: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    toastUpgrade: { type: Boolean, default: false },
    frequency: { type: String, default: "One-time event", trim: true }, // one-time or a series
    notes: { type: String, default: "", trim: true },
    source: { type: String, default: "", trim: true }, // ?src= from the link

    status: {
      type: String,
      enum: ["new", "contacted", "quoted", "booked", "closed"],
      default: "new",
    },
    adminNotes: { type: String, default: "", trim: true }, // private notes from the dashboard
  },
  { timestamps: true }
);

const HostingInquiry = mongoose.model("HostingInquiry", hostingInquirySchema);
export default HostingInquiry;
