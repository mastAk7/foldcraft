import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { safeStorage } from '../services/persistence'
import { registry, type PublishedPassport } from '../services/registry'
import { analyse } from './domain/analysis'
import { validateParams } from './domain/params'
import { deriveRecord, fingerprint, passportSummary } from './domain/passport'
import { currentVersion, emptyBrief, briefFor, generateParams, makeVersion, uid } from './domain/project'
import { sampleProjects } from './domain/seed'
import { breakMyDesign } from './domain/sims'
import type { AssumptionOverrides, Batch, BriefStage, DesignParams, MaterialId, ParamChange, ProduceKind, ProductBrief, Project, VersionSource } from './domain/types'

/**
 * Producer Studio state: saved projects (brief, design versions, batches) persisted in localStorage.
 * Published records go to the separate shared registry (services/registry.ts), never from here directly.
 */
export const STUDIO_KEY = 'foldcraft:studio'
const STUDIO_VERSION = 1

interface Persisted {
  projects: Project[]
  /** Unsaved parameter edits per project (the working copy). */
  drafts: Record<string, DesignParams>
  seeded: boolean
}

interface Actions {
  createProject(kind?: ProduceKind): string
  deleteProject(id: string): void
  updateBrief(id: string, fn: (b: ProductBrief) => ProductBrief): void
  setBriefStage(id: string, stage: BriefStage): void
  completeBrief(id: string): void
  generateDesign(id: string): void
  setDraft(id: string, params: DesignParams | null): void
  commitVersion(id: string, params: DesignParams, label: string, source: VersionSource, changeLog: ParamChange[]): string | null
  setCurrentVersion(id: string, versionId: string): void
  markTested(id: string, versionId: string): void
  setFinal(id: string, versionId: string, final: boolean): void
  setAssumption(id: string, material: MaterialId, key: 'pricePerKg' | 'convertingPerPack', value: number | undefined): void
  publish(id: string, batch: Omit<Batch, 'id' | 'recordVersion' | 'createdAt' | 'designVersionId'>): { ok: true; recordVersion: number } | { ok: false; reason: string }
  loadSamples(): void
  storageError: string | null
}

export type StudioState = Persisted & Actions

const now = () => new Date().toISOString()

