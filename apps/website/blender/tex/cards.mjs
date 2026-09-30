import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 630 }, deviceScaleFactor: 1.5 });
await p.goto('file:///C:/Users/User/Desktop/VAYA/apps/website/blender/tex/cards.html');
const card = document => document.getElementById('id');
await p.screenshot({ path: 'blender/tex/card_id.png' });
await p.evaluate(() => {
  const c = document.getElementById('id');
  c.className = 'card b';
  c.innerHTML = `<div class="top"><div class="brand">VAYA</div><div class="tag" style="color:#9FD3E6;border-color:rgba(159,211,230,.5)">✓ Permis vérifié</div></div>
  <h2>Permis de conduire</h2><div class="lines" style="width:62%"><div style="width:90%"></div><div style="width:65%"></div><div style="width:78%"></div></div>
  <div class="chip" style="background:linear-gradient(135deg,#BFE3EE,#6FA3B6)"></div>`;
});
await p.screenshot({ path: 'blender/tex/card_licence.png' });
await p.evaluate(() => {
  const c = document.getElementById('id');
  c.className = 'card c';
  c.innerHTML = `<div class="top"><div class="brand">VAYA</div><div class="tag" style="color:#F0D59A;border-color:rgba(240,213,154,.5)">✓ Véhicule enregistré</div></div>
  <div class="plate" dir="ltr" style="unicode-bidi:isolate">123 <span dir="rtl" style="unicode-bidi:isolate">تونس</span> 4567</div>
  <div class="lines" style="width:55%;margin-top:30px"><div style="width:85%"></div><div style="width:55%"></div></div>`;
});
await p.screenshot({ path: 'blender/tex/card_vehicle.png' });
await b.close();
