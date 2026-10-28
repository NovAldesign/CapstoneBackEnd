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

const fallMugs = (() => {
  const slug = "four-fall-mugs";
  const img = (f) => IMG(slug, f);
  const a = (href, text) => `<a href="${href}" target="_blank" rel="sponsored nofollow noopener noreferrer">${text}</a>`;
  const L = {
    chai: "https://link.amazon/B03nmCosQ",
    pumpkin: "https://link.amazon/B0gkcaPpZ",
    spice: "https://link.amazon/B0ckb7G4C",
    vanilla: "https://link.amazon/B08B20CsV",
    cocoa: "https://link.amazon/B0iRxNiiG",
    maple: "https://link.amazon/B03LYjHLJ",
    cinnamon: "https://link.amazon/B0dBqnq4N",
  };
  const photo = (file, alt) =>
    `<figure class="gfc-photo gfc-photo-tall"><img src="${img(file)}" alt="${alt}" width="800" height="1200" loading="lazy" /></figure>`;

  // {{WINTER_WARMERS}} is swapped for the Winter Warmers post link when the post is added
  const content = `
<p class="gfc-lede">Fall at our table runs on mugs. Something warm in both hands, a game on the table, nowhere else to be.</p>

<p>This season we built four: a pumpkin chai latte, a pumpkin hot chocolate, and then (because sweet potato has never once let this kitchen down) sweet potato versions of both. Every one is zero proof, and every one is sized for a quiet night in: one mug for you, or two to share.</p>

<p>If pumpkin is your whole personality from October on, start at the top. If sweet potato pie is the best thing about your family's table, skip to the bottom half. Either way, you are covered.</p>

<p class="gfc-disclosure">As an Amazon Associate I earn from qualifying purchases.</p>

<h2>Pumpkin Chai Latte</h2>
${photo("pumpkin-chai-latte.jpg", "Pumpkin chai latte in a glass mug with cinnamon on the foam, next to a small pumpkin")}
<p>Strong chai, real pumpkin, warm spice, steamed milk. It tastes like the season means it.</p>
<ul>
  <li>4 oz strong chai (concentrate, or 2 ${a(L.chai, "chai tea bags")} steeped in 4 oz water)</li>
  <li>6 oz milk, steamed</li>
  <li>2 tbsp ${a(L.pumpkin, "pumpkin purée")}</li>
  <li>1 tbsp brown sugar</li>
  <li>1/4 tsp ${a(L.spice, "pumpkin pie spice")}</li>
  <li>1/4 tsp ${a(L.vanilla, "vanilla extract")}</li>
  <li>${a(L.cinnamon, "Cinnamon")}, for the top</li>
</ul>
<p>Whisk the pumpkin, sugar, spice, and vanilla into the hot chai until smooth. Pour into a mug, top with the steamed milk and foam, and dust with cinnamon.</p>
<p class="gfc-for-two"><strong>For two:</strong> 8 oz chai, 12 oz milk, 1/4 cup pumpkin, 2 tbsp brown sugar, 1/2 tsp each of pie spice and vanilla.</p>

<h2>Pumpkin Hot Chocolate</h2>
${photo("pumpkin-hot-chocolate.jpg", "Pumpkin hot chocolate topped with whipped cream and cinnamon, with a small pumpkin and chocolate pieces")}
<p>Hot chocolate, deepened. The pumpkin doesn't announce itself. It just makes the cocoa taste more like cocoa.</p>
<ul>
  <li>8 oz milk</li>
  <li>3 tbsp ${a(L.pumpkin, "pumpkin purée")}</li>
  <li>2 tbsp ${a(L.cocoa, "cocoa powder")}</li>
  <li>2 tbsp sugar</li>
  <li>1 oz chocolate chips (optional, for body)</li>
  <li>1/4 tsp ${a(L.spice, "pumpkin pie spice")}</li>
  <li>1/2 tsp ${a(L.vanilla, "vanilla extract")}</li>
  <li>Pinch of salt</li>
  <li>Whipped cream and cinnamon, to finish</li>
</ul>
<p>Warm the milk and whisk in the cocoa, sugar, salt, and spice until there are no lumps. Whisk in the pumpkin and chips and heat through without boiling. Vanilla goes in off the heat. Whipped cream on top, always.</p>
<p class="gfc-for-two"><strong>For two:</strong> 16 oz milk, 6 tbsp pumpkin, 1/4 cup each of cocoa and sugar, 1/2 tsp pie spice, 1 tsp vanilla, a generous pinch of salt.</p>

<h2>Sweet Potato Chai Latte</h2>
${photo("sweet-potato-chai-latte.jpg", "Sweet potato chai latte in a glass mug next to a roasted sweet potato and cinnamon sticks")}
<p>Roasted sweet potato blends into chai like it was always supposed to be there: rounder than pumpkin, with maple doing the sweetening.</p>
<p>First, the purée: roast whole sweet potatoes at 400°F for 45 to 60 minutes until completely soft. Scoop, blend silky with a splash of milk, and strain if it is fibrous. One medium potato gives you roughly 8 to 9 oz.</p>
<ul>
  <li>4 oz strong chai</li>
  <li>6 oz milk, steamed</li>
  <li>2 tbsp sweet potato purée</li>
  <li>1 tbsp ${a(L.maple, "maple syrup")}</li>
  <li>1/4 tsp ${a(L.spice, "pumpkin pie spice")}, plus a pinch of extra cinnamon</li>
  <li>1/4 tsp ${a(L.vanilla, "vanilla extract")}</li>
</ul>
<p>Whisk the purée, maple, spices, and vanilla into the hot chai until fully smooth. Sweet potato needs the whisk a little more than pumpkin does. Top with steamed milk and a dusting of cinnamon.</p>
<p class="gfc-for-two"><strong>For two:</strong> 8 oz chai, 12 oz milk, 1/4 cup purée, 2 tbsp maple syrup, 1/2 tsp pie spice plus a pinch of cinnamon, 1/2 tsp vanilla.</p>

<h2>Sweet Potato Hot Chocolate</h2>
${photo("sweet-potato-hot-chocolate.jpg", "Sweet potato hot chocolate topped with whipped cream next to a roasted sweet potato and dark chocolate")}
<p>Think sweet potato pie meets a mug of cocoa. Cinnamon-forward, glossy, and richer than it has any right to be without a drop of anything proofed.</p>
<ul>
  <li>8 oz milk</li>
  <li>3 tbsp sweet potato purée</li>
  <li>2 tbsp ${a(L.cocoa, "cocoa powder")}</li>
  <li>2 tbsp brown sugar</li>
  <li>1 oz chocolate chips (optional)</li>
  <li>1/4 tsp cinnamon-forward pie spice</li>
  <li>1/2 tsp ${a(L.vanilla, "vanilla extract")}</li>
  <li>Pinch of salt</li>
  <li>Whipped cream, to finish</li>
</ul>
<p>Warm the milk; whisk in the cocoa, sugar, salt, and spice. Whisk in the purée and chips until glossy. A quick blend makes it perfectly smooth. Vanilla off the heat, whipped cream on top.</p>
<p class="gfc-for-two"><strong>For two:</strong> 16 oz milk, 6 tbsp purée, 1/4 cup each of cocoa and brown sugar, 1/2 tsp pie spice, 1 tsp vanilla, a generous pinch of salt.</p>

<h2>A note on making them</h2>
<p>Warm everything gently and never let it boil, because boiling scorches milk. Pumpkin and sweet potato both settle at the bottom of the mug, so give it a swirl halfway through drinking. It is worth it.</p>
<p>These four join the rest of the cold-weather family in our <a href="{{WINTER_WARMERS}}">Winter Warmers guide</a>. Pick your mug. We will save you a seat.</p>

<p class="gfc-closer">Vaughn, Grown Folks&trade; Collective<br/><em>Where grown folks come out to play.&trade;</em></p>
`.trim();

  return {
    title: "Four Fall Mugs Worth Staying In For",
    slug,
    category: "Zero Proof",
    excerpt:
      "A pumpkin chai latte, a pumpkin hot chocolate, and sweet potato versions of both. Four zero-proof fall mugs, each for one or two to share.",
    imageUrl: img("cover.jpg"),
    imageAlt: "Four zero-proof fall drinks: pumpkin chai latte, pumpkin hot chocolate, sweet potato chai latte and sweet potato hot chocolate",
    imageCaption: "Pick your mug.",
    pinImageUrl: img("pin.jpg"),
    affiliate: true,
    content,
  };
})();

