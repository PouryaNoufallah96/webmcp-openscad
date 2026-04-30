import Editor, { type OnMount } from '@monaco-editor/react'
import { useStore } from '@tanstack/react-store'
import { useEffect, useRef, useState } from 'react'
import { projectActions, projectStore } from '@/store/project-store'

const COMMIT_DEBOUNCE_MS = 400

export function SourceEditor({ className }: { className?: string }) {
  const sourceText = useStore(projectStore, (s) => s.source?.text ?? '')
  const sourceName = useStore(projectStore, (s) => s.source?.name ?? null)
  const [draft, setDraft] = useState<string>(sourceText)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommitted = useRef<string>(sourceText)

  // Sync editor content if the source changes externally
  // (e.g. agent calls edit_source or revert_source).
  useEffect(() => {
    if (sourceText !== lastCommitted.current) {
      lastCommitted.current = sourceText
      setDraft(sourceText)
    }
  }, [sourceText])

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [])

  const onChange = (value: string | undefined) => {
    const next = value ?? ''
    setDraft(next)
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      if (next === lastCommitted.current) return
      lastCommitted.current = next
      projectActions.editSource(next, 'edited in source panel')
      projectActions.reparseParameters()
    }, COMMIT_DEBOUNCE_MS)
  }

  const handleMount: OnMount = (editor, monaco) => {
    monaco.languages.register({ id: 'scad' })
    monaco.languages.setMonarchTokensProvider('scad', {
      tokenizer: {
        root: [
          [
            /\b(if|else|for|let|each|module|function|true|false|undef|use|include|return)\b/,
            'keyword',
          ],
          [
            /\b(cube|sphere|cylinder|polyhedron|circle|square|polygon|translate|rotate|scale|union|difference|intersection|hull|minkowski|linear_extrude|rotate_extrude|color|render|projection|mirror|offset|resize|surface|text|children|echo|version|abs|sin|cos|tan|asin|acos|atan|atan2|len|min|max|pow|sqrt|exp|log|ln|round|ceil|floor|sign|str|chr|ord|search|concat|reverse|cross|norm|rands|lookup)\b/,
            'predefined',
          ],
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@blockComment'],
          [/"/, 'string', '@string'],
          [/-?\d+(\.\d+)?/, 'number'],
          [/[A-Za-z_][A-Za-z0-9_]*/, 'identifier'],
          [/[{}()\[\]]/, '@brackets'],
          [/[<>]=?|==|!=|&&|\|\||[+\-*/%=]/, 'operator'],
        ],
        blockComment: [
          [/[^*/]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[*/]/, 'comment'],
        ],
        string: [
          [/[^\\"]+/, 'string'],
          [/\\./, 'string.escape'],
          [/"/, 'string', '@pop'],
        ],
      },
    })
    monaco.editor.setModelLanguage(editor.getModel()!, 'scad')
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="island-kicker">Source ({sourceName ?? 'no source'})</p>
        <p className="m-0 text-[10px] font-mono text-[var(--sea-ink-soft)]">
          {draft.length.toLocaleString()} chars · auto-commits 400ms after typing
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--line)]">
        <Editor
          height="320px"
          defaultLanguage="scad"
          value={draft}
          onChange={onChange}
          onMount={handleMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            tabSize: 2,
          }}
        />
      </div>
    </div>
  )
}
