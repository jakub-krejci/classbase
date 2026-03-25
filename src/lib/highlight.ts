// Python syntax highlighter — safe placeholder approach (no null bytes)
export function highlightPython(raw: string): string {
  // Escape HTML
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // We do single-pass replacement using a tagged approach:
  // Split into segments: [literal, token, literal, token, ...]
  // Then wrap tokens in spans at the end.

  // Order of patterns (most specific first):
  const patterns: [string, RegExp][] = [
    ['py-str', /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
    ['py-cmt', /#[^\n]*/g],
    ['py-kw',  /\b(?:def|class|if|elif|else|for|while|return|import|from|as|in|not|and|or|is|None|True|False|pass|break|continue|with|try|except|finally|raise|lambda|yield|global|nonlocal|del|assert|async|await)\b/g],
    ['py-bi',  /\b(?:print|len|range|int|float|str|list|dict|set|tuple|bool|type|input|open|sum|max|min|abs|round|sorted|enumerate|zip|map|filter|isinstance|hasattr|getattr|setattr|repr)\b/g],
    ['py-num', /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g],
  ]

  // Build a combined regex with named groups isn't feasible cross-browser, so we do
  // sequential non-overlapping replacement using a segment array.
  
  // Represent as array of {text, cls} where cls='' means literal
  type Seg = { text: string; cls: string }
  let segments: Seg[] = [{ text: escaped, cls: '' }]

  for (const [cls, regex] of patterns) {
    const next: Seg[] = []
    for (const seg of segments) {
      if (seg.cls !== '') {
        // Already classified — keep as-is
        next.push(seg)
        continue
      }
      // Split this literal segment by the pattern
      const text = seg.text
      let lastIndex = 0
      regex.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = regex.exec(text)) !== null) {
        if (m.index > lastIndex) {
          next.push({ text: text.slice(lastIndex, m.index), cls: '' })
        }
        next.push({ text: m[0], cls })
        lastIndex = m.index + m[0].length
      }
      if (lastIndex < text.length) {
        next.push({ text: text.slice(lastIndex), cls: '' })
      }
    }
    segments = next
  }

  return segments
    .map(seg => seg.cls ? `<span class="${seg.cls}">${seg.text}</span>` : seg.text)
    .join('')
}

export const PYTHON_CSS = `
.py-kw  { color: #c678dd; font-weight: 500; }
.py-str { color: #98c379; }
.py-num { color: #d19a66; }
.py-cmt { color: #7f848e; font-style: italic; }
.py-bi  { color: #61afef; }
`