const meetPeople = (() => {
  const slug = "how-to-meet-people-in-your-30s-atlanta";
  const img = (f) => IMG(slug, f);
  const signup = `<div data-gfc-signup></div>`;

  const content = `
<p class="gfc-lede">You used to make friends without trying.</p>

<p>Class, the dorm, the job where everybody was new at the same time. Then life got full. People married, moved, had kids, changed careers. Now it's Friday, your phone is quiet, and you're wondering where everybody went.</p>

<p>You're not the only one. Plenty of grown folks in Atlanta, from their 30s to their 60s, are looking for the same thing you are: good people to spend real time with.</p>

<h2>Friendship takes time, and that's good news</h2>

<p>A University of Kansas study found it takes about <strong>50 hours</strong> together to go from acquaintance to casual friend, and <strong>more than 200 hours</strong> to become close friends. Nobody becomes your best friend in one night. They become your friend because you keep showing up in the same room.</p>

<p class="gfc-pull">So the question isn't "Where do I go once?" It's "Where can I go again and again?"</p>

<figure class="gfc-photo gfc-photo-wide"><img src="${img("friends-laughing.jpg")}" alt="A group of friends in their 30s, 40s and 50s laughing together" width="1200" height="800" /><figcaption>Friendship grows with time together.</figcaption></figure>

<h2>6 ways to meet people in your 30s and up</h2>

<h3>1. Pick something that repeats</h3>
<p>One-time events are fun, but monthly or weekly ones are where friendships grow. The second time you see someone, you're not strangers anymore.</p>

<h3>2. Go solo. Really.</h3>
<p>Walking in alone feels big, but it's the fastest way to meet people. When you come with your crew, you talk to your crew. When you come solo, you talk to the room.</p>

<h3>3. Choose nights with something built in to do</h3>
<p>Games, music and team activities give you something to talk about right away. Nobody has to come up with an opening line when it's your turn at the spades table.</p>

<h3>4. Lead with you, not your job title</h3>
<p>"What do you do?" closes a conversation fast. Try "What brought you out tonight?" or "Where are you from originally?" instead.</p>

${signup}

<h3>5. Follow up within a day</h3>
<p>Met someone you clicked with? Send the text the next morning: "Great meeting you last night. Coming to the next one?" That one message turns a moment into a friendship.</p>

<h3>6. Say yes to the second invite</h3>
<p>The first night is a hello. The second one is where it starts to feel like your people.</p>

<h2>Where to start this week</h2>

<p>That's why we built <strong>Grown Folks&trade; Collective</strong>, a hosted, alcohol-free night out for adults 30 and up in Atlanta. Game nights. Karaoke Bingo. <strong>Acoustic &amp; Infused&trade;</strong>, our live music showcase, where you can sit close to the stage and the room actually listens.</p>

<figure class="gfc-photo gfc-photo-wide"><img src="${img("cover.jpg")}" alt="A big, smiling group of Grown Folks Collective guests at Karaoke Bingo in Atlanta" width="1600" height="900" /><figcaption>The crew at Karaoke Bingo</figcaption></figure>

<p>Most people come solo and leave knowing names. Nobody leads with what they do for a living. We just want to know you. Some guests drive in from Monroe, Villa Rica and Buford, and we've sold out five nights so far.</p>

<h2>Your first night, made easy</h2>

<p>Not sure what to expect? You walk in and someone welcomes you. There's something to do and something to listen to, so there's no awkward standing around. By the end of the night, you'll know a few faces, and you'll want to come back.</p>

<p>That's how it starts. One night, then the next one, then the next. Before long, those 50 hours add up to real friends.</p>

<p class="gfc-details-cta"><a class="gfc-button" href="${SITE}/events?src=blog">See upcoming events</a></p>

${signup}

<p class="gfc-source"><em>Source: Hall, J. A. (2018). "How many hours does it take to make a friend?" Journal of Social and Personal Relationships.</em></p>

<p class="gfc-closer">Vaughn, Grown Folks&trade; Collective<br/><em>Where grown folks come out to play.&trade;</em></p>
`.trim();

  return {
    title: "How to Meet People in Your 30s and Up in Atlanta, in Real Life",
    slug,
    category: "Connection",
    excerpt:
      "Making friends as a grown adult takes more than one night out. Here's how to meet people in your 30s, 40s and beyond in Atlanta, and where to start this week.",
    imageUrl: img("cover.jpg"),
    imageAlt: "A big, smiling group of Grown Folks Collective guests at Karaoke Bingo in Atlanta",
    imageCaption: "Grown folks at Karaoke Bingo, Atlanta",
    pinImageUrl: img("pin.jpg"),
    content,
  };
})();

