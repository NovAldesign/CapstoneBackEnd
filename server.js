// Imports
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { logReq, globalErr } from "./middleware/middleware.js";
import connectDB from "./db/conn.js";
import applicantRoutes from "./routes/applicantRoutes.js";

// Setups
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
connectDB();

// Middlewares (Request)
app.use(cors());
app.use(express.json());
app.use(logReq);

// Routes
app.use("/api", applicantRoutes);

// Global Error Handling Middleware
app.use(globalErr);

// Listener
app.listen(PORT, () => {
    console.log(`GFC Server running on PORT: ${PORT}`);
    console.log(`System Date: ${new Date().toLocaleDateString()}`);
});