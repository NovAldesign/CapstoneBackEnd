const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  excerpt: { type: String, required: true },
  imageUrl: { type: String, required: false }, // Stores image link
  category: { type: String, default: 'General' },
  publishedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Article', articleSchema);