import mongoose from "mongoose";
import partnerPortalSchema from "./partnerPortalSchema.js";

const partnershipSchema = new mongoose.Schema({
    companyName: { 
        type: String, 
        required: true,
        trim: true 
    },
    contactPerson: { 
        type: String, 
        required: true,
        trim: true 
    },
    email: { 
        type: String, 
        required: true, 
        lowercase: true,
        trim: true
        // REMOVED unique: true so the same brand can submit multiple inquiries across event cycles!
    },
    phone: { 
        type: String, 
        default: "" 
    },
    tierRequested: { 
        type: String, 
        default: "" 
    },
    eventsInterested: { 
        type: [String], 
        default: [] 
    },
    hostingInterest: { 
        type: String, 
        default: "" 
    },
    details: { 
        type: String, 
        default: "" 
    },
    
    // Kept safe for your internal admin management dashboard panels later
    status: { 
        type: String, 
        enum: ["pending", "contacted", "accepted", "active", "declined", "expired"], 
        default: "pending" 
    },
    adminNotes: { type: String, default: "", trim: true }, // private notes from the dashboard
    // Partner portal (magic-link sign-in, uploads, checklist, agreement, payment)
    portal: { type: partnerPortalSchema, default: () => ({}) },
}, { timestamps: true });

export default mongoose.model("Partnership", partnershipSchema);









