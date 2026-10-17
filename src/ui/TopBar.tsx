import { CircleHelp, History, Info, LayoutGrid, ListChecks, Map as MapIcon, Menu, QrCode, RotateCcw, Sprout } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { vitality } from '../domain/progression'
import { visibleTasks } from '../domain/tasks'
import { useWorld } from '../services/store'

export function TopBar({ webgl }: { webgl: boolean }) {
  const worldName = useWorld((s) => s.worldName)
  const events = useWorld((s) => s.events)
  const items = useWorld((s) => s.items)
  const listView = useWorld((s) => s.listView)
  const { openPanel, setListView, resetDemo, restartGuide } = useWorld.getState()
  const v = useMemo(() => vitality(events), [events])
  const todo = useMemo(() => visibleTasks(items).length, [items])
  const [menu, setMenu] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false)
        setConfirmReset(false)
      }
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', key)
    }
  }, [menu])

  const pick = (fn: () => void) => () => {
    setMenu(false)
    setConfirmReset(false)
    fn()
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
      {/* World identity + progress */}
      <button
        type="button"
        onClick={() => openPanel('activity')}
        className="panel pointer-events-auto flex min-w-0 items-center gap-3 px-3 py-2 text-left transition hover:-translate-y-px"
        aria-label={`${worldName}. World stage: ${v.stage.name}. Open progress and activity.`}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#4f9d5a] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]">
          <Sprout size={22} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-[17px] leading-tight">{worldName}</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="pixel-bar w-[72px] sm:w-[110px]" aria-hidden>
              <div style={{ width: `${Math.round(((v.stage.level + v.progress) / 5) * 100)}%` }} />
            </div>
            <span className="text-[11.5px] font-semibold text-ink-2">
              {v.stage.name}
              <span className="font-normal text-ink-3 max-sm:hidden"> · Progress</span>
            </span>
          </div>
        </div>
      </button>

      <div className="pointer-events-auto flex items-center gap-1.5">
        <button type="button" className="btn panel relative h-11 !rounded-xl px-3" onClick={() => openPanel('coach')} aria-label={`To do: ${todo} suggestion${todo === 1 ? '' : 's'}`}>
          <ListChecks size={18} aria-hidden />
          <span className="text-sm font-semibold">To do</span>
          {todo > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-md bg-[#e08e0b] px-1 text-[11px] font-bold text-white">{todo}</span>}
        </button>
        <button type="button" className="btn panel h-11 !rounded-xl px-3" onClick={restartGuide} aria-label="Help: show the getting started guide">
          <CircleHelp size={18} aria-hidden />
          <span className="text-sm font-semibold max-sm:hidden">Help</span>
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="btn panel h-11 !rounded-xl px-3"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            <Menu size={18} aria-hidden />
            <span className="text-sm font-semibold max-sm:hidden">Menu</span>
            <span className="sr-only sm:hidden">Menu</span>
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
                <MenuItem icon={<History size={16} />} onClick={pick(() => openPanel('activity'))}>
                  Progress & activity
                </MenuItem>
                <MenuItem icon={<QrCode size={16} />} onClick={pick(() => openPanel('qr'))}>
                  Demo QR codes
                </MenuItem>
                {webgl && (
                  <MenuItem icon={listView ? <MapIcon size={16} /> : <LayoutGrid size={16} />} onClick={pick(() => setListView(!listView))}>
                    {listView ? 'Show the 3D world' : 'List only (hide 3D world)'}
                  </MenuItem>
                )}
                <MenuItem icon={<CircleHelp size={16} />} onClick={pick(restartGuide)}>
                  Show the getting started guide
                </MenuItem>
                <MenuItem icon={<Info size={16} />} onClick={pick(() => openPanel('about'))}>
                  About this prototype
                </MenuItem>
                <div className="my-1 border-t border-line" />
                {confirmReset ? (
                  <div className="p-2 text-[13px]">
                    <p className="text-ink-2">Replace everything with the sample world? Your items and progress will be lost.</p>
                    <div className="mt-2 flex gap-1.5">
                      <button type="button" className="btn btn-sm btn-clay" onClick={pick(resetDemo)}>
                        Reset demo
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setConfirmReset(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <MenuItem icon={<RotateCcw size={16} />} onClick={() => setConfirmReset(true)}>
                    Reset demo world…
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
