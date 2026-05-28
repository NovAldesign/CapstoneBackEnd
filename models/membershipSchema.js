import mongoose from "mongoose";

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
            lowercase: true, // Forces emails to lower-case to prevent login bypasses
            trim: true
        },
        phone: {
            type: String,
            unique: true,
            required: true,
        },
        dob: { type: Date, required: true },

        // --- Authentication & Access Control ---
        password: { 
            type: String, 
            required: true,
            select: false // Automatically hides password hashes from standard GET queries
        },
        role: {
            type: String,
            enum: ["user", "admin"],
            default: "user"
        },

        // --- Membership ---
        tier: {
            type: String,
            enum: ["Social", "Founding"],
            required: true
        },
        status: {
            type: String,
            enum: ["accepted", "pending", "waitlisted"],
            default: "pending"
        },

        // --- Connection Goals ---
        connectionGoals: {
            primaryInterest: {
                type: String,
                enum: ['Meet New People', 'Play / Games', 'Local Events']
            },
            isolationBarrier: String,
        },

        // --- Password Reset Tokens (Cryptographic Security Handshake) ---
        resetPasswordToken: { type: String },
        resetPasswordExpires: { type: Date },

        submittedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

export default mongoose.model("Membership", membershipSchema);