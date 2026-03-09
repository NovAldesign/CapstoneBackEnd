import mongoose from "mongoose";
import bcrypt from "bcrypt";

const partnershipSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    industry: { type: String, required: true },
    
    // Contact Person Details
    contactPerson: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { 
        type: String, 
        required: true,
        match: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Weak password']
    },

    // Partnership Logistics
    tier: { type: String, enum: ['Founding Partner', 'Title Sponsor', 'In-Kind Donor'], default: 'Title Sponsor' },
    contributionType: { type: String, enum: ['Financial', 'Venue', 'Service', 'Product'] },
    contractStart: { type: Date, required: true },
    contractEnd: { type: Date, required: true },
    
    // Portal Assets (For document uploads later)
    documents: [{ 
        fileName: String, 
        fileUrl: String, 
        uploadedAt: { type: Date, default: Date.now } 
    }],
    
    status: { type: String, enum: ['pending', 'active', 'expired'], default: 'pending' }
});

// Password Hashing Middleware
partnershipSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

export default mongoose.model("Partnership", partnershipSchema);









