import mongoose from "mongoose";

const applicantSchema = new mongoose.Schema(
    {
        category:
        {
            type: String,
            default: "applicants",
        },
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

        phone:
        {
            type: String,
            unique: true,
            required: true,
        },

        dob:
        {
            type: Date,
            required: true,
        },
        industry:
        {
            type: String,
            required: true,
            index: true,

        },
        tier:
            { 
                type: String,
                enum: ["Platinum", "Gold", "Silver"],
                default: "Silver",
            },

        status:
            { 
                type: String,
                enum: ["accepted", "pending"],
                default: "pending"
            },

        isFirstTimeFounder:
            { 
                type: Boolean, 
                default: false,    
            },

        submittedAt: 
        { 
            type: Date, 
            default: Date.now 
        }

    });

export default mongoose.model("Applicants", applicantSchema);