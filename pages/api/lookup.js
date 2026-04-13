// pages/api/lookup.js
// Google Books API (free, no key) → title, author, pages
// AR BookFinder scraper (free, session-based) → word count

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, author } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  try {
    const q = [
      `intitle:${encodeURIComponent(title)}`,
      author ? `inauthor:${encodeURIComponent(author)}` : '',
    ].filter(Boolean).join('+');

    const [gbData, wordCount] = await Promise.all([
      fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`).then(r => r.json()),
      fetchArWordCount(title, author),
    ]);

    const item = gbData.items?.[0]?.volumeInfo;
    if (!item && wordCount === null) return res.status(404).json({ error: 'Book not found' });

    return res.status(200).json({
      title: item?.title || title,
      author: item?.authors?.[0] || author || null,
      pages: item?.pageCount || null,
      word_count: wordCount,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Extract all hidden ASP.NET fields (handles split ViewState like __VIEWSTATE1)
function extractHiddenFields(html) {
  const fields = {};
  for (const m of html.matchAll(/name="(__[^"]+)"\s+[^>]*value="([^"]*)"/g)) {
    fields[m[1]] = m[2];
  }
  return fields;
}

async function fetchArWordCount(title, author) {
  const cookies = {};

  function cookieHeader() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function storeCookies(response) {
    const raw = response.headers.getSetCookie?.() ??
      (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    for (const h of raw) {
      const eq = h.indexOf('=');
      const semi = h.indexOf(';');
      if (eq > 0) {
        cookies[h.slice(0, eq).trim()] = h.slice(eq + 1, semi > eq ? semi : undefined).trim();
      }
    }
  }

  try {
    // 1. GET UserType page → session + ViewState
    const r1 = await fetch('https://www.arbookfind.com/UserType.aspx', {
      headers: { 'User-Agent': UA },
    });
    storeCookies(r1);
    const html1 = await r1.text();
    const fields1 = extractHiddenFields(html1);
    if (!fields1.__VIEWSTATE) return null;

    // 2. POST user type selection
    const r2 = await fetch('https://www.arbookfind.com/UserType.aspx', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader(),
        'Referer': 'https://www.arbookfind.com/UserType.aspx',
      },
      body: new URLSearchParams({
        ...fields1,
        radUserType: 'radParent',
        btnSubmitUserType: 'Submit',
      }).toString(),
      redirect: 'manual',
    });
    storeCookies(r2);
    if (r2.status !== 302) return null;

    // 3. GET default.aspx (quick search form) → all hidden fields incl. __VIEWSTATE1
    const r3 = await fetch('https://www.arbookfind.com/default.aspx', {
      headers: { 'User-Agent': UA, 'Cookie': cookieHeader() },
    });
    storeCookies(r3);
    const html3 = await r3.text();
    const fields3 = extractHiddenFields(html3);
    if (!fields3.__VIEWSTATE) return null;

    // 4. POST search — results returned inline on default.aspx (200, not redirect)
    const r4 = await fetch('https://www.arbookfind.com/default.aspx', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader(),
        'Referer': 'https://www.arbookfind.com/default.aspx',
      },
      body: new URLSearchParams({
        ...fields3,
        'ctl00$ContentPlaceHolder1$txtKeyWords': title,
        'ctl00$ContentPlaceHolder1$btnDoIt': 'Search',
      }).toString(),
    });
    storeCookies(r4);
    const html4 = await r4.text();

    const linkMatch = html4.match(/href="(bookdetail\.aspx\?[^"]+)"/);
    if (!linkMatch) return null;

    // 6. GET book detail → word count
    const r6 = await fetch(`https://www.arbookfind.com/${linkMatch[1]}`, {
      headers: { 'User-Agent': UA, 'Cookie': cookieHeader() },
    });
    const html6 = await r6.text();

    // Word count is in a span: id="...lblWordCount">31938</span>
    const wc = html6.match(/lblWordCount">(\d[\d,]*)<\/span>/i);
    return wc ? parseInt(wc[1].replace(/,/g, ''), 10) : null;
  } catch {
    return null;
  }
}
