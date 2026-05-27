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
        },
        phone: {
            type: String,
            unique: true,
            required: true,
        },
        dob: { type: Date, required: true },

        // --- Membership ---
        tier: {
            type: String,
            enum: ["Social", "Founding"],
            default: "Founding",
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

        submittedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

export default mongoose.model("Membership", membershipSchema);
