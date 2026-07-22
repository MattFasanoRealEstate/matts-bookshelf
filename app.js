/* Matt's Bookshelf — zero-dependency static app.
   Books you add are stored in localStorage; covers/metadata come from Open Library;
   photo identification runs on-device via Tesseract.js (loaded from CDN on demand). */

// ---------- persistence ----------
const BOOKS_KEY = 'bookshelf.customBooks.v1'
const TAG_KEY = 'bookshelf.amazonTag.v1'
const STATUS_KEY = 'bookshelf.statusOverrides.v1'
const VIEW_KEY = 'bookshelf.viewMode.v1'

function loadCustomBooks() {
  try { return JSON.parse(localStorage.getItem(BOOKS_KEY)) ?? [] } catch { return [] }
}
const saveCustomBooks = (books) => localStorage.setItem(BOOKS_KEY, JSON.stringify(books))

function loadStatusOverrides() {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY)) ?? {} } catch { return {} }
}
const saveStatusOverrides = () => localStorage.setItem(STATUS_KEY, JSON.stringify(statusOverrides))

// ---------- state ----------
let customBooks = loadCustomBooks()
let statusOverrides = loadStatusOverrides() // { [bookId]: 'to-read' | 'reading' | 'read' }
let query = ''
let genreFilter = ''
let sortKey = 'rating'
let tag = localStorage.getItem(TAG_KEY) ?? ''
let viewMode = localStorage.getItem(VIEW_KEY) === 'shelf' ? 'shelf' : 'grid'
let highlightId = null // book id to pop-in animate on the next shelf render

const shelfPool = () => [...customBooks, ...MY_BOOKS, ...(typeof TO_READ_BOOKS !== 'undefined' ? TO_READ_BOOKS : [])]
// Grid View shows read/reading books — including anything promoted out of To Be
// Read via a Shelf View status override, and excluding anything sent back to it.
const allBooks = () => shelfPool().filter((b) => bookStatus(b) !== 'to-read')

// A book's shelf status: an explicit override always wins (set by the Shelf View
// "start reading" / "mark finished" controls); otherwise it's derived from the data.
function bookStatus(book) {
  const override = statusOverrides[book.id]
  if (override) return override
  if (book.reading) return 'reading'
  if (book.toRead) return 'to-read'
  return 'read'
}

// ---------- link + cover helpers ----------
function coverUrl(book, size = 'L') {
  if (book.coverUrl) return book.coverUrl
  if (book.coverId) return `https://covers.openlibrary.org/b/id/${book.coverId}-${size}.jpg`
  if (book.isbn) return `https://covers.openlibrary.org/b/isbn/${book.isbn}-${size}.jpg`
  return null
}
function amazonUrl(book) {
  const q = encodeURIComponent(`${book.title} ${book.author}`)
  const base = `https://www.amazon.com/s?k=${q}&i=stripbooks`
  return tag ? `${base}&tag=${encodeURIComponent(tag)}` : base
}
function audibleUrl(book) {
  const q = encodeURIComponent(`${book.title} ${book.author}`)
  const base = `https://www.audible.com/search?keywords=${q}`
  return tag ? `${base}&tag=${encodeURIComponent(tag)}` : base
}
function goodreadsUrl(book) {
  return `https://www.goodreads.com/search?q=${encodeURIComponent(`${book.title} ${book.author}`)}`
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---------- rendering ----------
const $ = (id) => document.getElementById(id)

function visibleBooks() {
  const q = query.trim().toLowerCase()
  let list = allBooks().filter(
    (b) =>
      (!genreFilter || b.genre === genreFilter) &&
      (!q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q)),
  )
  if (sortKey === 'favorites') list = list.filter((b) => b.rating >= 5)
  const cmp = {
    rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
    favorites: (a, b) => (b.yearRead ?? 0) - (a.yearRead ?? 0),
    recent: (a, b) => (b.yearRead ?? 0) - (a.yearRead ?? 0),
    title: (a, b) => a.title.localeCompare(b.title),
    author: (a, b) => a.author.localeCompare(b.author),
  }[sortKey]
  return list.sort(cmp)
}

