import mongoose from "mongoose";

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
        enum: ["pending", "active", "expired", "accepted"], 
        default: "pending" 
    }
}, { timestamps: true });

export default mongoose.model("Partnership", partnershipSchema);









