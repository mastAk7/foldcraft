/**
 * Producer Studio domain model.
 *
 * Kept separate from the consumer model on purpose:
 *  - ProductBrief / Project / DesignVersion / Batch are producer-private working data.
 *  - The only thing that crosses to the consumer is a ProductRecord (the consumer's own type),
 *    derived in passport.ts and published to the registry.
 *  - Estimates and simulation results are derived from parameters and never stored as facts.
 */
import type { DateKind, ProductDate, ProductRecord, StorageKind } from '../../domain/types'
import type { RunRecord } from './runs'

export type Vec3 = [number, number, number]
export interface Dims {
  /** millimetres */
  l: number
  w: number
  h: number
}

/* ------------------------------------------------------------------ brief */

export type ProduceKind = 'strawberry' | 'cherry_tomato' | 'apple' | 'mango' | 'grape' | 'generic'

export type BriefCategory =
  | 'Berries'
  | 'Vine fruit'
  | 'Pome fruit'
  | 'Tropical fruit'
  | 'Vegetables'
  | 'Other food'
  | 'Non-food'

export type Fragility = 'low' | 'medium' | 'high'
export type ColdChain = 'ambient' | 'chilled' | 'frozen'
export type Transport = 'local' | 'regional' | 'long_haul'
export type Ventilation = 'none' | 'standard' | 'high'
export type Cushioning = 'none' | 'pad' | 'cells'

export interface ProductIdentification {
  name: string
  category: BriefCategory
  produce: ProduceKind
  /** Downscaled data URL. Display only; nothing is measured from it. */
  image?: string
  description?: string
  /** Size of one unit (one berry, one apple…), mm. */
  unitDims: Dims
  unitWeightG: number
  unitsPerPackage: number
  /** Production quantity, in packages. */
  batchPackages: number
  fragility: Fragility
}

export interface ProductMetadata {
  productId: string
  brand?: string
  lotId?: string
  packedOn?: string
  dates: ProductDate[]
  shelfLifeDays?: number
  tempMinC?: number
  tempMaxC?: number
  humidityMinPct?: number
  humidityMaxPct?: number
  /** When set, replaces the storage kind derived from the temperature range. */
  storageKindOverride?: StorageKind
  storageText: string
  afterOpeningText?: string
  handling?: string
  coldChain: ColdChain
  warnings?: string
  notes?: string
}

export interface PackagingRequirements {
  template: TemplateId
  permittedMaterials: MaterialId[]
  /** Optional producer target for the outer size, mm. */
  targetDims?: Partial<Dims>
  wallMm?: number
  cushioning: Cushioning
  ventilation: Ventilation
  stackLayers: number
  transport: Transport
  targetCostPerPack?: number
  monoMaterial: boolean
  preferFibre: boolean
  constraints?: string
  remarks?: string
}

export interface ProductBrief {
  identification: ProductIdentification
  metadata: ProductMetadata
  requirements: PackagingRequirements
}

/* ------------------------------------------------------------------ design */

export type TemplateId = 'folding_carton' | 'produce_tray' | 'clamshell' | 'compartment_tray'

export type MaterialId = 'fbb_board' | 'recycled_board' | 'corrugated_e' | 'moulded_pulp' | 'rpet' | 'pet'

export type Insert = 'none' | 'pad' | 'cells'

interface CommonParams {
  /** Outer length (x), width (z), height (y), mm. */
  length: number
  width: number
  height: number
  wallMm: number
  material: MaterialId
  color: string
  accent: string
}

export interface CartonParams extends CommonParams {
  template: 'folding_carton'
  tuckMm: number
  window: boolean
  insert: Insert
}

export interface TrayParams extends CommonParams {
  template: 'produce_tray'
  draftDeg: number
  ventCount: number
  ventDiaMm: number
  cornerRibs: boolean
  filmLid: boolean
  insert: Exclude<Insert, 'cells'>
}

