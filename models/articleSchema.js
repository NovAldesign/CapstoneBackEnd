import mongoose from 'mongoose';

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  excerpt: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: 'General'
  },
  imageUrl: {
    type: String,
    default: ''
  },
  imageAlt: { type: String, default: '' },
  imageCaption: { type: String, default: '' },
  // Tall image for the "Save to Pinterest" button (1000 x 1500)
  pinImageUrl: { type: String, default: '' },
  // Shows the affiliate disclosure at the top of the post
  affiliate: { type: Boolean, default: false },
  publishedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

const Article = mongoose.model('Article', articleSchema);

export default Article;