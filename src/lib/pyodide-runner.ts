// Pyodide Python runner — loads once, reuses the same instance
let pyodideInstance: any = null
let pyodideLoading: Promise<any> | null = null

export async function loadPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance
  if (pyodideLoading) return pyodideLoading

  pyodideLoading = (async () => {
    try {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js'
      document.head.appendChild(script)
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Pyodide'))
      })
      const py = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
        stdout: () => {},
        stderr: () => {},
      })
      pyodideInstance = py
      return py
    } catch (e) {
      pyodideLoading = null
      throw e
    }
  })()

  return pyodideLoading
}

export type RunResult = {
  output: string
  error: string | null
  images: string[]
}

export async function runPython(
  code: string,
  onOutput: (line: string) => void,
  onStatus?: (msg: string) => void
): Promise<RunResult> {
  const lines: string[] = []
  const images: string[] = []

  try {
    const py = await loadPyodide()

    py.setStdout({ batched: (s: string) => { lines.push(s); onOutput(s) } })
    py.setStderr({ batched: (s: string) => { lines.push('⚠ ' + s); onOutput('⚠ ' + s) } })

    // loadPackagesFromImports scans the code for import statements and
    // downloads any Pyodide-bundled packages that aren't loaded yet.
    // This is the official API — handles matplotlib, numpy, pandas, scipy etc.
    try {
      onStatus?.('Loading packages…')
      await py.loadPackagesFromImports(code)
      onStatus?.('')
    } catch {
      // Non-fatal: package may already be loaded or not available
    }

    // Matplotlib backend + plt.show() capture shim
    const matplotlibShim = `
_cb_figures = []

def _cb_capture_show(*args, **kwargs):
    import io, base64
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as _plt
    buf = io.BytesIO()
    _plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    buf.seek(0)
    _cb_figures.append(base64.b64encode(buf.read()).decode('utf-8'))
    _plt.clf()
    _plt.close('all')

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.show = _cb_capture_show
except ImportError:
    pass
`
    try { await py.runPythonAsync(matplotlibShim) } catch {}

    // Override input() to use browser prompt() — works synchronously from Python's perspective
    const inputShim = `
import sys
from js import prompt as _js_prompt

def input(msg=''):
    result = _js_prompt(str(msg))
    if result is None:
        raise EOFError('input() cancelled by user')
    print(str(msg) + str(result))
    return str(result)

__builtins__['input'] = input
`
    try { await py.runPythonAsync(inputShim) } catch {}

    // Run user code
    await py.runPythonAsync(code)

    // Capture any figures the user forgot to show()
    try {
      await py.runPythonAsync(`
try:
    import matplotlib.pyplot as plt
    if plt.get_fignums():
        _cb_capture_show()
except Exception:
    pass
`)
    } catch {}

    // Collect captured figures
    try {
      const figs = py.globals.get('_cb_figures')
      if (figs) {
        const arr: string[] = figs.toJs ? figs.toJs() : Array.from(figs)
        images.push(...arr)
      }
    } catch {}

    return {
      output: lines.join('\n') || (images.length ? '' : '(no output)'),
      error: null,
      images,
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    // Clean up Pyodide traceback noise
    const clean = msg.includes('PythonError')
      ? msg
          .split('\n')
          .filter((l: string) =>
            !l.includes('File "/lib/python') &&
            !l.includes('_pyodide') &&
            !l.includes('eval_code_async') &&
            !l.includes('run_async') &&
            !l.includes('coroutine =') &&
            l.trim() !== ''
          )
          .join('\n')
          .trim()
      : msg
    return { output: lines.join('\n'), error: clean, images }
  }
}
