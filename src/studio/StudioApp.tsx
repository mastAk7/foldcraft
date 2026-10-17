import '@fontsource-variable/manrope'
import { ArrowLeft, Globe2 } from 'lucide-react'
import { Component, useEffect, type ReactNode } from 'react'
import { navigate, parseStudioPath, STUDIO_PATH, usePath, WORLD_PATH } from '../router'
import { REGISTRY_KEY } from '../services/registry'
import { ProjectShell } from './ProjectShell'
import { Projects } from './Projects'
import { Report } from './Report'
import { STUDIO_KEY, useStudio } from './store'
import './studio.css'

export function StudioMark() {
  return (
    <a
      href={STUDIO_PATH}
      onClick={(e) => {
        e.preventDefault()
        navigate(STUDIO_PATH)
      }}
      className="flex shrink-0 items-center gap-2 rounded-lg"
      aria-label="Producer Studio projects"
    >
      <span className="grid h-8 w-8 grid-cols-2 gap-[2px] rounded-[8px] bg-moss p-[5px] shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]" aria-hidden>
        <span className="rounded-[2px] bg-white/90" />
        <span className="rounded-[2px] bg-white/40" />
        <span className="rounded-[2px] bg-white/40" />
        <span className="rounded-[2px] bg-white/90" />
      </span>
      <span className="hidden leading-none sm:block">
        <span className="block font-display text-[17px]">FoldCraft</span>
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">Producer Studio</span>
      </span>
    </a>
  )
}

export function StudioHeader({ children, back }: { children?: ReactNode; back?: { label: string; to: string } }) {
  return (
    <header className="studio-header flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper/95 px-3 backdrop-blur sm:px-4">
      {back ? (
        <button type="button" className="btn btn-ghost btn-sm -ml-1 px-2" onClick={() => navigate(back.to)}>
          <ArrowLeft size={16} aria-hidden /> <span className="hidden sm:inline">{back.label}</span>
        </button>
      ) : null}
      <StudioMark />
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <a
        href={WORLD_PATH}
        className="btn btn-sm"
        onClick={(e) => {
          e.preventDefault()
          navigate(WORLD_PATH)
        }}
      >
        <Globe2 size={15} aria-hidden /> <span className="hidden md:inline">Consumer world</span>
      </a>
    </header>
  )
}

/** Keeps a failure in one screen from blanking the studio; saved projects are untouched. */
class StudioBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }
  componentDidCatch(error: unknown) {
    console.error('Producer Studio screen failed', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid flex-1 place-items-center p-6">
        <div className="panel max-w-[460px] p-5 text-center" role="alert">
          <h2 className="font-display text-xl">This screen hit a problem</h2>
          <p className="mt-1 text-[14px] text-ink-2">Your saved projects are not affected. Go back to the project list or reload the page.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" className="btn" onClick={() => navigate(STUDIO_PATH)}>
              Projects
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default function StudioApp() {
  const path = usePath()
  const route = parseStudioPath(path)

  // Another tab (studio or consumer) changed storage: re-read so screens stay consistent.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STUDIO_KEY) useStudio.persist.rehydrate()
      if (e.key === REGISTRY_KEY) useStudio.setState({})
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <div className="studio-root flex h-full flex-col">
      <StudioBoundary resetKey={path + window.location.search}>
        {route.view === 'projects' && <Projects />}
        {route.view === 'project' && <ProjectShell id={route.id} />}
        {route.view === 'report' && <Report id={route.id} />}
      </StudioBoundary>
    </div>
  )
}
