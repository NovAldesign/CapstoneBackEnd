import mongoose from "mongoose";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            unique: true,
            required: true,
            index: true,
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            match: [
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
                'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.'
            ]
        },
        role: {
            type: String,
            enum: ["Admin", "Moderator"],
            default: "Moderator",
        },
        accessKey: {
            type: String,
            required: true,
        },
        lastAction: {
            type: String,
        },
        lastLoginIp: {
            type: String,
        },
        status: {
            type: String,
            default: "active",
        }
    },
    { timestamps: true }
);

// --- PASSWORD ENCRYPTION LOGIC ---

adminSchema.pre("save", async function () {
    if (!this.isModified("password")) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        console.log(`🔐 Hashing password for: ${this.name}`);
    } catch (err) {
        // In async hooks, you can just throw the error
        throw err;
    }
});

// 2. This helper method is used during login to check if a password is correct
adminSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Admin", adminSchema);



