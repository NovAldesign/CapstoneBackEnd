import Article from "../models/articleSchema.js";

// -------------------------------------------------------
// Blog posts written outside the dashboard. Each one is added once, the first time
// the server starts after it's pushed. After that it lives in the dashboard (Blog tab)
// like any other post, and edits made there are kept.
// Photos live in the frontend repo: public/blog/<slug>/
// -------------------------------------------------------
const SITE = "https://www.grownfolkscollective.com";
const IMG = (slug, file) => `${SITE}/blog/${slug}/${file}`;

const fridayNight = (() => {
  const slug = "your-kind-of-friday-night";
  const img = (f) => IMG(slug, f);
  const tickets = `${SITE}/go/oct30?src=blog`;
  const figure = (file, alt, caption) =>
    `<figure class="gfc-photo"><img src="${img(file)}" alt="${alt}" width="800" height="1000" /><figcaption>${caption}</figcaption></figure>`;

  const content = `
<p class="gfc-lede">You already know the Friday night you want.</p>

<p>You want to get dressed, go somewhere beautiful and feel something. You want live voices close enough to give you chills. You want a room full of grown folks who came for the same reason you did. You want to laugh at the break, learn somebody's name and drive home lighter than you arrived.</p>

<p>You don't want to shout over a bar. You don't want to stand in the back. You don't want another Friday on the couch wondering where your people are.</p>

<p class="gfc-pull">They're here.</p>

<h2>Walk in, and somebody's glad you came</h2>

<p>On Friday, October 30, Acoustic &amp; Infused&trade; is that night.</p>

<p>Bri Boyd welcomes you at the door like she's been waiting on you. You settle into your seat with something warm in your hand. Then the room gets quiet.</p>

<div class="gfc-photo-pair">
  ${figure("bri-boyd.jpg", "Bri Boyd, host of Acoustic & Infused on October 30", "Your host, Bri Boyd")}
  ${figure("julian-alxndr.jpg", "Julian Alxndr, R&B singer and guitarist", "Julian Alxndr opens the night")}
</div>

<h2>The music, up close</h2>

<p>Julian Alxndr's guitar opens the night: smooth R&amp;B, played close enough to hear every string.</p>

<p>Then Ace.cension steps up. Atlanta R&amp;B with soul, and the songs start to feel personal. By the break, you're talking to the people at your table like you came together.</p>

<div class="gfc-photo-pair">
  ${figure("ace-cension.jpg", "Ace.cension, Atlanta R&B singer", "Ace.cension, Atlanta R&amp;B with soul")}
  ${figure("vernell-payton-jr.jpg", "Vernell Payton Jr., R&B vocalist", "Vernell Payton Jr. closes it out")}
</div>

<p>And Vernell Payton Jr. closes it out with the kind of voice that sends you home still carrying the song.</p>

<h2>Art being born in the corner</h2>

<p>All night, Lyiness paints at the side of the room. A blank canvas slowly becomes a picture of the evening you're sitting inside of. Look up between songs and watch it change.</p>

<figure class="gfc-photo gfc-photo-wide"><img src="${img("lyiness.jpg")}" alt="Live painter Lyiness with one of her colorful canvases" width="640" height="480" /><figcaption>Lyiness, painting the night live</figcaption></figure>

<p>That's the experience. Live music you can feel, art coming to life in the corner, grown folks who actually talk to each other. A night built for the person who loves music and misses rooms like this.</p>

<p class="gfc-pull">Most people walk in solo and walk out knowing names.</p>

<div class="gfc-details">
  <h3>The details</h3>
  <dl>
    <dt>When</dt><dd>Friday, October 30, 2026. Music 7:00 to 9:30 PM.</dd>
    <dt>Where</dt><dd>Aromas Tea Bar, Atlanta</dd>
    <dt>Tickets</dt><dd>$30. Bringing your person? Plus One is $52 for two seats.</dd>
    <dt>Groups</dt><dd>Groups of 5 save 20%. Groups of 10 save 25%.</dd>
    <dt>The room</dt><dd>Alcohol-free. Adults 30+. Men and women.</dd>
  </dl>
  <p class="gfc-details-cta"><a class="gfc-button" href="${tickets}">Get your ticket</a></p>
</div>

<p>Stop picturing the Friday night you want. It's on the calendar.</p>

<h2>And the season keeps going</h2>

<p>If October 30 fills your cup, there's more:</p>
<ul>
  <li><strong>Friday, November 6:</strong> the November Showcase, hosted by Simon Huebner, with Gerard Lancaster confirmed.</li>
  <li><strong>Friday, December 4:</strong> the Holiday Edition, with Isaiah Lake, Meosha and Chrys Dolce, hosted by Alan Moore.</li>
</ul>
<p><a href="${SITE}/events">See every upcoming night</a></p>

<h3>Follow the voices</h3>
<p class="gfc-handles">
  <a href="https://www.instagram.com/itsjulianalxndr/" target="_blank" rel="noopener noreferrer">@itsjulianalxndr</a>
  <a href="https://www.instagram.com/ace.cension/" target="_blank" rel="noopener noreferrer">@ace.cension</a>
  <a href="https://www.instagram.com/vernellpaytonjr/" target="_blank" rel="noopener noreferrer">@vernellpaytonjr</a>
  <a href="https://www.instagram.com/lyiness/" target="_blank" rel="noopener noreferrer">@lyiness</a>
  <a href="https://www.instagram.com/briboydcoaching/" target="_blank" rel="noopener noreferrer">@briboydcoaching</a>
</p>

<p class="gfc-closer">Your kind of Friday night exists. It's right here in Atlanta, and your seat is in it.</p>
`.trim();

  return {
    title: "This Is Your Kind of Friday Night",
    slug,
    category: "Live Music",
    excerpt:
      "Live R&B close enough to give you chills, art being painted while you watch, and a room full of grown folks who actually talk to each other. Acoustic & Infused, Friday, October 30 at Aromas Tea Bar.",
    imageUrl: img("cover.jpg"),
    imageAlt: "Singer and band performing live in an intimate Atlanta tea bar",
    imageCaption: "Live music, close enough to hear every string.",
    content,
  };
})();

const POSTS = [fridayNight];

// Adds any post that isn't in the database yet. Never changes an existing post.
export const seedArticles = async () => {
  let added = 0;
  for (const post of POSTS) {
    const res = await Article.updateOne(
      { slug: post.slug },
      { $setOnInsert: { ...post, publishedAt: new Date() } },
      { upsert: true }
    );
    if (res.upsertedCount) added++;
  }
  if (added) console.log(`📝 Added ${added} blog post(s)`);
  return added;
};
