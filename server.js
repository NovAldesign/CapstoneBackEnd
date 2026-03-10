// Imports
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import { logReq, globalErr } from "./middleware/middleware.js";
import connectDB from "./db/conn.js";
import membershipRoutes from "./routes/membershipRoutes.js";

// Setups
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
connectDB();

// Middlewares (Request)
app.use(cors());
app.use(express.json());
app.use(logReq);
app.use('/uploads', express.static('uploads'));

// Routes
app.use("/api", membershipRoutes);

// Global Error Handling Middleware
app.use(globalErr);

// Listener
app.listen(PORT, () => {
    console.log(`GFC Server running on PORT: ${PORT}`);
    console.log(`System Date: ${new Date().toLocaleDateString()}`);
});