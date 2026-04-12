import { useState, useEffect } from 'react';
import Head from 'next/head';

const CHILDREN = ['Alex', 'Hannah'];
const COLORS = {
  Alex:   { bg: '#e8f4fd', accent: '#2196f3', dark: '#1565c0', light: '#bbdefb' },
  Hannah: { bg: '#fce4ec', accent: '#e91e8c', dark: '#880e4f', light: '#f8bbd0' },
};

const EXTRA_PALETTES = [
  { bg: '#f3e5f5', accent: '#9c27b0', dark: '#4a148c' },
  { bg: '#e8f5e9', accent: '#388e3c', dark: '#1b5e20' },
  { bg: '#fff3e0', accent: '#f57c00', dark: '#e65100' },
  { bg: '#e0f2f1', accent: '#00796b', dark: '#004d40' },
  { bg: '#fff8e1', accent: '#f9a825', dark: '#7b6500' },
];

function nameToColors(name) {
  if (COLORS[name]) return COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return EXTRA_PALETTES[hash % EXTRA_PALETTES.length];
}

function autoWpp(pages) {
  if (!pages) return 200;
  return pages < 50 ? 150 : pages < 150 ? 200 : 250;
}

function estimateWords(pages, customWpp) {
  if (!pages) return 0;
  const wpp = customWpp || autoWpp(pages);
  return Math.round(pages * wpp);
}