function touch(p: Project, patch: Partial<Project>): Project {
  return { ...p, ...patch, updatedAt: now() }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Keep only structurally sound projects from storage; a bad save must never break the studio. */
export function sanitizeStudio(raw: unknown): Persisted {
  if (!isObj(raw)) return { projects: [], drafts: {}, seeded: false }
  const projects = Array.isArray(raw.projects)
    ? (raw.projects as unknown[]).filter((p): p is Project => {
        if (!isObj(p) || typeof p.id !== 'string' || !isObj(p.brief) || !Array.isArray(p.versions)) return false
        const b = p.brief as Record<string, unknown>
        return isObj(b.identification) && isObj(b.metadata) && isObj(b.requirements)
      })
      .map((p) => ({
        ...p,
        versions: p.versions.filter((v) => isObj(v) && isObj(v.params) && validateParams(v.params).length === 0),
        testedVersionIds: Array.isArray(p.testedVersionIds) ? p.testedVersionIds : [],
        batches: Array.isArray(p.batches) ? p.batches : [],
        assumptions: isObj(p.assumptions) ? p.assumptions : {},
      }))
    : []
  const drafts: Record<string, DesignParams> = {}
  if (isObj(raw.drafts)) for (const [k, v] of Object.entries(raw.drafts)) if (isObj(v) && validateParams(v as unknown as DesignParams).length === 0) drafts[k] = v as unknown as DesignParams
  return { projects, drafts, seeded: raw.seeded === true }
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => {
      const update = (id: string, fn: (p: Project) => Project) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? fn(p) : p)) }))
      const find = (id: string) => get().projects.find((p) => p.id === id)

      return {
        projects: [],
        drafts: {},
        seeded: false,
        storageError: null,

        createProject(kind) {
          const brief = kind ? briefFor(kind) : emptyBrief()
          const p: Project = {
            id: uid(),
            name: brief.identification.name || 'Untitled product',
            createdAt: now(),
            updatedAt: now(),
            briefStage: 'A',
            briefComplete: false,
            brief,
            versions: [],
            testedVersionIds: [],
            batches: [],
            assumptions: {},
          }
          set((s) => ({ projects: [p, ...s.projects] }))
          return p.id
        },

        deleteProject(id) {
          set((s) => {
            const drafts = { ...s.drafts }
            delete drafts[id]
            return { projects: s.projects.filter((p) => p.id !== id), drafts }
          })
        },

        updateBrief(id, fn) {
          update(id, (p) => {
            const brief = fn(p.brief)
            return touch(p, { brief, name: brief.identification.name.trim() || 'Untitled product' })
          })
        },

        setBriefStage(id, stage) {
          update(id, (p) => touch(p, { briefStage: stage }))
        },

        completeBrief(id) {
          update(id, (p) => touch(p, { briefComplete: true, briefStage: 'review' }))
        },

        generateDesign(id) {
          const p = find(id)
          if (!p) return
          const { params, changeLog } = generateParams(p.brief)
          const v = makeVersion(params, p.versions.length + 1, 'generated', p.versions.length ? 'Regenerated from brief' : 'Generated from brief', changeLog, p.currentVersionId)
          update(id, (x) => touch(x, { versions: [...x.versions, v], currentVersionId: v.id, briefComplete: true }))
          get().setDraft(id, null)
        },

        setDraft(id, params) {
          set((s) => {
            const drafts = { ...s.drafts }
            if (params) drafts[id] = params
            else delete drafts[id]
            return { drafts }
          })
        },

        commitVersion(id, params, label, source, changeLog) {
          const p = find(id)
          if (!p || validateParams(params).length) return null
          const parent = currentVersion(p)
          const v = makeVersion(params, p.versions.length + 1, source, label, changeLog, parent?.id)
          update(id, (x) => touch(x, { versions: [...x.versions, v], currentVersionId: v.id }))
          get().setDraft(id, null)
          return v.id
        },

        setCurrentVersion(id, versionId) {
          update(id, (p) => touch(p, { currentVersionId: versionId }))
          get().setDraft(id, null)
        },

        markTested(id, versionId) {
          update(id, (p) => (p.testedVersionIds.includes(versionId) ? p : touch(p, { testedVersionIds: [...p.testedVersionIds, versionId] })))
        },

        setFinal(id, versionId, final) {
          update(id, (p) => touch(p, { versions: p.versions.map((v) => ({ ...v, final: v.id === versionId ? final : final ? false : v.final })) }))
        },

        setAssumption(id, material, key, value) {
          update(id, (p) => {
            const a: AssumptionOverrides = { ...p.assumptions, [material]: { ...p.assumptions[material], [key]: value } }
            if (value === undefined) delete a[material]![key]
            return touch(p, { assumptions: a })
          })
        },

        publish(id, b) {
          const p = find(id)
          if (!p) return { ok: false, reason: 'Project not found.' }
          const fin = [...p.versions].reverse().find((v) => v.final)
          if (!fin) return { ok: false, reason: 'Finalise a design version first.' }
          const recordVersion = (p.published?.recordVersion ?? 0) + 1
          const batch: Batch = { ...b, id: uid(), designVersionId: fin.id, recordVersion, createdAt: now() }
          const a = analyse(fin.params, p.brief, p.assumptions)
          const record = deriveRecord(p.brief, fin.params, a, batch)
          const passport: PublishedPassport = {
            record,
            recordVersion,
            lotCode: batch.lotCode || undefined,
            designVersion: fin.n,
            publishedAt: batch.createdAt,
            summary: passportSummary(fin.params, a, breakMyDesign(a.ctx)),
          }
          if (!registry.publish(passport)) {
            set({ storageError: 'Browser storage is full. Remove the product image or old projects, then publish again.' })
            return { ok: false, reason: 'Browser storage refused the record (storage may be full).' }
          }
          update(id, (x) => touch(x, { batches: [...x.batches, batch], published: { recordVersion, publishedAt: batch.createdAt, lotCode: batch.lotCode || undefined, fingerprint: fingerprint(record) } }))
          return { ok: true, recordVersion }
        },

        loadSamples() {
          const { projects, passports } = sampleProjects()
          const existingNames = new Set(get().projects.filter((p) => p.seed).map((p) => p.brief.metadata.productId))
          const fresh = projects.filter((p) => !existingNames.has(p.brief.metadata.productId))
          for (const pp of passports) if (!registry.latest(pp.record.id)) registry.publish(pp)
          set((s) => ({ projects: [...fresh, ...s.projects], seeded: true }))
        },
      }
    },
    {
      name: STUDIO_KEY,
      version: STUDIO_VERSION,
      storage: createJSONStorage(() => ({
        getItem: safeStorage.getItem,
        removeItem: safeStorage.removeItem,
        setItem(name: string, value: string) {
          let error: string | null = null
          try {
            window.localStorage.setItem(name, value)
          } catch {
            error = 'Browser storage is full, so recent changes may not be saved. Remove a product image or delete old projects.'
          }
          // Deferred: the store may still be initialising when the first write happens.
          queueMicrotask(() => {
            if (useStudio.getState().storageError !== error) useStudio.setState({ storageError: error })
          })
        },
      })),
      partialize: (s): Persisted => ({ projects: s.projects, drafts: s.drafts, seeded: s.seeded }),
      migrate: (persisted) => sanitizeStudio(persisted) as unknown as StudioState,
      merge: (persisted, current) => ({ ...current, ...sanitizeStudio(persisted) }),
    },
  ),
)

export const selectProject = (id: string) => (s: StudioState) => s.projects.find((p) => p.id === id)
