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
  const step = param.step ?? (hasRange ? (param.max! - param.min!) / 100 : 1)

  return (
    <div className="flex items-center gap-2">
      {hasRange ? (
        <input
          type="range"
          className="flex-1"
          min={param.min}
          max={param.max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : null}
      <input
        type="number"
        className="w-20 rounded-md border border-[var(--line)] bg-[var(--chip-bg)] px-2 py-1 text-right font-mono text-xs text-[var(--sea-ink)]"
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
      className="w-full rounded-md border border-[var(--line)] bg-[var(--chip-bg)] px-2 py-1 text-xs text-[var(--sea-ink)]"
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

function BooleanControl({
  value,
  onChange,
}: {
  param: ParameterBoolean
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{value ? 'true' : 'false'}</span>
    </label>
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
      className="w-full rounded-md border border-[var(--line)] bg-[var(--chip-bg)] px-2 py-1 font-mono text-xs text-[var(--sea-ink)]"
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

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <code className="text-xs font-semibold text-[var(--sea-ink)]">
          {param.name}
        </code>
        {isOverridden ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] uppercase tracking-wide text-[var(--lagoon-deep)] hover:underline"
          >
            reset
          </button>
        ) : null}
      </div>
      {param.description ? (
        <p className="m-0 text-[11px] text-[var(--sea-ink-soft)]">
          {param.description}
        </p>
      ) : null}
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
      {param.kind === 'boolean' ? (
        <BooleanControl
          param={param}
          value={Boolean(value)}
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

export function ParameterPanel({ className }: { className?: string }) {
  const parameters = useStore(projectStore, (s) => s.parameters)
  const overrides = useStore(projectStore, (s) => s.overrides)
  const overrideCount = Object.keys(overrides).length

  if (parameters.length === 0) {
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
      <div className="mb-2 flex items-center justify-between">
        <p className="island-kicker">
          Parameters ({parameters.length})
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
      <div className="flex flex-col gap-2">
        {parameters.map((param) => (
          <ParameterRow key={param.name} param={param} />
        ))}
      </div>
    </div>
  )
}