function allGenres() {
  const pool = viewMode === 'shelf' ? shelfPool() : allBooks()
  return [...new Set(pool.map((b) => b.genre))].sort()
}

function cardHtml(book) {
  const src = coverUrl(book)
  const status = bookStatus(book)
  const statusChip =
    status === 'reading' ? '<span class="read-chip">📖 Reading now</span>'
    : status === 'read' ? `<span class="read-chip">${book.yearRead ? `Read ${book.yearRead}` : 'Read'}</span>`
    : ''
  return `
  <article class="card" data-id="${esc(book.id)}">
    <div class="card-cover${src ? '' : ' nocover'}">
      ${src ? `<img src="${esc(src)}" alt="Cover of ${esc(book.title)}" loading="lazy"
        onerror="this.closest('.card-cover').classList.add('nocover')" />` : ''}
      <div class="cover-fallback"><span>${esc(book.title)}</span><small>${esc(book.author)}</small></div>
      ${book.custom ? `<button class="delete-btn" title="Remove this book" data-delete="${esc(book.id)}">✕</button>` : ''}
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="chip-group">
          <span class="genre-chip">${esc(book.genre)}</span>
          ${statusChip}
        </span>
        ${book.rating ? `<span class="stars" title="Matt’s rating: ${book.rating}/5">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</span>` : ''}
      </div>
      <h3>${esc(book.title)}</h3>
      <p class="author">${esc(book.author)}${book.year ? ` · ${esc(book.year)}` : ''}</p>
      <p class="summary">${esc(book.summary)}</p>
      ${book.why ? `<p class="why">“${esc(book.why)}”</p>` : ''}
      <div class="buy-row">
        <a class="buy amazon" href="${esc(amazonUrl(book))}" target="_blank" rel="noopener noreferrer">Amazon</a>
        <a class="buy audible" href="${esc(audibleUrl(book))}" target="_blank" rel="noopener noreferrer">Audible</a>
        <a class="buy goodreads" href="${esc(goodreadsUrl(book))}" target="_blank" rel="noopener noreferrer">Goodreads</a>
      </div>
    </div>
  </article>`
}

function renderGenreOptions() {
  const genres = allGenres()
  if (genreFilter && !genres.includes(genreFilter)) genreFilter = '' // e.g. a TBR-only genre after switching to Grid View

  const sel = $('genre-select')
  sel.innerHTML =
    `<option value="">All genres</option>` +
    genres.map((g) => `<option value="${esc(g)}"${g === genreFilter ? ' selected' : ''}>${esc(g)}</option>`).join('')

  const fsel = $('f-genre')
  fsel.innerHTML = genres.map((g) => `<option>${esc(g)}</option>`).join('')
}

function render() {
  if (viewMode === 'shelf') { renderShelf(); return }
  const books = visibleBooks()
  $('book-count').textContent = allBooks().length
  $('grid').innerHTML = books.map((b) => cardHtml(b)).join('')
  $('empty-msg').hidden = books.length > 0
}

// ---------- Shelf View ----------
function shelfVisibleBooks() {
  const q = query.trim().toLowerCase()
  return shelfPool().filter(
    (b) =>
      (!genreFilter || b.genre === genreFilter) &&
      (!q ||
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.genre.toLowerCase().includes(q)),
  )
}

