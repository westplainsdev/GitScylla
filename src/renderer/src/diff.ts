export type DiffLineType = 'add' | 'del' | 'ctx' | 'hunk' | 'meta' | 'binary'

export interface DiffLine {
  type: DiffLineType
  oldNo: number | null
  newNo: number | null
  content: string
}

/** parses unified diff text into renderable lines with old/new line numbers */
export function parseDiff(text: string): DiffLine[] {
  if (/^Binary file|^GIT binary patch/m.test(text)) {
    return [{ type: 'binary', oldNo: null, newNo: null, content: 'Binary file — no preview' }]
  }

  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  let inHunks = false

  for (const raw of text.split('\n')) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      inHunks = true
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      out.push({ type: 'hunk', oldNo: null, newNo: null, content: raw })
      continue
    }
    if (!inHunks) {
      if (raw.startsWith('diff --git') || raw.startsWith('index ') || raw.startsWith('new file') ||
          raw.startsWith('deleted file') || raw.startsWith('old mode') || raw.startsWith('new mode') ||
          raw.startsWith('similarity') || raw.startsWith('rename')) {
        continue // skip git header noise; path is shown in the drawer title
      }
      out.push({ type: 'meta', oldNo: null, newNo: null, content: raw })
      continue
    }
    if (raw.startsWith('\\')) {
      out.push({ type: 'meta', oldNo: null, newNo: null, content: raw })
      continue
    }
    const marker = raw[0]
    const content = raw.slice(1)
    if (marker === '+') {
      out.push({ type: 'add', oldNo: null, newNo: newNo++, content })
    } else if (marker === '-') {
      out.push({ type: 'del', oldNo: oldNo++, newNo: null, content })
    } else {
      out.push({ type: 'ctx', oldNo: oldNo++, newNo: newNo++, content })
    }
  }
  return out.filter((l) => l.type !== 'meta' || l.content.trim() !== '')
}
