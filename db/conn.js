import mongoose from "mongoose";

const connectDB = async () => {
  // Grab the URI inside the function to ensure it's loaded
  const connectionStr = process.env.MONGO_URI;

  if (!connectionStr) {
    console.error("❌ Error: MONGO_URI is not defined in environment variables.");
    process.exit(1);
  }

  try {
    await mongoose.connect(connectionStr);
    console.log("✅ MongoDB Connected...");
  } catch (err) {
    console.error(`❌ MongoDB Connection Error: err.message`);
    process.exit(1);
  }
};

export default connectDB;