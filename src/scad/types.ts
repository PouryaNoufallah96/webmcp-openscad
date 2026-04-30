export type ParameterNumber = {
  kind: 'number'
  name: string
  description?: string
  group?: string
  value: number
  min?: number
  max?: number
  step?: number
}

export type ParameterEnumOption = {
  label: string
  value: string | number
}

export type ParameterEnum = {
  kind: 'enum'
  name: string
  description?: string
  group?: string
  value: string | number
  options: Array<ParameterEnumOption>
}

export type ParameterBoolean = {
  kind: 'boolean'
  name: string
  description?: string
  group?: string
  value: boolean
}

export type ParameterString = {
  kind: 'string'
  name: string
  description?: string
  group?: string
  value: string
}

export type Parameter =
  | ParameterNumber
  | ParameterEnum
  | ParameterBoolean
  | ParameterString

export type ParameterValue = number | string | boolean

export type ScadSource = {
  name: string
  source: string
  origin: string
}

export type Adapter = {
  name: string
  match: (url: string) => boolean
  fetch: (url: string) => Promise<ScadSource>
}
