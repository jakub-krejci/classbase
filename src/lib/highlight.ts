// Python syntax highlighter — shared between editor and viewer
export function highlightPython(raw: string): string {
  // Step 1: escape HTML entities
  let r = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Step 2: use placeholder tokens to avoid re-matching
  const ph: Record<string, string> = {}
  let n = 0
  const save = (cls: string, txt: string): string => {
    const k = `\x00${n++}\x00`
    ph[k] = `<span class="${cls}">${txt}</span>`
    return k
  }

  // Strings first (to protect their content)
  r = r.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, m => save('py-str', m))
  // Comments
  r = r.replace(/(#[^\n]*)/g, m => save('py-cmt', m))
  // Keywords
  r = r.replace(/\b(def|class|if|elif|else|for|while|return|import|from|as|in|not|and|or|is|None|True|False|pass|break|continue|with|try|except|finally|raise|lambda|yield|global|nonlocal|del|assert|async|await)\b/g, m => save('py-kw', m))
  // Built-ins
  r = r.replace(/\b(print|len|range|int|float|str|list|dict|set|tuple|bool|type|input|open|sum|max|min|abs|round|sorted|enumerate|zip|map|filter|isinstance|hasattr|getattr|setattr|repr|vars|dir|super|object)\b/g, m => save('py-bi', m))
  // Class names (CapitalCase)
  r = r.replace(/\b([A-Z][a-zA-Z0-9_]+)\b/g, m => save('py-cls', m))
  // Numbers
  r = r.replace(/\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, m => save('py-num', m))
  // Operators
  r = r.replace(/([+\-*/%=<>!&|^~]+)/g, m => save('py-op', m))

  // Step 3: restore placeholders (must use replaceAll to handle multiple occurrences)
  for (const [k, v] of Object.entries(ph)) {
    r = r.split(k).join(v)
  }
  return r
}

export const PYTHON_CSS = `
.py-kw  { color: #c678dd; font-weight: 500; }
.py-str { color: #98c379; }
.py-num { color: #d19a66; }
.py-cmt { color: #7f848e; font-style: italic; }
.py-bi  { color: #61afef; }
.py-cls { color: #e5c07b; }
.py-op  { color: #56b6c2; }
`
