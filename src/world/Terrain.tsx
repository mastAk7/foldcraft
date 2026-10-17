import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { fx } from './fx'
import { createVoxelMaterial } from './materials'
import { hash2 } from './noise'
import { terrain, type Block, type Cell } from './terrainData'

const TOP: Record<Block, string> = {
  snow: '#eef4fa',
  icetile: '#c4e3f5',
  ice: '#a6d6f0',
  frostgrass: '#7cc6b0',
  moss: '#93bca3',
  grass: '#7cc35b',
  deck: '#c08b55',
  meadow: '#6fbd4e',
  workfloor: '#b3ada3',
  plaza: '#d3c4aa',
  path: '#bea67f',
  streambed: '#9c8a6c',
  stone: '#a3a7ad',
  forestfloor: '#4f9a5c',
  field: '#8c6a45',
  marsh: '#6f8a6a',
  bridge: '#a87443',
}

const SOIL: Partial<Record<Block, string>> = {
  snow: '#c3d2e2',
  icetile: '#a9c4da',
  ice: '#9fc2dc',
  frostgrass: '#6d5b4b',
  moss: '#6d5b4b',
  deck: '#8a6142',
  plaza: '#9a8a74',
  workfloor: '#8f8a83',
  stone: '#8c9096',
  bridge: '#7a512d',
}

const WITHERED = new THREE.Color('#ad9f78')
const MEADOW = new THREE.Color(TOP.meadow)
const DRY_BED = new THREE.Color('#a8957a')
const WET_BED = new THREE.Color('#5f6f62')

const CAP = 0.34
const CHUNK = 16
const COLD = new Set(['frostlands', 'highland'])
const tmpC = new THREE.Color()

function jitter(c: THREE.Color, x: number, z: number, amt = 0.05) {
  const j = (hash2(x, z, 91) - 0.5) * amt
  return c.offsetHSL(0, 0, j)
}

const capHeight = (c: Cell) => (c.top === 'deck' || c.top === 'icetile' || c.top === 'workfloor' || c.top === 'plaza' || c.top === 'bridge' ? 0.5 : CAP)

/** The three layers of a column, top to bottom: a thin cap, soil, then stone tapering into the underside. */
function layers(c: Cell): { top: number; bottom: number; color: THREE.Color; cap?: boolean }[] {
  const capH = capHeight(c)
  return [
    { top: c.h, bottom: c.h - capH, color: jitter(new THREE.Color(TOP[c.top]), c.x, c.z), cap: true },
    { top: c.h - capH, bottom: c.h - 3, color: jitter(new THREE.Color(SOIL[c.top] ?? '#8a6142'), c.x, c.z, 0.04) },
    { top: c.h - 3, bottom: Math.min(c.h - 3, c.bottom), color: jitter(new THREE.Color(COLD.has(c.region) ? '#97a6b8' : '#8c8b8f'), c.x, c.z, 0.06) },
  ].filter((l) => l.top - l.bottom > 0.001)
}

const SIDES: { dx: number; dz: number; n: [number, number, number] }[] = [
  { dx: 1, dz: 0, n: [1, 0, 0] },
  { dx: -1, dz: 0, n: [-1, 0, 0] },
  { dx: 0, dz: 1, n: [0, 0, 1] },
  { dx: 0, dz: -1, n: [0, 0, -1] },
]

interface ChunkGeometry {
  geometry: THREE.BufferGeometry
  /** Vertex ranges of cap faces whose colour follows world vitality (healing meadow, refilling stream). */
  dynamic: { cell: Cell; start: number; count: number }[]
}

/**
 * One merged mesh per chunk with only the faces that can be seen: every top, the underside, and
 * side faces only where a neighbour doesn't cover them (steps, banks, the island edge). Hidden
 * faces between columns are never drawn.
 */
