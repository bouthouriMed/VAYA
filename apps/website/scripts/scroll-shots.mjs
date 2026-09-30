// node scripts/scroll-shots.mjs <url> <outPrefix> <w>x<h> <selector> <p1,p2,...>
// Screenshots at scroll progress points *within* the given section.
import { chromium } from 'playwright';
const [, , url, out, size, sel, ps] = process.argv;
const [w, h] = size.split('x').map(Number);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: w, height: h } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(1500);
for (const p of ps.split(',').map(Number)) {
  await page.evaluate(([sel, p]) => {
    const el = document.querySelector(sel);
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + (el.offsetHeight - window.innerHeight) * p);
  }, [sel, p]);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}_${String(p).replace('.', '')}.png` });
}
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await b.close();
