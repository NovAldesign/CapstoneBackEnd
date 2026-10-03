import mongoose from "mongoose";

// GFC Select™ invites sent on someone's behalf:
//   kind "nomination" = someone vouched for a single man or woman 30+ (/select/nominate)
//   kind "friend"     = an applicant asked us to invite a friend ("Applying with a friend?")
const selectNominationSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["nomination", "friend"], default: "nomination" },
    // Who nominated him
    nominatorName: { type: String, required: true, trim: true, maxlength: 60 },
    nominatorEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    shareName: { type: Boolean, default: false }, // OK to tell him who nominated him
    relationship: { type: String, default: "", trim: true, maxlength: 40 },
    note: { type: String, default: "", trim: true, maxlength: 400 }, // why he'd be a great fit

    // The person nominated (or the friend)
    nomineeFirstName: { type: String, required: true, trim: true, maxlength: 40 },
    nomineeEmail: { type: String, default: "", lowercase: true, trim: true, maxlength: 120 },
    nomineePhone: { type: String, default: "", trim: true, maxlength: 30 },
    nomineeGender: { type: String, enum: ["man", "woman"], default: "man" },

    // invited = email sent · text = phone only, team texts him · already = already on the list or applied
    // repeat = nominated recently by someone else (no second email)
    status: { type: String, enum: ["invited", "text", "already", "repeat"], default: "invited" },
    invitedAt: { type: Date, default: null },
    source: { type: String, default: "", trim: true, maxlength: 60 },
  },
  { timestamps: true }
);

export default mongoose.model("SelectNomination", selectNominationSchema);
