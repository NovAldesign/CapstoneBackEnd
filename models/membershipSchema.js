import mongoose from "mongoose";
import bcrypt from "bcrypt";

const membershipSchema = new mongoose.Schema(
    {
        // --- Demographics ---
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        email: {
            type: String,
            unique: true,
            required: true,
            index: true,
        },
        phone: {
            type: String,
            unique: true,
            required: true,
        },
        dob: { type: Date, required: true },
        industry: {
            type: String,
            required: true,
            index: true,
        },

        // --- Security & Auth ---
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters long']
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

        // --- Membership Status ---
        tier: {
            type: String,
            enum: ["Platinum", "Gold", "Silver"],
            default: "Silver",
        },
        status: {
            type: String,
            enum: ["accepted", "pending", "waitlisted"],
            default: "pending"
        },

        // --- Connection Metrics  ---
        connectionGoals: {
            socialSatisfaction: { type: Number, min: 1, max: 10 },
            primaryInterest: {
                type: String,
                enum: ['Meet New People', 'Play/Games', 'Travel', 'Local Events']
            },
            isolationBarrier: String,
        },

        // --- Logistics for Social Experiences ---
        preferences: {
            dietaryRestrictions: [String],
            apparelSize: { type: String, enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'] },
            favoriteMocktail: String,
            golfSkillLevel: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Never Played'] }
        },

        // --- Travel Details ---
        hasPassport: { type: Boolean, default: false },
        emergencyContact: {
            name: String,
            phone: String,
            relationship: String
        },
        submittedAt: {
            type: Date,
            default: Date.now
        }
    }
);

// --- PASSWORD ENCRYPTION LOGIC ---
//
membershipSchema.pre("save", async function () {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified("password")) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        
        // Log initials for privacy in the console
        const initials = `${this.firstName[0]}${this.lastName[0]}`;
        console.log(`🔐 Password secured for member: ${initials}`);
    } catch (err) {
        // In async hooks, throwing the error passes it to the next middleware automatically
        throw new Error(err);
    }
});

// Helper method for login
membershipSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Membership", membershipSchema);