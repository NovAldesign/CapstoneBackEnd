const express = require('express');
const router = express.Router();
const Article = require('../models/article');

// POST route to create a new article
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