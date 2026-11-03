import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'one-recovery-proof-'));
const executable = fs.realpathSync('build/recovery-live');
const children = [];
const nodes = new Map();
const sockets = new Set();
const requests = [];
let socketNode = 'b';
let pageNode = 'a';
let proofs = 0;
let browser;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const wait = async (test, label, milliseconds = 15000) => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { if (await test()) return; await pause(40); }
  throw new Error(`Timed out: ${label}`);
};
const check = (condition, label) => { assert(condition, label); proofs++; console.log(`ok   ${label}`); };
const start = async name => {
  const portFile = path.join(directory, `${name}-${children.length}.port`);
  const log = fs.openSync(path.join(directory, `${name}-${children.length}.log`), 'w');
  const child = spawn(executable, [], {cwd: process.cwd(), env: {...process.env, ONE_RECOVERY_TEST_DIR: directory, ONE_TEST_PORT_FILE: portFile, ONE_TEST_PORT: '0'}, stdio: ['ignore', log, log]});
  fs.closeSync(log);
  children.push(child);
  await wait(() => {
    if (child.exitCode !== null) throw new Error(`Fixture ${name} exited ${child.exitCode}`);
    return fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').trim();
  }, `fixture ${name} listens`);
  const node = {child, port: Number(fs.readFileSync(portFile, 'utf8').trim())};
  nodes.set(name, node);
  return node;
};
const alive = node => node && node.child.exitCode === null && node.child.signalCode === null;
const target = name => alive(nodes.get(name)) ? nodes.get(name) : [...nodes.values()].find(alive);
const kill = async node => {
  const running = fs.realpathSync(`/proc/${node.child.pid}/exe`);
  assert.equal(running, executable, 'kill only this proof executable');
  node.child.kill('SIGKILL');
  await wait(() => node.child.exitCode !== null || node.child.signalCode !== null, 'owned fixture exits');
};
const proxy = http.createServer((request, response) => {
  const alternate = socketNode === 'a' ? 'b' : 'a';
  const name = request.url.startsWith('/one/upload') || request.url.startsWith('/one/cookies') ? alternate : pageNode;
  const node = target(name);
  if (!node) { response.writeHead(503); response.end('unavailable'); return; }
  requests.push({url: request.url, port: node.port});
  const upstream = http.request({host: '127.0.0.1', port: node.port, method: request.method, path: request.url, headers: request.headers}, incoming => {
    response.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(503); response.end('unavailable'); });
  request.pipe(upstream);
});
proxy.on('upgrade', (request, socket, head) => {
  const node = target(socketNode);
  if (!node) { socket.destroy(); return; }
  const upstream = net.connect(node.port, '127.0.0.1', () => {
    upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${request.rawHeaders.map((value, index) => index % 2 ? `${value}\r\n` : `${value}: `).join('')}\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  sockets.add(socket); sockets.add(upstream);
  socket.on('close', () => { sockets.delete(socket); upstream.destroy(); });
  upstream.on('close', () => { sockets.delete(upstream); socket.destroy(); });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

try {
  await start('a'); await start('b');
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, extraHTTPHeaders: {'X-Test-User': 'alice'}});
  await context.addCookies([{name: 'test-user', value: 'alice', url: base}]);
  const page = await context.newPage();
  let navigations = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++; });
  page.on('pageerror', error => console.error('browser error:', error.message));
  await page.goto(`${base}/recovery`);
  await page.waitForSelector('html[data-one-ready]');
  const boot = await page.evaluate(() => ({s: window.__one.s, proof: window.__one.proof}));
  const row = () => JSON.parse(fs.readFileSync(path.join(directory, `${boot.s}.json`), 'utf8'));
  const checkpoint = () => JSON.parse(row().payload);
  const stored = async text => wait(() => checkpoint().app.draft === text, `durable draft ${text.length} bytes`);
  check(Boolean(boot.proof) && row().epoch >= 2, 'page from node A attaches on node B using shared state');

  const before = row().writes;
  const started = Date.now();
  await page.getByRole('textbox').focus();
  await page.evaluate(async () => {
    const field = document.querySelector('input');
    for (let i = 0; i < 250; i++) {
      field.value = `ação 📝 ${i}`;
      field.dispatchEvent(new Event('input', {bubbles: true}));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  });
  await stored('ação 📝 249');
  const elapsed = Date.now() - started;
  const writes = row().writes - before;
  check(writes <= Math.ceil(elapsed / 1000) + 1 && writes < 15, `typing250 edits: ${writes} durable writes in${elapsed}ms`);
  check(checkpoint().frontier === 250 && checkpoint().typed === 250, 'event and input acknowledgements name the durable typing frontier');

  socketNode = 'a';
  await kill(nodes.get('b'));
  await wait(() => row().epoch >= 3 && page.evaluate(() => !document.documentElement.hasAttribute('data-one-offline')), 'node A recovers dead node B');
  await page.waitForFunction(() => document.querySelector('input').value === 'ação 📝 249');
  check(navigations === 1 && page.url() === `${base}/recovery`, 'node death restores route and draft without reloading the page');

  await page.getByRole('button', {name: 'Other view', exact: true}).click();
  await page.waitForURL(`${base}/recovery/other`);
  check(await page.getByRole('textbox').inputValue() === 'ação 📝 249', 'view navigation keeps the restored draft');
  await start('b');
  await page.getByRole('button', {name: 'Store cookie', exact: true}).click();
  await wait(async () => (await context.cookies()).some(cookie => cookie.name === 'test-cookie'), 'cookie written by another node');
  const cookie = (await context.cookies()).find(value => value.name === 'test-cookie');
  check(Buffer.from(cookie.value, 'base64').toString() === JSON.stringify('cookie-value') && cookie.httpOnly, 'another node reads latest durable cookie storage and retains HttpOnly');
  check(requests.some(request => request.url.startsWith('/one/cookies') && request.port === nodes.get('b').port), 'cookie request reaches a node without the attached app');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: 'Pick file', exact: true}).click();
  await (await chooser).setFiles({name: 'ação.txt', mimeType: 'text/plain', buffer: Buffer.from('shared opaque bytes ç')});
  await page.getByText('Read bytes: shared opaque bytes ç', {exact: true}).waitFor();
  check(requests.some(request => request.url.startsWith('/one/upload') && request.port === nodes.get('b').port), 'upload completes on a different node and attached owner reads its opaque handle');
  check(navigations === 1, 'cookie and upload recovery keep the document alive');

  pageNode = 'b'; socketNode = 'b';
  await page.reload();
  await page.waitForSelector('html[data-one-ready]');
  check(await page.getByRole('textbox').inputValue() === 'ação 📝 249' && (await page.evaluate(() => window.__one.s)) === boot.s, 'explicit page reload can restore the same draft on another node');
  await page.getByRole('textbox').fill('after reload');
  await page.getByRole('button', {name: 'Edit view', exact: true}).click();
  await page.waitForURL(`${base}/recovery`);
  await stored('after reload');
  check(checkpoint().typed > 250, 'fresh page counters resume above saved typing and held submit is released');

  fs.writeFileSync(path.join(directory, 'unavailable'), '1');
  await page.getByRole('textbox').fill('unacked during outage');
  await page.getByRole('textbox').blur();
  await pause(1300);
  check(checkpoint().app.draft === 'after reload' && await page.getByRole('textbox').inputValue() === 'unacked during outage', 'store outage neither acknowledges nor erases a blurred local draft');
  socketNode = 'a';
  await kill(nodes.get('b'));
  await pause(1200);
  fs.unlinkSync(path.join(directory, 'unavailable'));
  await stored('unacked during outage');
  check(navigations === 2 && await page.getByRole('textbox').inputValue() === 'unacked during outage', 'unacknowledged typing replays on a new owner without reload or input loss');

  await start('b'); socketNode = 'b';
  await fetch(`http://127.0.0.1:${nodes.get('a').port}/arm-kill`, {headers: {'X-Test-User': 'alice'}});
  await page.getByRole('button', {name: 'Commit once', exact: true}).click();
  await page.getByText('Committed mutations: 1', {exact: true}).waitFor({timeout: 15000});
  const business = JSON.parse(fs.readFileSync(path.join(directory, 'business.json'), 'utf8'));
  check(business.count === 1 && Object.keys(business.seen).length === 1, 'death after business commit before checkpoint replays one opaque operation key');
  check(navigations === 2 && await page.getByRole('textbox').inputValue() === 'unacked during outage', 'business replay preserves route, view and draft without page reload');

  const foreign = await fetch(`${base}/one/cookies?s=${boot.s}`, {method: 'POST', headers: {'X-Test-User': 'bob', 'X-One-Proof': boot.proof}});
  check(foreign.status === 403, 'foreign account cannot read cookie or recovery storage with another tab capability');
  const tampered = await fetch(`${base}/one/cookies?s=${boot.s}`, {method: 'POST', headers: {'X-Test-User': 'alice', 'X-One-Proof': '0'.repeat(64)}});
  check(tampered.status === 403, 'tampered tab capability is refused');
  console.log(`PASS recovery: ${proofs} checks`);
} finally {
  if (browser) await browser.close();
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => proxy.close(resolve));
  for (const child of children) {
    try { if (fs.realpathSync(`/proc/${child.pid}/exe`) === executable) child.kill('SIGTERM'); } catch {}
  }
  await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve))));
  // Keep exact owned evidence on failures too; never remove another run's tree.
  console.log(`Evidence directory: ${directory}`);
}