function buildChunk(cells: Cell[], map: Map<string, Cell>): ChunkGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const dynamic: ChunkGeometry['dynamic'] = []

  const quad = (corners: number[][], n: [number, number, number], c: THREE.Color) => {
    const base = pos.length / 3
    for (const v of corners) {
      pos.push(v[0], v[1], v[2])
      nor.push(...n)
      col.push(c.r, c.g, c.b)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    return base
  }

  for (const c of cells) {
    const x0 = c.x - 0.5
    const x1 = c.x + 0.5
    const z0 = c.z - 0.5
    const z1 = c.z + 0.5
    const ls = layers(c)
    const isDynamic = c.top === 'meadow' || (c.water === 'stream' && c.top === 'streambed')
    const capStart = pos.length / 3
    // top (counter-clockwise seen from above)
    quad(
      [
        [x0, c.h, z1],
        [x1, c.h, z1],
        [x1, c.h, z0],
        [x0, c.h, z0],
      ],
      [0, 1, 0],
      ls[0].color,
    )
    // underside
    const low = ls[ls.length - 1]
    quad(
      [
        [x0, low.bottom, z0],
        [x1, low.bottom, z0],
        [x1, low.bottom, z1],
        [x0, low.bottom, z1],
      ],
      [0, -1, 0],
      low.color,
    )
    for (const s of SIDES) {
      const nb = map.get(`${c.x + s.dx},${c.z + s.dz}`)
      // the neighbour column covers [nb.bottom, nb.h]; draw what's left of each layer
      const coverTop = nb ? nb.h : -Infinity
      const coverBottom = nb ? Math.min(nb.h - 3, nb.bottom) : -Infinity
      for (const l of ls) {
        const parts: [number, number][] = []
        if (!nb) parts.push([l.bottom, l.top])
        else {
          if (l.top > coverTop) parts.push([Math.max(l.bottom, coverTop), l.top])
          if (l.bottom < coverBottom) parts.push([l.bottom, Math.min(l.top, coverBottom)])
        }
        for (const [b, t] of parts) {
          if (t - b < 0.001) continue
          let corners: number[][]
          if (s.dx === 1)
            corners = [
              [x1, b, z1],
              [x1, b, z0],
              [x1, t, z0],
              [x1, t, z1],
            ]
          else if (s.dx === -1)
            corners = [
              [x0, b, z0],
              [x0, b, z1],
              [x0, t, z1],
              [x0, t, z0],
            ]
          else if (s.dz === 1)
            corners = [
              [x0, b, z1],
              [x1, b, z1],
              [x1, t, z1],
              [x0, t, z1],
            ]
          else
            corners = [
              [x1, b, z0],
              [x0, b, z0],
              [x0, t, z0],
              [x1, t, z0],
            ]
          const start = quad(corners, s.n, l.color)
          if (l.cap && isDynamic) dynamic.push({ cell: c, start, count: 4 })
        }
      }
    }
    if (isDynamic) dynamic.push({ cell: c, start: capStart, count: 4 })
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geometry.setIndex(idx)
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  return { geometry, dynamic }
}

function Chunk({ chunk, material }: { chunk: ChunkGeometry; material: THREE.Material }) {
  const lastV = useRef(-1)
  useEffect(() => () => chunk.geometry.dispose(), [chunk])

  // Workshop meadow heals and the stream bed darkens as vitality rises.
  useFrame(() => {
    if (!chunk.dynamic.length || Math.abs(fx.vitality - lastV.current) < 0.01) return
    lastV.current = fx.vitality
    const v = fx.vitality
    const attr = chunk.geometry.getAttribute('color') as THREE.BufferAttribute
    for (const { cell: c, start, count } of chunk.dynamic) {
      if (c.top === 'meadow') {
        const threshold = hash2(c.x, c.z, 5) * 0.85 + 0.1
        const t = Math.min(1, Math.max(0, (v / 2.4 - threshold) * 4))
        tmpC.copy(WITHERED).lerp(MEADOW, t)
      } else {
        tmpC.copy(DRY_BED).lerp(WET_BED, Math.min(1, Math.max(0, v - 2.2)))
      }
      jitter(tmpC, c.x, c.z)
      for (let i = start; i < start + count; i++) attr.setXYZ(i, tmpC.r, tmpC.g, tmpC.b)
    }
    attr.needsUpdate = true
  })

  return <mesh geometry={chunk.geometry} material={material} castShadow receiveShadow />
}

/** The island, as 16×16 chunks of merged, face-culled geometry sharing one material. */
export function Terrain() {
  const material = useMemo(() => createVoxelMaterial({ vertexColors: true }), [])
  const chunks = useMemo(() => {
    const { cells, map } = terrain()
    const byKey = new Map<string, Cell[]>()
    for (const c of cells) {
      const key = `${Math.floor(c.x / CHUNK)},${Math.floor(c.z / CHUNK)}`
      let list = byKey.get(key)
      if (!list) byKey.set(key, (list = []))
      list.push(c)
    }
    return [...byKey.entries()].map(([key, list]) => ({ key, chunk: buildChunk(list, map) }))
  }, [])
  return (
    <group>
      {chunks.map(({ key, chunk }) => (
        <Chunk key={key} chunk={chunk} material={material} />
      ))}
    </group>
  )
}
