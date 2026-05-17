import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Admin from '../models/adminSchema.js';

await mongoose.connect(process.env.MONGO_URI);

// Delete existing admin with this email if re-running
await Admin.deleteOne({ email: 'your@email.com' });

const admin = new Admin({
  name:             'Your Name',
  email:            'your@email.com',
  password:         'YourPassword123!',  // min 8 chars, upper, lower, number, special
  role:             'Admin',
  accessKey:        process.env.ADMIN_KEY || 'GFC_SECURE_99',
  securityQuestion: 'What was the name of your first pet?',
  securityAnswer:   'your answer',
  status:           'active',
});

await admin.save();
console.log('✅ Admin account created for', admin.email);
await mongoose.disconnect();