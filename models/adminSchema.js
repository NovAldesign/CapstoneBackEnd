import mongoose from "mongoose";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema(
    {
        name: { 
            type: String, 
            required: true 
        },
        email: { 
            type: String, 
            required: true, 
            unique: true,
            index: true 
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            match: [
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
                'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.'
            ]
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
        role: { 
            type: String, 
            enum: ["Admin", "Moderator"], 
            default: "Moderator" 
        },
        accessKey: { 
            type: String, 
            required: true 
        },
        status: { 
            type: String, 
            enum: ["active", "inactive"], 
            default: "active" 
        },
        
        // --- Added Preferences for Staff Gear & Event Logistics ---
        preferences: {
            apparelSize: { 
                type: String, 
                enum: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
                default: 'L' // Defaulting to a standard size to prevent seed errors
            },
            golfSkillLevel: { 
                type: String, 
                enum: ['Beginner', 'Intermediate', 'Advanced', 'Never Played'],
                default: 'Never Played'
            }
        },

        lastAction: { type: String },
        lastLoginIp: { type: String },
        createdAt: { type: Date, default: Date.now }
    }
);

// --- PASSWORD ENCRYPTION LOGIC ---
adminSchema.pre("save", async function () {
    if (!this.isModified("password")) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        console.log(`🔐 Hashing admin password for: ${this.name}`);
    } catch (err) {
        throw err;
    }
});

// Helper for login comparison
adminSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Admin", adminSchema);



