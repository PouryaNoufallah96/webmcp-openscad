import { useStore } from '@tanstack/react-store'
import { projectStore } from '@/store/project-store'

const KIND_COLORS: Record<string, string> = {
  load: 'text-[var(--lagoon-deep)]',
  param: 'text-[var(--palm)]',
  source: 'text-amber-700',
  render: 'text-[var(--sea-ink-soft)]',
  export: 'text-[var(--sea-ink-soft)]',
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 1000) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return new Date(ts).toLocaleTimeString()
}

export function HistoryPanel({ className }: { className?: string }) {
  const history = useStore(projectStore, (s) => s.history)
  const recent = history.slice(0, 30)

  return (
    <div className={className}>
      <p className="island-kicker mb-2">
        Activity ({history.length})
      </p>
      {recent.length === 0 ? (
        <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
          No actions yet.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-1 p-0">
          {recent.map((entry, idx) => (
            <li
              key={`${entry.ts}-${idx}`}
              className="flex items-baseline gap-2 text-[11px] leading-snug"
            >
              <code
                className={`shrink-0 rounded bg-[var(--chip-bg)] px-1.5 py-0.5 font-mono uppercase tracking-wide ${
                  KIND_COLORS[entry.kind] ?? 'text-[var(--sea-ink-soft)]'
                }`}
              >
                {entry.kind}
              </code>
              <span className="flex-1 text-[var(--sea-ink)]">
                {entry.summary}
              </span>
              <span className="shrink-0 font-mono text-[var(--sea-ink-soft)]">
                {formatRelative(entry.ts)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
