// Imports
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import fs from 'fs'; // used for folder check
import { logReq, globalErr } from "./middleware/middleware.js";
import connectDB from "./db/conn.js";
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
app.use(cors());
app.use(express.json());
app.use(logReq);

// Serve uploads as a static route so images/docs are viewable in React
app.use('/uploads', express.static(uploadDir));

// Routes
app.use("/api/members", membershipRoutes); 
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handling Middleware
app.use(globalErr);

// Listener
app.listen(PORT, () => {
    console.log(`GFC Server running on PORT: ${PORT}`);
    console.log(`System Date: ${new Date().toLocaleDateString()}`);
    console.log(`Connection Mode: ${process.env.NODE_ENV || 'development'}`);
});