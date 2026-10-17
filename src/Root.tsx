import { lazy, Suspense, useEffect, useRef } from 'react'
import { isWorldPath, usePath } from './router'

const App = lazy(() => import('./App'))
const LandingPage = lazy(() => import('./landing/LandingPage'))

export default function Root() {
  const path = usePath()
  const world = isWorldPath(path)
  const wasWorld = useRef(world)

  // Leaving the consumer world (e.g. browser Back) reloads the page instead of unmounting the app in place:
  // drei's <Html> labels keep their own React roots, which throw when the canvas is torn down around them.
  const leavingWorld = wasWorld.current && !world
  useEffect(() => {
    if (leavingWorld) window.location.reload()
    wasWorld.current = world
  }, [leavingWorld, world])

  useEffect(() => {
    document.title = world ? 'Foldcraft · Your product world' : 'FoldCraft · Small choices. Bigger worlds.'
  }, [world])

  // Keep the app mounted until the reload takes over.
  return <Suspense fallback={null}>{world || leavingWorld ? <App /> : <LandingPage />}</Suspense>
}