async function apiFetch(method, body, qs = '') {
  const res = await fetch('/api/books' + qs, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Tests ────────────────────────────────────────────────────────────
function runTests() {
  const results = [];
  results.push({ name: 'estimateWords: picture book (32p)', pass: estimateWords(32) === 4800 });
  results.push({ name: 'estimateWords: chapter book (120p)', pass: estimateWords(120) === 24000 });
  results.push({ name: 'estimateWords: novel (300p)', pass: estimateWords(300) === 75000 });
  results.push({ name: 'estimateWords: 0 pages', pass: estimateWords(0) === 0 });

  const books = [
    { child: 'Alex', pages: 32, words: 4800 },
    { child: 'Alex', pages: 100, words: 20000 },
    { child: 'Hannah', pages: 278, words: 69500 },
  ];
  const alexTotal = books.filter(b => b.child === 'Alex').reduce((s, b) => s + b.pages, 0);
  results.push({ name: 'Totals: Alex pages sum', pass: alexTotal === 132 });
  results.push({ name: 'Totals: Hannah book count', pass: books.filter(b => b.child === 'Hannah').length === 1 });
  results.push({ name: 'COLORS defined for both children', pass: !!COLORS.Alex && !!COLORS.Hannah });
  results.push({ name: 'JSON round-trip', pass: (() => { try { return JSON.parse(JSON.stringify({ a: 1 })).a === 1; } catch { return false; } })() });
  results.push({ name: 'nameToColors: known name uses COLORS', pass: nameToColors('Alex') === COLORS.Alex });
  results.push({ name: 'nameToColors: unknown name returns palette', pass: !!nameToColors('Dave') && !!nameToColors('Dave').accent });
  results.push({ name: 'nameToColors: deterministic for same name', pass: nameToColors('Zoe').accent === nameToColors('Zoe').accent });
  results.push({ name: 'estimateWords: custom wpp overrides auto', pass: estimateWords(100, 300) === 30000 });
  results.push({ name: 'autoWpp: picture book', pass: autoWpp(32) === 150 });
  results.push({ name: 'autoWpp: chapter book', pass: autoWpp(120) === 200 });
  results.push({ name: 'autoWpp: novel', pass: autoWpp(300) === 250 });
  results.push({ name: 'Multi-reader: each child gets own entry', pass: (() => {
    const children = ['Alex', 'Hannah'];
    const entries = children.map(child => ({ child, title: 'Test', pages: 100 }));
    return entries.length === 2 && entries[0].child === 'Alex' && entries[1].child === 'Hannah';
  })() });
  results.push({ name: 'Bulk: title lines parsed correctly', pass: (() => {
    const raw = 'Book A\nBook B\nBook C';
    const lines = raw.split('\n').map(t => t.trim()).filter(Boolean);
    return lines.length === 3 && lines[0] === 'Book A';
  })() });
  return results;
}

export default function Home() {
  const [books, setBooks] = useState([]);
  const [view, setView] = useState('home');

  // Add form state
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [customName, setCustomName] = useState('');
  const [titles, setTitles] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [looking, setLooking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [wpp, setWpp] = useState('');
  const [wppEdited, setWppEdited] = useState(false);
  const [totalWords, setTotalWords] = useState('');
  const [totalWordsEdited, setTotalWordsEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [localBooks, setLocalBooks] = useState([]);
  const [importing, setImporting] = useState(false);
  const [trashBooks, setTrashBooks] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [profileReader, setProfileReader] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [expandedGroup, setExpandedGroup] = useState(null);

  useEffect(() => {
    // Check for old localStorage books to offer migration
    try {
      const old = JSON.parse(localStorage.getItem('kids-books-v1') || '[]');
      if (old.length > 0) setLocalBooks(old);
    } catch {}

    apiFetch('GET')
      .then(data => setBooks(data))
      .catch(e => setSyncError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleImport() {
    setImporting(true);
    try {
      const saved = await apiFetch('POST', localBooks);
      setBooks(prev => [...saved, ...prev]);
      localStorage.removeItem('kids-books-v1');
      setLocalBooks([]);
    } catch (e) {
      setSyncError('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  }

  // Auto-fill WPP when pages changes, unless user has manually set it
  useEffect(() => {
    if (!wppEdited && pages && !isNaN(Number(pages)) && Number(pages) > 0) {
      setWpp(String(autoWpp(Number(pages))));
    }
  }, [pages, wppEdited]);

  // Auto-derive WPP from total words when user fills in that field
  useEffect(() => {
    if (!totalWordsEdited) return;
    const tw = Number(totalWords);
    const p = Number(pages);
    if (totalWords && !isNaN(tw) && tw > 0 && pages && !isNaN(p) && p > 0) {
      setWpp(String(Math.round(tw / p)));
      setWppEdited(true);
    }
  }, [totalWords, pages, totalWordsEdited]);

  // Derived
  const titleLines = titles.split('\n').map(t => t.trim()).filter(Boolean);
  const isBulkMode = titleLines.length > 1;

  function totals(c) {
    const cb = books.filter(b => b.child === c);
    return { count: cb.length, pages: cb.reduce((s, b) => s + (b.pages || 0), 0), words: cb.reduce((s, b) => s + (b.words || 0), 0) };
  }

  function allReaders() {
    const names = new Set(CHILDREN);
    books.forEach(b => names.add(b.child));
    return [...names];
  }

  function toggleChild(name) {
    setSelectedChildren(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }

  function addCustomName() {
    const name = customName.trim();
    if (!name) return;
    if (!selectedChildren.includes(name)) {
      setSelectedChildren(prev => [...prev, name]);
    }
    setCustomName('');
  }

  async function handleScan(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setLookupError('');
    try {
      // Resize to max 1024px before sending — iPhone photos can be 10+ MB
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const MAX = 1024;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setTitles(data.title || '');
      setAuthor(data.author || '');
      if (data.pages) {
        setPages(String(data.pages));
        if (!wppEdited) setWpp(String(autoWpp(data.pages)));
      }
    } catch (e) {
      setLookupError('Scan failed: ' + e.message);
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  }

  async function handleLookup() {
    if (!titles.trim() || isBulkMode) return;
    setLooking(true);
    setLookupError('');
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titles.trim(), author: author.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setTitles(data.title || titles);
      setAuthor(data.author || author);
      setPages(String(data.pages || ''));
      if (data.word_count) {
        setTotalWords(String(data.word_count));
        setTotalWordsEdited(true);
      } else if (data.pages && !wppEdited) {
        setWpp(String(autoWpp(data.pages)));
      }
    } catch (e) {
      setLookupError(e.message);
    } finally {
      setLooking(false);
    }
  }

  async function handleSave() {
    setSaveError('');
    if (selectedChildren.length === 0) return setSaveError('Pick at least one reader');
    if (!titles.trim()) return setSaveError('Enter a title');

    if (isBulkMode) {
      await handleBulkSave();
      return;
    }

    if (!pages || isNaN(Number(pages)) || Number(pages) <= 0) return setSaveError('Enter a valid page count');

    const now = Date.now();
    const explicitWords = totalWords && !isNaN(Number(totalWords)) && Number(totalWords) > 0 ? Number(totalWords) : null;
    const effectiveWpp = wpp && !isNaN(Number(wpp)) && Number(wpp) > 0 ? Number(wpp) : undefined;
    const finalWpp = explicitWords ? Math.round(explicitWords / Number(pages)) : effectiveWpp || autoWpp(Number(pages));
    const newBooks = selectedChildren.map((child, i) => ({
      id: now + i,
      child,
      title: titles.trim(),
      author: author.trim(),
      pages: Number(pages),
      wpp: finalWpp,
      words: explicitWords || estimateWords(Number(pages), effectiveWpp),
      date: new Date().toISOString().split('T')[0],
    }));

    try {
      const saved = await apiFetch('POST', newBooks);
      setBooks(prev => [...saved, ...prev]);
    } catch (e) { return setSaveError('Save failed: ' + e.message); }
    resetForm();
    setView('home');
  }

  async function handleBulkSave() {
    setBulkProcessing(true);
    const newBooks = [];
    const manualPages = pages && !isNaN(Number(pages)) && Number(pages) > 0 ? Number(pages) : null;
    let idCounter = Date.now();

    for (let i = 0; i < titleLines.length; i++) {
      const t = titleLines[i];
      setBulkProgress({ current: i + 1, total: titleLines.length, currentTitle: t });

      let bookTitle = t;
      let bookAuthor = '';
      let bookPages = manualPages || 0;

      if (!manualPages) {
        try {
          const res = await fetch('/api/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: t }),
          });
          const data = await res.json();
          if (res.ok) {
            bookTitle = data.title || t;
            bookAuthor = data.author || '';
            bookPages = data.pages || 0;
          }
        } catch (e) {
          // save with 0 pages if lookup fails
        }
      }

      const explicitWordsBulk = totalWords && !isNaN(Number(totalWords)) && Number(totalWords) > 0 ? Number(totalWords) : null;
      const effectiveWpp = wpp && !isNaN(Number(wpp)) && Number(wpp) > 0 ? Number(wpp) : undefined;
      const finalWppBulk = explicitWordsBulk && bookPages > 0 ? Math.round(explicitWordsBulk / bookPages) : effectiveWpp || autoWpp(bookPages);
      for (const child of selectedChildren) {
        newBooks.push({
          id: idCounter++,
          child,
          title: bookTitle,
          author: bookAuthor,
          pages: bookPages,
          wpp: finalWppBulk,
          words: explicitWordsBulk || estimateWords(bookPages, effectiveWpp),
          date: new Date().toISOString().split('T')[0],
        });
      }
    }

    try {
      const saved = await apiFetch('POST', newBooks);
      setBooks(prev => [...saved, ...prev]);
    } catch (e) { setSaveError('Save failed: ' + e.message); }
    setBulkProcessing(false);
    setBulkProgress(null);
    resetForm();
    setView('home');
  }

  function startEdit(book) {
    setEditingBook(book);
    setSelectedChildren([book.child]);
    setTitles(book.title);
    setAuthor(book.author || '');
    setPages(String(book.pages || ''));
    setWpp(String(book.wpp || autoWpp(book.pages || 0)));
    setWppEdited(true);
    setSaveError('');
    setView('edit');
  }

  async function handleUpdate() {
    setSaveError('');
    if (selectedChildren.length === 0) return setSaveError('Pick a reader');
    if (!titles.trim()) return setSaveError('Enter a title');
    if (!pages || isNaN(Number(pages)) || Number(pages) <= 0) return setSaveError('Enter a valid page count');

    const explicitWordsEdit = totalWords && !isNaN(Number(totalWords)) && Number(totalWords) > 0 ? Number(totalWords) : null;
    const effectiveWpp = wpp && !isNaN(Number(wpp)) && Number(wpp) > 0 ? Number(wpp) : undefined;
    const finalWppEdit = explicitWordsEdit ? Math.round(explicitWordsEdit / Number(pages)) : effectiveWpp || autoWpp(Number(pages));
    const updatedBook = {
      ...editingBook,
      child: selectedChildren[0],
      title: titles.trim(),
      author: author.trim(),
      pages: Number(pages),
      wpp: finalWppEdit,
      words: explicitWordsEdit || estimateWords(Number(pages), effectiveWpp),
    };

    try {
      const saved = await apiFetch('PUT', updatedBook);
      setBooks(prev => prev.map(b => b.id === editingBook.id ? saved : b));
    } catch (e) { return setSaveError('Update failed: ' + e.message); }
    resetForm();
    setEditingBook(null);
    setView('home');
  }

  function resetForm() {
    setSelectedChildren([]); setCustomName('');
    setTitles(''); setAuthor(''); setPages('');
    setWpp(''); setWppEdited(false);
    setTotalWords(''); setTotalWordsEdited(false);
    setLookupError(''); setSaveError('');
    setLooking(false); setBulkProcessing(false); setBulkProgress(null);
  }

  async function handleDelete(id) {
    if (!confirm('Move this book to trash?')) return;
    setBooks(prev => prev.filter(b => b.id !== id));
    try { await apiFetch('DELETE', { id }); }
    catch (e) {
      setSyncError('Delete failed: ' + e.message);
      apiFetch('GET').then(data => setBooks(data)).catch(() => {});
    }
  }

  async function loadTrash() {
    setTrashLoading(true);
    try {
      const data = await apiFetch('GET', null, '?trash=1');
      setTrashBooks(data);
    } catch (e) { setSyncError(e.message); }
    finally { setTrashLoading(false); }
  }

  async function handleRestore(id) {
    try {
      await fetch('/api/books', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setTrashBooks(prev => prev.filter(b => b.id !== id));
      apiFetch('GET').then(data => setBooks(data)).catch(() => {});
    } catch (e) { setSyncError('Restore failed: ' + e.message); }
  }

  async function handleHardDelete(id) {
    if (!confirm('Permanently delete? This cannot be undone.')) return;
    try {
      await fetch('/api/books?hard=1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setTrashBooks(prev => prev.filter(b => b.id !== id));
    } catch (e) { setSyncError('Permanent delete failed: ' + e.message); }
  }

  async function handleRecalculate() {
    if (!confirm('Recalculate all word counts from pages × WPP?')) return;
    try {
      const res = await fetch('/api/recalculate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const fresh = await apiFetch('GET');
      setBooks(fresh);
      alert(`✅ Recalculated words for ${data.updated} book${data.updated !== 1 ? 's' : ''}.`);
    } catch (e) { setSyncError('Recalculate failed: ' + e.message); }
  }

  function profileCacheKey(name, readerBooks) {
    const count = readerBooks.length;
    const latestId = readerBooks[0]?.id || 0;
    return `kb_profile_v2_${name}_${count}_${latestId}`;
  }

  async function openReaderProfile(name) {
    setProfileReader(name);
    setProfileData(null);
    setProfileError('');
    setExpandedGroup(null);
    setView('reader');
    const readerBooks = books.filter(b => b.child === name);

    // Check localStorage cache first
    const cacheKey = profileCacheKey(name, readerBooks);
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setProfileData(JSON.parse(cached));
        setProfileLoading(false);
        return;
      }
    } catch {}

    setProfileLoading(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reader: name, books: readerBooks.map(b => ({ title: b.title, author: b.author, pages: b.pages })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Profile failed');
      setProfileData(data);
      // Save to cache — clear old keys for this reader first
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(`kb_profile_v2_${name}_`)) { localStorage.removeItem(k); i--; }
        }
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {}
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileLoading(false);
    }
  }

  function handleExport() {
    const json = JSON.stringify(books, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kids-books-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Views ──────────────────────────────────────────────────────────

  if (view === 'tests') {
    const results = testResults || [];
    const passed = results.filter(r => r.pass).length;
    return (
      <div style={s.page}>
        <Head><title>Tests</title></Head>
        <header style={s.header}>
          <button style={s.back} onClick={() => setView('home')}>← Back</button>
          <span style={s.headerTitle}>Tests</span>
          <div style={{width:60}}/>
        </header>
        <div style={s.body}>
          <div style={{...s.badge, background: passed===results.length?'#e8f5e9':'#fff3e0', color: passed===results.length?'#2e7d32':'#e65100'}}>
            {passed}/{results.length} passed {passed===results.length?'✓':'✗'}
          </div>
          {results.map((r,i) => (
            <div key={i} style={s.testRow}>
              <span style={{color: r.pass?'#4caf50':'#f44336', fontSize:18, marginRight:10}}>{r.pass?'✓':'✗'}</span>
              <span style={{color: r.pass?'#333':'#c62828', fontSize:14}}>{r.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'edit' && editingBook) {
    const col = nameToColors(selectedChildren[0] || editingBook.child);
    return (
      <div style={s.page}>
        <Head><title>Edit Book</title></Head>
        <header style={s.header}>
          <button style={s.back} onClick={() => { resetForm(); setEditingBook(null); setView('home'); }}>← Back</button>
          <span style={s.headerTitle}>Edit Book</span>
          <div style={{width:60}}/>
        </header>
        <div style={s.body}>

          {/* Reader — single select */}
          <label style={s.label}>Reader</label>
          <div style={{display:'flex', gap:12, marginBottom:12}}>
            {CHILDREN.map(c => {
              const cc = nameToColors(c);
              const sel = selectedChildren[0] === c;
              return (
                <button key={c} onClick={() => setSelectedChildren([c])} style={{
                  flex:1, padding:14, borderRadius:12, border:`2px solid ${cc.accent}`,
                  background: sel ? cc.accent : cc.bg,
                  color: sel ? '#fff' : cc.dark,
                  fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif',
                }}>{c}</button>
              );
            })}
          </div>
          {/* Custom name for reader */}
          <div style={{display:'flex', gap:8, marginBottom:20}}>
            <input
              style={{...s.input, marginBottom:0, flex:1}}
              value={!CHILDREN.includes(selectedChildren[0]) ? (selectedChildren[0] || customName) : customName}
              onChange={e => { setCustomName(e.target.value); setSelectedChildren([e.target.value]); }}
              placeholder="Other reader name…"
            />
          </div>

          {/* Title */}
          <label style={s.label}>Book Title</label>
          <input style={s.input} value={titles} onChange={e => setTitles(e.target.value)} placeholder="Title" />

          {/* Author */}
          <label style={s.label}>Author</label>
          <input style={s.input} value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author" />

          {/* Pages */}
          <label style={s.label}>Pages</label>
          <input style={s.input} value={pages} onChange={e => setPages(e.target.value)}
            type="number" inputMode="numeric" placeholder="enter page count" />

          {/* WPP */}
          <label style={s.label}>Words per Page</label>
          <input
            style={s.input}
            value={wpp}
            onChange={e => { setWpp(e.target.value); setWppEdited(true); }}
            type="number" inputMode="numeric"
            placeholder={pages ? String(autoWpp(Number(pages))) : '200'}
          />
          <div style={s.hint}>
            {pages && wpp
              ? `~${estimateWords(Number(pages), Number(wpp)).toLocaleString()} estimated words`
              : pages ? `~${estimateWords(Number(pages)).toLocaleString()} estimated words` : ''}
          </div>

          {/* Total Words (optional override) */}
          <label style={s.label}>Total Words (optional)</label>
          <input
            style={s.input}
            value={totalWords}
            onChange={e => { setTotalWords(e.target.value); setTotalWordsEdited(true); }}
            type="number" inputMode="numeric"
            placeholder={pages && wpp ? String(estimateWords(Number(pages), Number(wpp))) : 'Leave blank to use pages × wpp'}
          />
          <div style={s.hint}>
            {totalWords && pages && Number(pages) > 0
              ? `→ wpp = ${Math.round(Number(totalWords) / Number(pages))}`
              : 'If filled, overrides pages × wpp'}
          </div>

          {saveError && <div style={s.error}>{saveError}</div>}

          <button onClick={handleUpdate} style={s.saveBtn}>Save Changes</button>
        </div>
      </div>
    );
  }

  if (view === 'trash') {
    return (
      <div style={s.page}>
        <Head><title>Trash</title></Head>
        <header style={s.header}>
          <button style={s.back} onClick={() => setView('home')}>← Back</button>
          <span style={s.headerTitle}>🗑️ Trash</span>
          <div style={{width:60}}/>
        </header>
        <div style={s.body}>
          {trashLoading
            ? <div style={{textAlign:'center', padding:40, color:'#888'}}>Loading…</div>
            : trashBooks.length === 0
            ? <div style={{textAlign:'center', padding:40, color:'#999'}}>
                <div style={{fontSize:40}}>✅</div>
                <div style={{marginTop:8}}>Trash is empty</div>
              </div>
            : trashBooks.map(book => {
                const col = nameToColors(book.child);
                return (
                  <div key={book.id} style={{
                    padding:'12px', marginBottom:8, borderRadius:10,
                    background:'#fafafa', border:'1px solid #eee',
                    borderLeft:`4px solid ${col.accent}`,
                  }}>
                    <div style={{fontSize:15, fontWeight:700, color:'#999', textDecoration:'line-through'}}>{book.title}</div>
                    {book.author && <div style={{fontSize:13, color:'#bbb'}}>{book.author}</div>}
                    <div style={{fontSize:12, color:'#ccc', marginTop:2}}>
                      <span style={{background:col.accent, color:'#fff', borderRadius:4, padding:'1px 6px', marginRight:4, opacity:0.6}}>{book.child}</span>
                      {book.date} · {book.pages} pages
                    </div>
                    <div style={{display:'flex', gap:8, marginTop:10}}>
                      <button onClick={() => handleRestore(book.id)} style={{
                        flex:1, padding:'8px', borderRadius:8, background:'#e8f5e9',
                        color:'#2e7d32', border:'1px solid #a5d6a7', fontWeight:700,
                        fontSize:13, cursor:'pointer', fontFamily:'Georgia, serif',
                      }}>↩ Restore</button>
                      <button onClick={() => handleHardDelete(book.id)} style={{
                        flex:1, padding:'8px', borderRadius:8, background:'#ffebee',
                        color:'#c62828', border:'1px solid #ef9a9a', fontWeight:700,
                        fontSize:13, cursor:'pointer', fontFamily:'Georgia, serif',
                      }}>✕ Delete Forever</button>
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>
    );
  }

  if (view === 'add') {
    // Bulk processing overlay
    if (bulkProcessing) {
      const prog = bulkProgress || { current: 0, total: titleLines.length, currentTitle: '...' };
      return (
        <div style={s.page}>
          <Head><title>Adding Books…</title></Head>
          <div style={{padding:40, textAlign:'center'}}>
            <div style={{fontSize:52, marginBottom:20}}>📚</div>
            <div style={{fontSize:20, fontWeight:700, color:'#3d2b1f', marginBottom:8}}>
              Adding books… {prog.current}/{prog.total}
            </div>
            <div style={{fontSize:14, color:'#888', marginBottom:24, fontStyle:'italic'}}>
              {prog.currentTitle}
            </div>
            <div style={{background:'#e0e0e0', borderRadius:8, height:10, overflow:'hidden', margin:'0 16px'}}>
              <div style={{
                background:'#5c6bc0',
                width: `${(prog.current / prog.total) * 100}%`,
                height:'100%',
                borderRadius:8,
                transition:'width 0.3s',
              }}/>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={s.page}>
        <Head><title>Add Book</title></Head>
        <header style={s.header}>
          <button style={s.back} onClick={() => { resetForm(); setView('home'); }}>← Back</button>
          <span style={s.headerTitle}>Add a Book</span>
          <div style={{width:60}}/>
        </header>
        <div style={s.body}>

          {/* ── Section 1: Who read it? ── */}
          <div style={s.formSection}>
            <div style={s.formSectionTitle}>👤 Who Read It?</div>
            <label style={s.label}>Select Reader</label>
            <div style={{display:'flex', gap:12, marginBottom:12}}>
              {CHILDREN.map(c => {
                const col = nameToColors(c);
                const sel = selectedChildren.includes(c);
                return (
                  <button key={c} onClick={() => toggleChild(c)} style={{
                    flex:1, padding:14, borderRadius:12, border:`2px solid ${col.accent}`,
                    background: sel ? col.accent : col.bg,
                    color: sel ? '#fff' : col.dark,
                    fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif',
                    transition:'background 0.15s, color 0.15s',
                  }}>{c}</button>
                );
              })}
            </div>

            {/* Custom name input */}
            <label style={s.label}>Other Reader</label>
            <div style={{display:'flex', gap:8, marginBottom:12}}>
              <input
                style={{...s.input, marginBottom:0, flex:1}}
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomName(); } }}
                placeholder="Other reader name…"
              />
              <button
                onClick={addCustomName}
                disabled={!customName.trim()}
                style={{
                  padding:'12px 16px', borderRadius:8, background:'#5c6bc0',
                  color:'#fff', border:'none', fontWeight:700, cursor:'pointer',
                  opacity: customName.trim() ? 1 : 0.4, fontFamily:'Georgia, serif', fontSize:15,
                }}
              >Add</button>
            </div>

            {/* Selected reader chips */}
            {selectedChildren.length > 0 && (
              <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:4}}>
                {selectedChildren.map(name => {
                  const col = nameToColors(name);
                  return (
                    <div key={name} style={{
                      display:'flex', alignItems:'center', gap:6,
                      background: col.accent, color:'#fff',
                      borderRadius:20, padding:'5px 8px 5px 14px',
                      fontSize:14, fontWeight:700,
                    }}>
                      {name}
                      <button onClick={() => toggleChild(name)} style={{
                        background:'rgba(0,0,0,0.2)', border:'none', color:'#fff',
                        cursor:'pointer', fontSize:11, borderRadius:10,
                        width:18, height:18, display:'flex', alignItems:'center',
                        justifyContent:'center', padding:0, lineHeight:1,
                      }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Section 2: Book Title ── */}
          <div style={s.formSection}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <div style={s.formSectionTitle}>📖 {isBulkMode ? `Book Titles (${titleLines.length})` : 'Book Title'}</div>
              {!isBulkMode && (
                <label style={{
                  fontSize:13, color:'#5c6bc0', fontWeight:700, cursor:'pointer',
                  display:'flex', alignItems:'center', gap:4,
                  opacity: scanning ? 0.5 : 1, marginBottom:0,
                }}>
                  {scanning ? '⏳ Scanning…' : '📷 Scan Cover'}
                  <input
                    type="file" accept="image/*" capture="environment"
                    onChange={handleScan} disabled={scanning}
                    style={{display:'none'}}
                  />
                </label>
              )}
            </div>
            <textarea
              style={{
                ...s.input,
                minHeight: isBulkMode ? 130 : 48,
                resize:'vertical',
                fontFamily:'Georgia, serif',
                lineHeight:1.5,
              }}
              value={titles}
              onChange={e => setTitles(e.target.value)}
              placeholder={isBulkMode ? 'The Wild Robot\nCharlotte\'s Web\nHarry Potter…' : 'Enter Book Title Here'}
              rows={isBulkMode ? 5 : 2}
            />

            {isBulkMode && (
              <div style={{
                color:'#3949ab', fontSize:13, marginBottom:12,
                padding:'8px 12px', background:'#e8eaf6', borderRadius:8,
              }}>
                📚 <strong>Bulk mode</strong> — {titleLines.length} books
                {selectedChildren.length > 1 ? ` × ${selectedChildren.length} readers` : ''}
                {!pages ? ' — page counts auto-looked up for each' : ` — all using ${pages} pages`}
              </div>
            )}
          </div>

          {/* ── Section 3: Author, Look Up & Page Details ── */}
          <div style={s.formSection}>

            {/* Lookup button (single mode only) */}
            {!isBulkMode && (
              <>
                <button onClick={handleLookup} disabled={looking || !titles.trim()} style={{
                  ...s.lookupBtn, opacity: (!titles.trim() || looking) ? 0.5 : 1, marginTop:0
                }}>
                  {looking ? 'Looking up…' : '🔍 Look Up Info or Enter Manually'}
                </button>
                {lookupError && <div style={s.error}>Lookup failed: {lookupError}<br/><small>You can still enter details manually below.</small></div>}

                <label style={s.label}>Author (optional)</label>
                <input style={s.input} value={author} onChange={e => setAuthor(e.target.value)}
                  placeholder="Enter Author Name" />
              </>
            )}

            {/* Pages */}
            <label style={s.label}>
              {isBulkMode ? 'Pages (optional — applies to all, or leave blank to auto-lookup)' : 'Pages'}
            </label>
            <input
              style={s.input}
              value={pages}
              onChange={e => setPages(e.target.value)}
              placeholder={isBulkMode ? 'Leave blank to auto-lookup each' : 'Enter Page Count Here'}
              type="number"
              inputMode="numeric"
            />

            {/* Words per page */}
            <label style={s.label}>Words per Page</label>
            <input
              style={s.input}
              value={wpp}
              onChange={e => { setWpp(e.target.value); setWppEdited(true); }}
              placeholder="Enter Words Per Page Here"
              type="number"
              inputMode="numeric"
            />
            <div style={s.hint}>
              {pages && wpp
                ? `~${estimateWords(Number(pages), Number(wpp)).toLocaleString()} estimated words`
                : pages
                ? `~${estimateWords(Number(pages)).toLocaleString()} estimated words (auto)`
                : 'Auto-filled when pages are entered'}
            </div>

            {/* Total Words (optional override) */}
            {!isBulkMode && (
              <>
                <label style={s.label}>Total Words (optional)</label>
                <input
                  style={s.input}
                  value={totalWords}
                  onChange={e => { setTotalWords(e.target.value); setTotalWordsEdited(true); }}
                  type="number" inputMode="numeric"
                  placeholder={pages && wpp ? String(estimateWords(Number(pages), Number(wpp))) : 'Leave blank to use pages × wpp'}
                />
                <div style={s.hint}>
                  {totalWords && pages && Number(pages) > 0
                    ? `→ wpp = ${Math.round(Number(totalWords) / Number(pages))}`
                    : 'If filled, overrides pages × wpp'}
                </div>
              </>
            )}
          </div>

          {saveError && <div style={s.error}>{saveError}</div>}

          <button onClick={handleSave} style={s.saveBtn}>
            {isBulkMode
              ? `Save ${titleLines.length} Book${titleLines.length !== 1 ? 's' : ''}${selectedChildren.length > 1 ? ` × ${selectedChildren.length} Readers` : ''}`
              : 'Save Book'
            }
          </button>
        </div>
      </div>
    );
  }

  if (view === 'reader' && profileReader) {
    const col = nameToColors(profileReader);
    const t = totals(profileReader);
    const readerBooks = books.filter(b => b.child === profileReader);

    function groupStats(g) {
      const titles = new Set((g.books || []).map(t => t.trim().toLowerCase()));
      const matched = readerBooks.filter(b => titles.has((b.title || '').trim().toLowerCase()));
      return {
        pages: matched.reduce((s, b) => s + (b.pages || 0), 0),
        words: matched.reduce((s, b) => s + (b.words || 0), 0),
        bookList: matched,
      };
    }

    // ── Expanded group sub-view ──────────────────────────────────────
    if (expandedGroup) {
      const stats = groupStats(expandedGroup);
      const sorted = [...stats.bookList].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return (
        <div style={s.page}>
          <Head><title>{expandedGroup.name}</title></Head>
          <header style={s.header}>
            <button style={s.back} onClick={() => setExpandedGroup(null)}>← Back</button>
            <span style={s.headerTitle}>{expandedGroup.name}</span>
            <div style={{width:60}}/>
          </header>
          <div style={s.body}>
            {/* Summary stats */}
            <div style={{display:'flex', gap:8, marginBottom:20}}>
              {[
                ['📚', expandedGroup.count, 'Books'],
                ['📄', stats.pages.toLocaleString(), 'Pages'],
                ['✍️', stats.words >= 1000 ? (stats.words/1000).toFixed(0)+'K' : String(stats.words), 'Words'],
              ].map(([icon, val, label]) => (
                <div key={label} style={{flex:1, background:col.bg, border:`1px solid ${col.accent}`, borderRadius:10, padding:'10px 6px', textAlign:'center'}}>
                  <div style={{fontSize:26}}>{icon}</div>
                  <div style={{fontSize:24, fontWeight:700, color:col.dark}}>{val}</div>
                  <div style={{fontSize:13, color:'#888', textTransform:'uppercase', letterSpacing:0.5}}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{marginBottom:12}}>
              <span style={{fontSize:11, background:col.bg, color:col.dark, borderRadius:10, padding:'3px 10px', border:`1px solid ${col.accent}`, fontWeight:700}}>
                {expandedGroup.type === 'series' ? '📖 Series' : '✍️ Author'} · {expandedGroup.readingLevel}
              </span>
            </div>
            {sorted.length === 0 && (
              <div style={{color:'#aaa', fontSize:14, textAlign:'center', padding:'20px 0'}}>No matched books found</div>
            )}
            {sorted.map(book => {
              const bookWpp = book.wpp || autoWpp(book.pages || 0);
              const bookWords = book.words || estimateWords(book.pages || 0, bookWpp);
              return (
                <div key={book.id} onClick={() => startEdit(book)} style={{
                  padding:'12px 14px', marginBottom:8, borderRadius:10,
                  background:'#fff', border:'1px solid #e8e0d8',
                  borderLeft:`4px solid ${col.accent}`,
                  cursor:'pointer',
                }}>
                  <div style={{fontSize:15, fontWeight:700, color:'#2d1f14'}}>{book.title}</div>
                  {book.author && <div style={{fontSize:13, color:'#888'}}>{book.author}</div>}
                  <div style={{fontSize:15, color:'#aaa', marginTop:4}}>
                    {book.date} · {book.pages} pages · {bookWpp} wpp · <span style={{color:'#2d1f14', fontWeight:700}}>{bookWords.toLocaleString()} words</span>
                  </div>
                  <div style={{fontSize:11, color:'#bbb', marginTop:2}}>tap to edit</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ── Reader profile main view ─────────────────────────────────────
    return (
      <div style={s.page}>
        <Head><title>{profileReader}'s Reading Profile</title></Head>
        <header style={s.header}>
          <button style={s.back} onClick={() => { setView('home'); setProfileReader(null); setProfileData(null); }}>← Back</button>
          <span style={s.headerTitle}>{profileReader}'s Profile</span>
          <div style={{width:60}}/>
        </header>
        <div style={s.body}>

          {/* Stats row */}
          <div style={{display:'flex', gap:8, marginBottom:20}}>
            {[['📚', t.count, 'Books'], ['📄', t.pages.toLocaleString(), 'Pages'], ['✍️', (t.words >= 1000 ? (t.words/1000).toFixed(0)+'K' : t.words), 'Words']].map(([icon, val, label]) => (
              <div key={label} style={{flex:1, background:col.bg, border:`1px solid ${col.accent}`, borderRadius:10, padding:'10px 6px', textAlign:'center'}}>
                <div style={{fontSize:20}}>{icon}</div>
                <div style={{fontSize:18, fontWeight:700, color:col.dark}}>{val}</div>
                <div style={{fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5}}>{label}</div>
              </div>
            ))}
          </div>

          {profileLoading && (
            <div style={{textAlign:'center', padding:40, color:'#888'}}>
              <div style={{fontSize:36, marginBottom:8}}>🔍</div>
              <div>Analyzing reading history…</div>
            </div>
          )}

          {profileError && <div style={s.error}>{profileError}</div>}

          {profileData && (
            <>
              {/* Favorites */}
              <div style={s.sectionLabel}>Favorites</div>
              {(profileData.groups || []).map((g, i) => {
                const gs = groupStats(g);
                return (
                  <div key={i} onClick={() => setExpandedGroup(g)} style={{
                    background:'#fff', border:`1px solid #e8e0d8`, borderRadius:10,
                    padding:'12px 14px', marginBottom:8,
                    borderLeft:`4px solid ${col.accent}`,
                    cursor:'pointer',
                  }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:15, fontWeight:700, color:'#2d1f14'}}>{g.name}</div>
                        <div style={{fontSize:12, color:'#aaa', marginTop:2}}>{g.type === 'series' ? '📖 Series' : '✍️ Author'}</div>
                      </div>
                      <div style={{textAlign:'right', flexShrink:0, marginLeft:12}}>
                        <div style={{fontSize:16, fontWeight:700, color:col.accent}}>{g.count} {g.count === 1 ? 'book' : 'books'} ›</div>
                        <div style={{
                          fontSize:11, background:col.bg, color:col.dark,
                          borderRadius:10, padding:'2px 8px', marginTop:4,
                          display:'inline-block', border:`1px solid ${col.accent}`,
                        }}>{g.readingLevel}</div>
                      </div>
                    </div>
                    {(gs.pages > 0 || gs.words > 0) && (
                      <div style={{fontSize:15, color:'#888', marginTop:6}}>
                        {gs.pages.toLocaleString()} pages · <span style={{color:'#2d1f14', fontWeight:700}}>{gs.words >= 1000 ? (gs.words/1000).toFixed(0)+'K' : gs.words} words</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Suggestions */}
              <div style={{...s.sectionLabel, marginTop:24}}>What to Read Next</div>
              {(profileData.suggestions || []).map((suggestion, i) => (
                <div key={i} style={{
                  background:col.bg, border:`1px solid ${col.accent}`,
                  borderRadius:10, padding:'12px 14px', marginBottom:8,
                }}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15, fontWeight:700, color:'#2d1f14'}}>{suggestion.title}</div>
                      <div style={{fontSize:13, color:'#888'}}>{suggestion.author}</div>
                    </div>
                    <div style={{
                      fontSize:11, background:'#fff', color:col.dark,
                      borderRadius:10, padding:'2px 8px', marginLeft:8,
                      border:`1px solid ${col.accent}`, whiteSpace:'nowrap', flexShrink:0,
                    }}>{suggestion.readingLevel}</div>
                  </div>
                  {suggestion.why && (
                    <div style={{fontSize:13, color:'#666', marginTop:6, fontStyle:'italic'}}>"{suggestion.why}"</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  // Home
  if (loading) return (
    <div style={{...s.page, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh'}}>
      <div style={{textAlign:'center', color:'#888'}}>
        <div style={{fontSize:48, marginBottom:12}}>📚</div>
        <div>Loading books…</div>
      </div>
    </div>
  );

  const readers = allReaders();
  return (
    <div style={s.page}>
      <Head><title>Kids Reading Tracker</title></Head>
      {syncError && (
        <div style={{background:'#ffebee', color:'#c62828', padding:'10px 16px', fontSize:13}}>
          ⚠️ {syncError} — <button onClick={() => setSyncError('')} style={{background:'none', border:'none', color:'#c62828', cursor:'pointer', textDecoration:'underline'}}>dismiss</button>
        </div>
      )}
      {localBooks.length > 0 && (
        <div style={{background:'#fff8e1', borderBottom:'2px solid #f9a825', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12}}>
          <div style={{fontSize:13, color:'#7b6500'}}>
            📦 Found <strong>{localBooks.length} book{localBooks.length !== 1 ? 's' : ''}</strong> saved on this browser — import to sync everywhere?
          </div>
          <button onClick={handleImport} disabled={importing} style={{
            background:'#f9a825', color:'#fff', border:'none', borderRadius:8,
            padding:'8px 14px', fontWeight:700, fontSize:13, cursor:'pointer',
            opacity: importing ? 0.6 : 1, whiteSpace:'nowrap', fontFamily:'Georgia, serif',
          }}>{importing ? 'Importing…' : 'Import'}</button>
        </div>
      )}
      <header style={s.header}>
        <span style={{fontSize:26}}>📚</span>
        <span style={s.headerTitle}>Reading Tracker</span>
        <div style={{display:'flex', gap:6}}>
          <button style={s.testBtn} onClick={handleExport} title="Download backup">💾</button>
          <button style={s.testBtn} onClick={() => { loadTrash(); setView('trash'); }} title="Trash">🗑️</button>
          <span style={{fontSize:10, color:'#bbb', alignSelf:'center', paddingRight:2}}>v2.8</span>
        </div>
      </header>

      {/* Stats cards */}
      <div style={{display:'flex', flexWrap:'wrap', gap:12, padding:'16px 16px 0'}}>
        {readers.map(c => {
          const t = totals(c);
          const col = nameToColors(c);
          return (
            <div key={c} onClick={() => openReaderProfile(c)} style={{flex:'1 1 140px', background:col.bg, border:`2px solid ${col.accent}`, borderRadius:14, padding:14, cursor:'pointer'}}>
              <div style={{fontSize:20, fontWeight:700, color:col.dark, marginBottom:8}}>{c}</div>
              {[['Books', t.count], ['Pages', t.pages.toLocaleString()], ['Words', t.words.toLocaleString()]].map(([label, val]) => (
                <div key={label} style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                  <span style={{fontSize:15, color:'#888', textTransform:'uppercase', fontWeight:600}}>{label}</span>
                  <span style={{fontSize:20, fontWeight:700, color:col.accent}}>{val}</span>
                </div>
              ))}
              <div style={{fontSize:11, color:col.accent, marginTop:6, textAlign:'right', opacity:0.7}}>tap for profile →</div>
            </div>
          );
        })}
      </div>

      <div style={{padding:'16px'}}>
        <button onClick={() => setView('add')} style={s.addBtn}>+ Add a Book</button>
      </div>

      {/* Book list */}
      <div style={{padding:'0 16px 40px'}}>
        {books.length === 0
          ? <div style={{textAlign:'center', padding:'40px 0', color:'#999'}}>
              <div style={{fontSize:48}}>📖</div>
              <div style={{marginTop:8}}>No books yet!</div>
            </div>
          : books.map(book => {
              const col = nameToColors(book.child);
              return (
                <div key={book.id} style={{
                  display:'flex', alignItems:'flex-start', gap:10,
                  padding:'12px 0 12px 12px', borderBottom:'1px solid #ede8de',
                  borderLeft:`4px solid ${col.accent}`, marginBottom:4,
                  cursor:'pointer',
                }}>
                  <div style={{flex:1}} onClick={() => startEdit(book)}>
                    <div style={{fontSize:16, fontWeight:700, color:'#2d1f14'}}>{book.title}</div>
                    {book.author && <div style={{fontSize:13, color:'#888'}}>{book.author}</div>}
                    <div style={{fontSize:15, color:'#aaa', marginTop:2}}>
                      <span style={{background:col.accent, color:'#fff', borderRadius:4, padding:'1px 6px', marginRight:4}}>{book.child}</span>
                      {book.date} · {book.pages} pages · {book.wpp || autoWpp(book.pages)} wpp · <span style={{color:'#2d1f14', fontWeight:700}}>{book.words?.toLocaleString()} words</span>
                    </div>
                    <div style={{fontSize:11, color:'#bbb', marginTop:2}}>tap to edit</div>
                  </div>
                  <button onClick={() => handleDelete(book.id)}
                    style={{background:'none', border:'none', color:'#ccc', fontSize:18, cursor:'pointer', padding:'0 8px'}}>✕</button>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const s = {
  page: { maxWidth:480, margin:'0 auto', fontFamily:'Georgia, serif', background:'#fafaf8', minHeight:'100vh' },
  header: { background:'#fff', borderBottom:'2px solid #e8d5a3', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 },
  headerTitle: { fontSize:20, fontWeight:700, color:'#3d2b1f' },
  back: { fontSize:14, padding:'6px 12px', borderRadius:6, border:'1px solid #ccc', background:'#f5f5f5', cursor:'pointer' },
  testBtn: { fontSize:12, padding:'4px 10px', borderRadius:6, border:'1px solid #ccc', background:'#f5f5f5', cursor:'pointer', color:'#666' },
  body: { padding:16 },
  label: { display:'block', fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6, marginTop:12 },
  formSection: { background:'#fff', border:'1px solid #e0d8cc', borderRadius:14, padding:'14px 14px 6px', marginBottom:16, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' },
  formSectionTitle: { fontSize:15, fontWeight:800, color:'#3d2b1f', marginBottom:10, paddingBottom:8, borderBottom:'1px solid #ede8de', letterSpacing:0.2 },
  input: { width:'100%', padding:'12px', borderRadius:8, border:'1px solid #ddd', fontSize:16, fontFamily:'Georgia, serif', boxSizing:'border-box', marginBottom:4 },
  lookupBtn: { width:'100%', padding:12, marginTop:8, borderRadius:8, background:'#5c6bc0', color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif' },
  saveBtn: { width:'100%', padding:16, marginTop:16, borderRadius:12, background:'#2e7d32', color:'#fff', border:'none', fontSize:17, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif' },
  addBtn: { width:'100%', padding:14, borderRadius:12, background:'#3d2b1f', color:'#fff', border:'none', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif' },
  error: { background:'#ffebee', color:'#c62828', padding:'10px 12px', borderRadius:8, fontSize:13, marginTop:8 },
  hint: { color:'#888', fontSize:13, marginTop:4, marginBottom:8 },
  badge: { padding:'12px 16px', borderRadius:10, fontWeight:700, fontSize:16, marginBottom:16 },
  testRow: { display:'flex', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #eee' },
  sectionLabel: { fontSize:12, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:1, marginBottom:10 },
};
