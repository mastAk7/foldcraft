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
  assert(s.onboarded && s.items.length === 9 && s.items.every((i) => i.addedVia === 'demo_seed'), 'sample world not stored as demo items')
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

await browser.close()
await new Promise((r) => server.httpServer.close(r))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`)
if (pageErrors.length) console.log(`\nPage errors:\n  ${pageErrors.join('\n  ')}`)
console.log('\nManual only: live camera scanning (CameraScanner + jsQR), a real phone camera opening a printed code, touchpad/touch gestures in the 3D world.')
process.exit(failed.length || pageErrors.length ? 1 : 0)