const loneliness = (() => {
  const slug = "health-effects-of-loneliness";
  const img = (f) => IMG(slug, f);
  const signup = `<div data-gfc-signup></div>`;
  const ap = "https://abc17news.com/news/ap-national-news/2023/05/02/loneliness-poses-risks-as-deadly-as-smoking-surgeon-general/";
  const naco = "https://www.naco.org/news/us-surgeon-general-releases-advisory-and-national-strategy-advance-social-connection";

  const content = `
<p class="gfc-lede">If you've felt lonely lately, you're in good company.</p>

<p>About <strong>half of U.S. adults</strong> say they've felt it. It doesn't matter if you're 32 or 62, single or married, new to Atlanta or here your whole life. Loneliness shows up for all kinds of people.</p>

<p>Here's what most people don't know: it isn't only a feeling. It affects your body, too.</p>

<h2>What loneliness does to your health</h2>

<p>In 2023, the U.S. Surgeon General called loneliness and isolation a public health concern and laid out what the research shows. People who lack social connection have:</p>

<ul>
  <li><strong>29% higher risk of heart disease</strong></li>
  <li><strong>32% higher risk of stroke</strong></li>
  <li><strong>About 50% higher risk of dementia</strong> in older adults</li>
  <li><strong>Twice the likelihood</strong> of depression and anxiety</li>
  <li><strong>Nearly 30% higher risk</strong> of dying early</li>
</ul>

<p>The advisory also said the health risk of being disconnected is <strong>comparable to smoking up to 15 cigarettes a day</strong>.</p>

<p class="gfc-pull">That's a lot to take in. Now for the good news.</p>

<h2>The fix feels good</h2>

<p>The same research that shows the risk also points to the answer: <strong>regular, real-life connection</strong>. That means seeing the same faces, laughing at the same table and having somewhere to be on a Friday night.</p>

<p>You don't need a big friend group overnight. You need a place to start and a reason to come back. Small, steady moments add up:</p>

<ul>
  <li><strong>A standing plan.</strong> One night a month you don't skip.</li>
  <li><strong>Shared activities.</strong> Games, music and anything that gets people talking without trying.</li>
  <li><strong>Showing up solo.</strong> That's where new people actually meet you.</li>
  <li><strong>Following up.</strong> A quick "good seeing you" text keeps it going.</li>
</ul>

<p>Want the full playbook? Read <a href="${SITE}/blog/how-to-meet-people-in-your-30s-atlanta">How to Meet People in Your 30s and Up in Atlanta, in Real Life</a>.</p>

${signup}

<h2>Why we do this</h2>

<p>Our mission at <strong>Grown Folks&trade; Collective</strong> is simple: ending social isolation one event at a time.</p>

<figure class="gfc-photo gfc-photo-wide"><img src="${img("crew.jpg")}" alt="A group of Grown Folks Collective guests smiling together at Game Night in Atlanta" width="1740" height="1145" /><figcaption>The crew at Game Night</figcaption></figure>

<p>We host alcohol-free nights for adults 30 and up in Atlanta: game nights, Karaoke Bingo and Acoustic &amp; Infused&trade;, our live music showcase. Most people come solo and leave knowing names. Nobody leads with what they do for a living. We just want to know you.</p>

<figure class="gfc-photo"><img src="${img("karaoke-bingo-room.jpg")}" alt="A full room of guests playing Karaoke Bingo" width="1032" height="1343" /><figcaption>A full room at Karaoke Bingo</figcaption></figure>

<p class="gfc-pull">It's fun, and it's also good for you.</p>

<p class="gfc-details-cta"><a class="gfc-button" href="${SITE}/events?src=blog">See upcoming events</a></p>

${signup}

<p class="gfc-note"><em>If you're feeling more than lonely, or things feel heavy, you don't have to carry it alone. Talk with your doctor or someone you trust, or call or text <strong>988</strong>, the Suicide &amp; Crisis Lifeline, any time.</em></p>

<p class="gfc-source"><em>Sources: U.S. Surgeon General, "Our Epidemic of Loneliness and Isolation" (2023), via <a href="${ap}" target="_blank" rel="noopener noreferrer">AP</a> and <a href="${naco}" target="_blank" rel="noopener noreferrer">NACo</a>.</em></p>

<p class="gfc-closer">Vaughn, Grown Folks&trade; Collective<br/><em>Where grown folks come out to play.&trade;</em></p>
`.trim();

  return {
    title: "The Health Effects of Loneliness, and the Simple Fix: Your People",
    slug,
    category: "Connection",
    excerpt:
      "Loneliness affects your heart, your mind and even how long you live. Here's what the research says, and the simple, feel-good way grown folks in Atlanta are turning it around.",
    imageUrl: img("cover.jpg"),
    imageAlt: "A big, smiling group of Grown Folks Collective guests at Karaoke Bingo in Atlanta",
    imageCaption: "Grown folks at Karaoke Bingo, Atlanta",
    pinImageUrl: img("pin.jpg"),
    publishedAt: new Date("2026-10-29T08:00:00-04:00"),
    content,
  };
})();

