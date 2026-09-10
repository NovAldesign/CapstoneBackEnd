const express = require('express');
const router = express.Router();
const Article = require('../models/article');

// GET all articles (for your main Blog page)
router.get('/', async (req, res) => {
  try {
    const articles = await Article.find().sort({ publishedAt: -1 });
    res.json(articles);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET a single article by slug (for reading full posts)
router.get('/:slug', async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug });
    if (!article) return res.status(404).json({ message: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST a new article
router.post('/', async (req, res) => {
  const { title, slug, content, excerpt, category, imageUrl } = req.body;

  const article = new Article({
    title,
    slug,
    content,
    excerpt,
    category,
    imageUrl
  });

  try {
    const newArticle = await article.save();
    res.status(201).json(newArticle);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;