import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
    {
        name:
        {
            type: String,
            required: true,
        },
        email:
        {
            type: String,
            unique: true,
            required: true,
            index: true,
        },
        role:
        {
            type: String,
            enum: ["admin", "moderator"]
         
        },

        status:
        {
            type: String,
            enum: ["accepted", "pending"],
            default: "pending",
        },




        name: "Jordan Hayes",
        email: "j.hayes@gfc-ops.com",
        role: "Admin",
        accessKey: "GFC_EXEC_2026",
        lastAction: "Approved Gold Member",
        lastLoginIp: "72.14.213.44",
        status: "active"