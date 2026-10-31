// The server restarts under a live page (tests/ui/live.sh stops it first): the page reloads at the
// screen it was on, since the screen is in its URL, and carries on in a new session.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
const base = 'http://127.0.0.1:8950';
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(ok ? `ok   ${label}` : `FAIL ${label}`); if (!ok) failures++; };
const start = async () => {
  const server = spawn('./build/gallery-live', {stdio: 'inherit'});
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/'); break; } catch (_) { await new Promise(r => setTimeout(r, 100)); }
  }
  return server;
};
const stop = (server) => new Promise((done) => { server.once('exit', done); server.kill(); });
let server = await start();
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  await page.goto(base + '/');
  await page.waitForTimeout(200);
  await page.getByRole('button', {name: 'Abrir formulário'}).click();
  await page.getByText('Formulário 1').waitFor({timeout: 5000});
  check(new URL(page.url()).pathname === '/form/1', 'soft navigation moved the URL');
  const before = await page.evaluate(() => window.__one.s);
  await stop(server);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-one-offline'), null, {timeout: 5000});
  server = await start();
  await page.waitForFunction((s) => window.__one && window.__one.s !== s, before, {timeout: 20000});
  await page.getByText('Formulário 1').waitFor({timeout: 5000});
  check(new URL(page.url()).pathname === '/form/1', 'after a restart the page is at the same route');
  check(await page.getByRole('button', {name: 'Voltar'}).count() === 1, 'showing that screen, not the start');
  await page.waitForTimeout(200);
  await page.getByRole('button', {name: 'Voltar'}).click();
  await page.getByText('Adicionar (0)').waitFor({timeout: 5000});
  check(true, 'and it works: a new session answers');
} finally {
  await browser.close();
  await stop(server);
}
console.log(failures === 0 ? 'PASS tests/ui/web_live_restart.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
