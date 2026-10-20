import mongoose from "mongoose";

// In-kind donations from the Partnerships page: products for gift bags and
// giveaways, and equipment for events. Reviewed in the dashboard (Donations tab).
export const DONATION_KINDS = [
  "Products for gift bags",
  "Giveaways and prizes",
  "Sound equipment (speakers, mics, mixer, karaoke machine)",
  "Lighting and stage decor",
  "Games (cards, tables, board games)",
  "Art and coloring supplies (easels, canvases, coloring books)",
  "Non-alcoholic drinks",
  "Something else",
];

// Our staple events (keep in sync with eventOptions in the frontend Partnership page)
export const DONATION_EVENTS = [
  "Game Night",
  "Karaoke Bingo",
  "Acoustic & Infused (Live Music Showcase)",
  "Recess Talks™",
  "GFC Select",
  "Any event",
];

export const DELIVERY = ["I'll drop it off", "Please pick it up", "I'll ship it", "Let's talk"];

const donationSchema = new mongoose.Schema(
  {
    donorType: { type: String, enum: ["business", "individual"], default: "business" },
    companyName: { type: String, default: "", trim: true, maxlength: 150 },
    contactName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },

    kinds: [{ type: String, trim: true }],
    items: { type: String, required: true, trim: true, maxlength: 1500 }, // what they're donating
    quantity: { type: String, default: "", trim: true, maxlength: 200 }, // how many / approximate value
    events: [{ type: String, trim: true }],
    delivery: { type: String, default: "Let's talk", trim: true, maxlength: 40 },
    availableBy: { type: String, default: "", trim: true, maxlength: 100 },

    // Shout-out at the event, social tag and newsletter mention
    recognition: { type: Boolean, default: true },
    instagram: { type: String, default: "", trim: true, maxlength: 80 },
    website: { type: String, default: "", trim: true, maxlength: 300 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
    source: { type: String, default: "", trim: true, maxlength: 120 },

    status: { type: String, enum: ["new", "accepted", "received", "declined"], default: "new" },
    receivedAt: { type: Date, default: null },
    adminNotes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

export default mongoose.model("Donation", donationSchema);
