// pages/api/scan.js
// Accepts a base64 image of a book cover, returns title/author/pages via Claude vision.

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

// Anthropic only accepts these image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image, mediaType } = req.body;
  if (!image) return res.status(400).json({ error: 'image required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  // Normalise media type — iPhone HEIC and anything unknown → jpeg
  const safeType = ALLOWED_TYPES.includes(mediaType) ? mediaType : 'image/jpeg';

  // Strip any accidental data URL prefix if present
  const base64 = image.replace(/^data:[^;]+;base64,/, '');

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
        max_tokens: 300,
        system: 'You are a book identifier. Always respond with only a raw JSON object, no markdown, no explanation.',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: safeType, data: base64 },
            },
            {
              type: 'text',
              text: 'Identify the book in this image. Return only this JSON: {"title":"...","author":"...","pages":123,"confidence":"high|medium|low"}. If you cannot identify a book, return {"error":"no book found"}.',
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || JSON.stringify(data.error) });

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Could not parse response: ' + text.slice(0, 100) });

    const result = JSON.parse(match[0]);
    if (result.error) return res.status(422).json({ error: result.error });

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
