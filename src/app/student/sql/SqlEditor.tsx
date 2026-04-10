'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import AssignmentPanel from '@/components/AssignmentPanel'
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
export default function SqlEditor({ profile, assignmentId }: { profile: any; assignmentId?: string | null }) {
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
  const [rightTab, setRightTab]         = useState<'schema'|'snippets'|'history'|'data'>('schema')
  const [erPositions, setErPositions]   = useState<Record<string, {x:number;y:number}>>({})
  const erDragRef = useRef<{table:string;startX:number;startY:number;origX:number;origY:number}|null>(null)
  const erContainerRef = useRef<HTMLDivElement>(null)
  const [centerTab, setCenterTab]       = useState<'editor'|'schema'>('editor')
  const [dataPreviewTable, setDataPreviewTable] = useState<string|null>(null)
  const [dataPreviewRows, setDataPreviewRows]   = useState<{cols:string[];rows:any[][]}>({cols:[],rows:[]})
  const [resultsHeight, setResultsHeight] = useState(220)
  const resultsResizeRef = useRef<{startY:number;startH:number}|null>(null)
  const [erWidth, setErWidth]             = useState(42)  // percent
  const erResizeRef = useRef<{startX:number;startW:number}|null>(null)

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
        monaco.editor.defineTheme('cb-dark', {
          base: 'vs-dark', inherit: true,
          rules: [
            { token: 'keyword', foreground: 'c792ea' },
            { token: 'string', foreground: 'c3e88d' },
            { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
            { token: 'number', foreground: 'f78c6c' },
          ],
          colors: {
            'editor.background': '#0d1117',
            'editor.foreground': '#e6edf3',
            'editorLineNumber.foreground': '#30363d',
            'editor.lineHighlightBackground': '#161b22',
          },
        })
        if (!editorContainerRef.current) return
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
          if (!String(tname).startsWith('sqlite_')) tables.push({ name: String(tname), columns: cols })
        }
      }
      setSchema(tables)
      initErPositions(tables)
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

  // ── Init ER positions when schema changes ────────────────────────────────
  function initErPositions(tables: TableInfo[]) {
    setErPositions(prev => {
      const next: Record<string, {x:number;y:number}> = {}
      tables.forEach((t, i) => {
        next[t.name] = prev[t.name] ?? { x: 20 + (i % 3) * 220, y: 20 + Math.floor(i / 3) * 180 }
      })
      return next
    })
  }

  // ── Data preview ──────────────────────────────────────────────────────────
  function previewTable(tableName: string) {
    if (!dbRef.current) return
    try {
      const res = dbRef.current.exec(`SELECT * FROM "${tableName}" LIMIT 10`)
      if (res.length > 0) {
        setDataPreviewRows({ cols: res[0].columns, rows: res[0].values })
      } else {
        setDataPreviewRows({ cols: [], rows: [] })
      }
      setDataPreviewTable(tableName)
      setRightTab('data')
    } catch {}
  }

  // ── Detect tables mentioned in current SQL ────────────────────────────────
  function getActiveTables(): string[] {
    const sql = editorRef.current?.getValue() ?? ''
    return schema.map(t => t.name).filter(name =>
      new RegExp(`\\b${name}\\b`, 'i').test(sql)
    )
  }

  // ── Detect FK relations heuristically ────────────────────────────────────
  interface Relation { from: string; fromCol: string; to: string; toCol: string; real: boolean }
  function detectRelations(): Relation[] {
    const relations: Relation[] = []
    const tableNames = schema.map(t => t.name.toLowerCase())
    for (const table of schema) {
      for (const col of table.columns) {
        // Real FK: column has references in schema
        if (col.name.toLowerCase().endsWith('_id')) {
          const refTableName = col.name.toLowerCase().replace(/_id$/, '')
          const refTable = schema.find(t => t.name.toLowerCase() === refTableName ||
            t.name.toLowerCase() === refTableName + 'e' ||
            t.name.toLowerCase() === refTableName + 'y' ||
            t.name.toLowerCase() === refTableName + 'i')
          if (refTable) {
            const pkCol = refTable.columns.find(c => c.pk) ?? refTable.columns[0]
            relations.push({ from: table.name, fromCol: col.name, to: refTable.name, toCol: pkCol?.name ?? 'id', real: false })
          }
        }
      }
    }
    return relations
  }

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
    } else if (renameModal.type === 'project') {
      const proj = renameModal.item as SqlProject
      const newName = renameVal.trim()
      // Rename all files in the project by moving them
      const allFiles = [...proj.scripts.map(s => s.path)]
      const dbPath = `zaci/${uid}/${proj.key}/${proj.key}.db`
      allFiles.push(dbPath)
      // We store project name in a metadata file
      const metaPath = `zaci/${uid}/${proj.key}/_name.txt`
      await pushText(metaPath, newName)
      const projs = await refreshProjects()
      const p = projs.find(x => x.key === proj.key)
      if (p) setActiveProject(p)
      flash('✓ Projekt přejmenován')
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
        <Modal title={renameModal.type === 'project' ? '✏ Přejmenovat projekt' : '✏ Přejmenovat skript'} onClose={() => setRenameModal(null)}>
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && renameVal.trim() && doRename()} autoFocus placeholder={renameModal.type === 'project' ? (renameModal.item as SqlProject).name : (renameModal.item as SqlScript).name} style={{ ...modalInp, marginBottom: 14 }} />
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

      {/* ── Assignment panel ── */}
      {assignmentId && (
        <AssignmentPanel
          assignmentId={assignmentId}
          studentId={uid ?? profile?.id}
          accent={accent}
        />
      )}
      {/* ── 3-col layout ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ LEFT: Sidebar ══ */}
        <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <img src="/icons/database.png" alt="SQL" style={{ width: 18, height: 18, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: D.txtPri, lineHeight: 1.2 }}>SQLEdit</div>
                <div style={{ fontSize: 9, color: D.txtSec, lineHeight: 1.2 }}>by Jakub Krejčí</div>
              </div>
              {isDirty && <span style={{ fontSize: 9, color: D.warning, marginLeft: 'auto' }}>● neuloženo</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="sql-sb" style={{...sideBtn}} onClick={() => setNewProjModal(true)}><span>🗄️</span> Nový projekt</button>
              <button className="sql-sb" style={{...sideBtn}} onClick={() => setNewScriptModal(true)}><span>📄</span> Nový skript</button>
              <button className="sql-sb" style={{...sideBtn}} onClick={() => { setOpenProjModal(true); refreshProjects() }}><span>📂</span> Otevřít</button>
              <div style={{ height: 1, background: D.border, margin: '2px 0' }} />
              <button id="sql-save-btn" className="sql-sb" style={{...sideBtn, opacity: !activeProject || saving ? .4 : 1}} disabled={!activeProject || saving} onClick={saveScript}><span>💾</span> Uložit</button>
              <button className="sql-sb" style={{...sideBtn, opacity: !activeScript ? .4 : 1}} disabled={!activeScript} onClick={downloadScript}><span>⬇️</span> .sql</button>
              <button className="sql-sb" style={{...sideBtn, opacity: !dbRef.current ? .4 : 1}} disabled={!dbRef.current} onClick={downloadDb}><span>⬇️</span> .db</button>
            </div>
          </div>
          {/* Moje projekty */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            <div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 700, color: D.txtSec, textTransform: 'uppercase', letterSpacing: '.06em' }}>Moje projekty</div>
            {loadingProj
              ? <div style={{ fontSize: 11, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                  <div style={{ width: 12, height: 12, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…
                </div>
              : projects.length === 0 ? <div style={{ fontSize: 11, color: D.txtSec, padding: '4px 12px' }}>Žádné projekty</div>
              : projects.map(proj => (
                  <div key={proj.key} style={{ marginBottom: 2 }}>
                    <div className="sql-row" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: proj.key === activeProject?.key ? accent+'10' : 'transparent' }}>
                      <div onClick={() => { setExpandedProj(prev => { const n = new Set(prev); n.has(proj.key) ? n.delete(proj.key) : n.add(proj.key); return n }) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, cursor: 'pointer' }}>
                        <span style={{ fontSize: 9, color: D.txtSec, display: 'inline-block', transform: expandedProj.has(proj.key) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                        <span style={{ fontSize: 12 }}>🗄️</span>
                        <span onClick={e => { e.stopPropagation(); openProject(proj); setExpandedProj(prev => { const n = new Set(prev); n.add(proj.key); return n }) }} style={{ fontSize: 11, fontWeight: 700, color: proj.key === activeProject?.key ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                      </div>
                      <div className="sql-acts" style={{ display: 'flex', gap: 1, opacity: 0, flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); setRenameModal({ type: 'project', item: proj }); setRenameVal(proj.name) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 11 }} title="Přejmenovat">✏</button>
                        <button onClick={e => { e.stopPropagation(); setDeleteModal({ type: 'project', item: proj }) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 11 }}>🗑</button>
                      </div>
                    </div>
                    {expandedProj.has(proj.key) && (
                      <div style={{ marginLeft: 16 }}>
                        {proj.scripts.map(s => (
                          <div key={s.path} className="sql-row" onClick={() => openProject(proj, s)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 12px', borderRadius: 5, cursor: 'pointer', background: s.path === activeScript?.path ? accent+'15' : 'transparent', marginBottom: 1 }}>
                            <span style={{ fontSize: 10 }}>📄</span>
                            <span style={{ fontSize: 10, color: s.path === activeScript?.path ? accent : D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            <div className="sql-acts" style={{ display: 'flex', gap: 1, opacity: 0 }}>
                              <button onClick={e => { e.stopPropagation(); setRenameModal({ type: 'script', item: s }); setRenameVal(s.name.replace(/\.sql$/, '')) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.txtSec, fontSize: 10 }}>✏</button>
                              <button onClick={e => { e.stopPropagation(); setDeleteModal({ type: 'script', item: s }) }} style={{ padding: '1px 4px', background: 'none', border: 'none', cursor: 'pointer', color: D.danger, fontSize: 10 }}>🗑</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
            }
          </div>
          {saveMsg && <div style={{ padding: '6px 12px', borderTop: `1px solid ${D.border}`, fontSize: 11, color: saveMsg.startsWith('❌') ? D.danger : D.success, flexShrink: 0 }}>{saveMsg}</div>}
        </div>

        {/* ══ CENTER: Editor + ER Diagram (split) ══ */}
        <div style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>

          {/* Editor + Results (left half) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${D.border}` }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: D.txtSec }}>
                {activeProject ? <><span style={{ color: D.txtSec }}>🗄️ {activeProject.name}</span><span style={{ opacity: .4 }}> / </span></> : null}
                <span style={{ color: D.txtPri, fontWeight: 600 }}>{activeScript?.name ?? 'bez souboru'}</span>
                {isDirty && <span style={{ color: D.warning }}> ●</span>}
              </span>
              <div style={{ flex: 1 }} />
              {!sqlReady && <span style={{ fontSize: 10, color: D.txtSec, display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, border: `2px solid ${D.border}`, borderTopColor: accent, borderRadius: '50%', animation: 'spin .6s linear infinite' }} />Načítám…</span>}
              <button onClick={() => setNewScriptModal(true)} disabled={!activeProject}
                style={{ padding: '5px 10px', background: 'rgba(255,255,255,.04)', color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 7, fontSize: 11, cursor: activeProject ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: activeProject ? 1 : .4 }}>
                + Nový dotaz
              </button>
              <button id="sql-save-btn2" onClick={saveScript} disabled={!activeProject || saving}
                style={{ padding: '5px 10px', background: isDirty ? accent+'20' : 'rgba(255,255,255,.04)', color: isDirty ? accent : D.txtSec, border: `1px solid ${isDirty ? accent+'40' : D.border}`, borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: !activeProject || saving ? .4 : 1 }}>
                {saving ? '…' : '💾 Uložit'}
              </button>
              <button id="sql-run-btn" onClick={runSql} disabled={running || !dbRef.current}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', background: running || !dbRef.current ? D.bgMid : accent, color: running || !dbRef.current ? D.txtSec : '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: running || !dbRef.current ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
                {running ? <><div style={{ width: 11, height: 11, border: `2px solid rgba(255,255,255,.3)`, borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />…</> : '▶ Spustit'}
              </button>
            </div>
            {/* Monaco editor */}
            <div ref={editorContainerRef} style={{ flex: 1, background: '#0d1117', overflow: 'hidden', minHeight: 0 }} />
          {/* Resize handle: editor ↕ results */}
            <div
              style={{ height: 6, background: 'rgba(255,255,255,.04)', borderTop: `1px solid ${D.border}`, borderBottom: `1px solid ${D.border}`, cursor: 'ns-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.background = accent+'30')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
              onMouseDown={e => {
                e.preventDefault()
                resultsResizeRef.current = { startY: e.clientY, startH: resultsHeight }
                const onMove = (ev: MouseEvent) => {
                  const ref = resultsResizeRef.current; if (!ref) return
                  setResultsHeight(Math.max(80, Math.min(500, ref.startH - (ev.clientY - ref.startY))))
                }
                const onUp = () => { resultsResizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
              }}>
              <div style={{ width: 28, height: 2, borderRadius: 2, background: 'rgba(255,255,255,.2)' }} />
            </div>
            {/* Results */}
            <div style={{ height: resultsHeight, flexShrink: 0, borderTop: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {queryResults.length > 1 && (
                <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
                  {queryResults.map((r, i) => (
                    <button key={i} onClick={() => setActiveResult(i)} className="sql-result-tab"
                      style={{ padding: '5px 12px', background: activeResult === i ? D.bgMid : 'transparent', color: r.error ? D.danger : activeResult === i ? D.txtPri : D.txtSec, border: 'none', borderRight: `1px solid ${D.border}`, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: activeResult === i ? 600 : 400 }}>
                      {r.error ? '❌' : r.rows.length > 0 ? '📊' : '✓'} #{i + 1}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                {queryResults.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', color: D.txtSec }}>
                    <span style={{ fontSize: 22, opacity: .3 }}>🗄️</span>
                    <div>
                      <div style={{ fontSize: 12 }}>Spusť SQL dotaz (Ctrl+Enter)</div>
                      <div style={{ fontSize: 11, opacity: .6 }}>SELECT, INSERT, CREATE TABLE…</div>
                    </div>
                  </div>
                ) : (() => {
                  const r = queryResults[activeResult] ?? queryResults[0]
                  if (!r) return null
                  return (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: `1px solid ${D.border}` }}>
                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: D.txtSec, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={r.sql}>{r.sql.slice(0, 50)}{r.sql.length > 50 ? '…' : ''}</span>
                        {r.error ? <span style={{ fontSize: 10, color: D.danger, fontWeight: 600 }}>❌ Chyba</span>
                          : r.rows.length > 0 ? <span style={{ fontSize: 10, color: D.success, fontWeight: 600 }}>✓ {r.rows.length} řádků · {fmtMs(r.ms)}</span>
                          : <span style={{ fontSize: 10, color: D.success, fontWeight: 600 }}>✓ {r.rowsAffected} ovlivněno · {fmtMs(r.ms)}</span>}
                        {r.rows.length > 0 && <button onClick={() => exportCsv(r)} style={{ padding: '2px 7px', background: D.bgMid, color: D.txtSec, border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>⬇ CSV</button>}
                      </div>
                      {r.error && <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.08)' }}><pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 11, color: '#FCA5A5', whiteSpace: 'pre-wrap' }}>{r.error}</pre></div>}
                      {r.rows.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%', fontFamily: 'monospace' }}>
                            <thead><tr>
                              <th style={{ padding: '5px 10px', background: D.bgMid, color: D.txtSec, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', border: `1px solid ${D.border}`, textAlign: 'center' as const, minWidth: 32 }}>#</th>
                              {r.columns.map((col, i) => <th key={i} style={{ padding: '5px 10px', background: D.bgMid, color: D.txtSec, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', border: `1px solid ${D.border}`, textAlign: 'left' as const, whiteSpace: 'nowrap' }}>{col}</th>)}
                            </tr></thead>
                            <tbody>{r.rows.map((row, ri) => (
                              <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                                <td style={{ padding: '4px 10px', border: `1px solid ${D.border}`, color: 'rgba(255,255,255,.2)', fontSize: 9, textAlign: 'center' as const }}>{ri + 1}</td>
                                {row.map((cell, ci) => <td key={ci} style={{ padding: '4px 10px', border: `1px solid ${D.border}`, color: cell === null ? 'rgba(255,255,255,.25)' : D.txtPri, fontStyle: cell === null ? 'italic' : 'normal', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(cell ?? '')}>{cell === null ? 'NULL' : String(cell)}</td>)}
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}
                      {!r.error && r.rows.length === 0 && <div style={{ padding: '12px', color: D.txtSec, fontSize: 11 }}>✓ Příkaz proveden — {r.rowsAffected > 0 ? `${r.rowsAffected} řádků ovlivněno` : 'žádné výsledky'} — {fmtMs(r.ms)}</div>}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Resize handle: editor ↔ ER */}
          <div
            style={{ width: 6, flexShrink: 0, background: 'rgba(255,255,255,.04)', borderLeft: `1px solid ${D.border}`, borderRight: `1px solid ${D.border}`, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.background = accent+'30')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
            onMouseDown={e => {
              e.preventDefault()
              const container = e.currentTarget.parentElement
              const totalW = container?.clientWidth ?? 800
              erResizeRef.current = { startX: e.clientX, startW: erWidth }
              const onMove = (ev: MouseEvent) => {
                const ref = erResizeRef.current; if (!ref) return
                const dx = ev.clientX - ref.startX
                const newPct = ref.startW - (dx / totalW * 100)
                setErWidth(Math.max(20, Math.min(65, newPct)))
              }
              const onUp = () => { erResizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
              window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
            }}>
            <div style={{ width: 2, height: 24, borderRadius: 2, background: 'rgba(255,255,255,.2)' }} />
          </div>

          {/* ER Diagram (right half of center) */}
          <div style={{ width: `${erWidth}%`, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#080a0f' }}>
            <div style={{ padding: '7px 12px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: D.txtPri }}>ER Diagram</span>
              {schema.length > 0 && <span style={{ fontSize: 10, color: D.txtSec }}>{schema.length} tabulek</span>}
              <div style={{ flex: 1 }} />
              <button onClick={() => setErPositions({})} style={{ padding: '2px 8px', background: 'none', border: `1px solid ${D.border}`, borderRadius: 5, fontSize: 10, color: D.txtSec, cursor: 'pointer', fontFamily: 'inherit' }} title="Resetovat rozmístění">↺</button>
            </div>
            {schema.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,.2)' }}>
                <span style={{ fontSize: 36, opacity: .3 }}>🗄️</span>
                <div style={{ fontSize: 12 }}>Vytvoř tabulky pro zobrazení diagramu</div>
                <div style={{ fontSize: 10, opacity: .6 }}>CREATE TABLE → Spustit</div>
              </div>
            ) : (() => {
              const activeTables = getActiveTables()
              const relations = detectRelations()

              const onErMouseDown = (e: React.MouseEvent, tableName: string) => {
                e.preventDefault()
                const pos = erPositions[tableName] ?? { x: 0, y: 0 }
                erDragRef.current = { table: tableName, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
                const onMove = (ev: MouseEvent) => {
                  const ref = erDragRef.current
                  if (!ref) return
                  const dx = ev.clientX - ref.startX
                  const dy = ev.clientY - ref.startY
                  setErPositions(prev => ({ ...prev, [ref.table]: { x: Math.max(0, ref.origX + dx), y: Math.max(0, ref.origY + dy) } }))
                }
                const onUp = () => { erDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }

              // Card dimensions for SVG lines
              const CARD_W = 160, COL_H = 22, HEADER_H = 32

              return (
                <div ref={erContainerRef} style={{ flex: 1, overflow: 'auto', position: 'relative', cursor: 'default' }}>
                  {/* SVG lines for relations */}
                  <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
                    {relations.map((rel, i) => {
                      const fromPos = erPositions[rel.from]
                      const toPos   = erPositions[rel.to]
                      if (!fromPos || !toPos) return null
                      const fromTable = schema.find(t => t.name === rel.from)
                      const fromColIdx = fromTable?.columns.findIndex(c => c.name === rel.fromCol) ?? 0
                      const x1 = fromPos.x + CARD_W
                      const y1 = fromPos.y + HEADER_H + fromColIdx * COL_H + COL_H / 2
                      const x2 = toPos.x
                      const y2 = toPos.y + HEADER_H / 2
                      const isActive = activeTables.includes(rel.from) && activeTables.includes(rel.to)
                      const mx = (x1 + x2) / 2
                      return (
                        <g key={i}>
                          <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                            stroke={isActive ? accent : 'rgba(255,255,255,.2)'}
                            strokeWidth={isActive ? 2 : 1}
                            strokeDasharray={rel.real ? 'none' : '4 3'}
                            fill="none" />
                          <circle cx={x2} cy={y2} r={3} fill={isActive ? accent : 'rgba(255,255,255,.3)'} />
                          <text x={(x1+x2)/2} y={Math.min(y1,y2) - 4} fontSize={8} fill="rgba(255,255,255,.35)" textAnchor="middle">1:N</text>
                        </g>
                      )
                    })}
                  </svg>
                  {/* Table cards */}
                  {schema.map(table => {
                    const pos = erPositions[table.name] ?? { x: 20, y: 20 }
                    const isActive = activeTables.includes(table.name)
                    return (
                      <div key={table.name}
                        onMouseDown={e => onErMouseDown(e, table.name)}
                        style={{
                          position: 'absolute', left: pos.x, top: pos.y,
                          width: CARD_W, userSelect: 'none',
                          borderRadius: 9, overflow: 'hidden', cursor: 'grab',
                          border: `1.5px solid ${isActive ? accent : 'rgba(255,255,255,.15)'}`,
                          boxShadow: isActive ? `0 0 12px ${accent}40` : '0 2px 12px rgba(0,0,0,.5)',
                          transition: 'border-color .2s, box-shadow .2s',
                        }}>
                        {/* Header */}
                        <div style={{ background: isActive ? accent+'30' : '#1a1f2e', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10 }}>📊</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? accent : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{table.name}</span>
                          <button onMouseDown={e => e.stopPropagation()} onClick={() => previewTable(table.name)}
                            style={{ padding: '1px 5px', background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 4, cursor: 'pointer', color: D.txtSec, fontSize: 9, fontFamily: 'inherit' }} title="Náhled dat">
                            👁
                          </button>
                        </div>
                        {/* Columns */}
                        {table.columns.map(col => (
                          <div key={col.name}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => {
                              const ed = editorRef.current
                              if (!ed) return
                              const pos2 = ed.getPosition()
                              ed.executeEdits('er', [{ range: { startLineNumber: pos2.lineNumber, startColumn: pos2.column, endLineNumber: pos2.lineNumber, endColumn: pos2.column }, text: col.name }])
                              ed.focus()
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: '#0d1117', borderTop: '1px solid rgba(255,255,255,.06)', cursor: 'pointer', height: COL_H }}
                            className="sql-row" title={`Vložit ${col.name} do editoru`}>
                            <span style={{ fontSize: 9, color: col.pk ? '#FBBF24' : 'rgba(255,255,255,.3)', flexShrink: 0 }}>{col.pk ? '🔑' : '▸'}</span>
                            <span style={{ fontSize: 10, color: col.pk ? '#FBBF24' : D.txtPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontWeight: col.pk ? 600 : 400 }}>{col.name}</span>
                            <span style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', flexShrink: 0 }}>{col.type.slice(0,7)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ══ RIGHT: Tools ══ */}
        <div style={{ width: 255, flexShrink: 0, borderLeft: `1px solid ${D.border}`, background: D.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `1px solid ${D.border}`, flexShrink: 0 }}>
            {([['schema','🗂','Schéma'],['snippets','🧩','Snippety'],['history','🕐','Historie'],['data','📊','Data']] as const).map(([tab, icon, label]) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ flex: 1, padding: '7px 1px', background: rightTab === tab ? D.bgMid : 'transparent', border: 'none', borderBottom: `2px solid ${rightTab === tab ? accent : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 9, fontWeight: 600, color: rightTab === tab ? D.txtPri : D.txtSec, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 13 }}>{icon}</span>{label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>

            {/* ── Schéma ── */}
            {rightTab === 'schema' && (
              <div style={{ padding: '8px 0' }}>
                {schema.length === 0
                  ? <div style={{ color: D.txtSec, fontSize: 11, textAlign: 'center' as const, padding: '24px 16px' }}>Žádné tabulky v databázi</div>
                  : schema.map(t => (
                    <div key={t.name} style={{ marginBottom: 2 }}>
                      <div className="sql-row" onClick={() => { const ed = editorRef.current; if (!ed) return; const p = ed.getPosition(); ed.executeEdits('schema', [{ range: { startLineNumber: p.lineNumber, startColumn: p.column, endLineNumber: p.lineNumber, endColumn: p.column }, text: t.name }]); ed.focus() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', cursor: 'pointer', background: getActiveTables().includes(t.name) ? accent+'12' : 'transparent' }}>
                        <span style={{ fontSize: 11 }}>📊</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: getActiveTables().includes(t.name) ? accent : '#60A5FA', flex: 1 }}>{t.name}</span>
                        <span style={{ fontSize: 9, color: D.txtSec }}>{t.columns.length}</span>
                        <button onMouseDown={e => e.stopPropagation()} onClick={ev => { ev.stopPropagation(); previewTable(t.name) }}
                          style={{ padding: '1px 5px', background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 4, cursor: 'pointer', color: D.txtSec, fontSize: 9, fontFamily: 'inherit' }}>👁</button>
                      </div>
                      {t.columns.map(c => (
                        <div key={c.name} className="sql-row" onClick={() => { const ed = editorRef.current; if (!ed) return; const p = ed.getPosition(); ed.executeEdits('col', [{ range: { startLineNumber: p.lineNumber, startColumn: p.column, endLineNumber: p.lineNumber, endColumn: p.column }, text: c.name }]); ed.focus() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 12px 2px 28px', cursor: 'pointer' }}>
                          <span style={{ fontSize: 9, color: c.pk ? '#FBBF24' : 'rgba(255,255,255,.3)' }}>{c.pk ? '🔑' : '▸'}</span>
                          <span style={{ fontSize: 10, color: c.pk ? '#FBBF24' : D.txtSec, flex: 1 }}>{c.name}</span>
                          <span style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', fontFamily: 'monospace' }}>{c.type}</span>
                        </div>
                      ))}
                    </div>
                  ))
                }
              </div>
            )}

            {/* ── Snippety ── */}
            {rightTab === 'snippets' && (
              <div style={{ padding: '6px 0' }}>
                {[
                  { label: 'SELECT vše', code: 'SELECT * FROM tabulka\nLIMIT 10;' },
                  { label: 'SELECT sloupce', code: 'SELECT sloupec1, sloupec2\nFROM tabulka\nWHERE podminka = hodnota;' },
                  { label: 'JOIN tabulek', code: 'SELECT a.*, b.sloupec\nFROM tabulka_a a\nJOIN tabulka_b b ON a.id = b.a_id;' },
                  { label: 'LEFT JOIN', code: 'SELECT a.*, b.sloupec\nFROM tabulka_a a\nLEFT JOIN tabulka_b b ON a.id = b.a_id;' },
                  { label: 'GROUP BY + COUNT', code: 'SELECT sloupec, COUNT(*) AS pocet\nFROM tabulka\nGROUP BY sloupec\nORDER BY pocet DESC;' },
                  { label: 'GROUP BY + SUM', code: 'SELECT kategorie, SUM(hodnota) AS celkem\nFROM tabulka\nGROUP BY kategorie;' },
                  { label: 'WHERE s podmínkami', code: "SELECT *\nFROM tabulka\nWHERE sloupec = 'hodnota'\n  AND cislo > 10\nORDER BY sloupec ASC;" },
                  { label: 'INSERT INTO', code: "INSERT INTO tabulka (sloupec1, sloupec2)\nVALUES ('hodnota1', 42);" },
                  { label: 'UPDATE', code: "UPDATE tabulka\nSET sloupec = 'nova_hodnota'\nWHERE id = 1;" },
                  { label: 'DELETE', code: 'DELETE FROM tabulka\nWHERE id = 1;' },
                  { label: 'CREATE TABLE', code: 'CREATE TABLE nova_tabulka (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nazev TEXT NOT NULL,\n  hodnota REAL,\n  datum DATE DEFAULT CURRENT_DATE\n);' },
                  { label: 'CREATE s FK', code: 'CREATE TABLE objednavky (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  uzivatel_id INTEGER REFERENCES uzivatele(id),\n  castka REAL NOT NULL\n);' },
                  { label: 'Subquery', code: 'SELECT *\nFROM tabulka\nWHERE id IN (\n  SELECT id FROM jina_tabulka\n  WHERE podminka = 1\n);' },
                  { label: 'HAVING', code: 'SELECT kategorie, COUNT(*) AS pocet\nFROM tabulka\nGROUP BY kategorie\nHAVING pocet > 5;' },
                  { label: 'DROP TABLE', code: 'DROP TABLE IF EXISTS tabulka;' },
                ].map(s => (
                  <div key={s.label} className="sql-row"
                    onClick={() => { const ed = editorRef.current; if (!ed) return; ed.setValue(ed.getValue() + '\n\n' + s.code); ed.focus() }}
                    style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${D.border}10` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: D.txtPri, marginBottom: 2 }}>{s.label}</div>
                    <pre style={{ margin: 0, fontSize: 9, color: '#60A5FA', fontFamily: 'monospace', whiteSpace: 'pre-wrap', opacity: .8 }}>{s.code.slice(0, 60)}{s.code.length > 60 ? '…' : ''}</pre>
                  </div>
                ))}
              </div>
            )}

            {/* ── Historie ── */}
            {rightTab === 'history' && (
              <div style={{ padding: '8px 0' }}>
                {queryHistory.length === 0
                  ? <div style={{ color: D.txtSec, fontSize: 11, textAlign: 'center' as const, padding: '24px 16px' }}>Žádná historie dotazů</div>
                  : queryHistory.map((h, i) => (
                    <div key={i} className="sql-row"
                      onClick={() => { editorRef.current?.setValue(h); editorRef.current?.focus() }}
                      style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${D.border}15` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 9, padding: '1px 5px', background: D.bgMid, borderRadius: 4, color: D.txtSec, fontFamily: 'monospace' }}>#{queryHistory.length - i}</span>
                        <span style={{ fontSize: 9, color: D.txtSec }}>{h.trim().split('\n')[0].slice(0,6).toUpperCase()}</span>
                      </div>
                      <pre style={{ margin: 0, fontSize: 9, color: D.txtSec, fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 56, overflow: 'hidden' }}>{h.slice(0, 120)}{h.length > 120 ? '…' : ''}</pre>
                    </div>
                  ))
                }
              </div>
            )}

            {/* ── Data preview ── */}
            {rightTab === 'data' && (
              <div style={{ padding: '0' }}>
                {!dataPreviewTable
                  ? <div style={{ color: D.txtSec, fontSize: 11, textAlign: 'center' as const, padding: '24px 16px' }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
                      Klikni na 👁 u tabulky<br/>pro náhled prvních 10 řádků
                    </div>
                  : <>
                    <div style={{ padding: '7px 12px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#60A5FA' }}>{dataPreviewTable}</span>
                      <span style={{ fontSize: 10, color: D.txtSec }}>{dataPreviewRows.rows.length} řádků</span>
                      <button onClick={() => { const ed = editorRef.current; if (!ed) return; ed.setValue(`SELECT * FROM "${dataPreviewTable}" LIMIT 10;`); ed.focus() }}
                        style={{ marginLeft: 'auto', padding: '2px 7px', background: accent+'20', color: accent, border: 'none', borderRadius: 5, fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}>→ Editor</button>
                    </div>
                    {dataPreviewRows.cols.length > 0 ? (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: '100%', fontFamily: 'monospace' }}>
                          <thead><tr>
                            {dataPreviewRows.cols.map((col, i) => <th key={i} style={{ padding: '4px 8px', background: D.bgMid, color: D.txtSec, fontSize: 9, fontWeight: 700, border: `1px solid ${D.border}`, textAlign: 'left' as const, whiteSpace: 'nowrap' }}>{col}</th>)}
                          </tr></thead>
                          <tbody>{dataPreviewRows.rows.map((row, ri) => (
                            <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)' }}>
                              {row.map((cell, ci) => <td key={ci} style={{ padding: '3px 8px', border: `1px solid ${D.border}`, color: cell === null ? 'rgba(255,255,255,.25)' : D.txtPri, fontStyle: cell === null ? 'italic' : 'normal', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(cell ?? '')}>{cell === null ? 'NULL' : String(cell)}</td>)}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    ) : <div style={{ padding: '12px', color: D.txtSec, fontSize: 11 }}>Tabulka je prázdná</div>}
                  </>
                }
              </div>
            )}

          </div>
        </div>

      </div>
    </DarkLayout>
  )
}