function shelfBookHtml(book, extraClass = '') {
  const src = coverUrl(book, 'M')
  return `
  <button class="shelf-book ${extraClass}" data-id="${esc(book.id)}">
    <span class="shelf-cover">
      ${src ? `<img src="${esc(src)}" alt="Cover of ${esc(book.title)}" loading="lazy"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" />` : ''}
      <span class="shelf-cover-fallback" style="${src ? 'display:none' : 'display:flex'}">${esc(book.title)}</span>
    </span>
    <span class="shelf-book-title">${esc(book.title)}</span>
  </button>`
}

function renderShelf() {
  const books = shelfVisibleBooks()
  $('book-count').textContent = shelfPool().length

  const reading = books.filter((b) => bookStatus(b) === 'reading')
  const read = books.filter((b) => bookStatus(b) === 'read')
  const toRead = books.filter((b) => bookStatus(b) === 'to-read')

  $('shelf-reading-row').innerHTML = reading
    .map((b) => {
      const src = coverUrl(b, 'M')
      const cls = b.id === highlightId ? ' just-moved' : ''
      return `
      <button class="reading-book${cls}" data-id="${esc(b.id)}">
        <span class="reading-cover">
          ${src ? `<img src="${esc(src)}" alt="Cover of ${esc(b.title)}" loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" />` : ''}
          <span class="reading-cover-fallback" style="${src ? 'display:none' : 'display:flex'}">${esc(b.title)}</span>
        </span>
        <span class="reading-title">${esc(b.title)}</span>
        <span class="reading-author">${esc(b.author)}</span>
      </button>`
    })
    .join('')

  const byGenre = new Map()
  for (const b of read) {
    if (!byGenre.has(b.genre)) byGenre.set(b.genre, [])
    byGenre.get(b.genre).push(b)
  }
  const genresInOrder = [...byGenre.keys()].sort()
  $('shelf-case-rows').innerHTML = genresInOrder
    .map((g) => {
      const rowBooks = byGenre.get(g).sort((a, b) => a.title.localeCompare(b.title))
      return `
      <div class="shelf-row">
        <span class="shelf-row-label">${esc(g)} · ${rowBooks.length}</span>
        <div class="shelf-row-books">
          ${rowBooks.map((b) => shelfBookHtml(b, b.id === highlightId ? 'just-moved' : '')).join('')}
        </div>
      </div>`
    })
    .join('')

  $('shelf-tbr-row').innerHTML = toRead
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((b) => shelfBookHtml(b, b.id === highlightId ? 'just-moved' : ''))
    .join('')

  $('empty-msg').hidden = books.length > 0
  highlightId = null
}

function setStatusOverride(id, status) {
  statusOverrides[id] = status
  saveStatusOverrides()
  highlightId = id
  closeDetail()
  render()
}

// ---------- Book detail modal ("opening" a shelved book) ----------
function findShelfBook(id) {
  return shelfPool().find((b) => b.id === id)
}

function detailBodyHtml(book) {
  const src = coverUrl(book)
  const status = bookStatus(book)
  const statusButtons = {
    'to-read': `<button class="status-btn primary" data-action="start-reading">📖 Start reading</button>`,
    reading: `<button class="status-btn primary" data-action="mark-finished">✓ Mark finished</button>
              <button class="status-btn ghost" data-action="back-to-tbr">↩ Back to TBR</button>`,
    read: `<button class="status-btn ghost" data-action="back-to-reading">↺ Reading again</button>`,
  }[status]
  const statusLabel = {
    'to-read': '<span class="read-chip">📚 To be read</span>',
    reading: '<span class="read-chip">📖 Reading now</span>',
    read: book.yearRead ? `<span class="read-chip">Read ${book.yearRead}</span>` : '',
  }[status]

  return `
    <div class="detail-layout">
      <div class="detail-cover">
        ${src ? `<img src="${esc(src)}" alt="Cover of ${esc(book.title)}"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" />` : ''}
        <span class="detail-cover-fallback" style="${src ? 'display:none' : 'display:flex'}">${esc(book.title)}</span>
      </div>
      <div class="detail-info">
        <span class="chip-group">
          <span class="genre-chip">${esc(book.genre)}</span>
          ${statusLabel}
        </span>
        ${book.rating ? `<span class="stars" title="Matt’s rating: ${book.rating}/5">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</span>` : ''}
        <p class="detail-author">${esc(book.author)}${book.year ? ` · ${esc(book.year)}` : ''}</p>
        <p class="detail-summary">${esc(book.summary)}</p>
        ${book.why ? `<p class="detail-why">“${esc(book.why)}”</p>` : ''}
        <div class="status-row">${statusButtons}</div>
        <div class="buy-row">
          <a class="buy amazon" href="${esc(amazonUrl(book))}" target="_blank" rel="noopener noreferrer">Amazon</a>
          <a class="buy audible" href="${esc(audibleUrl(book))}" target="_blank" rel="noopener noreferrer">Audible</a>
          <a class="buy goodreads" href="${esc(goodreadsUrl(book))}" target="_blank" rel="noopener noreferrer">Goodreads</a>
        </div>
      </div>
    </div>`
}

let openDetailId = null

function openDetail(id) {
  const book = findShelfBook(id)
  if (!book) return
  openDetailId = id
  $('detail-title').textContent = book.title
  $('detail-body').innerHTML = detailBodyHtml(book)
  $('detail-modal').hidden = false
  const panel = $('detail-panel')
  panel.classList.remove('opening')
  void panel.offsetWidth // restart the animation each time
  panel.classList.add('opening')
}
function closeDetail() { $('detail-modal').hidden = true; openDetailId = null }

$('detail-close').addEventListener('click', closeDetail)
$('detail-modal').addEventListener('click', (e) => { if (e.target === $('detail-modal')) closeDetail() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail() })

$('shelf-view').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-id]')
  if (btn) openDetail(btn.dataset.id)
})

$('detail-body').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn || !openDetailId) return
  const action = btn.dataset.action
  if (action === 'start-reading') setStatusOverride(openDetailId, 'reading')
  else if (action === 'mark-finished') setStatusOverride(openDetailId, 'read')
  else if (action === 'back-to-tbr') setStatusOverride(openDetailId, 'to-read')
  else if (action === 'back-to-reading') setStatusOverride(openDetailId, 'reading')
})

// ---------- view toggle (grid ⇄ shelf) ----------
function applyViewMode() {
  $('grid').hidden = viewMode === 'shelf'
  $('shelf-view').hidden = viewMode !== 'shelf'
  $('sort-select').hidden = viewMode === 'shelf'
  $('view-toggle').textContent = viewMode === 'shelf' ? '▦ Grid view' : '🗄️ Shelf view'
}

$('view-toggle').addEventListener('click', () => {
  viewMode = viewMode === 'shelf' ? 'grid' : 'shelf'
  localStorage.setItem(VIEW_KEY, viewMode)
  applyViewMode()
  renderGenreOptions()
  render()
})

// ---------- toolbar & settings ----------
$('search-input').addEventListener('input', (e) => { query = e.target.value; render() })
$('genre-select').addEventListener('change', (e) => { genreFilter = e.target.value; render() })
$('sort-select').addEventListener('change', (e) => { sortKey = e.target.value; render() })

$('grid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete]')
  if (!btn) return
  const book = customBooks.find((b) => b.id === btn.dataset.delete)
  if (book && confirm(`Remove “${book.title}” from your shelf?`)) {
    customBooks = customBooks.filter((b) => b.id !== book.id)
    saveCustomBooks(customBooks)
    renderGenreOptions()
    render()
  }
})

$('settings-btn').addEventListener('click', () => { $('settings-panel').hidden = !$('settings-panel').hidden })

function updateTagStatus() {
  $('tag-status').textContent = tag
    ? `Links now earn with tag “${tag}”.`
    : 'No tag yet — links work, they just don’t earn.'
}
$('tag-input').value = tag
updateTagStatus()
$('tag-input').addEventListener('input', (e) => {
  tag = e.target.value.trim()
  localStorage.setItem(TAG_KEY, tag)
  updateTagStatus()
  render()
})

// ---------- Goodreads CSV import ----------
// Parses the export from goodreads.com → My Books → Import/Export.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

function importGoodreadsCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('That file doesn’t look like a Goodreads export.')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name) => header.indexOf(name)
  const iTitle = col('title'), iAuthor = col('author'), iIsbn = col('isbn13'),
    iShelf = col('exclusive shelf'), iDateRead = col('date read'), iShelves = col('bookshelves'),
    iRating = col('my rating')
  if (iTitle === -1 || iAuthor === -1) throw new Error('Missing Title/Author columns — is this a Goodreads export?')

  const existing = new Set(shelfPool().map((b) => `${b.title}|${b.author}`.toLowerCase()))
  let added = 0, skipped = 0
  for (const r of rows.slice(1)) {
    const shelf = iShelf !== -1 ? r[iShelf]?.trim() : 'read'
    if (shelf !== 'read' && shelf !== 'currently-reading') { skipped++; continue }
    const title = r[iTitle]?.replace(/\s*\(.*?\)\s*$/, '').trim() // drop "(Series, #N)" suffix
    const author = r[iAuthor]?.trim()
    if (!title || !author || existing.has(`${title}|${author}`.toLowerCase())) { skipped++; continue }
    const isbn = (r[iIsbn] ?? '').replace(/[^0-9Xx]/g, '') // Goodreads wraps ISBNs as ="9780..."
    const dateRead = iDateRead !== -1 ? r[iDateRead]?.trim() : ''
    const rating = iRating !== -1 ? Number(r[iRating]) || 0 : 0
    const shelves = iShelves !== -1 ? r[iShelves]?.split(',').map((s) => s.trim()).filter(Boolean) : []
    const genreShelf = shelves.find((s) => s !== 'to-read' && s !== 'currently-reading' && s !== 'read')
    customBooks.push({
      id: `gr-${Date.now()}-${added}`,
      title, author,
      genre: genreShelf ? genreShelf.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Uncategorized',
      year: null,
      yearRead: dateRead ? Number(dateRead.slice(0, 4)) || null : null,
      reading: shelf === 'currently-reading' || undefined,
      rating: rating || null,
      isbn: isbn.length >= 10 ? isbn : '',
      summary: '', why: '', custom: true,
    })
    existing.add(`${title}|${author}`.toLowerCase())
    added++
  }
  saveCustomBooks(customBooks)
  renderGenreOptions()
  render()
  return { added, skipped }
}

$('import-btn').addEventListener('click', () => $('import-input').click())
$('import-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const { added, skipped } = importGoodreadsCsv(await file.text())
    alert(`Imported ${added} book${added === 1 ? '' : 's'} from Goodreads${skipped ? ` (${skipped} skipped: duplicates or to-read shelf)` : ''}.`)
  } catch (err) {
    alert(err.message)
  } finally {
    e.target.value = ''
  }
})

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(allBooks(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'my-bookshelf.json'
  a.click()
  URL.revokeObjectURL(url)
})

// ---------- Open Library ----------
async function searchOpenLibrary(q, limit = 6) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&fields=key,title,author_name,first_publish_year,cover_i,isbn`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open Library search failed (${res.status})`)
  const data = await res.json()
  return (data.docs ?? []).map((d) => ({
    workKey: d.key,
    title: d.title,
    author: d.author_name?.[0] ?? 'Unknown',
    year: d.first_publish_year ?? null,
    coverId: d.cover_i ?? null,
    isbn: d.isbn?.find((i) => i.length === 13) ?? d.isbn?.[0] ?? null,
  }))
}

async function fetchDescription(workKey) {
  try {
    const res = await fetch(`https://openlibrary.org${workKey}.json`)
    if (!res.ok) return ''
    const data = await res.json()
    const desc = typeof data.description === 'string' ? data.description : data.description?.value
    if (!desc) return ''
    const firstPara = desc.split(/\r?\n/).find((p) => p.trim().length > 40) ?? desc
    return firstPara.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').trim().slice(0, 500)
  } catch {
    return ''
  }
}

