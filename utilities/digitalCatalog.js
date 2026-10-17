import path from "path";
import { fileURLToPath } from "url";

// -------------------------------------------------------
// Printable Karaoke Bingo downloads
// The PDFs live in capstonebackend/private/downloads/ (one per edition, plus the host guide).
// That folder is never served directly; buyers download through their order link.
// All prices are in cents ($12 = 1200).
// -------------------------------------------------------
export const DOWNLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "private", "downloads");

export const LICENSE =
  "One host or organization. Unlimited events and reprints for your own rooms. Please don't resell or share the files.";

export const GUIDE = "Karaoke-Bingo-Host-Guide.pdf";
const pdf = (id) => `karaoke-bingo-${id}.pdf`;
const GENRES = ["rnb", "hiphop", "pop", "rock", "country", "gospel", "motown", "discofunk"];
// Extra host files that come with an edition (and with any bundle that includes it)
const EXTRAS = {
  rnb: ["name-that-tune-host-sheet-rnb.pdf"],
};
const EXTRA_LABELS = {
  "name-that-tune-host-sheet-rnb.pdf": "Name That Tune Host Sheet (R&B)",
};
const withExtras = (id) => [pdf(id), ...(EXTRAS[id] || [])];
const HOLIDAYS = ["christmas", "newyears", "valentines", "mothersday", "juneteenth", "july4", "halloween", "thanksgiving"];

const single = (id, edition, hunt, group) => ({
  id: `single-${id}`,
  kind: "single",
  group,
  name: `Karaoke Bingo: ${edition}`,
  description: `40 unique print-ready cards, host guide included. Hunt songs: ${hunt}.`,
  priceCents: 1200,
  files: [...withExtras(id), GUIDE],
});

export const DIGITAL = [
  single("rnb", "90s & 2000s R&B Edition", "Jodeci and Tevin Campbell", "genre"),
  single("hiphop", "90s Hip-Hop Edition", "The Notorious B.I.G. and Montell Jordan", "genre"),
  single("pop", "Pop Hits Edition", "Britney Spears and Backstreet Boys", "genre"),
  single("rock", "Classic Rock Edition", "Journey and Bon Jovi", "genre"),
  single("country", "Country Edition", "Shania Twain and Garth Brooks", "genre"),
  single("gospel", "Gospel Edition", "Kirk Franklin and Mary Mary", "genre"),
  single("motown", "Motown & Soul Classics Edition", "The Temptations and Stevie Wonder", "genre"),
  single("discofunk", "Disco & Funk Party Edition", "Earth, Wind & Fire and Bee Gees", "genre"),
  single("christmas", "Christmas Edition", "Mariah Carey and Donny Hathaway", "holiday"),
  single("newyears", "New Year's Eve Edition", "Prince and Kool & The Gang", "holiday"),
  single("valentines", "Valentine's Day Edition", "Boyz II Men and Whitney Houston", "holiday"),
  single("mothersday", "Mother's Day Edition", "Boyz II Men and 2Pac", "holiday"),
  single("juneteenth", "Juneteenth Edition", "\"Lift Every Voice and Sing\" and Earth, Wind & Fire", "holiday"),
  single("july4", "Cookout / 4th of July Edition", "Frankie Beverly & Maze and DJ Jazzy Jeff & The Fresh Prince", "holiday"),
  single("halloween", "Halloween Edition", "Michael Jackson and Ray Parker Jr.", "holiday"),
  single("thanksgiving", "Thanksgiving / Friendsgiving Edition", "Sister Sledge and William DeVaughn", "holiday"),
  {
    id: "bundle-genre-series",
    kind: "bundle",
    group: "bundle",
    name: "Karaoke Bingo: Genre Series (8 Editions)",
    description: "All 8 genre editions, 320 unique cards, host guide included.",
    priceCents: 3900,
    files: [...GENRES.flatMap(withExtras), GUIDE],
  },
  {
    id: "bundle-holiday-series",
    kind: "bundle",
    group: "bundle",
    name: "Karaoke Bingo: Holiday Series (8 Editions)",
    description: "All 8 holiday editions, 320 unique cards, host guide included.",
    priceCents: 3900,
    files: [...HOLIDAYS.map(pdf), GUIDE],
  },
  {
    id: "complete-collection",
    kind: "bundle",
    group: "bundle",
    name: "Karaoke Bingo: The Complete Collection (All 16 Editions)",
    description: "Every genre and holiday edition, 640 unique cards, host guide included. One purchase, a year of game nights.",
    priceCents: 5900,
    files: [...GENRES.flatMap(withExtras), ...HOLIDAYS.flatMap(withExtras), GUIDE],
    featured: true,
  },
];

// Free sample, unlocked with an email signup
export const SAMPLE = {
  id: "sample-rnb",
  name: "Free sample: R&B Edition (2 cards)",
  file: "sample-rnb-2cards.pdf",
};

export const findDigital = (id) => DIGITAL.find((d) => d.id === id) || null;

export const publicDigital = () => ({
  license: LICENSE,
  items: DIGITAL.map(({ id, kind, group, name, description, priceCents, featured }) => ({
    id, kind, group, name, description, priceCents, featured: Boolean(featured),
  })),
});

// "karaoke-bingo-rnb.pdf" → "90s & 2000s R&B Edition"
export const fileLabel = (file) => {
  if (file === GUIDE) return "Host Guide";
  if (EXTRA_LABELS[file]) return EXTRA_LABELS[file];
  const p = DIGITAL.find((d) => d.kind === "single" && d.files[0] === file);
  return p ? p.name.replace("Karaoke Bingo: ", "") : file;
};
