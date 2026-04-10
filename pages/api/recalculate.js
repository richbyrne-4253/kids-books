// pages/api/recalculate.js
// Recalculates words = pages * wpp for all active books.

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const sb = getSupabase();

    // Fetch all active books
    const { data: books, error: fetchErr } = await sb
      .from('kids_books')
      .select('id, pages, wpp')
      .is('deleted_at', null);
    if (fetchErr) throw new Error(fetchErr.message);

    // Update each book with recalculated words
    const updates = books.map(b => ({
      id: b.id,
      words: Math.round((b.pages || 0) * (b.wpp || 200)),
    }));

    let updated = 0;
    for (const u of updates) {
      const { error } = await sb
        .from('kids_books')
        .update({ words: u.words })
        .eq('id', u.id);
      if (!error) updated++;
    }

    return res.status(200).json({ ok: true, updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
