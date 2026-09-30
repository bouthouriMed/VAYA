import { chromium } from 'playwright';
const [,, url, out, w, h, scale] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale || 1 });
await p.goto(url); await p.waitForTimeout(300);
await p.screenshot({ path: out }); await b.close();
