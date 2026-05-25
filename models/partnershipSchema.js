import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const partnershipSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    contactPerson: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    
    // Optional for intake phase (so the lean form doesn't crash)
    industry: { type: String, required: false },
    phone: { type: String, required: false },
    
    // Passwords made optional here so brands don't create profiles before you vet them
    password: { 
        type: String, 
        required: false,
        match: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Weak password']
    },
    securityQuestion: {
        type: String,
        enum: [
            "What was the name of your first pet?",
            "What city did you meet your best friend in?",
            "What was your favorite childhood board game?",
            "What was the make of your first car?"
        ]
    },
    securityAnswer: { type: String, select: false },

    // Partnership Logistics (Matched to sync with your actual React state inputs)
    tierRequested: { type: String, default: 'Bronze' },
    eventsInterested: { type: [String], default: [] },
    hostingInterest: { type: String, default: '' },
    details: { type: String, default: '' },
    
    contributionType: { type: String, enum: ['Financial', 'Venue', 'Service', 'Product'] },
    contractStart: { type: Date, required: false },
    contractEnd: { type: Date, required: false },
    
    documents: [{ 
        fileName: String, 
        fileUrl: String, 
        uploadedAt: { type: Date, default: Date.now } 
    }],
    
    status: { type: String, enum: ['pending', 'active', 'expired'], default: 'pending' }
}, { timestamps: true });

// Password Hashing Middleware (Only triggers if a password is actually supplied)
partnershipSchema.pre("save", async function (next) {
    if (!this.password || !this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

export default mongoose.model("Partnership", partnershipSchema);









