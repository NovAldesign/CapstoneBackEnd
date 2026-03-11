// Imports
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import fs from 'fs';
import { logReq, globalErr } from "./middleware/middleware.js";
import { protect, restrictTo } from "./middleware/authMiddleware.js";
import connectDB from "./db/conn.js";

// Models & Data
import Membership from "./models/membershipSchema.js";
import Admin from "./models/adminSchema.js";
import Partnership from "./models/partnershipSchema.js";
import { membershipData, adminData, partnershipData } from "./utilities/data.js";

// Routes
import systemRoutes from "./routes/systemRoutes.js";
import membershipRoutes from "./routes/membershipRoutes.js";
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Setups
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
connectDB();

// --- Folder Safety Check ---
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("📁 Created missing 'uploads' directory");
}

// Middlewares (Request)
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(express.json());
app.use(logReq);

// Serve uploads as a static route
app.use('/uploads', express.static(uploadDir));

// --- 1. Root System Routes ---
app.get("/api", systemRoutes);

// --- 2. Domain Routes ---
app.use("/api/membership", membershipRoutes);         // Public - new member signup
app.use('/api/auth', authRoutes);                     // Public - login & password reset
app.use('/api/admin', protect, restrictTo('admin'), adminRoutes); // 🔒 Admin only

// Global Error Handling Middleware
app.use(globalErr);

// Listener
app.listen(PORT, () => {
    console.log(`GFC Server running on PORT: ${PORT}`);
    console.log(`System Date: ${new Date().toLocaleDateString()}`);
    console.log(`Connection Mode: ${process.env.NODE_ENV || 'development'}`);
});