// Turn raw OCR text from a cover photo into a search query: keep the longest,
// most word-like lines (titles print big, so OCR usually reads them best).
function ocrTextToQuery(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[^a-zA-Z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && /[a-zA-Z]{3}/.test(l))
  lines.sort((a, b) => b.length - a.length)
  return lines.slice(0, 3).join(' ').split(' ').slice(0, 10).join(' ')
}

// ---------- add-book modal ----------
let busy = false
let selected = null // { workKey, coverId, isbn }

function setStatus(msg, isBusy = false) {
  const el = $('status')
  el.hidden = !msg
  el.textContent = msg
  el.classList.toggle('busy', isBusy)
}

function openModal() {
  $('modal').hidden = false
  $('step-method').hidden = false
  $('step-form').hidden = true
  $('results').innerHTML = ''
  $('photo-preview').hidden = true
  $('query-input').value = ''
  setStatus('')
  renderGenreOptions()
}
function closeModal() { $('modal').hidden = true }

$('add-btn').addEventListener('click', openModal)
$('modal-close').addEventListener('click', closeModal)
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

$('photo-btn').addEventListener('click', () => $('photo-input').click())

$('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const preview = $('photo-preview')
  preview.src = URL.createObjectURL(file)
  preview.hidden = false
  $('results').innerHTML = ''
  busy = true
  try {
    setStatus('Reading the cover (on-device OCR, ~10s the first time)…', true)
    await loadTesseract()
    const { data } = await Tesseract.recognize(file, 'eng')
    const q = ocrTextToQuery(data.text)
    if (!q) {
      setStatus('Couldn’t read any text from the photo — try a closer, straighter shot, or type the title below.')
      return
    }
    $('query-input').value = q
    await runSearch(q)
  } catch (err) {
    setStatus(`Photo recognition failed: ${err.message}`)
  } finally {
    busy = false
    e.target.value = ''
  }
})

