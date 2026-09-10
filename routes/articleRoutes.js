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