// First-time-user scenarios for the consumer world, run against a production build in real Chrome.
//
//   npm run e2e            (builds, then runs this file)
//   node e2e/consumer.mjs  (uses the existing dist/)
//
// Env: CHROME (browser executable; defaults to the usual Chrome install), OUT (screenshot folder),
//      HEADED=1 to watch it run.
//
// Every scenario checks what the person would see AND what Foldcraft actually stored, never just
// that a page rendered. Live camera scanning cannot be automated; it is listed as manual at the end.
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import QRCode from 'qrcode'
import { preview } from 'vite'

const CHROME =
  process.env.CHROME ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p))
if (!CHROME) throw new Error('No Chrome found. Set CHROME to a Chrome/Chromium executable.')
if (!existsSync('dist/index.html')) throw new Error('No build found. Run `npm run build` first (or `npm run e2e`).')
const OUT = process.env.OUT ?? join(tmpdir(), 'foldcraft-e2e')
mkdirSync(OUT, { recursive: true })

const server = await preview({ preview: { port: 0, host: '127.0.0.1' }, logLevel: 'warn' })
const BASE = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: !process.env.HEADED,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

const results = []
const pageErrors = []
let current = ''

const contexts = []

async function scenario(id, name, fn) {
  current = `${id}`
  const t = Date.now()
  const opened = contexts.length
  try {
    await fn()
    results.push({ id, name, ok: true, ms: Date.now() - t })
    console.log(`  ✔ ${id}. ${name}`)
  } catch (e) {
    results.push({ id, name, ok: false, error: e.message.split('\n')[0] })
    console.log(`  ✘ ${id}. ${name}\n      ${e.message.split('\n').slice(0, 8).join('\n      ')}`)
  } finally {
    // Close what this scenario opened: software-rendered 3D worlds left running starve later ones.
    for (const c of contexts.splice(opened)) await c.close().catch(() => {})
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function newPage({ width = 1440, height = 900, init } = {}) {
  // Reduced motion: also checks that path, and keeps software-rendered runs stable.
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
  contexts.push(ctx)
  if (init) await ctx.addInitScript(init)
  const page = await ctx.newPage()
  page.setDefaultTimeout(45_000) // software WebGL can stall the main thread for seconds
  page.on('pageerror', (e) => pageErrors.push(`[${current}] ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/WebGL|GPU|swiftshader/i.test(m.text()) && pageErrors.push(`[${current}] console: ${m.text()}`))
  return page
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('foldcraft:world') ?? 'null')?.state ?? null)
const itemByRecord = async (page, id) => (await stored(page)).items.find((i) => i.record.id === id)
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), timeout: 60_000 })
const dialog = (page, name) => page.getByRole('dialog', { name })
const toast = (page, text) => page.getByTestId('toast').filter({ hasText: text })

async function startWorld(page, withSamples = true) {
  await page.goto(`${BASE}/world`)
  await page.getByRole('dialog', { name: /Your products, as a little world/ }).waitFor()
  await page.getByRole('button', { name: withSamples ? 'Start with sample products' : 'Start empty' }).click()
  await page.getByRole('button', { name: 'Add product', exact: true }).waitFor()
}

/** Add-flow steps 2 and 3: accept the reviewed record, say where it is, add it. */
async function finishAdd(page, location = 'Refrigerator') {
  await page.getByRole('button', { name: 'Looks right, continue' }).click()
  await page.getByRole('radio', { name: new RegExp(`^${location}`) }).click()
  await page.getByRole('button', { name: 'Add to my world' }).click()
}

console.log(`Foldcraft consumer e2e · ${BASE} · screenshots in ${OUT}\n`)

// ---------------------------------------------------------------------------------------------
const page = await newPage()
contexts.length = 0 // the shared page lives across scenarios; scenario I closes it

await scenario('A', 'First visit explains the experience and offers sample vs empty', async () => {
  await page.goto(`${BASE}/world`)
  const welcome = page.getByRole('dialog', { name: /Your products, as a little world/ })
  await welcome.waitFor()
  for (const t of ['Add the products you bring home', 'Keep them where the label says', 'Give the packaging a next life'])
    assert(await welcome.getByText(t).isVisible(), `welcome is missing "${t}"`)
  assert(await welcome.getByRole('button', { name: 'Start empty' }).isVisible(), 'no "Start empty" choice')
  await shot(page, 'A-welcome')
  assert((await stored(page)) === null || (await stored(page)).onboarded === false, 'world was marked onboarded before choosing')
})

await scenario('B', 'Main actions are labelled and the guide explains the first step', async () => {
  await page.getByRole('button', { name: 'Start with sample products' }).click()
  for (const name of ['My items', 'Add product', 'Before you buy', /^To do/, /^Help/, /Menu/])
    assert(await page.getByRole('button', { name }).first().isVisible(), `missing visible button ${name}`)
  const guide = page.getByTestId('guide')
  assert(await guide.getByText('Open a product').isVisible(), 'guide does not show its first step')
  assert(await guide.getByText(/Choose My items below, or tap an object/).isVisible(), 'guide does not say how to open a product')
  const s = await stored(page)
  assert(s.onboarded && s.items.length === 10 && s.items.every((i) => i.addedVia === 'demo_seed'), 'sample world not stored as demo items')
  await page.waitForTimeout(1500) // let the 3D world settle for the screenshot
  await shot(page, 'B-world')
})

await scenario('C', 'Find a product through My items search (no false size matches)', async () => {
  await page.getByRole('button', { name: 'My items' }).click()
  const panel = dialog(page, 'My items')
  await panel.waitFor()
  const search = panel.getByRole('searchbox', { name: 'Search your items' })
  await search.fill('1kg')
  assert(await panel.getByText(/No items match “1kg”/).isVisible(), '"1kg" should match nothing, not the 1 kg rice')
  await search.fill('fridge')
  await search.fill('milk')
  const rows = panel.getByRole('listitem')
  assert((await rows.count()) === 1, `"milk" should find exactly one item, found ${await rows.count()}`)
  assert(await rows.first().getByText('Whole Milk').isVisible(), '"milk" did not find Whole Milk')
  assert(await rows.first().getByText('Sample', { exact: true }).isVisible(), 'sample item is not marked Sample')
  assert(await rows.first().getByText('Storage differs').isVisible(), 'the mismatch is not shown in words')
  await shot(page, 'C-my-items')
})

await scenario('D', 'Open product and packaging details from the list', async () => {
  await dialog(page, 'My items').getByRole('button', { name: /Whole Milk/ }).click()
  const p = dialog(page, 'Whole Milk')
  await p.waitFor()
  for (const t of ['Sample data', 'Where you recorded it', 'Kitchen counter', 'Label recommends', 'Packaging & next life'])
    assert(await p.getByText(t, { exact: true }).first().isVisible(), `product panel is missing "${t}"`)
  assert(await p.getByRole('button', { name: 'Back to My items' }).isVisible(), 'no Back to My items')
  await p.getByText('Record details & history').click()
  assert(await p.getByText('Part of the sample world').isVisible(), 'how it was added is not shown in words')
})

await scenario('E', 'Storage, date and packaging guidance is readable', async () => {
  const p = dialog(page, 'Whole Milk')
  assert(await p.getByText(/^Label: “/).isVisible(), 'label storage text not shown')
  assert(await p.getByText('Dates are reminders to check the product. Foldcraft doesn’t know its actual condition.').isVisible(), 'date caveat missing')
  assert(await p.getByText(/Recycling depends on what your local collection accepts/).isVisible(), 'local recycling caveat missing')
})

await scenario('F', 'Complete the next step and see confirmation; the record and world update', async () => {
  const p = dialog(page, 'Whole Milk')
  await p.getByRole('button', { name: 'I’ve moved it to the refrigerator' }).first().click()
  await toast(page, 'Storage now matches the label').waitFor()
  const milk = await itemByRecord(page, 'whole-milk-1l')
  assert(milk.actual === 'refrigerator', `stored location is ${milk.actual}`)
  const s = await stored(page)
  assert(s.events.some((e) => e.type === 'storage_corrected' && e.itemId === milk.id), 'no storage_corrected event recorded')
  assert(s.guide.done.includes('act'), 'guide did not tick the action step')
  assert(await p.getByText('Where you recorded it matches the storage instructions.').isVisible(), 'panel did not update to the match state')
  await shot(page, 'F-done')
})

await scenario('G', 'Snooze / dismiss give feedback and can be undone; safety reminders cannot be dismissed', async () => {
  // Back to the list, then the yoghurt, whose use-by date is two days away.
  await dialog(page, 'Whole Milk').getByRole('button', { name: 'Back to My items' }).click()
  const list = dialog(page, 'My items')
  await list.getByRole('searchbox').fill('yoghurt')
  await list.getByRole('button', { name: /Greek Yoghurt/ }).click()
  const p = dialog(page, 'Greek Yoghurt')
  await p.waitFor()
  assert(await p.getByText(/use by date/i).first().isVisible(), 'use-by reminder not shown as the next step')
  assert((await p.getByRole('button', { name: 'Dismiss' }).count()) === 0, 'a use-by reminder offers Dismiss')
  await p.getByRole('button', { name: 'Remind me tomorrow' }).first().click()
  const t = toast(page, 'Snoozed until tomorrow')
  await t.waitFor()
  assert(Object.keys((await itemByRecord(page, 'greek-yoghurt-jar')).tasks).length === 1, 'snooze not stored')
  await t.getByRole('button', { name: 'Undo' }).click()
  await toast(page, 'Undone').waitFor()
  assert(Object.keys((await itemByRecord(page, 'greek-yoghurt-jar')).tasks).length === 0, 'undo did not restore the reminder')

  // A mistaken "Used it up" is recoverable.
  await p.getByRole('button', { name: 'Used it up', exact: true }).click()
  const used = toast(page, 'Greek Yoghurt used up')
  await used.waitFor()
  assert((await itemByRecord(page, 'greek-yoghurt-jar')).status === 'finished', 'not marked used up')
  await used.getByRole('button', { name: 'Undo' }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('foldcraft:world')).state.items.find((i) => i.record.id === 'greek-yoghurt-jar').status === 'unopened')

  // A best-before reminder can be dismissed, with feedback, and restored from the item.
  await p.getByRole('button', { name: 'Back to My items' }).click()
  await list.getByRole('searchbox').fill('sourdough')
  await list.getByRole('button', { name: /Sourdough Loaf/ }).click()
  const bread = dialog(page, 'Sourdough Loaf')
  await bread.getByRole('button', { name: 'Dismiss' }).first().click()
  await toast(page, 'Reminder dismissed').waitFor()
  await bread.getByText('Record details & history').click()
  await bread.getByRole('button', { name: 'Show again' }).click()
  await toast(page, 'Hidden reminders restored').waitFor()
  assert(Object.keys((await itemByRecord(page, 'sourdough-loaf')).tasks).length === 0, 'restore did not clear the dismissal')
})

await scenario('J', 'Back, Esc, zone focus and reload return to the main view without losing state', async () => {
  await page.keyboard.press('Escape')
  await dialog(page, 'Sourdough Loaf').waitFor({ state: 'detached' })
  assert((await stored(page)).guide.done.includes('back'), 'closing the panel did not tick the guide')
  await page.getByRole('button', { name: /^Freezer/ }).click()
  assert(await page.getByRole('status').filter({ hasText: 'Freezer · 1 item' }).isVisible(), 'zone focus has no caption')
  await page.getByRole('button', { name: 'Whole world' }).first().click()
  await page.getByRole('button', { name: 'My items' }).click()
  assert((await dialog(page, 'My items').getByRole('searchbox').inputValue()) === 'sourdough', 'My items forgot the search')
  const before = await stored(page)
  await page.reload()
  await page.getByRole('button', { name: 'Add product', exact: true }).waitFor()
  const after = await stored(page)
  assert(after.items.length === before.items.length, 'items lost on reload')
  assert((await itemByRecord(page, 'whole-milk-1l')).actual === 'refrigerator', 'action lost on reload')
  assert((await page.getByRole('dialog', { name: /Your products/ }).count()) === 0, 'welcome shown again after onboarding')
})

await scenario('H', 'Add products through the sample shortcut, a QR image and a phone-camera QR link', async () => {
  // Sample shortcut
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByRole('tab', { name: 'Sample products' }).click()
  await page.getByRole('button', { name: /Dish Soap Refill/ }).click()
  await finishAdd(page, 'Kitchen counter')
  await toast(page, 'Dish Soap Refill added').waitFor()
  let s = await stored(page)
  assert(s.items.filter((i) => i.record.id === 'dish-soap-refill').at(-1).addedVia === 'sample', 'sample add not recorded as sample')

  // QR image (decoded on-device)
  const png = await QRCode.toBuffer(`${BASE}/p/oat-drink-carton`, { margin: 2, width: 360 })
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByRole('tab', { name: 'QR image' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'oat.png', mimeType: 'image/png', buffer: png })
  await page.getByText('Check the product details').waitFor()
  await finishAdd(page, 'Pantry')
  await toast(page, 'Oat Drink added').waitFor()
  s = await stored(page)
  assert(s.items.filter((i) => i.record.id === 'oat-drink-carton').at(-1).addedVia === 'qr_image', 'QR image add not recorded as qr_image')

  // A product QR opened by the phone's own camera lands on /p/<id>
  await page.goto(`${BASE}/p/greek-yoghurt-jar?batch=L2`)
  await page.getByText('Check the product details').waitFor()
  await finishAdd(page, 'Refrigerator')
  await toast(page, 'Greek Yoghurt added').waitFor()
  s = await stored(page)
  const linked = s.items.filter((i) => i.record.id === 'greek-yoghurt-jar').at(-1)
  assert(linked.addedVia === 'qr_link', `phone-camera link recorded as ${linked.addedVia}`)
  assert(linked.record.batch === 'L2', 'batch from the code not kept')
  assert(new URL(page.url()).search === '', 'scan parameters left in the address bar')
})

await scenario('I', 'Bad codes, unknown products, empty world and a full storage are handled honestly', async () => {
  await page.goto(`${BASE}/world?scan=${encodeURIComponent('hello there')}`)
  await page.getByText('We couldn’t find this product').waitFor()
  assert(await page.getByText(/isn’t a Foldcraft product code/).isVisible(), 'malformed code reason missing')
  assert(await page.getByRole('button', { name: 'Add it manually' }).isVisible(), 'no manual fallback offered')
  await page.goto(`${BASE}/p/zzz-unknown-product`)
  await page.getByText('We couldn’t find this product').waitFor()
  assert(await page.getByText(/record isn’t available on this device/).isVisible(), 'unknown product reason missing')
  await page.getByRole('button', { name: 'Add it manually' }).click()
  assert(await page.getByRole('tab', { name: 'Type it in', selected: true }).isVisible(), 'manual tab not opened')
  await page.keyboard.press('Escape')
  // One software-rendered 3D world at a time keeps the run fast and stable.
  await page.context().close()

  // Empty world
  const empty = await newPage({ width: 390, height: 844 })
  await startWorld(empty, false)
  assert(await empty.getByTestId('guide').getByText('Your world is empty').isVisible(), 'guide does not handle the empty world')
  await empty.getByRole('button', { name: 'My items' }).click()
  assert(await empty.getByText('Your world is empty').first().isVisible(), 'My items has no empty state')
  assert(await empty.getByRole('button', { name: 'Load sample products' }).isVisible(), 'no way to load samples into an empty world')
  await shot(empty, 'I-empty-mobile')
  await empty.context().close()


  // Storage refuses writes (full or blocked)
  const full = await newPage({
    init: () => {
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (k, v) {
        if (window.__full && k === 'foldcraft:world') throw new DOMException('quota', 'QuotaExceededError')
        return orig.call(this, k, v)
      }
    },
  })
  await startWorld(full)
  await full.evaluate(() => (window.__full = true))
  await full.getByRole('button', { name: 'My items' }).click()
  await dialog(full, 'My items').getByRole('button', { name: /Whole Milk/ }).click()
  await dialog(full, 'Whole Milk').getByRole('button', { name: 'I’ve moved it to the refrigerator' }).first().click()
  const banner = full.getByRole('alert').filter({ hasText: 'Your changes aren’t being saved' })
  await banner.waitFor()
  assert(await banner.getByText(/storage for Foldcraft is full/).isVisible(), 'banner does not explain the cause')
  assert(await dialog(full, 'Whole Milk').getByText('Where you recorded it matches the storage instructions.').isVisible(), 'app stopped working after a failed save')
  assert((await itemByRecord(full, 'whole-milk-1l')).actual === 'counter', 'test setup: the write should really have failed')
  await shot(full, 'I-save-failed')
  await full.evaluate(() => (window.__full = false))
  await banner.getByRole('button', { name: 'Try saving again' }).click()
  await banner.waitFor({ state: 'detached' })
  assert((await itemByRecord(full, 'whole-milk-1l')).actual === 'refrigerator', 'retry did not save the change')

})

await scenario('K', 'Keyboard only: open My items, open a product, act, close', async () => {
  const kb = await newPage()
  await startWorld(kb)
  const myItems = kb.getByRole('button', { name: 'My items' })
  await myItems.focus()
  await kb.keyboard.press('Enter')
  await dialog(kb, 'My items').waitFor()
  await dialog(kb, 'My items').getByRole('searchbox').focus()
  await kb.keyboard.type('peas')
  await kb.keyboard.press('Tab') // clear-search button
  await kb.keyboard.press('Tab') // filters…
  const row = dialog(kb, 'My items').getByRole('button', { name: /Frozen Garden Peas/ })
  await row.focus()
  await kb.keyboard.press('Enter')
  const p = dialog(kb, 'Frozen Garden Peas')
  await p.waitFor()
  await p.getByRole('button', { name: 'I opened it' }).focus()
  await kb.keyboard.press('Enter')
  await toast(kb, 'Frozen Garden Peas marked opened').waitFor()
  await kb.keyboard.press('Escape')
  await p.waitFor({ state: 'detached' })
  assert((await itemByRecord(kb, 'frozen-garden-peas')).status === 'opened', 'keyboard action not stored')
  await kb.waitForTimeout(400)
  assert(await kb.evaluate(() => document.activeElement?.textContent?.includes('My items') ?? false), 'focus did not return to My items after closing')

})

// ---------------------------------------------------------------------------------------------
// Walk mode. Software rendering runs at a few frames per second here, and each frame is capped at
// 0.1 s of movement, so these check directions and limits rather than exact distances.

const walkPose = (p) => p.evaluate(() => ({ ...window.__foldcraftWalk }))
const walkPrefs = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('foldcraft:walk') ?? 'null'))
async function waitFrames(p, n = 3) {
  const start = (await walkPose(p)).frames
  await p.waitForFunction((f) => window.__foldcraftWalk.frames >= f, start + n, { timeout: 60_000 })
}
async function holdKey(p, key, ms) {
  await p.keyboard.down(key)
  await p.waitForTimeout(ms)
  await p.keyboard.up(key)
  await waitFrames(p, 2)
}
async function enterWalk(p) {
  await p.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Walk' }).click()
  await p.getByRole('button', { name: /Leave walk mode/ }).waitFor()
  await waitFrames(p, 3)
}
const walkTo = (p, zone) => p.getByRole('navigation', { name: 'Walk to a zone' }).getByRole('button', { name: new RegExp(`^${zone}`) }).click()
async function drag(p, dx, dy, steps = 10) {
  const vp = p.viewportSize()
  const x = vp.width / 2
  const y = vp.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  for (let i = 1; i <= steps; i++) await p.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps)
  await p.mouse.up()
  await waitFrames(p, 2)
}

let walker // shared by L–P, like the main page above

await scenario('L', 'Walk mode: the controls card, then W/A/S/D, arrows, touchpad-style drag and swipe all move or turn', async () => {
  walker = await newPage()
  contexts.pop() // lives across L–Q; Q closes it
  await startWorld(walker)
  await enterWalk(walker)
  const card = walker.getByRole('region', { name: 'Walk mode controls' })
  await card.waitFor()
  for (const t of ['Walk forward, left, back, right', 'Turn left or right', /press and hold on the touchpad, then slide/, /two-finger swipe/, 'Open the highlighted item (or just click it)', /press again to leave walk mode/])
    assert(await card.getByText(t).isVisible(), `controls card is missing "${t}"`)
  await shot(walker, 'L-walk-guide')
  await card.getByRole('button', { name: 'Got it' }).click()
  await card.waitFor({ state: 'detached' })
  assert((await walkPrefs(walker))?.guideSeen === true, 'controls card will show again every time')

  let a = await walkPose(walker)
  assert(a.mode === 'walk' && Math.abs(a.yaw) < 0.01, `walk mode should start facing north, got ${JSON.stringify(a)}`)
  await holdKey(walker, 'KeyW', 1500)
  let b = await walkPose(walker)
  assert(a.z - b.z > 0.5 && Math.abs(b.x - a.x) < 0.2, `W did not walk forward (north): ${a.z.toFixed(2)} → ${b.z.toFixed(2)}`)
  await holdKey(walker, 'KeyS', 1000)
  a = await walkPose(walker)
  assert(a.z > b.z + 0.3, 'S did not walk back')
  await holdKey(walker, 'KeyD', 1000)
  b = await walkPose(walker)
  assert(b.x > a.x + 0.3, 'D did not step right')
  await holdKey(walker, 'KeyA', 1000)
  a = await walkPose(walker)
  assert(a.x < b.x - 0.3, 'A did not step left')
  await holdKey(walker, 'ArrowUp', 1000)
  b = await walkPose(walker)
  assert(b.z < a.z - 0.3, '↑ did not walk forward')
  await holdKey(walker, 'ArrowLeft', 1200)
  a = await walkPose(walker)
  assert(a.yaw > b.yaw + 0.2, '← did not turn left')

  // Look by press-and-drag (what a touchpad click-drag produces), with no movement.
  await drag(walker, 240, 0)
  b = await walkPose(walker)
  assert(b.yaw < a.yaw - 0.4, `dragging right did not look right (${a.yaw.toFixed(2)} → ${b.yaw.toFixed(2)})`)
  assert(Math.hypot(b.x - a.x, b.z - a.z) < 0.05, 'dragging to look moved the player')
  // A huge downward drag never flips the view: pitch stays within ±65°.
  await drag(walker, 0, 3000, 40)
  b = await walkPose(walker)
  assert(b.pitch >= -1.135 && b.pitch < -1.0, `pitch not clamped looking down: ${b.pitch}`)
  await drag(walker, 0, -1500, 25)
  // Two-finger swipe (wheel) looks around too, and never scrolls the page.
  a = await walkPose(walker)
  await walker.mouse.move(walker.viewportSize().width / 2, walker.viewportSize().height / 2)
  await walker.mouse.wheel(200, 0)
  await waitFrames(walker, 2)
  b = await walkPose(walker)
  assert(b.yaw < a.yaw - 0.15, 'a sideways two-finger swipe did not turn the view')
  assert((await walker.evaluate(() => window.scrollY + document.scrollingElement.scrollTop)) === 0, 'the page scrolled')
  await shot(walker, 'L-walking')

  // Leaving and coming back doesn't show the card again.
  await walker.getByRole('button', { name: /Leave walk mode/ }).click()
  await enterWalk(walker)
  assert((await walker.getByRole('region', { name: 'Walk mode controls' }).count()) === 0, 'controls card shown again')
})

await scenario('M', 'Walk mode stops when the window loses focus, ignores typing and pauses while a panel is open', async () => {
  await walker.keyboard.down('KeyW')
  await walker.waitForTimeout(800)
  await walker.evaluate(() => window.dispatchEvent(new Event('blur')))
  await waitFrames(walker, 2)
  const a = await walkPose(walker)
  await walker.waitForTimeout(1500)
  await waitFrames(walker, 2)
  const b = await walkPose(walker)
  await walker.keyboard.up('KeyW')
  assert(Math.hypot(b.x - a.x, b.z - a.z) < 0.05, `kept walking after the window lost focus (${a.z.toFixed(2)} → ${b.z.toFixed(2)})`)

  await walker.getByRole('button', { name: 'My items' }).click()
  const list = dialog(walker, 'My items')
  await list.waitFor()
  await waitFrames(walker, 2)
  const c = await walkPose(walker)
  assert(c.paused, 'walking is not paused with a panel open')
  assert(await walker.getByText('Walking is paused while a panel is open').isVisible(), 'no paused notice')
  await list.getByRole('searchbox').fill('')
  await list.getByRole('searchbox').pressSequentially('wasd')
  await walker.keyboard.down('ArrowUp')
  await walker.waitForTimeout(800)
  await walker.keyboard.up('ArrowUp')
  await waitFrames(walker, 2)
  const d = await walkPose(walker)
  assert(Math.hypot(d.x - c.x, d.z - c.z) < 0.01 && Math.abs(d.yaw - c.yaw) < 0.001, 'typing in the search box moved the player')
  assert((await list.getByRole('searchbox').inputValue()) === 'wasd', 'the search box did not get the typing')
  // Esc closes the panel only; walk mode stays.
  await walker.keyboard.press('Escape')
  await list.waitFor({ state: 'detached' })
  await waitFrames(walker, 2)
  assert((await walkPose(walker)).mode === 'walk', 'Esc in a panel also left walk mode')
  assert(await walker.getByRole('button', { name: /Leave walk mode/ }).isVisible(), 'walk HUD gone after closing the panel')
})

await scenario('N', 'Walk to a zone, open the highlighted item with E or a click, read its details and record an action', async () => {
  await walkTo(walker, 'Pantry')
  await walker.getByRole('status').filter({ hasText: 'Pantry · 4 items' }).waitFor()
  await waitFrames(walker, 4)
  const at = await walkPose(walker)
  assert(Math.abs(at.x + 14) < 1 && Math.abs(at.z - 19) < 1.5, `did not arrive at the pantry: ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`)
  const prompt = walker.getByText(/Press\s*E\s*or click to open/)
  await prompt.waitFor()
  const name = (await walker.getByTestId('walk-target').locator('strong').textContent()).trim()
  await shot(walker, 'N-target')
  await walker.keyboard.press('KeyE')
  const p = dialog(walker, name)
  await p.waitFor()
  for (const t of ['Where you recorded it', 'Packaging & next life'])
    assert(await p.getByText(t, { exact: true }).first().isVisible(), `product panel is missing "${t}"`)
  await p.getByText('Record details & history').click()
  assert(await p.getByText('Part of the sample world').isVisible(), 'record details not readable from walk mode')
  const item = (await stored(walker)).items.find((i) => i.record.name === name)
  await p.getByRole('button', { name: 'Used it up', exact: true }).click()
  await toast(walker, `${name} used up`).waitFor()
  assert((await stored(walker)).items.find((i) => i.id === item.id).status === 'finished', 'action from walk mode was not stored')
  await walker.keyboard.press('Escape')
  await p.waitFor({ state: 'detached' })

  // A plain click (no drag) on the highlighted item opens it and doesn't move or turn the player.
  await walkTo(walker, 'Freezer')
  await waitFrames(walker, 3)
  await holdKey(walker, 'ArrowLeft', 500) // turn a little toward the peas
  for (let i = 0; i < 6 && !(await walker.getByText(/Press\s*E\s*or click to open/).count()); i++) await holdKey(walker, 'ArrowLeft', 250)
  await walker.getByText(/Press\s*E\s*or click to open/).waitFor()
  const before = await walkPose(walker)
  const vp = walker.viewportSize()
  await walker.mouse.click(vp.width / 2, vp.height / 2)
  await dialog(walker, 'Frozen Garden Peas').waitFor()
  await waitFrames(walker, 2)
  const after = await walkPose(walker)
  assert(Math.hypot(after.x - before.x, after.z - before.z) < 0.01 && Math.abs(after.yaw - before.yaw) < 0.001, 'clicking an item moved the player')
})

await scenario('O', 'Solid things and the island edge hold: no walking through the freezer vault or off the world', async () => {
  await walker.keyboard.press('Escape')
  await dialog(walker, 'Frozen Garden Peas').waitFor({ state: 'detached' })
  await walkTo(walker, 'Freezer')
  await waitFrames(walker, 3)
  await holdKey(walker, 'KeyW', 6000) // straight at the vault behind the pad
  const a = await walkPose(walker)
  // The vault's front wall is at z ≈ -15.9; the player (radius 0.35) must stop in front of it.
  assert(a.z > -15.9 + 0.3, `walked into the freezer vault: z = ${a.z.toFixed(2)}`)
  assert(a.y >= 2.9, `fell below the pad: y = ${a.y}`)
  await holdKey(walker, 'ArrowLeft', 2500) // turn to face west, toward the island edge
  await holdKey(walker, 'KeyW', 9000)
  const b = await walkPose(walker)
  assert(b.y >= 1.99, `fell below the ground: y = ${b.y}`)
  assert(Math.hypot(b.x, b.z) < 35, `left the island: ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`)
  await shot(walker, 'O-edge')
})

await scenario('P', 'Esc closes the panel first, then leaves walk mode; switching views keeps the open item and everything works in overview', async () => {
  await walkTo(walker, 'Pantry')
  await waitFrames(walker, 4)
  await walker.getByText(/Press\s*E\s*or click to open/).waitFor()
  await walker.keyboard.press('KeyE')
  const panel = walker.getByRole('dialog').filter({ has: walker.getByText('Packaging & next life', { exact: true }) })
  await panel.waitFor()
  const title = (await panel.getByRole('heading').first().textContent()).trim()
  // Switching to Overview with the item open keeps it open.
  await walker.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Overview' }).click()
  await walker.getByRole('button', { name: /Leave walk mode/ }).waitFor({ state: 'detached' })
  assert(await dialog(walker, title).isVisible(), 'the open item closed when switching to overview')
  assert((await walkPose(walker)).mode === 'overview', 'still in walk mode')
  // Back to walk with the item open: Esc closes the item first, then leaves walk mode.
  await enterWalk(walker)
  await walker.keyboard.press('Escape')
  await dialog(walker, title).waitFor({ state: 'detached' })
  await waitFrames(walker, 2)
  assert((await walkPose(walker)).mode === 'walk', 'first Esc left walk mode instead of closing the panel')
  await walker.keyboard.press('Escape')
  await walker.getByRole('button', { name: /Leave walk mode/ }).waitFor({ state: 'detached' })
  assert(await walker.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Overview' }).getAttribute('aria-pressed') === 'true', 'overview not selected after Esc')
  // Ordinary overview still works: zone focus, list, product details.
  await walker.getByRole('button', { name: /^Freezer/ }).click()
  await walker.getByRole('status').filter({ hasText: 'Freezer · 1 item' }).waitFor()
  await walker.getByRole('button', { name: 'Whole world' }).first().click()
  await walker.getByRole('button', { name: 'My items' }).click()
  await dialog(walker, 'My items').getByRole('searchbox').fill('milk')
  await dialog(walker, 'My items').getByRole('button', { name: /Whole Milk/ }).click()
  await dialog(walker, 'Whole Milk').getByText('Packaging & next life', { exact: true }).waitFor()
  await walker.keyboard.press('Escape')
  await shot(walker, 'P-overview-again')
})

await scenario('Q', 'Rendering stays responsive in overview and walk mode (software WebGL, reported only)', async () => {
  const fps = () =>
    walker.evaluate(
      () =>
        new Promise((res) => {
          let n = 0
          const t0 = performance.now()
          const f = () => {
            n++
            if (performance.now() - t0 < 4000) requestAnimationFrame(f)
            else res(n / ((performance.now() - t0) / 1000))
          }
          requestAnimationFrame(f)
        }),
    )
  await walker.waitForTimeout(1000)
  const overview = await fps()
  await enterWalk(walker)
  const walking = await fps()
  console.log(`      software-WebGL frame rate: overview ${overview.toFixed(1)} fps, walk ${walking.toFixed(1)} fps (a real GPU is far faster)`)
  assert(overview > 0.5 && walking > 0.5, 'rendering stalled')
  await walker.getByRole('button', { name: /Leave walk mode/ }).click()
  await walker.context().close()
})

// ---------------------------------------------------------------------------------------------
const box = (loc) => loc.boundingBox()
const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

await scenario('R', 'Coaches sit under the world name and answer preset questions; help is on the right; demo alerts change nothing', async () => {
  const W = 1280
  const p = await newPage({ width: W, height: 800 })
  await startWorld(p)
  const name = await box(p.getByTestId('world-header').getByRole('button', { name: /World stage/ }))
  const coaches = await box(p.getByTestId('coach-buttons'))
  assert(coaches.y >= name.y + name.height - 1 && coaches.y - (name.y + name.height) < 16, 'coach buttons are not directly below the world name')
  assert(Math.abs(coaches.x - name.x) < 4 && coaches.y + coaches.height < 160, 'coach buttons are not in the top-left header')
  const guide = await box(p.getByTestId('guide'))
  assert(guide.x > W / 2 && guide.x + guide.width <= W, `guide is not on the right (x=${guide.x})`)
  assert(!overlaps(guide, coaches), 'guide overlaps the coach buttons')

  // Storage Coach about the open product; two questions in a row; closing returns to the product.
  await p.getByRole('button', { name: 'My items' }).click()
  await dialog(p, 'My items').getByRole('button', { name: /Whole Milk/ }).click()
  await dialog(p, 'Whole Milk').waitFor()
  await p.getByRole('button', { name: 'Storage Coach', exact: true }).click()
  const chat = dialog(p, 'Storage Coach')
  await chat.waitFor()
  assert((await chat.getByRole('combobox', { name: 'About' }).locator('option:checked').textContent()) === 'Whole Milk', 'chat is not about the open product')
  await chat.getByRole('button', { name: 'Where should I store the Whole Milk?' }).click()
  await chat.getByRole('button', { name: 'Why does it need a specific temperature?' }).click()
  const exchanges = chat.getByTestId('chat-exchange')
  assert((await exchanges.count()) === 2, 'two questions did not give two answers')
  assert(/below 5°C/.test(await exchanges.nth(1).textContent()), 'temperature answer does not quote the milk label')
  const chatBox = await box(chat)
  assert(chatBox.x < 20 && chatBox.x + chatBox.width < W / 2 && chatBox.y >= coaches.y + coaches.height, 'coach chat does not open on the left, under its buttons')
  assert(!overlaps(await box(p.getByTestId('guide')), chatBox), 'guide overlaps the open coach panel')
  await shot(p, 'R-storage-coach')
  await p.keyboard.press('Escape')
  await dialog(p, 'Whole Milk').waitFor()

  // Circularity Coach, opened and closed with its own button.
  await p.getByRole('button', { name: 'Circularity Coach', exact: true }).click()
  const circ = dialog(p, 'Circularity Coach')
  await circ.getByRole('button', { name: 'What material is it made from?' }).click()
  assert(/HDPE/.test(await circ.getByTestId('chat-exchange').last().textContent()), 'material answer is not from the milk record')
  await p.getByRole('button', { name: 'Circularity Coach', exact: true }).click()
  await dialog(p, 'Whole Milk').waitFor()
  await p.keyboard.press('Escape')

  // Demo alerts: both at once, repeated without duplicates, with working follow-ups.
  const before = await stored(p)
  const warn = p.getByRole('button', { name: 'Simulate demo warning' })
  const warnBox = await box(warn)
  assert(warnBox.x > W / 2 && warnBox.y < 60, 'Simulate demo warning is not at the top right')
  await warn.click()
  await warn.click()
  const alerts = p.getByTestId('demo-alert')
  assert((await alerts.count()) === 2, `expected 2 demo alerts, found ${await alerts.count()}`)
  const milkAlert = alerts.filter({ hasText: 'Your milk on the kitchen counter is going off today, so use it up.' })
  const fruitAlert = alerts.filter({ hasText: 'Your fruit in the refrigerator is going off today, so use it up.' })
  assert((await milkAlert.count()) === 1 && (await fruitAlert.count()) === 1, 'alerts do not name milk and fruit')
  assert(/Whole Milk/.test(await milkAlert.textContent()) && /Strawberries/.test(await fruitAlert.textContent()), 'alerts do not identify the products')
  assert(/real use-by date .*\(in 6 days\)/.test(await milkAlert.textContent()), 'milk alert does not give its real record date')
  assert((await box(alerts.first())).x > W / 2, 'alerts are not in the right-hand rail')
  await shot(p, 'R-demo-alerts')
  await milkAlert.getByRole('button', { name: 'View details' }).click()
  await dialog(p, 'Whole Milk').waitFor()
  await shot(p, 'R-alert-details')
  await milkAlert.getByRole('button', { name: 'Ask Storage Coach' }).click()
  const fromAlert = dialog(p, 'Storage Coach')
  assert(/Use by/.test(await fromAlert.getByTestId('chat-exchange').last().textContent()), 'alert did not open the coach on the milk dates')
  await p.keyboard.press('Escape')
  await dialog(p, 'Whole Milk').waitFor()
  await p.keyboard.press('Escape')
  await fruitAlert.getByRole('button', { name: 'Packaging info' }).click()
  assert(/Punnet/.test(await dialog(p, 'Circularity Coach').getByTestId('chat-exchange').last().textContent()), 'fruit packaging answer missing')
  await p.keyboard.press('Escape')
  await milkAlert.getByRole('button', { name: /Dismiss the milk demo alert/ }).click()
  await milkAlert.waitFor({ state: 'detached' })
  assert((await alerts.count()) === 1 && (await fruitAlert.count()) === 1, 'dismissing milk removed the fruit alert')
  const after = await stored(p)
  assert(JSON.stringify(after.items) === JSON.stringify(before.items), 'demo alerts changed stored items')
  assert(JSON.stringify(after.events) === JSON.stringify(before.events), 'demo alerts added events')
  assert(!('demoAlerts' in after), 'demo alerts were saved')

  // Mid width: the help rail steps aside rather than covering an open panel.
  await p.setViewportSize({ width: 1024, height: 768 })
  await p.getByRole('button', { name: 'Storage Coach', exact: true }).click()
  const midChat = await box(dialog(p, 'Storage Coach'))
  const railAlert = p.getByTestId('demo-alert')
  assert(!(await railAlert.count()) || !overlaps(await box(railAlert.first()), midChat), 'help rail overlaps the panel at 1024 px')
  await shot(p, 'R-1024-chat')
  await p.keyboard.press('Escape')
})

await scenario('S', 'Phone width: coach row under the name, help below it, coach chat and demo alerts usable', async () => {
  const W = 390
  const p = await newPage({ width: W, height: 844 })
  await startWorld(p)
  const name = await box(p.getByTestId('world-header').getByRole('button', { name: /World stage/ }))
  const coaches = await box(p.getByTestId('coach-buttons'))
  assert(coaches.y >= name.y + name.height - 1 && coaches.x + coaches.width <= W, 'coach row not under the name or off-screen')
  assert(name.width > 140, `world name squeezed to ${name.width}px`)
  const guide = await box(p.getByTestId('guide'))
  assert(guide.y >= coaches.y + coaches.height && guide.x + guide.width <= W && guide.x >= 0, 'guide overlaps the coach row or leaves the screen')
  await shot(p, 'S-phone-world')
  await p.getByRole('button', { name: 'Storage Coach', exact: true }).click()
  const chat = dialog(p, 'Storage Coach')
  await chat.getByRole('combobox', { name: 'About' }).selectOption({ label: 'Strawberries' })
  await chat.getByRole('button', { name: 'Why does it need a specific temperature?' }).click()
  assert(/0–4 °C/.test(await chat.getByTestId('chat-exchange').last().textContent()), 'phone chat answer not about the strawberries')
  await shot(p, 'S-phone-chat')
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Menu' }).click()
  await p.getByRole('menuitem', { name: 'Simulate demo alerts' }).click()
  await dialog(p, 'Simulate demo alerts').getByRole('button', { name: /Simulate a milk expiry warning/ }).click()
  const alert = await box(p.getByTestId('demo-alert'))
  assert(alert.x >= 0 && alert.x + alert.width <= W && !overlaps(alert, coaches), 'phone alert is off-screen or covers the coach row')
  await shot(p, 'S-phone-alert')
})

await browser.close()
await new Promise((r) => server.httpServer.close(r))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`)
if (pageErrors.length) console.log(`\nPage errors:\n  ${pageErrors.join('\n  ')}`)
console.log('\nManual only: live camera scanning (CameraScanner + jsQR), a real phone camera opening a printed code, and real touchpad/touch gestures in the 3D world (walk mode is checked here with emulated mouse, wheel and keys; see docs/consumer-journeys.md for the manual touchpad steps).')
process.exit(failed.length || pageErrors.length ? 1 : 0)
