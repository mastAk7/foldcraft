import { Html } from '@react-three/drei'
import { ZONE_ORDER, ZONES } from '../domain/storage'
import type { ZoneId } from '../domain/types'
import { useWorld } from '../services/store'
import { ZoneIcon } from '../ui/ZoneIcon'
import { BINS, binPositions } from './propData'
import { heightAt, PADS } from './terrainData'

function labelPos(zone: ZoneId): [number, number, number] {
  if (zone === 'homestead') return [0, 8.2, -2.6]
  const p = PADS[zone]
  const x = (p.x0 + p.x1) / 2
  const z = p.z0 - 2.2
  return [x, heightAt(x, z) + (zone === 'workshop' ? 3.6 : 5), z]
}

export function ZoneLabels() {
  const focusZone = useWorld((s) => s.focusZone)
  const setFocusZone = useWorld((s) => s.setFocusZone)
  const select = useWorld((s) => s.select)
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
              onClick={() => {
                select(null)
                setFocusZone(id)
              }}
              aria-label={`Focus ${z.name}, ${z.plain}`}
            >
              <ZoneIcon zone={id} size={13} />
              <span className="zone-label-name">{z.name}</span>
              <span className="zone-label-plain">{z.plain}</span>
            </button>
          </Html>
        )
      })}
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
