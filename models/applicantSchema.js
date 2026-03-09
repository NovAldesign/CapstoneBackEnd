import mongoose from "mongoose";
import bcrypt from "bcrypt";

const applicantSchema = new mongoose.Schema(
    {
        // Demographics
        firstName: {
            type: String,
            required: true,
        },
        lastName: {
            type: String,
            required: true, 
        },
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
        dob: {
            type: Date,
            required: true,
        },
        industry: {
            type: String,
            required: true,
            index: true,
        },
        // Security
        password: {
            type: String,
            required: [true, 'Password is required'],
            match: [
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
                'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.'
            ]
        },
        // Membership status
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
        // Connection Metrics 
        connectionGoals: {
            socialSatisfaction: { type: Number, min: 1, max: 10 },
            primaryInterest: {
                type: String,
                enum: ['Meet New People', 'Play/Games', 'Travel', 'Local Events']
            },
            isolationBarrier: String,
        },
        // Logistics for experiences
        preferences: {
            dietaryRestrictions: [String],
            apparelSize: { type: String, enum: ['XS','S', 'M', 'L', 'XL', '2XL', '3XL'] },
            favoriteMocktail: String,
            golfSkillLevel: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Never Played'] }
        },
        // Travel 
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

applicantSchema.pre("save", async function () {
    // 1. Only hash the password if it has been modified (or is new)
    if (!this.isModified("password")) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        console.log(`🔐 Hashing password for: ${this.firstName}`);
        
       
    } catch (err) {
        
        throw err;
    }
});

// Helper method for login
applicantSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Applicants", applicantSchema);