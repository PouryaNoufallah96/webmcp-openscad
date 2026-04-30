import { useStore } from '@tanstack/react-store'
import { projectActions, projectStore } from '@/store/project-store'
import type {
  Parameter,
  ParameterBoolean,
  ParameterEnum,
  ParameterNumber,
  ParameterString,
  ParameterValue,
} from '@/scad/types'

function effectiveValue(
  param: Parameter,
  overrides: Record<string, ParameterValue>,
): ParameterValue {
  if (param.name in overrides) return overrides[param.name]
  return param.value
}

function InfoIcon({ description }: { description: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        tabIndex={0}
        aria-label={description}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--chip-bg)] text-[10px] font-bold text-[var(--sea-ink-soft)] transition hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-20 mt-2 w-72 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-2 text-[11px] leading-snug text-[var(--sea-ink)] opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {description}
      </span>
    </span>
  )
}

function clampStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 1
  return step
}

function roundToStep(value: number, step: number): number {
  const decimals = (step.toString().split('.')[1] ?? '').length
  return Number(value.toFixed(decimals))
}

function NumberControl({
  param,
  value,
  onChange,
}: {
  param: ParameterNumber
  value: number
  onChange: (v: number) => void
}) {
  const hasRange = typeof param.min === 'number' && typeof param.max === 'number'
  const rawStep = param.step ?? (hasRange ? (param.max! - param.min!) / 100 : 1)
  const step = clampStep(rawStep)

  const clamp = (v: number) => {
    let next = v
    if (typeof param.min === 'number') next = Math.max(param.min, next)
    if (typeof param.max === 'number') next = Math.min(param.max, next)
    return roundToStep(next, step)
  }

  const dec = () => onChange(clamp(value - step))
  const inc = () => onChange(clamp(value + step))

  if (hasRange) {
    return (
      <div className="flex items-center gap-3 rounded-b-lg border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
        <input
          type="range"
          className="min-w-0 flex-1 accent-[var(--lagoon-deep)]"
          min={param.min}
          max={param.max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          className="w-20 min-w-0 rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-right font-mono text-sm text-[var(--sea-ink)] outline-none"
          min={param.min}
          max={param.max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex items-stretch overflow-hidden rounded-b-lg border border-[var(--line)] bg-[var(--chip-bg)]">
      <input
        type="number"
        className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm text-[var(--sea-ink)] outline-none"
        min={param.min}
        max={param.max}
        step={step}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
      <button
        type="button"
        onClick={dec}
        aria-label="decrement"
        className="flex w-10 items-center justify-center border-l border-[var(--line)] text-base font-bold text-[var(--sea-ink)] transition hover:bg-[var(--surface-strong)]"
      >
        −
      </button>
      <button
        type="button"
        onClick={inc}
        aria-label="increment"
        className="flex w-10 items-center justify-center border-l border-[var(--line)] text-base font-bold text-[var(--sea-ink)] transition hover:bg-[var(--surface-strong)]"
      >
        +
      </button>
    </div>
  )
}

function EnumControl({
  param,
  value,
  onChange,
}: {
  param: ParameterEnum
  value: string | number
  onChange: (v: string | number) => void
}) {
  return (
    <select
      className="w-full rounded-b-lg border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 text-sm text-[var(--sea-ink)]"
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value
        const opt = param.options.find((o) => String(o.value) === raw)
        if (opt) onChange(opt.value)
      }}
    >
      {param.options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function BooleanToggle({
  value,
  onChange,
}: {
  param: ParameterBoolean
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition ' +
        (value
          ? 'border-transparent bg-[var(--lagoon-deep)]'
          : 'border-[var(--line)] bg-[var(--chip-bg)]')
      }
    >
      <span
        className={
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition ' +
          (value ? 'translate-x-5' : 'translate-x-0.5')
        }
      />
    </button>
  )
}

function StringControl({
  value,
  onChange,
}: {
  param: ParameterString
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="text"
      className="w-full rounded-b-lg border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 font-mono text-sm text-[var(--sea-ink)]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function ParameterRow({ param }: { param: Parameter }) {
  const overrides = useStore(projectStore, (s) => s.overrides)
  const isOverridden = param.name in overrides
  const value = effectiveValue(param, overrides)

  const onSet = (v: ParameterValue) => projectActions.setOverride(param.name, v)
  const onReset = () => projectActions.setOverride(param.name, undefined)

  const isBoolean = param.kind === 'boolean'
  const hasControlBox = !isBoolean

  const titleBarClasses = hasControlBox
    ? 'flex items-center justify-between gap-2 rounded-t-md border border-b-0 border-[var(--line)] bg-[var(--chip-bg)] px-3 py-1.5'
    : 'flex items-center justify-between gap-2 rounded-md border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-1.5'

  return (
    <div className="flex flex-col pl-4">
      <div className={titleBarClasses}>
        <span
          className="truncate font-mono text-sm font-semibold text-[var(--sea-ink)]"
          title={param.description ?? undefined}
        >
          {param.name}
        </span>
        <div className="flex flex-shrink-0 items-center gap-3">
          {isOverridden ? (
            <button
              type="button"
              onClick={onReset}
              className="text-[10px] uppercase tracking-wide text-[var(--lagoon-deep)] hover:underline"
            >
              reset
            </button>
          ) : null}
          {isBoolean ? (
            <BooleanToggle
              param={param}
              value={Boolean(value)}
              onChange={onSet}
            />
          ) : param.description ? (
            <InfoIcon description={param.description} />
          ) : null}
        </div>
      </div>
      {param.kind === 'number' ? (
        <NumberControl
          param={param}
          value={typeof value === 'number' ? value : Number(value)}
          onChange={onSet}
        />
      ) : null}
      {param.kind === 'enum' ? (
        <EnumControl
          param={param}
          value={value as string | number}
          onChange={onSet}
        />
      ) : null}
      {param.kind === 'string' ? (
        <StringControl
          param={param}
          value={String(value)}
          onChange={onSet}
        />
      ) : null}
    </div>
  )
}

const UNGROUPED_KEY = '__ungrouped__'

function groupParameters(parameters: Parameter[]): Array<{
  key: string
  label: string | null
  items: Parameter[]
}> {
  const order: string[] = []
  const buckets = new Map<string, Parameter[]>()
  for (const p of parameters) {
    if (p.group === 'Hidden') continue
    const key = p.group ?? UNGROUPED_KEY
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(p)
  }
  return order.map((key) => ({
    key,
    label: key === UNGROUPED_KEY ? null : key,
    items: buckets.get(key)!,
  }))
}

export function ParameterPanel({ className }: { className?: string }) {
  const parameters = useStore(projectStore, (s) => s.parameters)
  const overrides = useStore(projectStore, (s) => s.overrides)
  const overrideCount = Object.keys(overrides).length

  const groups = groupParameters(parameters)
  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0)

  if (visibleCount === 0) {
    return (
      <div className={className}>
        <p className="text-xs text-[var(--sea-ink-soft)]">
          No customizable parameters in this source.
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <p className="island-kicker">
          Parameters ({visibleCount})
        </p>
        {overrideCount > 0 ? (
          <button
            type="button"
            onClick={() => projectActions.resetOverrides()}
            className="text-[10px] uppercase tracking-wide text-[var(--lagoon-deep)] hover:underline"
          >
            reset all ({overrideCount})
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            {group.label ? (
              <h3 className="m-0 border-b border-[var(--line)] pb-2 text-base font-bold tracking-tight text-[var(--sea-ink)]">
                {group.label}
              </h3>
            ) : null}
            <div className="flex flex-col gap-4">
              {group.items.map((param) => (
                <ParameterRow key={param.name} param={param} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
