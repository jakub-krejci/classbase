'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkLayout, D, card, SectionLabel } from '@/components/DarkLayout'

// ── Constants ─────────────────────────────────────────────────────────────────
const BUCKET    = 'sql-files'
const LS_RECENT = 'cb_sql_recent'
const LS_LAST   = 'cb_sql_last'
const LS_HISTORY = 'cb_sql_history'
const MAX_HISTORY = 20

// ── Types ─────────────────────────────────────────────────────────────────────
interface SqlProject { name: string; key: string; scripts: SqlScript[]; updatedAt: string }
interface SqlScript  { path: string; name: string; project: string; updatedAt: string }
interface RecentEntry{ key: string; name: string; openedAt: string }
interface TableInfo  { name: string; columns: ColInfo[] }
interface ColInfo    { name: string; type: string; pk: boolean; notnull: boolean }
interface QueryResult{ columns: string[]; rows: any[][]; rowsAffected: number; error?: string; sql: string; ms: number }

// ── DB templates ──────────────────────────────────────────────────────────────
const TEMPLATES: Record<string, { label: string; icon: string; sql: string }> = {
  empty: { label: 'Prázdná databáze', icon: '📭', sql: '-- Prázdná databáze\n-- Začni vytvořením tabulky:\n-- CREATE TABLE uzivatele (id INTEGER PRIMARY KEY, jmeno TEXT, vek INTEGER);\n' },
  school: {
    label: 'Škola', icon: '🏫',
    sql: `-- Školní databáze: studenti, předměty, známky
CREATE TABLE studenti (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jmeno TEXT NOT NULL,
  prijmeni TEXT NOT NULL,
  trida TEXT,
  datum_narozeni DATE
);

CREATE TABLE predmety (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazev TEXT NOT NULL,
  zkratka TEXT,
  ucitel TEXT
);

CREATE TABLE znamky (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER REFERENCES studenti(id),
  predmet_id INTEGER REFERENCES predmety(id),
  znamka INTEGER CHECK(znamka BETWEEN 1 AND 5),
  datum DATE DEFAULT CURRENT_DATE
);

INSERT INTO studenti (jmeno, prijmeni, trida) VALUES
  ('Jan', 'Novák', '3A'), ('Marie', 'Svobodová', '3A'),
  ('Petr', 'Dvořák', '3B'), ('Lucie', 'Horáková', '3B');

INSERT INTO predmety (nazev, zkratka) VALUES
  ('Matematika', 'MAT'), ('Čeština', 'CES'), ('Angličtina', 'ANG');

INSERT INTO znamky (student_id, predmet_id, znamka) VALUES
  (1,1,2),(1,2,1),(1,3,3),(2,1,1),(2,2,2),(3,1,3),(3,3,2),(4,2,1),(4,3,1);
`
  },
  eshop: {
    label: 'E-shop', icon: '🛒',
    sql: `-- E-shop databáze: produkty, zákazníci, objednávky
CREATE TABLE produkty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazev TEXT NOT NULL,
  cena REAL NOT NULL,
  kategorie TEXT,
  sklad INTEGER DEFAULT 0
);

CREATE TABLE zakaznici (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jmeno TEXT NOT NULL,
  email TEXT UNIQUE,
  mesto TEXT
);

CREATE TABLE objednavky (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zakaznik_id INTEGER REFERENCES zakaznici(id),
  datum DATETIME DEFAULT CURRENT_TIMESTAMP,
  celkem REAL
);

CREATE TABLE polozky_objednavky (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  objednavka_id INTEGER REFERENCES objednavky(id),
  produkt_id INTEGER REFERENCES produkty(id),
  mnozstvi INTEGER,
  cena_za_kus REAL
);

INSERT INTO produkty (nazev, cena, kategorie, sklad) VALUES
  ('Notebook', 24990, 'Elektronika', 15),
  ('Myš', 490, 'Elektronika', 80),
  ('Klávesnice', 890, 'Elektronika', 50),
  ('Hrnek', 199, 'Kancelář', 200),
  ('Stůl', 3490, 'Nábytek', 8);

INSERT INTO zakaznici (jmeno, email, mesto) VALUES
  ('Jana Nová', 'jana@email.cz', 'Praha'),
  ('Tomáš Veselý', 'tomas@email.cz', 'Brno'),
  ('Eva Malá', 'eva@email.cz', 'Ostrava');

INSERT INTO objednavky (zakaznik_id, celkem) VALUES (1, 25480), (2, 1380), (3, 890);
INSERT INTO polozky_objednavky (objednavka_id, produkt_id, mnozstvi, cena_za_kus) VALUES
  (1,1,1,24990),(1,2,1,490),(2,2,2,490),(2,3,1,390),(3,3,1,890);
`
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'projekt'
}
function dbPath(uid: string, proj: string) { return `zaci/${uid}/${sanitizeKey(proj)}/database.db` }
function scriptPath(uid: string, proj: string, name: string) { return `zaci/${uid}/${sanitizeKey(proj)}/${sanitizeKey(name)}` }
function fmtMs(ms: number) { return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s` }
function fmtSize(b?: number) { if (!b) return ''; return b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}kB` : `${(b/1048576).toFixed(1)}MB` }

// ── Main component ────────────────────────────────────────────────────────────
export default function SqlEditor({ profile }: { profile: any }) {
  const supabase = createClient()
  const accent   = profile?.accent_color ?? '#7C3AED'
  const uid      = profile?.id as string

  // ── SQL.js state ──────────────────────────────────────────────────────────
  const sqlJsRef   = useRef<any>(null)   // SQL.js library
  const dbRef      = useRef<any>(null)   // current Database instance
  const [sqlReady, setSqlReady] = useState(false)

  // ── Editor/project state ──────────────────────────────────────────────────
  const [projects, setProjects]         = useState<SqlProject[]>([])
  const [loadingProj, setLoadingProj]   = useState(true)
  const [activeProject, setActiveProject] = useState<SqlProject | null>(null)
  const [activeScript, setActiveScript] = useState<SqlScript | null>(null)
  const [recent, setRecent]             = useState<RecentEntry[]>([])
  const [expandedProj, setExpandedProj] = useState<Set<string>>(new Set())
  const [isDirty, setIsDirty]           = useState(false)

  // ── Query/results ─────────────────────────────────────────────────────────
  const [queryResults, setQueryResults] = useState<QueryResult[]>([])
  const [activeResult, setActiveResult] = useState(0)
  const [running, setRunning]           = useState(false)
  const [schema, setSchema]             = useState<TableInfo[]>([])
  const [showSchema, setShowSchema]     = useState(false)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [showHistory, setShowHistory]   = useState(false)

  // ── Monaco editor ─────────────────────────────────────────────────────────
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorRef          = useRef<any>(null)
  const monacoRef          = useRef<any>(null)
  const [monacoReady, setMonacoReady] = useState(false)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving]           = useState(false)
  const [saveMsg, setSaveMsg]         = useState('')
  const [newProjModal, setNewProjModal]   = useState(false)
  const [newProjName, setNewProjName]     = useState('')
  const [newProjTemplate, setNewProjTemplate] = useState('empty')
  const [openProjModal, setOpenProjModal] = useState(false)
  const [newScriptModal, setNewScriptModal] = useState(false)
  const [newScriptName, setNewScriptName]   = useState('')
  const [newScriptProj, setNewScriptProj]   = useState('')
  const [deleteModal, setDeleteModal]       = useState<{ type: 'project' | 'script'; item: any } | null>(null)
  const [renameModal, setRenameModal]       = useState<{ type: 'project' | 'script'; item: any } | null>(null)
  const [renameVal, setRenameVal]           = useState('')

  // ── Load SQL.js from CDN ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as any
    if (w.initSqlJs) { sqlJsRef.current = w.initSqlJs; setSqlReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js'
    s.onload = async () => {
      try {
        const SQL = await w.initSqlJs({
          locateFile: (f: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${f}`
        })
        sqlJsRef.current = SQL
        setSqlReady(true)
      } catch { flash('❌ SQL.js se nepodařilo načíst') }
    }
    document.head.appendChild(s)
  }, [])

  // ── Load Monaco ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
    s.onload = () => {
      const w = window as any
      w.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } })
      w.require(['vs/editor/editor.main'], (monaco: any) => {
        monacoRef.current = monaco
        if (!editorContainerRef.current) return
        monaco.editor.defineTheme('cb-dark', {
          base: 'vs-dark', inherit: true,
          rules: [
            { token: 'keyword', foreground: 'c792ea' },
            { token: 'string', foreground: 'c3e88d' },
            { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
            { token: 'number', foreground: 'f78c6c' },
          ],
          colors: { 'editor.background': '#0d1117', 'editor.foreground': '#e6edf3', 'editorLineNumber.foreground': '#30363d', 'editor.lineHighlightBackground': '#161b22' }
        })
        const ed = monaco.editor.create(editorContainerRef.current, {
          value: '-- Vyber nebo vytvoř projekt\n',
          language: 'sql',
          theme: 'cb-dark',
          fontSize: 14,
          fontFamily: "'JetBrains Mono','Fira Code',monospace",
          minimap: { enabled: false },
          lineNumbers: 'on' as const,
          wordWrap: 'on' as const,
          automaticLayout: false,
          scrollBeyondLastLine: false,
          padding: { top: 14, bottom: 14 },
          bracketPairColorization: { enabled: true },
          scrollbar: { horizontal: 'auto', vertical: 'auto' },
          suggest: { showKeywords: true, showSnippets: true },
        })
        editorRef.current = ed
        ed.onDidChangeModelContent(() => setIsDirty(true))
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => document.getElementById('sql-run-btn')?.click())
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => document.getElementById('sql-save-btn')?.click())
        setMonacoReady(true)
      })
    }
    document.head.appendChild(s)
    return () => { editorRef.current?.dispose() }
  }, [])

  // ── Storage helpers ────────────────────────────────────────────────────────
  async function pushBinary(path: string, data: Uint8Array): Promise<string | null> {
    // Copy into a plain ArrayBuffer to satisfy TypeScript's strict BlobPart types
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    const blob = new Blob([buf], { type: 'application/octet-stream' })
    await supabase.storage.from(BUCKET).remove([path])
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/octet-stream', cacheControl: '0' })
    return error ? error.message : null
  }
  async function pushText(path: string, text: string): Promise<string | null> {
    const blob = new Blob([text], { type: 'text/plain' })
    await supabase.storage.from(BUCKET).remove([path])
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'text/plain', cacheControl: '0' })
    return error ? error.message : null
  }
  async function fetchBinary(path: string): Promise<Uint8Array | null> {
    const { data } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    if (!data) return null
    return new Uint8Array(await data.arrayBuffer())
  }
  async function fetchText(path: string): Promise<string> {
    const { data } = await supabase.storage.from(BUCKET).download(path + '?t=' + Date.now())
    if (!data) return ''
    return await data.text()
  }

  // ── Refresh projects ───────────────────────────────────────────────────────
  const refreshProjects = useCallback(async (): Promise<SqlProject[]> => {
    setLoadingProj(true)
    const { data: top } = await supabase.storage.from(BUCKET).list(`zaci/${uid}`, { limit: 200 })
    if (!top) { setLoadingProj(false); return [] }
    const result: SqlProject[] = []
    for (const item of top) {
      if ((item.metadata !== null && item.metadata !== undefined) || item.name.includes('.')) continue
      const { data: files } = await supabase.storage.from(BUCKET).list(`zaci/${uid}/${item.name}`, { limit: 200 })
      const scripts: SqlScript[] = (files ?? [])
        .filter(f => f.name.endsWith('.sql') && f.metadata !== null)
        .map(f => ({ path: `zaci/${uid}/${item.name}/${f.name}`, name: f.name, project: item.name, updatedAt: f.updated_at ?? '' }))
      result.push({ name: item.name, key: item.name, scripts, updatedAt: files?.[0]?.updated_at ?? '' })
    }
    setProjects(result)
    setLoadingProj(false)
    return result
  }, [uid])

  // ── Open project (load DB from storage) ───────────────────────────────────
  async function openProject(proj: SqlProject, scriptToOpen?: SqlScript) {
    if (!sqlReady || !sqlJsRef.current) { flash('❌ SQL.js se ještě načítá…'); return }
    // Load .db file
    const bytes = await fetchBinary(dbPath(uid, proj.key))
    let db: any
    if (bytes) {
      db = new sqlJsRef.current.Database(bytes)
    } else {
      db = new sqlJsRef.current.Database()
    }
    dbRef.current = db
    setActiveProject(proj)
    setQueryResults([])
    setActiveResult(0)
    refreshSchema(db)
    setExpandedProj(prev => new Set([...prev, proj.key]))
    const entry: RecentEntry = { key: proj.key, name: proj.name, openedAt: new Date().toISOString() }
    setRecent(prev => { const n = [entry, ...prev.filter(r => r.key !== proj.key)].slice(0, 3); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
    try { localStorage.setItem(LS_LAST, proj.key) } catch {}
    setOpenProjModal(false)
    // Open a script or show welcome
    const script = scriptToOpen ?? proj.scripts[0]
    if (script) {
      await openScript(script, db)
    } else {
      setActiveScript(null)
      editorRef.current?.setValue(`-- Projekt: ${proj.name}\n-- Ctrl+Enter = spustit · Ctrl+S = uložit\n\nSELECT * FROM sqlite_master WHERE type='table';\n`)
      setIsDirty(false)
    }
  }

  // ── Open script ────────────────────────────────────────────────────────────
  async function openScript(script: SqlScript, db?: any) {
    const text = await fetchText(script.path)
    setActiveScript(script)
    editorRef.current?.setValue(text)
    setIsDirty(false)
    if (db || dbRef.current) refreshSchema(db ?? dbRef.current)
  }

  // ── Refresh schema from DB ─────────────────────────────────────────────────
  function refreshSchema(db: any) {
    if (!db) return
    try {
      const tables: TableInfo[] = []
      const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      if (res[0]) {
        for (const [tname] of res[0].values) {
          const cols: ColInfo[] = []
          try {
            const info = db.exec(`PRAGMA table_info("${tname}")`)
            if (info[0]) {
              for (const row of info[0].values) {
                cols.push({ name: String(row[1]), type: String(row[2]), pk: row[5] === 1, notnull: row[3] === 1 })
              }
            }
          } catch {}
          tables.push({ name: String(tname), columns: cols })
        }
      }
      setSchema(tables)
      // Update Monaco autocomplete with table/column names
      updateSqlCompletions(tables)
    } catch {}
  }

  // ── Monaco SQL autocomplete with schema ────────────────────────────────────
  function updateSqlCompletions(tables: TableInfo[]) {
    const monaco = monacoRef.current
    if (!monaco) return
    const w = window as any
    if (w._sqlCompletionDisposable) w._sqlCompletionDisposable.dispose()
    w._sqlCompletionDisposable = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position)
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
        const suggestions: any[] = []
        // SQL keywords
        const keywords = ['SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'LIKE', 'IN', 'BETWEEN', 'EXISTS', 'UNION', 'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'AUTOINCREMENT', 'INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC']
        keywords.forEach(kw => suggestions.push({ label: kw, kind: monaco.languages.CompletionItemKind.Keyword, insertText: kw, range }))
        // Table names
        tables.forEach(t => {
          suggestions.push({ label: t.name, kind: monaco.languages.CompletionItemKind.Class, insertText: t.name, detail: `tabulka (${t.columns.length} sloupců)`, range })
          // Column names
          t.columns.forEach(c => suggestions.push({ label: c.name, kind: monaco.languages.CompletionItemKind.Field, insertText: c.name, detail: `${t.name}.${c.name} : ${c.type}`, range }))
        })
        return { suggestions }
      }
    })
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]')) } catch {}
    try { setQueryHistory(JSON.parse(localStorage.getItem(LS_HISTORY) ?? '[]')) } catch {}
    ;(async () => {
      const projs = await refreshProjects()
      const lastKey = localStorage.getItem(LS_LAST)
      if (lastKey) { const p = projs.find(x => x.key === lastKey); if (p) { await openProject(p); return } }
      if (projs.length > 0) await openProject(projs[0])
    })()
  }, [sqlReady])

  function flash(msg: string) { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2800) }

  // ── Run SQL ────────────────────────────────────────────────────────────────
  function runSql() {
    if (!dbRef.current) { flash('❌ Žádná databáze není otevřena'); return }
    const sql = editorRef.current?.getValue() ?? ''
    if (!sql.trim()) return
    setRunning(true)
    const results: QueryResult[] = []
    // Split by semicolons (naive but works for most cases)
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0)
    for (const stmt of statements) {
      const start = performance.now()
      try {
        const res = dbRef.current.exec(stmt)
        const ms = Math.round(performance.now() - start)
        if (res.length > 0) {
          results.push({ columns: res[0].columns, rows: res[0].values, rowsAffected: 0, sql: stmt, ms })
        } else {
          // DML statement (INSERT/UPDATE/DELETE/CREATE/DROP)
          const affected = dbRef.current.getRowsModified()
          results.push({ columns: [], rows: [], rowsAffected: affected, sql: stmt, ms })
        }
      } catch (e: any) {
        const ms = Math.round(performance.now() - start)
        results.push({ columns: [], rows: [], rowsAffected: 0, error: e.message, sql: stmt, ms })
      }
    }
    setQueryResults(results)
    setActiveResult(0)
    setRunning(false)
    refreshSchema(dbRef.current)
    setIsDirty(true)
    // Update history
    setQueryHistory(prev => {
      const n = [sql, ...prev.filter(h => h !== sql)].slice(0, MAX_HISTORY)
      try { localStorage.setItem(LS_HISTORY, JSON.stringify(n)) } catch {}
      return n
    })
  }

  // ── Save script ────────────────────────────────────────────────────────────
  async function saveScript() {
    if (!activeProject) return
    setSaving(true)
    const text = editorRef.current?.getValue() ?? ''
    if (activeScript) {
      const err = await pushText(activeScript.path, text)
      if (err) flash('❌ ' + err)
      else { flash('✓ Skript uložen'); setIsDirty(false) }
    } else {
      // Auto-save as "query.sql"
      const path = scriptPath(uid, activeProject.key, 'query.sql')
      const err = await pushText(path, text)
      if (!err) {
        const projs = await refreshProjects()
        const p = projs.find(x => x.key === activeProject.key)
        if (p) { setActiveProject(p); const s = p.scripts.find(x => x.path === path); if (s) setActiveScript(s) }
        flash('✓ Uloženo jako query.sql'); setIsDirty(false)
      } else flash('❌ ' + err)
    }
    // Also save DB state
    await saveDb()
    setSaving(false)
  }

  async function saveDb() {
    if (!dbRef.current || !activeProject) return
    const data = dbRef.current.export()
    await pushBinary(dbPath(uid, activeProject.key), data)
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function downloadScript() {
    const text = editorRef.current?.getValue() ?? ''
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    a.download = activeScript?.name ?? 'query.sql'
    a.style.display = 'none'; document.body.appendChild(a); a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href) }, 1000)
  }
  function downloadDb() {
    if (!dbRef.current) return
    const data = dbRef.current.export()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }))
    a.download = (activeProject?.name ?? 'database') + '.db'
    a.style.display = 'none'; document.body.appendChild(a); a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href) }, 1000)
  }

  // ── Export result as CSV ──────────────────────────────────────────────────
  function exportCsv(result: QueryResult) {
    const lines = [result.columns.join(','), ...result.rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = 'vysledek.csv'
    a.style.display = 'none'; document.body.appendChild(a); a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href) }, 1000)
  }

  // ── Create project ────────────────────────────────────────────────────────
  async function doCreateProject() {
    if (!sqlReady || !sqlJsRef.current) { flash('❌ SQL.js se ještě načítá'); return }
    const key = sanitizeKey(newProjName.trim() || 'projekt')
    setSaving(true)
    const db = new sqlJsRef.current.Database()
    const tmpl = TEMPLATES[newProjTemplate]
    if (tmpl?.sql && newProjTemplate !== 'empty') {
      try {
        tmpl.sql.split(';').map(s => s.trim()).filter(Boolean).forEach(stmt => { try { db.run(stmt) } catch {} })
      } catch {}
    }
    const dbData = db.export()
    await pushBinary(dbPath(uid, key), dbData)
    const initSql = newProjTemplate !== 'empty' ? tmpl.sql : '-- Nový SQL projekt\n-- Ctrl+Enter = spustit · Ctrl+S = uložit\n\nSELECT * FROM sqlite_master WHERE type=\'table\';\n'
    await pushText(scriptPath(uid, key, 'query.sql'), initSql)
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === key)
    if (p) await openProject(p)
    flash('✓ Projekt vytvořen')
    setNewProjModal(false); setNewProjName(''); setSaving(false)
  }

  // ── Create new script ─────────────────────────────────────────────────────
  async function doNewScript() {
    let name = newScriptName.trim() || 'query'
    if (!name.endsWith('.sql')) name += '.sql'
    const proj = newScriptProj || activeProject?.key || ''
    if (!proj) return
    setSaving(true)
    const path = scriptPath(uid, proj, name)
    await pushText(path, `-- ${name}\n\n`)
    const projs = await refreshProjects()
    const p = projs.find(x => x.key === proj); if (p) setActiveProject(p)
    const s = projs.flatMap(x => x.scripts).find(x => x.path === path)
    if (s) await openScript(s)
    setNewScriptModal(false); setNewScriptName(''); setSaving(false)
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function doDelete() {
    if (!deleteModal) return
    setSaving(true)
    if (deleteModal.type === 'project') {
      const proj = deleteModal.item as SqlProject
      const paths = [dbPath(uid, proj.key), ...proj.scripts.map(s => s.path)]
      await supabase.storage.from(BUCKET).remove(paths)
      const projs = await refreshProjects()
      if (activeProject?.key === proj.key) {
        if (projs.length > 0) await openProject(projs[0])
        else { setActiveProject(null); dbRef.current = null; setSchema([]) }
      }
      setRecent(prev => { const n = prev.filter(r => r.key !== proj.key); try { localStorage.setItem(LS_RECENT, JSON.stringify(n)) } catch {}; return n })
    } else {
      const script = deleteModal.item as SqlScript
      await supabase.storage.from(BUCKET).remove([script.path])
      const projs = await refreshProjects()
      const p = projs.find(x => x.key === script.project); if (p) setActiveProject(p)
      if (activeScript?.path === script.path) {
        const alt = p?.scripts[0]; if (alt) await openScript(alt); else setActiveScript(null)
      }
    }
    setDeleteModal(null); setSaving(false)
  }

  // ── Rename ────────────────────────────────────────────────────────────────
  async function doRename() {
    if (!renameModal || !renameVal.trim()) { setRenameModal(null); return }
    setSaving(true)
    if (renameModal.type === 'script') {
      const script = renameModal.item as SqlScript
      let newName = renameVal.trim(); if (!newName.endsWith('.sql')) newName += '.sql'
      const newPath = scriptPath(uid, script.project, newName)
      const content = await fetchText(script.path)
      await pushText(newPath, content)
      await supabase.storage.from(BUCKET).remove([script.path])
      const projs = await refreshProjects()
      const p = projs.find(x => x.key === script.project); if (p) setActiveProject(p)
      if (activeScript?.path === script.path) { const s = p?.scripts.find(x => x.path === newPath); if (s) setActiveScript(s) }
    }
    setRenameModal(null); setSaving(false)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const sideBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: 'rgba(255,255,255,.04)', border: `1px solid ${D.border}`, borderRadius: D.radiusSm, color: D.txtSec, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const, transition: 'all .15s' }
  const modalInp: React.CSSProperties = { width: '100%', padding: '10px 13px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 10, fontSize: 14, color: D.txtPri, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }

  function Modal({ title, onClose, children, width = 420 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 9998, backdropFilter: 'blur(5px)' }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9999, width: '100%', maxWidth: width, padding: '0 16px' }}>
          <div style={{ background: D.bgCard, borderRadius: D.radius, padding: '28px 24px', border: `1px solid ${D.border}`, boxShadow: '0 28px 70px rgba(0,0,0,.75)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: D.txtPri, marginBottom: 16 }}>{title}</div>
            {children}
          </div>
        </div>
      </>
    )
  }
  function MBtns({ onOk, onCancel, label, danger, disabled }: { onOk: () => void; onCancel: () => void; label: string; danger?: boolean; disabled?: boolean }) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onOk} disabled={disabled || saving} style={{ flex: 1, padding: '10px', background: danger ? D.danger : accent, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: disabled || saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled || saving ? .4 : 1 }}>{saving ? '…' : label}</button>
        <button onClick={onCancel} style={{ padding: '10px 14px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zrušit</button>
      </div>
    )
  }
  const projSel: React.CSSProperties = { width: '100%', padding: '8px 10px', background: D.bgMid, border: `1px solid ${D.border}`, borderRadius: 8, fontSize: 13, color: D.txtPri, fontFamily: 'inherit', outline: 'none', marginTop: 8 }

  return (
    <DarkLayout profile={profile} activeRoute="/student/sql" fullContent>

      {/* ── Modals ── */}
      {newProjModal && (
        <Modal title="🗄️ Nový projekt" onClose={() => setNewProjModal(false)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 10 }}>Název projektu</p>
          <input value={newProjName} onChange={e => setNewProjName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newProjName.trim() && doCreateProject()} autoFocus placeholder="Můj projekt" style={{ ...modalInp, marginBottom: 14 }} />
          <p style={{ fontSize: 12, color: D.txtSec, marginBottom: 8 }}>Šablona databáze</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {Object.entries(TEMPLATES).map(([key, tmpl]) => (
              <div key={key} onClick={() => setNewProjTemplate(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${newProjTemplate === key ? accent + '60' : D.border}`, background: newProjTemplate === key ? accent + '12' : 'transparent', transition: 'all .15s' }}>
                <span style={{ fontSize: 18 }}>{tmpl.icon}</span>
                <span style={{ fontSize: 13, color: newProjTemplate === key ? accent : D.txtPri, fontWeight: newProjTemplate === key ? 600 : 400 }}>{tmpl.label}</span>
                {newProjTemplate === key && <span style={{ marginLeft: 'auto', fontSize: 11, color: accent }}>✓</span>}
              </div>
            ))}
          </div>
          <MBtns onOk={doCreateProject} onCancel={() => setNewProjModal(false)} label="Vytvořit" disabled={!newProjName.trim()} />
        </Modal>
      )}
      {openProjModal && (
        <Modal title="📂 Otevřít projekt" onClose={() => setOpenProjModal(false)}>
          <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
            {projects.map(proj => (
              <div key={proj.key} onClick={() => openProject(proj)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: proj.key === activeProject?.key ? accent+'15' : 'transparent' }} className="sql-row">
                <span style={{ fontSize: 18 }}>🗄️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: proj.key === activeProject?.key ? accent : D.txtPri }}>{proj.name}</div>
                  <div style={{ fontSize: 10, color: D.txtSec }}>{proj.scripts.length} skriptů</div>
                </div>
              </div>
            ))}
            {projects.length === 0 && <div style={{ fontSize: 13, color: D.txtSec, textAlign: 'center', padding: '20px 0' }}>Žádné projekty</div>}
          </div>
          <button onClick={() => setOpenProjModal(false)} style={{ width: '100%', padding: '10px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' }}>Zavřít</button>
        </Modal>
      )}
      {newScriptModal && (
        <Modal title="📄 Nový SQL skript" onClose={() => setNewScriptModal(false)}>
          <input value={newScriptName} onChange={e => setNewScriptName(e.target.value)} onKeyDown={e => e.key === 'Enter' && newScriptName.trim() && doNewScript()} autoFocus placeholder="dotaz.sql" style={{ ...modalInp }} />
          <p style={{ fontSize: 12, color: D.txtSec, marginTop: 10, marginBottom: 6 }}>Projekt</p>
          <select value={newScriptProj || activeProject?.key || ''} onChange={e => setNewScriptProj(e.target.value)} style={projSel}>
            {projects.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <div style={{ marginTop: 14 }}>
            <MBtns onOk={doNewScript} onCancel={() => setNewScriptModal(false)} label="Vytvořit" disabled={!newScriptName.trim()} />
          </div>
        </Modal>
      )}
      {deleteModal && (
        <Modal title={`🗑 Smazat ${deleteModal.type === 'project' ? 'projekt' : 'skript'}`} onClose={() => setDeleteModal(null)}>
          <p style={{ fontSize: 13, color: D.txtSec, marginBottom: 6 }}>Smazat <strong style={{ color: D.txtPri }}>{deleteModal.type === 'project' ? (deleteModal.item as SqlProject).name : (deleteModal.item as SqlScript).name}</strong>?</p>
          {deleteModal.type === 'project' && <p style={{ fontSize: 12, color: D.warning, marginBottom: 6 }}>Smaže se i celá databáze!</p>}
          <p style={{ fontSize: 12, color: D.danger, marginBottom: 18 }}>Tato akce je nevratná.</p>
          <MBtns onOk={doDelete} onCancel={() => setDeleteModal(null)} label="Smazat" danger />
        </Modal>
      )}
      {renameModal && (
        <Modal title="✏ Přejmenovat skript" onClose={() => setRenameModal(null)}>
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameVal.trim() && doRename()} autoFocus placeholder={(renameModal.item as SqlScript).name} style={{ ...modalInp, marginBottom: 14 }} />
          <MBtns onOk={doRename} onCancel={() => setRenameModal(null)} label="Přejmenovat" disabled={!renameVal.trim()} />
        </Modal>
      )}

      <style>{`
        .sql-sb:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .sql-row { transition: background .12s; }
        .sql-row:hover { background: rgba(255,255,255,.05) !important; }
        .sql-row:hover .sql-acts { opacity: 1 !important; }
        .sql-result-tab { transition: all .15s; }
        .sql-result-tab:hover { background: rgba(255,255,255,.06) !important; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* ── 3-col layout ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ LEFT: sidebar ══ */}
        <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <img src="/icons/database.png" alt="SQL" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: D.txtPri }}>SQL Editor</span>
              {isDirty && <span style={{ fontSize: 9, color: D.warning, marginLeft: 'auto' }}>● neuloženo</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="sql-sb" style={sideBtn} onClick={() => setNewProjModal(true)}><span>🗄️</span> Nový projekt</button>
              <button className="sql-sb" style={sideBtn} onClick={() => setNewScriptModal(true)}><span>📄</span> Nový skript</button>
              <button className="sql-sb" style={sideBtn} onClick={() => { setOpenProjModal(true); refreshProjects() }}><span>📂</span> Otevřít</button>
              <div style={{ height: 1, background: D.border, margin: '2px 0' }} />
              <button id="sql-save-btn" className="sql-sb" style={{ ...sideBtn, opacity: !activeProject || saving ? .4 : 1 }} disabled={!activeProject || saving} onClick={saveScript}><span>💾</span> Uložit</button>
              <button className="sql-sb" style={{ ...sideBtn, opacity: !activeScript ? .4 : 1 }} disabled={!activeScript} onClick={downloadScript}><span>⬇️</span> .sql</button>
              <button className="sql-sb" style={{ ...sideBtn, opacity: !dbRef.current ? .4 : 1 }} disabled={!dbRef.current} onClick={downloadDb}><span>⬇️</span> .db</button>
            </div>
          </div>

          {/* Scrollable: recent + projects */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Nedávné</div>
            {recent.length === 0
              ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné nedávné projekty</div>
              : recent.map(r => (
                  <div key={r.key} className="sql-row" onClick={() => { const p = projects.find(x => x.key === r.key); if (p) openProject(p) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: D.radiusSm, cursor: 'pointer', background: r.key === activeProject?.key ? accent+'15' : 'transparent', marginBottom: 2 }}>
                    <span>🗄️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: r.key === activeProject?.key ? accent : D.txtPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    </div>
                  </div>
                ))
            }
          </div>

          <div style={{ height: 1, background: D.border, margin: '4px 12px' }} />
          <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Projekty</div>
            {loadingProj
              ? <div style={{ fontSize: 12, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : projects.length === 0 ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádné projekty</div>
              : projects.map(proj => (
                  <div key={proj.key} style={{ marginBottom: 5 }}>
                    <div className="sql-row" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', borderRadius: 7, background: proj.key === activeProject?.key ? accent+'10' : 'transparent' }}>
                      <div onClick={() => { setExpandedProj(prev => { const n = new Set(prev); n.has(proj.key) ? n.delete(proj.key) : n.add(proj.key); return n }); openProject(proj) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, cursor: 'pointer' }}>
                        <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expandedProj.has(proj.key) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                        <span style={{ fontSize: 13 }}>🗄️</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: proj.key === activeProject?.key ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                      </div>
                      <div className="sql-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); setDeleteModal({ type: 'project', item: proj }) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }} title="Smazat">🗑</button>
                      </div>
                    </div>
                    {expandedProj.has(proj.key) && (
                      <div style={{ marginLeft: 18 }}>
                        {/* SQL scripts */}
                        {proj.scripts.map(s => (
                          <div key={s.path} className="sql-row" onClick={() => { openProject(proj, s) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 6, cursor: 'pointer', background: s.path === activeScript?.path ? accent+'15' : 'transparent', marginBottom: 1 }}>
                            <span style={{ fontSize: 11 }}>📄</span>
                            <span style={{ fontSize: 11, color: s.path === activeScript?.path ? accent : D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: s.path === activeScript?.path ? 600 : 400 }}>{s.name}</span>
                            <div className="sql-acts" style={{ display: 'flex', gap: 1, opacity: 0 }}>
                              <button onClick={e => { e.stopPropagation(); setRenameModal({ type: 'script', item: s }); setRenameVal(s.name.replace(/\.sql$/, '')) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přejmenovat">✏</button>
                              <button onClick={e => { e.stopPropagation(); setDeleteModal({ type: 'script', item: s }) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }} title="Smazat">🗑</button>
                            </div>
                          </div>
                        ))}
                        {/* DB schema (tables) */}
                        {proj.key === activeProject?.key && schema.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.05em', padding: '3px 7px' }}>📋 Tabulky</div>
                            {schema.map(t => (
                              <div key={t.name} style={{ marginBottom: 2 }}>
                                <div className="sql-row" onClick={() => { editorRef.current?.trigger('', 'type', { text: t.name }) }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 5, cursor: 'pointer' }} title="Vložit název tabulky">
                                  <span style={{ fontSize: 10 }}>📊</span>
                                  <span style={{ fontSize: 11, color: '#60A5FA', fontWeight: 600, flex: 1 }}>{t.name}</span>
                                  <span style={{ fontSize: 9, color: D.txtSec }}>{t.columns.length}</span>
                                </div>
                                {t.columns.map(c => (
                                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 7px 1px 18px' }}>
                                    <span style={{ fontSize: 9, color: c.pk ? D.warning : D.txtSec }}>{c.pk ? '🔑' : '▸'}</span>
                                    <span style={{ fontSize: 10, color: D.txtSec }}>{c.name}</span>
                                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', marginLeft: 3 }}>{c.type}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
            }
          </div>{/* end scrollable */}
        </div>{/* end left sidebar */}

        {/* ══ CENTER: Editor ══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${D.border}`, flexShrink: 0, flexWrap: 'wrap' as const }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flex: 1, minWidth: 0 }}>
              {activeProject && <><span style={{ color: D.txtSec, flexShrink: 0 }}>🗄️ {activeProject.name}</span><span style={{ color: D.txtSec, opacity: .4 }}>/</span></>}
              <span style={{ color: D.txtPri, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{activeScript?.name ?? 'bez souboru'}</span>
              {isDirty && <span style={{ color: D.warning, fontSize: 10 }}>●</span>}
            </div>
            {saveMsg && <span style={{ fontSize: 11, color: saveMsg.startsWith('❌') ? D.danger : D.success, fontWeight: 600 }}>{saveMsg}</span>}
            <button onClick={() => setShowHistory(h => !h)}
              style={{ padding: '5px 10px', background: showHistory ? accent+'20' : 'rgba(255,255,255,.04)', color: showHistory ? accent : D.txtSec, border: `1px solid ${showHistory ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              🕐 Historie
            </button>
            <button id="sql-run-btn" onClick={runSql} disabled={running || !dbRef.current}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: running || !dbRef.current ? D.bgMid : accent, color: running || !dbRef.current ? D.txtSec : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: running || !dbRef.current ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
              {running ? <><div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: D.txtSec, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />…</> : '▶ Spustit'}
            </button>
          </div>

          {/* History dropdown */}
          {showHistory && (
            <div style={{ background: D.bgCard, border: `1px solid ${D.border}`, borderTop: 'none', padding: '10px 14px', maxHeight: 180, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Posledních {Math.min(queryHistory.length, MAX_HISTORY)} dotazů</div>
              {queryHistory.length === 0 ? <div style={{ fontSize: 12, color: D.txtSec }}>Žádná historie</div>
                : queryHistory.map((h, i) => (
                    <div key={i} onClick={() => { editorRef.current?.setValue(h); setShowHistory(false) }}
                      style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', marginBottom: 2, fontFamily: 'monospace', fontSize: 11, color: D.txtSec, background: 'rgba(255,255,255,.03)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      className="sql-row" title={h}>
                      {h.replace(/\s+/g, ' ').slice(0, 80)}
                    </div>
                  ))
              }
            </div>
          )}

          {/* Editor + schema */}
          <div style={{ flex: 1, display: 'flex', background: '#0d1117', overflow: 'hidden', minHeight: 0 }}>
            <div ref={editorContainerRef} style={{ flex: 1, overflow: 'hidden' }} />
            {showSchema && (
              <div style={{ width: 220, flexShrink: 0, borderLeft: `1px solid rgba(255,255,255,.08)`, background: '#1a1a2e', overflowY: 'auto', padding: '12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', marginBottom: 10 }}>Schéma databáze</div>
                {schema.length === 0
                  ? <div style={{ fontSize: 11, color: D.txtSec }}>Žádné tabulky</div>
                  : schema.map(t => (
                      <div key={t.name} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{ fontSize: 12 }}>📊</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA' }}>{t.name}</span>
                        </div>
                        {t.columns.map(c => (
                          <div key={c.name} style={{ display: 'flex', gap: 4, padding: '2px 0 2px 14px' }}>
                            <span style={{ fontSize: 10, color: c.pk ? D.warning : D.txtSec, flexShrink: 0 }}>{c.pk ? '🔑' : '▸'}</span>
                            <span style={{ fontSize: 10, color: D.txtPri }}>{c.name}</span>
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', marginLeft: 'auto' }}>{c.type}</span>
                          </div>
                        ))}
                      </div>
                    ))
                }
              </div>
            )}
          </div>

        </div>

        {/* ══ RIGHT: Results ══ */}
        <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Results panel */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Result tabs */}
            {queryResults.length > 1 && (
              <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
                {queryResults.map((r, i) => (
                  <button key={i} onClick={() => setActiveResult(i)} className="sql-result-tab"
                    style={{ padding: '6px 14px', background: activeResult === i ? D.bgMid : 'transparent', color: r.error ? D.danger : activeResult === i ? D.txtPri : D.txtSec, border: 'none', borderRight: `1px solid ${D.border}`, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: activeResult === i ? 600 : 400 }}>
                    {r.error ? '❌' : r.rows.length > 0 ? '📊' : '✓'} #{i + 1}
                  </button>
                ))}
              </div>
            )}
            {/* Result content */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              {queryResults.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px', color: D.txtSec }}>
                  <span style={{ fontSize: 28, opacity: .3 }}>🗄️</span>
                  <div>
                    <div style={{ fontSize: 13 }}>Spusť SQL dotaz (Ctrl+Enter)</div>
                    <div style={{ fontSize: 11, opacity: .6 }}>SELECT, INSERT, CREATE TABLE — výsledky se zobrazí zde</div>
                  </div>
                </div>
              ) : (() => {
                const r = queryResults[activeResult] ?? queryResults[0]
                if (!r) return null
                return (
                  <div>
                    {/* Status bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.sql}>{r.sql.slice(0, 60)}{r.sql.length > 60 ? '…' : ''}</span>
                      {r.error
                        ? <span style={{ fontSize: 11, color: D.danger, fontWeight: 600 }}>❌ Chyba</span>
                        : r.rows.length > 0
                          ? <span style={{ fontSize: 11, color: D.success, fontWeight: 600 }}>✓ {r.rows.length} řádků · {fmtMs(r.ms)}</span>
                          : <span style={{ fontSize: 11, color: D.success, fontWeight: 600 }}>✓ {r.rowsAffected} ovlivněno · {fmtMs(r.ms)}</span>
                      }
                      {r.rows.length > 0 && (
                        <button onClick={() => exportCsv(r)} style={{ padding: '2px 8px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>⬇ CSV</button>
                      )}
                    </div>
                    {/* Error */}
                    {r.error && (
                      <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.08)', borderBottom: `1px solid rgba(239,68,68,.2)` }}>
                        <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, color: '#FCA5A5', whiteSpace: 'pre-wrap' }}>{r.error}</pre>
                      </div>
                    )}
                    {/* Table */}
                    {r.rows.length > 0 && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%', fontFamily: 'monospace' }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '6px 12px', background: D.bgMid, color: D.txtSec, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', border: `1px solid ${D.border}`, textAlign: 'center' as const, minWidth: 40 }}>#</th>
                              {r.columns.map((col, i) => (
                                <th key={i} style={{ padding: '6px 12px', background: D.bgMid, color: D.txtSec, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', border: `1px solid ${D.border}`, textAlign: 'left' as const, whiteSpace: 'nowrap' }}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {r.rows.map((row, ri) => (
                              <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                                <td style={{ padding: '5px 12px', border: `1px solid ${D.border}`, color: 'rgba(255,255,255,.2)', fontSize: 10, textAlign: 'center' as const }}>{ri + 1}</td>
                                {row.map((cell, ci) => (
                                  <td key={ci} style={{ padding: '5px 12px', border: `1px solid ${D.border}`, color: cell === null ? 'rgba(255,255,255,.25)' : D.txtPri, fontStyle: cell === null ? 'italic' : 'normal', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(cell ?? '')}>
                                    {cell === null ? 'NULL' : String(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* No rows for DML */}
                    {!r.error && r.rows.length === 0 && (
                      <div style={{ padding: '14px 16px', color: D.txtSec, fontSize: 12 }}>
                        ✓ Příkaz proveden — {r.rowsAffected > 0 ? `${r.rowsAffected} řádků ovlivněno` : 'žádné výsledky'} — {fmtMs(r.ms)}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>
    </DarkLayout>
  )
}