export interface ClamshellParams extends CommonParams {
  template: 'clamshell'
  draftDeg: number
  ventCount: number
  ventDiaMm: number
  cornerRibs: boolean
  lidHeightPct: number
  insert: Exclude<Insert, 'cells'>
}

export interface CompartmentParams extends CommonParams {
  template: 'compartment_tray'
  draftDeg: number
  ventCount: number
  ventDiaMm: number
  cornerRibs: boolean
  cellsX: number
  cellsY: number
  filmLid: boolean
}

export type DesignParams = CartonParams | TrayParams | ClamshellParams | CompartmentParams

export interface ParamChange {
  key: string
  from: unknown
  to: unknown
  reason: string
}

export type VersionSource = 'generated' | 'manual' | 'assistant' | 'recommendation' | 'revert'

export interface DesignVersion {
  id: string
  n: number
  parentId?: string
  params: DesignParams
  label: string
  source: VersionSource
  changeLog: ParamChange[]
  createdAt: string
  final: boolean
}

/* ------------------------------------------------------------------ geometry */

export type ComponentId = 'body' | 'lid' | 'window' | 'film' | 'insert' | 'dividers'
export type PartKind = 'panel' | 'flap' | 'base' | 'wall' | 'rim' | 'lid' | 'divider' | 'insert' | 'film' | 'latch' | 'glue'

export type Hole = { kind: 'circle'; x: number; y: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number }

/**
 * A flat part. Its outline lives in a local 2D frame: x along u, y along v (mm), y = 0 being the hinge/attachment line.
 * The world placement is an orthonormal basis (u, v, n = u × v) at `origin`; thickness is centred on the plane.
 */
export interface Plate {
  id: string
  component: ComponentId
  kind: PartKind
  outline: [number, number][]
  holes: Hole[]
  thickness: number
  origin: Vec3
  u: Vec3
  v: Vec3
  /** Unit direction parts move along in the exploded view. */
  explode: Vec3
  /** Rendering hint: transparent film or window. */
  clear?: boolean
}

export interface Cell {
  /** Centre of the cell floor, package coordinates (mm). */
  x: number
  z: number
  l: number
  w: number
}

export interface UnitPlacement {
  x: number
  y: number
  z: number
}

export interface Arrangement {
  cols: number
  rows: number
  layers: number
  capacity: number
  fits: boolean
  placements: UnitPlacement[]
  /** Free space around a unit, per side, mm. */
  clearance: { x: number; y: number; z: number }
  voidPct: number
  /** Units are turned 90° (length across the package width). */
  rotated: boolean
  message?: string
}

export interface PackageComponentInfo {
  id: ComponentId
  name: string
  material: MaterialId | 'pet_film' | 'pp_film'
  areaMm2: number
  thicknessMm: number
}

export interface PackageGeometry {
  plates: Plate[]
  outer: Dims
  /** Usable inner floor and height, mm. */
  inner: Dims
  cells: Cell[]
  components: PackageComponentInfo[]
  /** Flat blank for templates that genuinely have one (folding carton). */
  dieline?: Dieline
  arrangement: Arrangement
  /** Height of the usable floor above the package base, mm. */
  floorY: number
}

export interface DielinePanel {
  id: string
  /** Absolute polygon in blank coordinates, mm (x right, y down). */
  polygon: [number, number][]
}

export interface Dieline {
  panels: DielinePanel[]
  width: number
  height: number
  netAreaMm2: number
  creases: [[number, number], [number, number]][]
  cuts: [[number, number], [number, number]][]
}

/* ------------------------------------------------------------------ estimates & sims */

export type ResultMethod = 'calculated' | 'simplified_estimate' | 'simplified_motion_model' | 'illustrative'
export type Risk = 'low' | 'moderate' | 'high'

export interface Metric {
  key: string
  label: string
  value: number
  unit: string
  digits?: number
  method: ResultMethod
  /** How the value is obtained, in plain words (equation or model output). */
  basis?: string
}

