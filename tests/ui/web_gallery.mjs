// Web UI test for the gallery's server-rendered pages: layout at phone and
// desktop widths, no horizontal overflow, every icon loads, controls carry
// event ids, and keyboard focus is visible. Screenshots go to build/ui/.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = 'build/gallery';
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8'});
  fs.createReadStream(file).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
fs.mkdirSync('build/ui', {recursive: true});
let failures = 0;
const check = (ok, label) => { if (!ok) { failures++; console.log(`FAIL ${label}`); } };
try {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    for (const page of ['components', 'people']) {
      const tab = await browser.newPage({viewport: {width: w, height: h}});
      const missing = [];
      tab.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
      const errors = [];
      tab.on('pageerror', e => errors.push(e.message));
      await tab.goto(`${base}/${page}.html`);
      await tab.waitForLoadState('networkidle');
      const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, `${page} ${w}px has no horizontal overflow (${overflow})`);
      check(missing.length === 0, `${page} ${w}px loads every asset ${missing.join(' ')}`);
      check(errors.length === 0, `${page} ${w}px has no page errors`);
      const unwired = await tab.locator('button:not([data-one-press])').count();
      check(unwired === 0, `${page}: every button carries an event id`);
      const tabbar = await tab.locator('[aria-selected=true]').count();
      check(tabbar >= 1, `${page}: the active tab is marked selected`);
      await tab.keyboard.press('Tab');
      const focused = await tab.evaluate(() => document.activeElement?.tagName);
      check(focused === 'BUTTON' || focused === 'INPUT', `${page}: keyboard focus reaches a control`);
      await tab.screenshot({path: `build/ui/web-${page}-${w}.png`});
      await tab.close();
    }
  }
  // Each route has its own first paint.
  for (const [route, text] of [['people', 'Maya Townsend'], ['form/1', 'Formulário 1']]) {
    const direct = await browser.newPage({javaScriptEnabled: false});
    await direct.goto(`${base}/routes/${route}.html`);
    check(await direct.getByText(text).count() === 1, `routes/${route}: rendered for that route`);
    await direct.close();
  }
  const tab = await browser.newPage({viewport: {width: 390, height: 844}});
  await tab.goto(`${base}/components.html`);
  const box = await tab.locator('button', {hasText: 'Todas'}).boundingBox();
  check(box && box.width < 120, `chips hug their label (${box?.width})`);
  const primary = await tab.locator('button', {hasText: 'Adicionar'}).boundingBox();
  check(primary && Math.round(primary.height) === 48, `primary button is 48px tall (${primary?.height})`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? 'PASS tests/ui/web_gallery.mjs' : `${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
