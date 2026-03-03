import mongoose from "mongoose";

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

export default mongoose.model("Admin", adminSchema);



      