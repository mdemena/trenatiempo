import { webkit, devices } from '@playwright/test'
const BASE = 'http://localhost:3000'
const EMOJI = devices['iPhone 13']
const EXE = '/home/mdemena/.cache/ms-playwright/webkit-2123/pw_run.sh'
async function main() {
  const browser = await webkit.launch({ executablePath: EXE })
  const ctx = await browser.newContext({ ...EMOJI })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}\n${e.stack||''}`))
  page.on('console', (m) => { if (m.type()==='error') errs.push(`[console:error] ${m.text()}`) })
  page.on('requestfailed', (r) => { if(!r.url().includes('google-analytics')) errs.push(`[requestfailed] ${r.url()} :: ${r.failure()?.errorText}`) })
  for (const code of ['35604','60000']) {
    errs.length = 0
    await page.goto(`${BASE}/es/estacion/${code}`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(()=>{})
    await page.waitForTimeout(4000)
    const text = await page.evaluate(() => document.body.innerText)
    console.log(`\n=== ESTACIÓN ${code} (WebKit/iOS mobile, dev:3000) ===`)
    console.log('tiene "Error del servidor":', text.includes('Error del servidor'))
    console.log('hay tren:', /C5|AVANT|R\d{2,3}|Dirección/.test(text))
    console.log('errores:', errs.length ? errs.join('\n  ') : 'NINGUNO')
    console.log('texto(150):', text.replace(/\s+/g,' ').slice(0,150))
  }
  await browser.close()
}
main().catch((e)=>{ console.error('FATAL', e.message); process.exit(1) })
