import { Home, Recycle, Snowflake, TreePine, Wheat, type LucideProps } from 'lucide-react'
import type { ZoneId } from '../domain/types'

const ICONS = {
  frostlands: Snowflake,
  coldgrove: TreePine,
  plains: Wheat,
  homestead: Home,
  workshop: Recycle,
} as const

export function ZoneIcon({ zone, ...rest }: { zone: ZoneId } & LucideProps) {
  const Icon = ICONS[zone]
  return <Icon aria-hidden {...rest} />
}
