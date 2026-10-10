import express from 'express';
import Article from '../models/articleSchema.js'; // Explicit .js extension required in ES Modules
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

const FIELDS = ['title', 'slug', 'content', 'excerpt', 'category', 'imageUrl', 'imageAlt', 'imageCaption', 'pinImageUrl', 'affiliate', 'publishedAt'];

const slugify = (s) => String(s || '')
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90);

// Only the fields we allow, cleaned up
const pick = (body) => {
  const out = {};
  for (const k of FIELDS) {
    if (body[k] === undefined) continue;
    if (k === 'affiliate') out[k] = !!body[k];
    else if (k === 'slug') out[k] = slugify(body[k]);
    else if (k === 'publishedAt') { if (body[k]) out[k] = new Date(body[k]); }
    else out[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
  }
  return out;
};

// GET all articles
router.get('/', async (req, res) => {
  try {
    const articles = await Article.find().sort({ publishedAt: -1 });
    res.json(articles);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single article by slug
router.get('/:slug', async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug });
    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new article — Admin only
router.post('/', protect, restrictTo('admin'), async (req, res) => {
  const data = pick(req.body);
  if (!data.slug) data.slug = slugify(data.title);
  if (!data.title || !data.slug || !data.content || !data.excerpt) {
    return res.status(400).json({ error: 'Title, content and a short summary are required.' });
  }
  try {
    if (await Article.exists({ slug: data.slug })) {
      return res.status(400).json({ error: `Another post already uses the link /blog/${data.slug}. Change the link.` });
    }
    const newArticle = await new Article(data).save();
    res.status(201).json(newArticle);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH an article — Admin only
router.patch('/:id', protect, restrictTo('admin'), async (req, res) => {
  const data = pick(req.body);
  try {
    if (data.slug && await Article.exists({ slug: data.slug, _id: { $ne: req.params.id } })) {
      return res.status(400).json({ error: `Another post already uses the link /blog/${data.slug}. Change the link.` });
    }
    const article = await Article.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!article) return res.status(404).json({ error: 'Post not found.' });
    res.json(article);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE an article — Admin only
router.delete('/:id', protect, restrictTo('admin'), async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ error: 'Post not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
