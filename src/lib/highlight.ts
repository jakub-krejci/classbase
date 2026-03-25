// Segment-based Python highlighter — no placeholder corruption
export function highlightPython(code: string): string {
  type Seg = { t: string; c: string }
  let segs: Seg[] = [{ t: code, c: '' }]

  const rules: [string, RegExp][] = [
    ['s', /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g],
    ['c', /#[^\n]*/g],
    ['k', /\b(?:def|class|if|elif|else|for|while|return|import|from|as|in|not|and|or|is|None|True|False|pass|break|continue|with|try|except|finally|raise|lambda|yield|global|nonlocal|del|assert|async|await)\b/g],
    ['b', /\b(?:print|len|range|int|float|str|list|dict|set|tuple|bool|type|input|open|sum|max|min|abs|round|sorted|enumerate|zip|map|filter|isinstance|hasattr|getattr|setattr|repr|super)\b/g],
    ['n', /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g],
  ]

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

  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const cls: Record<string,string> = { s:'py-s', c:'py-c', k:'py-k', b:'py-b', n:'py-n' }
  return segs.map(s => s.c ? `<span class="${cls[s.c]}">${esc(s.t)}</span>` : esc(s.t)).join('')
}

export const PYTHON_CSS = `
.py-k { color:#c678dd; font-weight:600 }
.py-s { color:#98c379 }
.py-n { color:#d19a66 }
.py-c { color:#7f848e; font-style:italic }
.py-b { color:#61afef }
`
