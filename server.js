// Imports
import express from "express";
import dotenv from "dotenv";
import { logReq, globalErr } from "./middleware/middleware.js";


// Setups
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares (Request)
app.use(express.json());
app.use(logReq);



// Routes


// Global Error Handling Middleware
app.use(globalErr);

// Listener
app.listen(PORT, () => {
    console.log(`Server listening on PORT: ${PORT}`);
});