import { Html } from '@react-three/drei'
import { ZONE_ORDER, ZONES } from '../domain/storage'
import type { ZoneId } from '../domain/types'
import { useWorld } from '../services/store'
import { ZoneIcon } from '../ui/ZoneIcon'
import { BINS, binPositions } from './propData'
import { heightAt, LANDMARKS, PADS } from './terrainData'
import { goToZone, useWalk } from './walk/walkState'

function labelPos(zone: ZoneId): [number, number, number] {
  if (zone === 'homestead') return [0, 8.2, -2.6]
  const p = PADS[zone]
  const x = (p.x0 + p.x1) / 2
  const z = p.z0 - 2.2
  return [x, heightAt(x, z) + (zone === 'workshop' ? 3.6 : 5), z]
}

export function ZoneLabels() {
  const focusZone = useWorld((s) => s.focusZone)
  const walking = useWalk((s) => s.mode === 'walk')
  return (
    <>
      {ZONE_ORDER.map((id) => {
        const z = ZONES[id]
        return (
          <Html key={id} position={labelPos(id)} center zIndexRange={[10, 0]}>
            <button
              type="button"
              className="zone-label"
              data-active={focusZone === id || undefined}
              style={{ ['--zone' as string]: z.color }}
              onClick={() => goToZone(id)}
              aria-label={walking ? `Walk to ${z.name}, ${z.plain}` : `Focus ${z.name}, ${z.plain}`}
            >
              <ZoneIcon zone={id} size={13} />
              <span className="zone-label-name">{z.name}</span>
              <span className="zone-label-plain">{z.plain}</span>
            </button>
          </Html>
        )
      })}
      {/* Outer landmarks: plain, non-interactive names that help you get your bearings. */}
      {Object.entries(LANDMARKS).map(([key, l]) => (
        <Html key={key} position={[l.x, heightAt(l.x, l.z) + 4, l.z]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <span className="landmark-label">{l.name}</span>
        </Html>
      ))}
      {binPositions().map(([x, y, zz], i) => (
        <Html key={BINS[i].key} position={[x, y + 1.75, zz]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          {focusZone === 'workshop' && (
            <span className="bin-label" style={{ ['--bin' as string]: BINS[i].color }}>
              {BINS[i].label}
            </span>
          )}
        </Html>
      ))}
    </>
  )
}
