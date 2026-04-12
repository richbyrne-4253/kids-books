// pages/api/lookup.js
// Server-side API route — runs on Vercel, not in the browser.
// Uses web_search to find book metadata including Lexile word count.

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, author } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const query = author ? `"${title}" by ${author}` : `"${title}"`;

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
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 2,
          },
        ],
        system: 'You are a book database assistant. Use web search to find accurate book metadata including word counts from AR BookFinder (arbookfind.com). AR BookFinder lists "Word Count" on every book detail page — that is the number to use. Always end your response with a raw JSON object only — no markdown, no explanation after the JSON.',
        messages: [{
          role: 'user',
          content: `Find accurate metadata for the book ${query}.

Search arbookfind.com for: ${title}${author ? ` ${author}` : ''} word count

Find the book on AR BookFinder and extract the Word Count field from its detail page.

Return ONLY this JSON object (word_count is the exact total words, or null if not found):
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
