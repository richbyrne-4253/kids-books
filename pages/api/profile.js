// pages/api/profile.js
// Accepts a reader name + their book list, returns author/series stats and suggestions via Claude.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { reader, books } = req.body;
  if (!reader || !Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ error: 'reader and books required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const bookList = books
    .map(b => `- "${b.title}"${b.author ? ` by ${b.author}` : ''}`)
    .join('\n');

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
        max_tokens: 4000,
        system: 'You are a children\'s book expert. Always respond with only a raw JSON object, no markdown, no explanation.',
        messages: [{
          role: 'user',
          content: `Analyze the reading history for ${reader} and return stats and suggestions.

Books read:
${bookList}

Return ONLY a raw JSON object:
{
  "groups": [
    {
      "name": "Series or Author name",
      "type": "series",
      "count": 3,
      "readingLevel": "Ages 7-10",
      "books": ["Exact Title 1", "Exact Title 2", "Exact Title 3"]
    }
  ],
  "suggestions": [
    {
      "title": "Book Title",
      "author": "Author Name",
      "readingLevel": "Ages 7-10",
      "why": "One sentence reason they would enjoy it"
    }
  ]
}

Rules:
- Group by series first (e.g. "Bad Guys", "Magic Tree House", "Dragon Masters") when 2+ books from the same series exist, type="series"
- For authors of standalone books (not part of a grouped series), create a group by author name, type="author"
- readingLevel must be exactly one of: "Ages 3-6", "Ages 5-7", "Ages 6-8", "Ages 7-10", "Ages 8-12", "Ages 12+", "Adult"
- Sort groups by count descending, then alphabetically
- The "books" array must contain the exact titles from the input list that belong to this group
- Return exactly 3 suggestions of books NOT already in the list, matching the reader's level and interests
- Keep "why" to 1 concise sentence`
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'API error' });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Could not parse response' });

    const result = JSON.parse(match[0]);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
