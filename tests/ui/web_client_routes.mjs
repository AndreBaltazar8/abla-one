// Soft navigation with the app in the page (Wasm): pages per route, written by
// `make gallery-web`, from a server that knows nothing about the app. Push, back,
// forward, reload and a direct link, with no session and no socket.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = 'build/gallery';
const types = {'.js': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.html': 'text/html; charset=utf-8'};
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://x').pathname;
  const file = name === '/' ? `${root}/client.html` : fs.existsSync(`${root}/routes${name}.html`) ? `${root}/routes${name}.html` : path.join(root, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(ok ? `ok   ${label}` : `FAIL ${label}`); if (!ok) failures++; };
const where = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 25)); }
  return false;
};
try {
  const noScript = await browser.newPage({javaScriptEnabled: false});
  await noScript.goto(base + '/form/2');
  check(await noScript.getByText('Formulário 2').count() === 1, 'direct link: first paint without JavaScript');
  await noScript.close();

  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [];
  const bad = [];
  const sockets = [];
  let documents = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) bad.push(r.url()); });
  page.on('websocket', ws => sockets.push(ws.url()));
  page.on('request', r => { if (r.resourceType() === 'document') documents++; });

  // A direct link, nested: the module hydrates the server's markup at that route.
  await page.goto(base + '/form/2');
  const before = await page.getByText('Formulário 2').elementHandle();
  await page.waitForSelector('html[data-one-ready]', {timeout: 10000});
  check(await page.getByText('Formulário 2').count() === 1, 'the module starts at the route');
  const after = await page.getByText('Formulário 2').elementHandle();
  check(await page.evaluate(([a, b]) => a === b, [before, after]), 'and hydrates its markup');
  check(await page.title() === 'Formulário 2 · Abla One', 'with its title');
  check(documents === 1, 'one page load');

  // Its back button has nowhere to go back to: the fallback.
  await page.getByRole('button', {name: 'Voltar'}).click();
  await page.getByText('CARTÃO').waitFor({timeout: 3000});
  check(where(page) === '/', 'a shared link\'s back goes to its fallback');

  // Push
  await page.getByRole('button', {name: 'Adicionar (0)'}).click();
  await page.getByText('Adicionar (1)').waitFor({timeout: 3000});
  await page.getByRole('button', {name: 'Pessoas'}).click();
  await page.getByText('Maya Townsend').waitFor({timeout: 3000});
  check(where(page) === '/people', `push (${where(page)})`);
  check(await page.title() === 'Pessoas · Abla One', 'push updates the title');
  check(documents === 1, 'push loads no page');
  await page.goBack();
  await page.getByText('Adicionar (1)').waitFor({timeout: 3000});
  check(where(page) === '/', 'back');
  await page.goForward();
  await page.getByText('Maya Townsend').waitFor({timeout: 3000});
  check(where(page) === '/people', 'forward');
  check(documents === 1, 'back and forward load no page');

  // Typing keeps one entry and the query is in the URL; a reload reads it.
  await page.getByRole('button', {name: 'Componentes'}).click();
  const search = page.getByPlaceholder('Pesquisar pessoas');
  await search.click();
  await search.pressSequentially('ma', {delay: 30});
  check(await until(() => where(page) === '/?q=ma'), `the query follows the field (${where(page)})`);
  await page.getByRole('button', {name: 'Pessoas'}).click();
  await page.getByText('Maya Townsend').waitFor({timeout: 3000});
  check(where(page) === '/people?q=ma', 'and the next move');
  await page.reload();
  await page.waitForSelector('html[data-one-ready]', {timeout: 10000});
  check(await until(async () => await page.getByText('Sofia Costa').count() === 0), 'reload: the module reads the query');
  check(await page.getByText('Maya Townsend').count() === 1, 'and shows that screen');

  // Scroll, from a route the static server has: at /form/1 relative URLs are one level up.
  await page.goto(base + '/form/1');
  await page.waitForSelector('html[data-one-ready]', {timeout: 10000});
  const area = () => page.evaluate(() => document.querySelector('.k-scroll').scrollTop);
  await page.evaluate(() => { document.querySelector('.k-scroll').scrollTop = 1500; });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Formulário seguinte')).click());
  await page.getByText('Formulário 2').waitFor({timeout: 3000});
  check(await until(async () => await area() === 0), 'a new route opens at the top');
  await page.goBack();
  await page.getByText('Formulário 1').waitFor({timeout: 3000});
  check(await until(async () => await area() === 1500), `back restores the scroll (${await area()})`);
  check(bad.length === 0, `every URL resolves on nested paths ${bad.join(' ')}`);
  check(sockets.length === 0, 'no WebSocket');
  check(errors.length === 0, `no page errors ${errors.join(' ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(failures === 0 ? 'PASS tests/ui/web_client_routes.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
