import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || '/tmp/vaya-shots';
mkdirSync(OUT, { recursive: true });

const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const sections = [
  'top',
  'journey-0',
  'journey-1',
  'journey-2',
  'journey-3',
  'journey-4',
  'journey-5',
  'passengers',
  'drivers',
  'trust',
  'final-cta',
];

async function shootLocale(browser, locale) {
  for (const [device, viewport] of Object.entries(viewports)) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: device === 'mobile' ? 2 : 1 });
    const page = await context.newPage();
    await page.goto(`http://localhost:4300/${locale}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    // full page
    await page.screenshot({ path: `${OUT}/${locale}-${device}-full.png`, fullPage: true });

    // hero
    await page.screenshot({ path: `${OUT}/${locale}-${device}-hero.png` });

    // scroll through the journey section in 6 steps + capture each
    const journeyHeight = await page.evaluate(() => {
      const el = document.getElementById('journey');
      return el ? el.getBoundingClientRect().height : 0;
    });
    const journeyTop = await page.evaluate(() => {
      const el = document.getElementById('journey');
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    });
    const scrollableRange = journeyHeight - viewport.height;

    for (let i = 0; i < 6; i++) {
      const progress = (i + 0.5) / 6;
      const target = journeyTop + scrollableRange * progress;
      await page.evaluate((y) => window.scrollTo(0, y), target);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${locale}-${device}-journey-step${i}.png` });
    }

    for (const id of ['passengers', 'drivers', 'trust', 'final-cta']) {
      const el = await page.$(`#${id}`);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${locale}-${device}-${id}.png` });
      }
    }

    await context.close();
  }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const locale of ['fr', 'en']) {
  await shootLocale(browser, locale);
}
await browser.close();
console.log('Done ->', OUT);
