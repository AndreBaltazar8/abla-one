// Wasm client UI test: the gallery as a server-rendered page whose app then
// runs in the browser (build/gallery/client.html, `make gallery-client`).
// Served by a plain static server: no session and no WebSocket. Checks the
// first paint without JavaScript, that the module takes over the existing
// markup (hydration), and that presses, typing and navigation run locally.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = 'build/gallery';
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + '/') || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8'});
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(ok ? `ok   ${label}` : `FAIL ${label}`); if (!ok) failures++; };
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/client.html')).ok) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const noScript = await browser.newPage({javaScriptEnabled: false});
  await noScript.goto(base + '/client.html');
  check(await noScript.getByText('Adicionar (0)').count() === 1, 'SSR renders the page without JavaScript');
  await noScript.close();

  // A press on the painted page, before the host script has run at all.
  const early = await browser.newPage({viewport: {width: 390, height: 844}});
  let letGo;
  const held = new Promise(resolve => { letGo = resolve; });
  await early.route('**/host.js', async route => { await held; await route.continue(); });
  await early.goto(base + '/client.html', {waitUntil: 'commit'});
  await early.getByRole('button', {name: 'Adicionar (0)'}).click();
  letGo();
  await early.getByText('Adicionar (1)').waitFor({timeout: 5000}).then(() => check(true, 'a press before the script reaches the module'), () => check(false, 'a press before the script reaches the module'));
  await early.close();

  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [];
  const sockets = [];
  const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('websocket', ws => sockets.push(ws.url()));
  page.on('request', r => requests.push(r.url()));
  await page.goto(base + '/client.html');
  const before = await page.locator('button', {hasText: 'Adicionar'}).elementHandle();
  await page.waitForSelector('html[data-one-ready]', {timeout: 10000});
  check(requests.some(u => u.endsWith('/gallery.wasm')), 'the app module loads');
  const hydrated = await page.locator('button', {hasText: 'Adicionar'}).elementHandle();
  check(await page.evaluate(([a, b]) => a === b, [before, hydrated]), 'the module hydrates the server markup instead of replacing it');
  await page.getByRole('button', {name: 'Adicionar (0)'}).click();
  await page.getByText('Adicionar (1)').waitFor({timeout: 3000});
  check(true, 'a press runs in the page');
  await page.getByRole('button', {name: 'Adicionar (1)'}).click();
  await page.getByRole('button', {name: 'Adicionar (2)'}).click();
  await page.getByText('Adicionar (3)').waitFor({timeout: 3000});
  check(true, 'rapid presses are all delivered');
  const search = page.getByPlaceholder('Pesquisar pessoas');
  await search.click();
  await search.pressSequentially('ma', {delay: 40});
  check(await search.inputValue() === 'ma', 'typed text survives patches');
  await page.getByRole('button', {name: 'Pessoas'}).click();
  await page.getByText('Maya Townsend').waitFor({timeout: 3000});
  check(await page.getByText('Sofia Costa').count() === 0, 'the query filters the list in the page');
  await page.getByText('Maya Townsend').click();
  await page.getByRole('button', {name: 'Componentes'}).click();
  await page.getByText('Última pessoa aberta: Maya Townsend').waitFor({timeout: 3000});
  check(true, 'list rows and tabs work');
  const timing = await page.evaluate(async () => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Adicionar'));
    const start = performance.now();
    button.click();
    return performance.now() - start;
  });
  check(timing < 50, `a press re-renders synchronously in the page (${timing.toFixed(1)} ms)`);
  check(sockets.length === 0, 'no WebSocket: nothing runs on the server');
  check(errors.length === 0, `no page errors ${errors.join(' ')}`);
  await page.screenshot({path: 'build/ui/web-client-gallery.png'});
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? 'PASS tests/ui/web_client_gallery.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
