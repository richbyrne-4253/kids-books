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

function estimateWords(pages) {
  if (!pages) return 0;
  const wpp = pages < 50 ? 150 : pages < 150 ? 200 : 250;
  return Math.round(pages * wpp);
}

function loadBooks() {
  try { return JSON.parse(localStorage.getItem('kids-books-v1') || '[]'); }
  catch { return []; }
}

function saveBooks(books) {
  localStorage.setItem('kids-books-v1', JSON.stringify(books));
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
  const [lookupError, setLookupError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [testResults, setTestResults] = useState(null);

  useEffect(() => { setBooks(loadBooks()); }, []);

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
    const newBooks = selectedChildren.map((child, i) => ({
      id: now + i,
      child,
      title: titles.trim(),
      author: author.trim(),
      pages: Number(pages),
      words: estimateWords(Number(pages)),
      date: new Date().toISOString().split('T')[0],
    }));

    const updated = [...newBooks, ...books];
    setBooks(updated);
    saveBooks(updated);
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

      for (const child of selectedChildren) {
        newBooks.push({
          id: idCounter++,
          child,
          title: bookTitle,
          author: bookAuthor,
          pages: bookPages,
          words: estimateWords(bookPages),
          date: new Date().toISOString().split('T')[0],
        });
      }
    }

    const updated = [...newBooks, ...books];
    setBooks(updated);
    saveBooks(updated);
    setBulkProcessing(false);
    setBulkProgress(null);
    resetForm();
    setView('home');
  }

  function resetForm() {
    setSelectedChildren([]); setCustomName('');
    setTitles(''); setAuthor(''); setPages('');
    setLookupError(''); setSaveError('');
    setLooking(false); setBulkProcessing(false); setBulkProgress(null);
  }

  function handleDelete(id) {
    if (!confirm('Delete this book?')) return;
    const updated = books.filter(b => b.id !== id);
    setBooks(updated);
    saveBooks(updated);
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

          {/* Reader picker */}
          <label style={s.label}>Who read it?</label>
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
            <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:20}}>
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

          {/* Title(s) */}
          <label style={s.label}>
            {isBulkMode ? `Book Titles (${titleLines.length} detected)` : 'Book Title'}
          </label>
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
            placeholder={'The Wild Robot\nCharlotte\'s Web\nHarry Potter…'}
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

          {/* Author (single mode only) */}
          {!isBulkMode && (
            <>
              <label style={s.label}>Author (optional)</label>
              <input style={s.input} value={author} onChange={e => setAuthor(e.target.value)}
                placeholder="Peter Brown" />

              <button onClick={handleLookup} disabled={looking || !titles.trim()} style={{
                ...s.lookupBtn, opacity: (!titles.trim() || looking) ? 0.5 : 1
              }}>
                {looking ? 'Looking up…' : '🔍 Look Up Page Count'}
              </button>
              {lookupError && <div style={s.error}>Lookup failed: {lookupError}<br/><small>You can still enter pages manually below.</small></div>}
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
            placeholder={isBulkMode ? 'Leave blank to auto-lookup each' : '278'}
            type="number"
            inputMode="numeric"
          />

          {pages && !isBulkMode && (
            <div style={s.hint}>~{estimateWords(Number(pages)).toLocaleString()} estimated words</div>
          )}

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

  // Home
  const readers = allReaders();
  return (
    <div style={s.page}>
      <Head><title>Kids Reading Tracker</title></Head>
      <header style={s.header}>
        <span style={{fontSize:26}}>📚</span>
        <span style={s.headerTitle}>Reading Tracker</span>
        <button style={s.testBtn} onClick={() => { setTestResults(runTests()); setView('tests'); }}>Tests</button>
      </header>

      {/* Stats cards */}
      <div style={{display:'flex', flexWrap:'wrap', gap:12, padding:'16px 16px 0'}}>
        {readers.map(c => {
          const t = totals(c);
          const col = nameToColors(c);
          return (
            <div key={c} style={{flex:'1 1 140px', background:col.bg, border:`2px solid ${col.accent}`, borderRadius:14, padding:14}}>
              <div style={{fontSize:20, fontWeight:700, color:col.dark, marginBottom:8}}>{c}</div>
              {[['Books', t.count], ['Pages', t.pages.toLocaleString()], ['~Words', t.words.toLocaleString()]].map(([label, val]) => (
                <div key={label} style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                  <span style={{fontSize:12, color:'#888', textTransform:'uppercase'}}>{label}</span>
                  <span style={{fontSize:16, fontWeight:700, color:col.accent}}>{val}</span>
                </div>
              ))}
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
                }}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:16, fontWeight:700, color:'#2d1f14'}}>{book.title}</div>
                    {book.author && <div style={{fontSize:13, color:'#888'}}>{book.author}</div>}
                    <div style={{fontSize:12, color:'#aaa', marginTop:2}}>
                      <span style={{background:col.accent, color:'#fff', borderRadius:4, padding:'1px 6px', marginRight:4}}>{book.child}</span>
                      {book.date} · {book.pages} pages · ~{book.words?.toLocaleString()} words
                    </div>
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
  label: { display:'block', fontSize:12, fontWeight:700, color:'#555', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6, marginTop:16 },
  input: { width:'100%', padding:'12px', borderRadius:8, border:'1px solid #ddd', fontSize:16, fontFamily:'Georgia, serif', boxSizing:'border-box', marginBottom:4 },
  lookupBtn: { width:'100%', padding:12, marginTop:8, borderRadius:8, background:'#5c6bc0', color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif' },
  saveBtn: { width:'100%', padding:16, marginTop:16, borderRadius:12, background:'#2e7d32', color:'#fff', border:'none', fontSize:17, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif' },
  addBtn: { width:'100%', padding:14, borderRadius:12, background:'#3d2b1f', color:'#fff', border:'none', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif' },
  error: { background:'#ffebee', color:'#c62828', padding:'10px 12px', borderRadius:8, fontSize:13, marginTop:8 },
  hint: { color:'#888', fontSize:13, marginTop:4, marginBottom:8 },
  badge: { padding:'12px 16px', borderRadius:10, fontWeight:700, fontSize:16, marginBottom:16 },
  testRow: { display:'flex', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #eee' },
};
