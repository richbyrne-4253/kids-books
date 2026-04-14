// pages/api/lookup.js
// AR BookFinder scraper (free, session-based) → title, author, pages, word count
// Falls back to Google Books API if AR BookFinder returns nothing

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, author } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  try {
    const ar = await fetchFromAr(title, author);
    if (ar) return res.status(200).json(ar);

    // Fallback: Google Books for title/author/pages (no word count)
    const q = [
      `intitle:${encodeURIComponent(title)}`,
      author ? `inauthor:${encodeURIComponent(author)}` : '',
    ].filter(Boolean).join('+');
    const gbData = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`).then(r => r.json());
    const item = gbData.items?.[0]?.volumeInfo;
    if (!item) return res.status(404).json({ error: 'Book not found' });

    return res.status(200).json({
      title: item.title || title,
      author: item.authors?.[0] || author || null,
      pages: item.pageCount || null,
      word_count: null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractHiddenFields(html) {
  const fields = {};
  for (const m of html.matchAll(/type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"|name="([^"]+)"[^>]*type="hidden"[^>]*value="([^"]*)"/g)) {
    fields[m[1] || m[3]] = m[2] !== undefined ? m[2] : m[4];
  }
  return fields;
}

function span(html, id) {
  // matches id="...lblBookTitle">value</span> — id suffix anywhere in the id attribute
  const m = html.match(new RegExp(`id="[^"]*${id}"[^>]*>([^<]+)<\\/span>`, 'i'));
  return m ? m[1].trim() : null;
}

async function fetchFromAr(title, author) {
  const cookies = {};

  function cookieHeader() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function storeCookies(r) {
    const raw = r.headers.getSetCookie?.() ??
      (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);
    for (const h of raw) {
      const eq = h.indexOf('='), semi = h.indexOf(';');
      if (eq > 0) cookies[h.slice(0, eq).trim()] = h.slice(eq + 1, semi > eq ? semi : undefined).trim();
    }
  }

  try {
    // 1. GET UserType page → session + ViewState
    const r1 = await fetch('https://www.arbookfind.com/UserType.aspx', { headers: { 'User-Agent': UA } });
    storeCookies(r1);
    const f1 = extractHiddenFields(await r1.text());
    if (!f1.__VIEWSTATE) return null;

    // 2. POST user type (Parent)
    const r2 = await fetch('https://www.arbookfind.com/UserType.aspx', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieHeader(), 'Referer': 'https://www.arbookfind.com/UserType.aspx' },
      body: new URLSearchParams({ ...f1, radUserType: 'radParent', btnSubmitUserType: 'Submit' }).toString(),
      redirect: 'manual',
    });
    storeCookies(r2);
    if (r2.status !== 302) return null;

    // 3. GET default.aspx search form
    const r3 = await fetch('https://www.arbookfind.com/default.aspx', { headers: { 'User-Agent': UA, 'Cookie': cookieHeader() } });
    storeCookies(r3);
    const f3 = extractHiddenFields(await r3.text());
    if (!f3.__VIEWSTATE) return null;

    // 4. POST quick search — results returned inline (200)
    const r4 = await fetch('https://www.arbookfind.com/default.aspx', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieHeader(), 'Referer': 'https://www.arbookfind.com/default.aspx' },
      body: new URLSearchParams({ ...f3, 'ctl00$ContentPlaceHolder1$txtKeyWords': title, 'ctl00$ContentPlaceHolder1$btnDoIt': 'Search' }).toString(),
    });
    storeCookies(r4);
    const html4 = await r4.text();
    const linkMatch = html4.match(/href="(bookdetail\.aspx\?[^"]+)"/);
    if (!linkMatch) return null;

    // 5. GET book detail page
    const r5 = await fetch(`https://www.arbookfind.com/${linkMatch[1]}`, { headers: { 'User-Agent': UA, 'Cookie': cookieHeader() } });
    const html5 = await r5.text();

    // Extract fields from named spans
    const arTitle = span(html5, 'lblBookTitle');
    const arAuthor = span(html5, 'lblAuthor');
    const wcRaw = span(html5, 'lblWordCount');
    const wordCount = wcRaw ? parseInt(wcRaw.replace(/,/g, ''), 10) : null;

    // Page count: last column of the first ISBN table row (Publisher|LCCN|ISBN|Year|Pages)
    const pageCountIdx = html5.indexOf('Page Count');
    const rowMatch = pageCountIdx >= 0
      ? html5.slice(pageCountIdx).match(/<tr>[\s\S]*?<td align="left">(\d+)<\/td>\s*<\/tr>/)
      : null;
    const pages = rowMatch ? parseInt(rowMatch[1], 10) : null;

    if (!arTitle && !wordCount) return null;

    return {
      title: arTitle || title,
      author: arAuthor || author || null,
      pages,
      word_count: wordCount,
    };
  } catch {
    return null;
  }
}