const POSTS = [fridayNight, fallMugs, meetPeople, loneliness];

// [slug, old text, new text]
const FIXES = [
  ["health-effects-of-loneliness", "A full room of guests at Grown Folks Game Night", "A full room of guests playing Karaoke Bingo"],
  ["health-effects-of-loneliness", "A full room at Game Night", "A full room at Karaoke Bingo"],
  ["health-effects-of-loneliness", "smiling together in Atlanta\"", "smiling together at Game Night in Atlanta\""],
  ["health-effects-of-loneliness", "The crew, out together", "The crew at Game Night"],
];

// Adds any post that isn't in the database yet. Never changes an existing post.
export const seedArticles = async () => {
  let added = 0;
  // Link to the Winter Warmers post if it exists, otherwise to the blog
  const warmers = await Article.findOne({ title: /winter warmers/i }, { slug: 1 }).lean().catch(() => null);
  const warmersUrl = warmers?.slug ? `${SITE}/blog/${warmers.slug}` : `${SITE}/blog`;
  for (const raw of POSTS) {
    const post = { ...raw, content: raw.content.replace("{{WINTER_WARMERS}}", warmersUrl) };
    const res = await Article.updateOne(
      { slug: post.slug },
      { $setOnInsert: { ...post, publishedAt: post.publishedAt || new Date() } }, // a post can set a future publish time
      { upsert: true }
    );
    if (res.upsertedCount) added++;
  }
  // One-time text fixes for posts that were already added (only runs if the old text is still there)
  for (const [slug, from, to] of FIXES) {
    const doc = await Article.findOne({ slug, content: { $regex: from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } }, { content: 1 }).catch(() => null);
    if (doc) await Article.updateOne({ _id: doc._id }, { $set: { content: doc.content.split(from).join(to) } });
  }
  if (added) console.log(`📝 Added ${added} blog post(s)`);
  return added;
};
