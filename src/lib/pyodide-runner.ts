// Pyodide Python runner — loads once, reuses the same instance
// Falls back to the simple JS evaluator if Pyodide fails to load

let pyodideInstance: any = null
let pyodideLoading: Promise<any> | null = null

export async function loadPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance
  if (pyodideLoading) return pyodideLoading

  pyodideLoading = (async () => {
    try {
      // Load from CDN
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

export async function runPython(code: string, onOutput: (line: string) => void): Promise<{ output: string; error: string | null }> {
  const lines: string[] = []

  try {
    const py = await loadPyodide()

    // Redirect stdout/stderr
    py.setStdout({ batched: (s: string) => { lines.push(s); onOutput(s) } })
    py.setStderr({ batched: (s: string) => { lines.push('⚠ ' + s); onOutput('⚠ ' + s) } })

    await py.runPythonAsync(code)
    return { output: lines.join('\n') || '(no output)', error: null }
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    // Format Python tracebacks nicely
    const clean = msg.includes('PythonError') ? msg.split('\n').filter((l: string) => !l.startsWith('  File "<exec>')).join('\n') : msg
    return { output: lines.join('\n'), error: clean }
  }
}
