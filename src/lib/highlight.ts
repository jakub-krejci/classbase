// Multi-language segment-based syntax highlighter
// No placeholder corruption — pure segment splitting

type Seg = { t: string; c: string }

function highlight(code: string, rules: [string, RegExp][]): string {
  let segs: Seg[] = [{ t: code, c: '' }]

  for (const [cls, rx] of rules) {
    const next: Seg[] = []
    for (const seg of segs) {
      if (seg.c) { next.push(seg); continue }
      let last = 0; rx.lastIndex = 0; let m: RegExpExecArray | null
      while ((m = rx.exec(seg.t)) !== null) {
        if (m.index > last) next.push({ t: seg.t.slice(last, m.index), c: '' })
        next.push({ t: m[0], c: cls })
        last = m.index + m[0].length
      }
      if (last < seg.t.length) next.push({ t: seg.t.slice(last), c: '' })
    }
    segs = next
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return segs.map(s => s.c ? `<span class="hl-${s.c}">${esc(s.t)}</span>` : esc(s.t)).join('')
}

// ── Python ────────────────────────────────────────────────────────────────────
export function highlightPython(code: string): string {
  return highlight(code, [
    ['s', /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
    ['c', /#[^\n]*/g],
    ['k', /\b(?:def|class|if|elif|else|for|while|return|import|from|as|in|not|and|or|is|None|True|False|pass|break|continue|with|try|except|finally|raise|lambda|yield|global|nonlocal|del|assert|async|await)\b/g],
    ['b', /\b(?:print|len|range|int|float|str|list|dict|set|tuple|bool|type|input|open|sum|max|min|abs|round|sorted|enumerate|zip|map|filter|isinstance|hasattr|getattr|setattr|repr|super)\b/g],
    ['n', /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g],
  ])
}

// ── JavaScript / TypeScript ───────────────────────────────────────────────────
export function highlightJS(code: string): string {
  return highlight(code, [
    ['s', /`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
    ['c', /\/\/[^\n]*|\/\*[\s\S]*?\*\//g],
    ['rx', /\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g],  // regex literals (rough)
    ['k', /\b(?:const|let|var|function|class|if|else|for|while|do|return|import|export|from|as|default|new|this|super|extends|typeof|instanceof|in|of|null|undefined|true|false|try|catch|finally|throw|async|await|yield|break|continue|switch|case|delete|void|static|get|set|type|interface|enum|implements|namespace|declare|readonly|abstract|override)\b/g],
    ['b', /\b(?:console|Math|Object|Array|String|Number|Boolean|Promise|JSON|Date|RegExp|Error|Map|Set|Symbol|parseInt|parseFloat|isNaN|isFinite|setTimeout|setInterval|clearTimeout|clearInterval|fetch|document|window|navigator|localStorage|sessionStorage|alert|confirm|prompt|require|module|process|Buffer)\b/g],
    ['n', /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g],
  ])
}

// ── TypeScript-specific additions (builds on JS) ──────────────────────────────
export function highlightTS(code: string): string {
  return highlight(code, [
    ['s', /`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
    ['c', /\/\/[^\n]*|\/\*[\s\S]*?\*\//g],
    ['k', /\b(?:const|let|var|function|class|if|else|for|while|do|return|import|export|from|as|default|new|this|super|extends|typeof|instanceof|in|of|null|undefined|true|false|try|catch|finally|throw|async|await|yield|break|continue|switch|case|delete|void|static|get|set|type|interface|enum|implements|namespace|declare|readonly|abstract|override|keyof|infer|never|unknown|any|string|number|boolean|bigint|symbol|object)\b/g],
    ['b', /\b(?:console|Math|Object|Array|String|Number|Boolean|Promise|JSON|Date|Map|Set|parseInt|parseFloat|isNaN|isFinite|setTimeout|setInterval|fetch|document|window|process|Buffer|Record|Partial|Required|Readonly|Pick|Omit|Exclude|Extract|NonNullable|ReturnType|InstanceType|Parameters)\b/g],
    ['t', /\b[A-Z][a-zA-Z0-9_]*(?=[\s<>|&,)\]])/g],  // type names
    ['n', /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g],
  ])
}

// ── SQL ───────────────────────────────────────────────────────────────────────
export function highlightSQL(code: string): string {
  return highlight(code, [
    ['s', /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g],
    ['c', /--[^\n]*|\/\*[\s\S]*?\*\//g],
    ['k', /\b(?:SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|VIEW|DATABASE|SCHEMA|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AS|AND|OR|NOT|IN|IS|NULL|BETWEEN|LIKE|EXISTS|UNION|ALL|DISTINCT|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|ASC|DESC|CASE|WHEN|THEN|ELSE|END|WITH|RETURNING|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CHECK|CONSTRAINT|CASCADE|TRIGGER|FUNCTION|PROCEDURE|BEGIN|COMMIT|ROLLBACK|TRANSACTION|IF|DO|DECLARE|RETURNS|LANGUAGE|VOLATILE|STABLE|IMMUTABLE|SECURITY|DEFINER|INVOKER|GRANT|REVOKE|ON|TO|FROM|WITH|OPTION|COLUMN|ROWS|ROW|VALUES|VALUE)\b/gi],
    ['b', /\b(?:COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|CONVERT|NOW|CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|EXTRACT|DATE_PART|TO_CHAR|TO_DATE|CONCAT|SUBSTRING|LENGTH|UPPER|LOWER|TRIM|REPLACE|ROUND|FLOOR|CEIL|ABS|POWER|SQRT|MOD|RANDOM|GEN_RANDOM_UUID|UUID_GENERATE_V4|ARRAY|JSON|JSONB|TEXT|INTEGER|BIGINT|BOOLEAN|TIMESTAMP|TIMESTAMPTZ|DATE|TIME|NUMERIC|DECIMAL|FLOAT|SERIAL|BIGSERIAL)\b/gi],
    ['n', /\b\d+\.?\d*\b/g],
  ])
}

// ── HTML ──────────────────────────────────────────────────────────────────────
export function highlightHTML(code: string): string {
  return highlight(code, [
    ['c', /<!--[\s\S]*?-->/g],
    ['s', /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
    ['k', /<\/?[a-zA-Z][a-zA-Z0-9-]*(?=[\s/>]|$)|<\/?[a-zA-Z][a-zA-Z0-9-]*>/g],
    ['b', /\b[a-zA-Z-]+(?==)/g],       // attribute names
    ['n', /<!DOCTYPE[^>]*>/gi],
    ['t', /&[a-zA-Z0-9#]+;/g],          // HTML entities
  ])
}

// ── CSS ───────────────────────────────────────────────────────────────────────
export function highlightCSS(code: string): string {
  return highlight(code, [
    ['c', /\/\*[\s\S]*?\*\//g],
    ['s', /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
    ['k', /@[a-zA-Z-]+/g],               // @media, @keyframes etc
    ['b', /(?<=:)\s*[a-zA-Z-]+(?=[;\s])/g],  // property values
    ['t', /[.#]?[a-zA-Z_][a-zA-Z0-9_-]*(?=\s*\{)/g],  // selectors
    ['n', /\b\d+\.?\d*(?:px|em|rem|%|vh|vw|vmin|vmax|pt|cm|mm|s|ms|deg|rad|fr|ch|ex)?\b/g],
    ['rx', /(?<=:\s*)[a-zA-Z-]+(?=\s*[;{])/g],  // property names (rough)
  ])
}

// ── Pseudocode ────────────────────────────────────────────────────────────────
export function highlightPseudo(code: string): string {
  return highlight(code, [
    ['c', /\/\/[^\n]*|#[^\n]*/g],
    ['k', /\b(?:IF|ELSE|ELIF|THEN|END|FOR|WHILE|DO|REPEAT|UNTIL|RETURN|FUNCTION|PROCEDURE|BEGIN|INPUT|OUTPUT|PRINT|AND|OR|NOT|TRUE|FALSE|NULL|CLASS|EXTENDS|NEW|CALL|SET|GET|TO|STEP|IN|OF|EACH|WITH|IMPORT|EXPORT|LET|VAR|CONST|IS|EQUAL|GREATER|LESS|THAN)\b/gi],
    ['b', /\b(?:Array|List|Queue|Stack|Map|Set|String|Number|Boolean|Integer|Float|Double|Char|Void|Null)\b/g],
    ['n', /\b\d+\.?\d*\b/g],
    ['s', /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
  ])
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
export type Language = 'python' | 'javascript' | 'typescript' | 'sql' | 'html' | 'css' | 'pseudocode'

export const LANGUAGE_LABELS: Record<Language, string> = {
  python:     'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  sql:        'SQL',
  html:       'HTML',
  css:        'CSS',
  pseudocode: 'Pseudocode',
}

export function highlightCode(code: string, lang: Language): string {
  switch (lang) {
    case 'python':     return highlightPython(code)
    case 'javascript': return highlightJS(code)
    case 'typescript': return highlightTS(code)
    case 'sql':        return highlightSQL(code)
    case 'html':       return highlightHTML(code)
    case 'css':        return highlightCSS(code)
    case 'pseudocode': return highlightPseudo(code)
    default:           return highlightPython(code)
  }
}

// ── Shared CSS for all languages ──────────────────────────────────────────────
// Uses unified hl-* classes so one stylesheet covers every language
export const PYTHON_CSS = `
.hl-k { color:#c678dd; font-weight:600 }   /* keyword */
.hl-s { color:#98c379 }                    /* string */
.hl-n { color:#d19a66 }                    /* number */
.hl-c { color:#7f848e; font-style:italic } /* comment */
.hl-b { color:#61afef }                    /* builtin / function */
.hl-t { color:#e5c07b }                    /* type / class name */
.hl-rx { color:#56b6c2 }                   /* regex / entity */

/* Legacy aliases so old py-* class refs still work */
.py-k { color:#c678dd; font-weight:600 }
.py-s { color:#98c379 }
.py-n { color:#d19a66 }
.py-c { color:#7f848e; font-style:italic }
.py-b { color:#61afef }
`