export interface MaterialAssumption {
  pricePerKg: number
  convertingPerPack: number
}

export type AssumptionOverrides = Partial<Record<MaterialId, Partial<MaterialAssumption>>>

export interface CostEstimate {
  method: ResultMethod
  netAreaM2: number
  blankAreaM2: number
  massG: number
  blankMassG: number
  utilisationPct: number
  trimWastePct: number
  materialCost: number
  convertingCost: number
  perPack: number
  perBatch: number
  wastePerBatchKg: number
  components: { name: string; material: string; massG: number }[]
  fibreSharePct: number
  monoMaterial: boolean
  assumptions: string[]
}

export type SimTest = 'drop' | 'stack' | 'vibration'
export type DropOrientation = 'bottom' | 'side' | 'corner'
export type VibrationProfile = 'smooth' | 'normal' | 'rough'

export interface DropSettings {
  heightCm: number
  orientation: DropOrientation
}
export interface StackSettings {
  layers: number
  offsetMm: number
}
export interface VibrationSettings {
  profile: VibrationProfile
  durationS: number
}

export interface Suggestion {
  id: string
  title: string
  reason: string
  /** Partial parameter patch. May include a template switch. */
  patch: Partial<Record<string, unknown>>
}

export interface SimResult {
  test: SimTest
  method: ResultMethod
  headline: string
  risk: Risk
  metrics: Metric[]
  concerns: string[]
  failureModes: string[]
  suggestions: Suggestion[]
  assumptions: string[]
  limitations: string[]
}

/** Model traces are SI (m, s, m/s²); the UI converts for display. */
export interface DropTrace {
  /** seconds since release */
  t: number[]
  /** height of the package's lowest point above the floor, m (negative while the floor contact is compressed) */
  y: number[]
  /** unit displacement relative to the package along the impact axis, m (positive = towards the impact face) */
  rel: number[]
  /** package deceleration from the floor contact, m/s² */
  acc: number[]
  /** net support force on the tracked unit ÷ its mass, m/s² (positive = pushed away from the impact face) */
  unitAcc: number[]
  /** unit contact at this sample: 0 none, 1 pressed on its support, 2 against the opposite boundary (lid/wall) */
  contact: number[]
  impactIndex: number
}

export interface VibrationTrace {
  t: number[]
  /** vertical and lateral (package x) deck displacement, m */
  base: number[]
  baseLat: number[]
  /** unit displacement inside its cell, m: lateral (package x) from the cell centre, and lift above its resting contact */
  px: number[]
  py: number[]
  /** contacts since the previous sample, bit mask: 1 wall (+x), 2 wall (−x), 4 lid, 8 airborne */
  contact: number[]
}

/* ------------------------------------------------------------------ project */

export type BriefStage = 'A' | 'B' | 'C' | 'review'

export interface Batch {
  id: string
  lotCode: string
  packedOn?: string
  dates: ProductDate[]
  designVersionId: string
  recordVersion: number
  createdAt: string
}

export interface PublishedRef {
  recordVersion: number
  publishedAt: string
  lotCode?: string
  /** JSON of the published ProductRecord, used to detect unpublished changes. */
  fingerprint: string
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  briefStage: BriefStage
  briefComplete: boolean
  brief: ProductBrief
  versions: DesignVersion[]
  currentVersionId?: string
  /** Version ids that have been through the simulation lab (any test). */
  testedVersionIds: string[]
  /** Completed Simulation Lab runs with their exact inputs (newest first, capped). */
  runs?: RunRecord[]
  batches: Batch[]
  assumptions: AssumptionOverrides
  published?: PublishedRef
  seed?: boolean
}

export type ProjectStatus = 'brief' | 'designing' | 'tested' | 'final' | 'published'

/** Re-exported for convenience in the studio. */
export type { DateKind, ProductDate, ProductRecord, StorageKind }
