# Matt's Bookshelf

Matt's personal reading shelf — everything he's actually read, searchable by
genre with buy links. Zero-dependency static site: no build step, no backend,
no API keys.

## Files

| File | What it is |
|---|---|
| `index.html` | Page structure, including the add-a-book modal |
| `styles.css` | All styling (dark amber "library" theme) |
| `data.js` | The library: `MY_BOOKS` (51 read/reading books) + `TO_READ_BOOKS` (44 to-read books), both built from Matt's real Goodreads exports. Edit this file to add/change books permanently |
| `app.js` | All logic: search/sort/filter, buy links, photo OCR, Open Library lookups, localStorage |

## Features

- **Search** by title, author, or genre; **filter** by genre; **sort** by
  highest rated (default, his own Goodreads star ratings), ★5 favorites,
  recently read, title, or author.
- **Buy links** — Amazon + Audible search links per book, plus a Goodreads
  search link. Enter your Amazon Associates tag under "Affiliate settings"
  and every link gains `&tag=yourtag-20` (stored in the browser).
- **📷 Add a book from a photo** — upload/snap a cover photo; Tesseract.js OCRs it
  in the browser (loaded from CDN on first use), the text is matched against
  Open Library, and the picked match auto-fills cover, author, year, and
  description. Added books are saved in the browser's localStorage.
- **Goodreads** — Goodreads retired its public API in 2020, so there is no live
  sync. Instead: every card links to the book's Goodreads page, and the
  **Import Goodreads CSV** button ingests the export file from
  goodreads.com → My Books → Import/Export (read + currently-reading shelves;
  to-read and duplicates are skipped).
- **Read badges & ratings** — books with `yearRead` show "Read 2025/2026";
  `reading: true` shows "📖 Reading now"; `rating: 1–5` shows gold stars
  (Matt's real Goodreads ratings).
- **Export library** downloads the full list (`my-bookshelf.json`). To make
  books you added permanent for all visitors, paste them into `data.js`.
- **🗄️ Shelf View** — a visual bookshelf alternative to the grid, toggled via
  the header button (persists per-browser). Three zones: **Currently
  reading** (books pulled forward, spine lit up in accent orange), **the
  bookcase** (finished books shelved by genre, on a wood-grain shelf ledge),
  and **to be read** (the 44 to-read titles pulled from Matt's Goodreads
  to-read shelf, shown desaturated until started). Clicking any book "opens"
  it — a `rotateY` flip reveals the detail card (cover, genre, rating,
  summary, buy links) plus a status control:
  - a to-read book gets **📖 Start reading** → moves it to Currently Reading
  - a currently-reading book gets **✓ Mark finished** (→ shelved by genre) or
    **↩ Back to TBR**
  - a finished book gets **↺ Reading again** (in case of a reread)

  Status changes are stored per-browser (`bookshelf.statusOverrides.v1`) as an
  override on top of the base data in `data.js` — they don't edit the file
  itself, so a re-import or a fresh browser reverts to what `data.js` says.
  Search and the genre filter apply to Shelf View too; the sort dropdown is
  grid-only (shelves have their own fixed organization).

## Run locally

Any static server works, e.g.:

```sh
python3 -m http.server 5199 -d "/Users/Matt/Desktop/matts-bookshelf"
```

then open http://localhost:5199. (`index.html` loads `data.js?v=3` /
`app.js?v=3` — bump that version query if you edit either file and a stale
cached copy won't clear.)

## Deploy (same as Nana's Recipes / Heather's Bookshelf)

It's a plain static site — push the folder to a GitHub repo and import it in
Vercel (framework preset: **Other**, no build command, output dir: root). Netlify
or GitHub Pages work identically.

## Notes

- Originally called "The Founder's Bookshelf" (folder, repo, and deployed URL:
  `founder-bookshelf`) and included a curated 36-book "founder canon" (Zero to
  One, High Output Management, etc.) ranked by editorial "mentions" — both
  dropped 2026-07 in favor of just Matt's real shelf under the name "Matt's
  Bookshelf," mirroring how [Heather's Bookshelf](../heathers-bookshelf)
  works: sorted by his own ratings, no artificial ranking. The folder, GitHub
  repo (`MattFasanoRealEstate/matts-bookshelf`), and Vercel project were all
  renamed to match; `founder-bookshelf.vercel.app` now 308-redirects to
  `matts-bookshelf.vercel.app`.
- Covers and metadata come from [Open Library](https://openlibrary.org) (free, no key).
- Books added via the photo feature live in each visitor's browser only; the
  list in `data.js` is what everyone sees.
