// pages/api/lookup.js
// Server-side API route — runs on Vercel, not in the browser.
// Has full network access to call Anthropic.
//
// Strategy:
//   1. web_fetch (free) → try Lexile Hub for exact word count
//   2. web_search ($0.01) → fallback if fetch returns no useful data
//   3. Claude memory → last resort if no tools find it

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, author } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const query = author ? `"${title}" by ${author}` : `"${title}"`;
  const lexileUrl = `https://hub.lexile.com/find-a-book/search/results/?title=${encodeURIComponent(title)}${author ? `&author=${encodeURIComponent(author)}` : ''}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        tools: [
          {
            type: 'web_fetch_20250910',
            name: 'web_fetch',
            max_uses: 2,
            max_content_tokens: 8000,
          },
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 1,
          },
        ],
        system: 'You are a book database assistant. Use web tools to find accurate book metadata. Always end your response with a raw JSON object only — no markdown, no explanation after the JSON.',
        messages: [{
          role: 'user',
          content: `Find accurate metadata for the book ${query}.

Step 1: Fetch this Lexile Hub URL to get the exact word count:
${lexileUrl}

Step 2: If the fetch doesn't return book data with a word count, search the web for:
site:lexile.com "${title}"${author ? ` ${author}` : ''} word count

Step 3: Use your knowledge if neither tool finds it.

Return ONLY this JSON object (word_count is the exact total words from Lexile, or null if not found):
{"title":"...","author":"...","pages":123,"word_count":45678,"confidence":"high|medium|low"}`,
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'API error' });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON in response: ' + text.slice(0, 200) });

    const book = JSON.parse(match[0]);
    return res.status(200).json(book);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