let tesseractPromise = null
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve()
  tesseractPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('couldn’t load the OCR library (check internet connection)'))
    document.head.appendChild(s)
  })
  return tesseractPromise
}

$('manual-search').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!busy) await runSearch($('query-input').value)
})

async function runSearch(q) {
  if (!q.trim()) return
  setStatus(`Searching Open Library for “${q}”…`, true)
  $('results').innerHTML = ''
  try {
    const results = await searchOpenLibrary(q)
    setStatus(results.length ? 'Pick the right match:' : 'No matches — try editing the search text and searching again.')
    const ul = $('results')
    for (const r of results) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.innerHTML = `
        ${r.coverId
          ? `<img src="https://covers.openlibrary.org/b/id/${r.coverId}-S.jpg" alt="" />`
          : '<span class="thumb-blank"></span>'}
        <span><strong>${esc(r.title)}</strong><em>${esc(r.author)}${r.year ? ` · ${esc(r.year)}` : ''}</em></span>`
      btn.addEventListener('click', () => pickResult(r))
      li.appendChild(btn)
      ul.appendChild(li)
    }
  } catch (err) {
    setStatus(`Search failed: ${err.message}. Check your internet connection.`)
  }
}

async function pickResult(r) {
  setStatus('Fetching description…', true)
  const summary = await fetchDescription(r.workKey)
  selected = r
  $('f-title').value = r.title
  $('f-author').value = r.author
  $('f-year').value = r.year ?? ''
  $('f-summary').value = summary
  $('f-why').value = ''
  $('f-rating').value = 0
  $('step-method').hidden = true
  $('step-form').hidden = false
  const fs = $('form-status')
  fs.hidden = !!summary
  fs.textContent = summary ? '' : 'No description found on Open Library — add a short summary yourself.'
  setStatus('')
}

$('form-back').addEventListener('click', () => {
  $('step-form').hidden = true
  $('step-method').hidden = false
})

$('step-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const book = {
    id: `custom-${Date.now()}`,
    title: $('f-title').value.trim(),
    author: $('f-author').value.trim(),
    genre: $('f-genre').value,
    year: $('f-year').value ? Number($('f-year').value) : null,
    summary: $('f-summary').value.trim(),
    why: $('f-why').value.trim(),
    rating: Number($('f-rating').value) || null,
    coverId: selected?.coverId ?? null,
    isbn: selected?.isbn ?? '',
    custom: true,
  }
  customBooks = [book, ...customBooks]
  saveCustomBooks(customBooks)
  selected = null
  closeModal()
  renderGenreOptions()
  render()
})

// ---------- boot ----------
applyViewMode()
renderGenreOptions()
render()
