// pages/api/lookup.js
// Server-side API route — runs on Vercel, not in the browser.
// Uses Google Books API (free, no key) to find title, author, and page count.
// Word count is not returned — enter manually from AR BookFinder.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, author } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  try {
    const q = [
      `intitle:${encodeURIComponent(title)}`,
      author ? `inauthor:${encodeURIComponent(author)}` : '',
    ].filter(Boolean).join('+');

    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
    const data = await response.json();

    const item = data.items?.[0]?.volumeInfo;
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
