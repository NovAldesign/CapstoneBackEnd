const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../Models/User'); // Adjust path to your User/Member model

// 1. FORGOT PASSWORD: Generates token and gives you the link
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      return res.status(404).json({ error: "No account found with that email." });
    }

    // Generate a secure random token string
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Set token hash and expiration (1 hour from now) on the user document
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).concat().digest('hex');
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour in milliseconds

    await user.save();

    // In production, you would email this link using nodemailer. 
    // For development, we return it in the response so you can click it instantly!
    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    res.json({ 
      message: "Reset token generated successfully.",
      DEVELOPMENT_LINK: resetUrl // Copy-paste this link in your browser during testing
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. RESET PASSWORD: Validates token and updates password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Hash the incoming token parameter to match against the stored DB hash
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    // Find user with matching token and confirm it hasn't expired yet
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: "Password reset token is invalid or has expired." });
    }

    // Encrypt the new plaintext password using bcrypt
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Clear the reset tokens out of the database so they can't be reused
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    res.json({ message: "✨ Password updated successfully! Proceed to login." });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;