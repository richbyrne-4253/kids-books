// pages/api/books.js
// CRUD API for kids_books table in Supabase.
// GET              → list active books (deleted_at IS NULL), newest first
// GET ?trash=1     → list soft-deleted books
// POST             → insert one or many books
// PUT              → update a book by id
// PATCH            → restore a soft-deleted book by id
// DELETE ?hard=1   → permanently delete from trash
// DELETE           → soft delete (set deleted_at = now())

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  let sb;
  try {
    sb = getSupabase();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (req.method === 'GET') {
    const trash = req.query.trash === '1';
    const query = sb.from('kids_books').select('*').order('created_at', { ascending: false });
    const { data, error } = trash
      ? await query.not('deleted_at', 'is', null)
      : await query.is('deleted_at', null);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const { data, error } = await sb.from('kids_books').insert(payload).select();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body;
    const { data, error } = await sb
      .from('kids_books').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // PATCH = restore from trash
  if (req.method === 'PATCH') {
    const { id } = req.body;
    const { data, error } = await sb
      .from('kids_books').update({ deleted_at: null }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    const hard = req.query.hard === '1';
    if (hard) {
      const { error } = await sb.from('kids_books').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await sb
        .from('kids_books').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
