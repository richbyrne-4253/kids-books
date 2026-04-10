import { useState, useEffect } from 'react';
import Head from 'next/head';

const CHILDREN = ['Alex', 'Hannah'];
const COLORS = {
  Alex:   { bg: '#e8f4fd', accent: '#2196f3', dark: '#1565c0', light: '#bbdefb' },
  Hannah: { bg: '#fce4ec', accent: '#e91e8c', dark: '#880e4f', light: '#f8bbd0' },
};

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
  return results;
}

export default function Home() {
  const [books, setBooks] = useState([]);
  const [view, setView] = useState('home'); // home | add | tests
  const [child, setChild] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [testResults, setTestResults] = useState(null);

  useEffect(() => { setBooks(loadBooks()); }, []);

  function totals(c) {
    const cb = books.filter(b => b.child === c);
    return { count: cb.length, pages: cb.reduce((s, b) => s + (b.pages || 0), 0), words: cb.reduce((s, b) => s + (b.words || 0), 0) };
  }

  async function handleLookup() {
    if (!title.trim()) return;
    setLooking(true);
    setLookupError('');
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), author: author.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setTitle(data.title || title);
      setAuthor(data.author || author);
      setPages(String(data.pages || ''));
    } catch (e) {
      setLookupError(e.message);
    } finally {
      setLooking(false);
    }
  }

  function handleSave() {
    setSaveError('');
    if (!child) return setSaveError('Pick a child');
    if (!title.trim()) return setSaveError('Enter a title');
    if (!pages || isNaN(Number(pages)) || Number(pages) <= 0) return setSaveError('Enter a valid page count');

    const book = {
      id: Date.now(),
      child,
      title: title.trim(),
      author: author.trim(),
      pages: Number(pages),
      words: estimateWords(Number(pages)),
      date: new Date().toISOString().split('T')[0],
    };
    const updated = [book, ...books];
    setBooks(updated);
    saveBooks(updated);
    resetForm();
    setView('home');
  }

  function resetForm() {
    setChild(''); setTitle(''); setAuthor(''); setPages('');
    setLookupError(''); setSaveError(''); setLooking(false);
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
    return (
      <div style={s.page}>
        <Head><title>Add Book</title></Head>
        <header style={s.header}>
          <button style={s.back} onClick={() => { resetForm(); setView('home'); }}>← Back</button>
          <span style={s.headerTitle}>Add a Book</span>
          <div style={{width:60}}/>
        </header>
        <div style={s.body}>

          {/* Child picker */}
          <label style={s.label}>Who read it?</label>
          <div style={{display:'flex', gap:12, marginBottom:20}}>
            {CHILDREN.map(c => {
              const col = COLORS[c];
              const sel = child === c;
              return (
                <button key={c} onClick={() => setChild(c)} style={{
                  flex:1, padding:14, borderRadius:12, border:`2px solid ${col.accent}`,
                  background: sel ? col.accent : col.bg,
                  color: sel ? '#fff' : col.dark,
                  fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:'Georgia, serif',
                }}>{c}</button>
              );
            })}
          </div>

          {/* Title */}
          <label style={s.label}>Book Title</label>
          <input style={s.input} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="The Wild Robot Escapes" />

          {/* Author */}
          <label style={s.label}>Author (optional)</label>
          <input style={s.input} value={author} onChange={e => setAuthor(e.target.value)}
            placeholder="Peter Brown" />

          {/* Lookup button */}
          <button onClick={handleLookup} disabled={looking || !title.trim()} style={{
            ...s.lookupBtn, opacity: (!title.trim() || looking) ? 0.5 : 1
          }}>
            {looking ? 'Looking up…' : '🔍 Look Up Page Count'}
          </button>
          {lookupError && <div style={s.error}>Lookup failed: {lookupError}<br/><small>You can still enter pages manually below.</small></div>}

          {/* Pages */}
          <label style={s.label}>Pages</label>
          <input style={s.input} value={pages} onChange={e => setPages(e.target.value)}
            placeholder="278" type="number" inputMode="numeric" />

          {pages && <div style={s.hint}>~{estimateWords(Number(pages)).toLocaleString()} estimated words</div>}

          {saveError && <div style={s.error}>{saveError}</div>}

          <button onClick={handleSave} style={s.saveBtn}>Save Book</button>
        </div>
      </div>
    );
  }

  // Home
  return (
    <div style={s.page}>
      <Head><title>Kids Reading Tracker</title></Head>
      <header style={s.header}>
        <span style={{fontSize:26}}>📚</span>
        <span style={s.headerTitle}>Reading Tracker</span>
        <button style={s.testBtn} onClick={() => { setTestResults(runTests()); setView('tests'); }}>Tests</button>
      </header>

      {/* Stats cards */}
      <div style={{display:'flex', gap:12, padding:'16px 16px 0'}}>
        {CHILDREN.map(c => {
          const t = totals(c);
          const col = COLORS[c];
          return (
            <div key={c} style={{flex:1, background:col.bg, border:`2px solid ${col.accent}`, borderRadius:14, padding:14}}>
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
              const col = COLORS[book.child] || {accent:'#888', bg:'#f5f5f5', dark:'#333'};
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
