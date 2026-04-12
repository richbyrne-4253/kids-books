// pages/api/relookup-all.js
// One-time endpoint: re-looks up word counts from bookroo.com for all active books.
// Updates only where bookroo returns a word count (high/medium confidence).
// Leaves untouched if not found. DELETE this file after running.

import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 300 };

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function lookupBookroo(title, author, apiKey) {
  const query = author ? `"${title}" by ${author}` : `"${title}"`;
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
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      system: 'You are a book database assistant. Use web search to find accurate book metadata including word counts from bookroo.com. Always end your response with a raw JSON object only — no markdown, no explanation after the JSON.',
      messages: [{
        role: 'user',
        content: `Find accurate metadata for the book ${query}.\n\nSearch bookroo.com for: ${title}${author ? ` ${author}` : ''} word count\n\nReturn ONLY this JSON object (word_count is the exact total words, or null if not found):\n{"title":"...","author":"...","pages":123,"word_count":45678,"confidence":"high|medium|low"}`,
      }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'API error');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const sb = getSupabase();
  const { data: books, error } = await sb
    .from('kids_books')
    .select('id, title, author, words, pages')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const results = { updated: [], skipped: [], failed: [] };

  for (const book of books) {
    try {
      const found = await lookupBookroo(book.title, book.author, apiKey);
      if (found?.word_count && found.confidence !== 'low') {
        const { error: upErr } = await sb
          .from('kids_books')
          .update({ words: found.word_count })
          .eq('id', book.id);
        if (upErr) throw new Error(upErr.message);
        results.updated.push({ title: book.title, old: book.words, new: found.word_count, confidence: found.confidence });
      } else {
        results.skipped.push({ title: book.title, reason: found?.word_count ? 'low confidence' : 'not found on bookroo' });
      }
    } catch (e) {
      results.failed.push({ title: book.title, error: e.message });
    }
    await sleep(500); // avoid hammering the API
  }

  return res.status(200).json({
    total: books.length,
    updated: results.updated.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    detail: results,
  });
}
