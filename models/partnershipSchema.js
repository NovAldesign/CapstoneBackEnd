import mongoose from "mongoose";

const partnershipSchema = new mongoose.Schema(
    {
        companyName: 
        {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        industry:
         {
            type: String,
            required: true,
        },
        tierRequested: 
        {
            type: String,
            enum: ["Founding Partner", "Title Sponsor", "In-Kind Donor"],
            required: true,
        },
        contributionType: 
        {
            type: String,
            enum: ["Financial", "Venue", "Service", "Product"],
            required: true,
        },
        details: {
            type: String,
            required: true,
        },
        missionAligned: {
            type: Boolean,
            required: true,
            default: false, 
        },
        contractStart: {
            type: Date,
            required: true,
        },
        contractEnd: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "declined"],
            default: "pending",
        }
    },
    { timestamps: true } 
);

export default mongoose.model("Partnership", partnershipSchema);










