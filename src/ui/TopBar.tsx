import { Bell, Ellipsis, History, Info, LayoutGrid, Map as MapIcon, QrCode, RotateCcw, Sprout } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { vitality } from '../domain/progression'
import { visibleTasks } from '../domain/tasks'
import { useWorld } from '../services/store'

export function TopBar({ webgl }: { webgl: boolean }) {
  const worldName = useWorld((s) => s.worldName)
  const events = useWorld((s) => s.events)
  const items = useWorld((s) => s.items)
  const listView = useWorld((s) => s.listView)
  const { openPanel, setListView, resetDemo } = useWorld.getState()
  const v = useMemo(() => vitality(events), [events])
  const attention = useMemo(() => visibleTasks(items).length, [items])
  const [menu, setMenu] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false)
        setConfirmReset(false)
      }
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [menu])

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
      {/* World identity + progress */}
      <button
        type="button"
        onClick={() => openPanel('activity')}
        className="panel pointer-events-auto flex min-w-0 items-center gap-3 px-3 py-2 text-left transition hover:-translate-y-px"
        aria-label={`${worldName}. World vitality: ${v.stage.name}. Open activity and progress.`}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#4f9d5a] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]">
          <Sprout size={22} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[17px] leading-tight">{worldName}</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="pixel-bar w-[88px] sm:w-[120px]" aria-hidden>
              <div style={{ width: `${Math.round(((v.stage.level + v.progress) / 5) * 100)}%` }} />
            </div>
            <span className="text-[11.5px] font-semibold text-ink-2">{v.stage.name}</span>
          </div>
        </div>
      </button>

      <div className="pointer-events-auto flex items-center gap-1.5">
        <button
          type="button"
          className="btn btn-icon panel relative !rounded-xl"
          onClick={() => openPanel('coach')}
          aria-label={`Coaches: ${attention} suggestion${attention === 1 ? '' : 's'}`}
        >
          <Bell size={18} />
          <AnimatePresence>
            {attention > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-md bg-[#e08e0b] px-1 text-[11px] font-bold text-white"
              >
                {attention}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <button type="button" className="btn btn-icon panel !rounded-xl max-sm:hidden" onClick={() => openPanel('activity')} aria-label="Activity log">
          <History size={18} />
        </button>
        {webgl && (
          <button
            type="button"
            className="btn btn-icon panel !rounded-xl"
            onClick={() => setListView(!listView)}
            aria-label={listView ? 'Show 3D world' : 'Show list view'}
            aria-pressed={listView}
          >
            {listView ? <MapIcon size={18} /> : <LayoutGrid size={18} />}
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="btn btn-icon panel !rounded-xl"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="More"
            onClick={() => setMenu((m) => !m)}
          >
            <Ellipsis size={18} />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="panel panel-solid absolute right-0 top-12 w-64 p-1.5"
              >
                <MenuItem icon={<History size={16} />} onClick={() => (setMenu(false), openPanel('activity'))}>
                  Activity & progress
                </MenuItem>
                <MenuItem icon={<QrCode size={16} />} onClick={() => (setMenu(false), openPanel('qr'))}>
                  Demo QR codes
                </MenuItem>
                <MenuItem icon={<Info size={16} />} onClick={() => (setMenu(false), openPanel('about'))}>
                  About this prototype
                </MenuItem>
                <div className="my-1 border-t border-line" />
                {confirmReset ? (
                  <div className="p-2 text-[13px]">
                    <p className="text-ink-2">Replace everything with the sample world?</p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        className="btn btn-sm btn-clay"
                        onClick={() => {
                          resetDemo()
                          setMenu(false)
                          setConfirmReset(false)
                        }}
                      >
                        Reset demo
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setConfirmReset(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <MenuItem icon={<RotateCcw size={16} />} onClick={() => setConfirmReset(true)}>
                    Reset demo world
                  </MenuItem>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function MenuItem({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium hover:bg-black/5"
    >
      <span className="text-ink-2">{icon}</span>
      {children}
    </button>
  )
}
