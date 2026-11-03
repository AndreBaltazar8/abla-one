import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'one-recovery-proof-'));
const executable = fs.realpathSync(process.env.ONE_RECOVERY_TEST_EXECUTABLE||'build/recovery-live');
const children = [];
const nodes = new Map();
const sockets = new Set();
const requests = [];
let socketNode = 'b';
let pageNode = 'a';
let proofs = 0;
let disabledConnections = 0;
let refuseUpload = 0;
const uploadNonces = [];
let browser;
const trace=[];
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const wait = async (test, label, milliseconds = 15000) => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { if (await test()) return; await pause(40); }
  throw new Error(`Timed out: ${label}`);
};
const check = (condition, label) => { assert(condition, label); proofs++; console.log(`ok   ${label}`); };
const start = async (name,disabled=false) => {
  const portFile = path.join(directory, `${name}-${children.length}.port`);
  const log = fs.openSync(path.join(directory, `${name}-${children.length}.log`), 'w');
  const hostFile=path.join(directory,`${name}-${children.length}.host.js`);fs.copyFileSync('src/backends/web/host.js',hostFile);
  const child = spawn(executable, [], {cwd: process.cwd(), env: {...process.env, ONE_RECOVERY_TEST_DIR: directory, ONE_RECOVERY_TEST_HOST:hostFile, ONE_RECOVERY_TEST_ASYNC_MS: '150', ONE_RECOVERY_TEST_DISABLED: disabled?'1':'0', ONE_TEST_PORT_FILE: portFile, ONE_TEST_PORT: '0'}, stdio: ['ignore', log, log]});
  fs.closeSync(log);
  children.push(child);
  await wait(() => {
    if (child.exitCode !== null) throw new Error(`Fixture ${name} exited ${child.exitCode}`);
    return fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').trim();
  }, `fixture ${name} listens`);
  const node = {child, hostFile, port: Number(fs.readFileSync(portFile, 'utf8').trim())};
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
  if (request.url.startsWith('/one/upload')) {
    uploadNonces.push(request.headers['x-one-upload']);
    if (refuseUpload > 0) { refuseUpload--; request.resume(); response.writeHead(503); response.end('unavailable'); return; }
  }
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
  if(socketNode==='off')disabledConnections++;
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
  const expectedHost=fs.readFileSync('src/backends/web/host.js','utf8');
  fs.writeFileSync(nodes.get('a').hostFile,"throw new Error('synthetic stale host protocol');");
  check(await (await fetch(`http://127.0.0.1:${nodes.get('a').port}/one/host.js`)).text()===expectedHost,'a running node keeps its matching host protocol when a later build replaces the source file');
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, extraHTTPHeaders: {'X-Test-User': 'alice'}});
  await context.addCookies([{name: 'test-user', value: 'alice', url: base}]);
  const page = await context.newPage();
  page.on('websocket', socket => {
    for (const direction of ['framereceived','framesent']) socket.on(direction, ({payload}) => {
      try {
        const v=JSON.parse(String(payload));
        trace.push({direction,t:v.t,r:v.r,a:v.a,c:v.c,ack:v.ack,n:v.n,id:v.id,at:v.at,p:v.p,nav:v.nav,effect:v.message?.t});
        if(trace.length>4096) trace.shift();
      } catch {}
    });
  });
  let navigations = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++; });
  page.on('pageerror', error => console.error('browser error:', error.message));
  await page.goto(`${base}/recovery`);
  await page.waitForSelector('html[data-one-ready]');
  const boot = await page.evaluate(() => ({s: window.__one.s, proof: window.__one.proof}));
  const publicContext=await browser.newContext();
  const publicPage=await publicContext.newPage();
  socketNode='a';
  const recordsBeforePublic=fs.readdirSync(directory).filter(name=>/^[a-f0-9]{32}\.json$/.test(name)).length;
  await publicPage.goto(`${base}/recovery/public`);
  await publicPage.locator('html[data-one-ready]').waitFor();
  check(await publicPage.evaluate(()=>!window.__one.proof) && fs.readdirSync(directory).filter(name=>/^[a-f0-9]{32}\.json$/.test(name)).length===recordsBeforePublic,'an excluded public page keeps readable legacy SSR and viewport interaction without a checkpoint');
  await publicPage.getByRole('textbox').fill('public-only draft');
  await publicPage.getByRole('button',{name:'Other view',exact:true}).click();
  await publicPage.waitForURL(`${base}/recovery/other`);
  check(await publicPage.getByRole('textbox').inputValue()==='public-only draft','an excluded local public session still dispatches legacy controls');
  await publicContext.close();
  socketNode='b';
  check((await context.cookies()).some(cookie => cookie.name === 'proof-bootstrap' && cookie.httpOnly), 'asynchronous creation delivers bootstrap cookies in the original SSR response');
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

  const openedTab = context.waitForEvent('page');
  await page.evaluate(() => window.open('/recovery', '_blank'));
  const second = await openedTab;
  await second.waitForSelector('html[data-one-ready]');
  const secondBoot = await second.evaluate(() => ({s: window.__one.s, proof: window.__one.proof}));
  check(secondBoot.s !== boot.s && await second.getByRole('textbox').inputValue() === '', 'new tab with cloned sessionStorage starts its own draft');
  await second.getByRole('textbox').fill('separate tab draft');
  await wait(() => JSON.parse(JSON.parse(fs.readFileSync(path.join(directory, `${secondBoot.s}.json`), 'utf8')).payload).app.draft === 'separate tab draft', 'second tab durable draft');
  // Deterministically poison the former origin-wide handoff. Both tabs must
  // recover their own claims despite the same cookies accompanying each GET.
  await context.addCookies([{name: 'one_resume', value: secondBoot.s, url: base}, {name: 'one_resume_proof', value: secondBoot.proof, url: base}]);
  await Promise.all([page.reload(), second.reload()]);
  await Promise.all([page.waitForSelector('html[data-one-ready]'), second.waitForSelector('html[data-one-ready]')]);
  check(await page.evaluate(() => window.__one.s) === boot.s && await second.evaluate(() => window.__one.s) === secondBoot.s && await page.getByRole('textbox').inputValue() === 'ação 📝 249' && await second.getByRole('textbox').inputValue() === 'separate tab draft', 'simultaneous reloads ignore shared resume cookies and retain per-tab drafts');
  const claim = await page.evaluate(() => JSON.parse(sessionStorage.getItem('one:claim:/')));
  check(Object.keys(claim).sort().join(',') === 'proof,s', 'browser claim storage contains only opaque session ID and proof');
  await second.close();
  // The explicit simultaneous reload above adds one document navigation.
  navigations--;

  await start('off',true);
  socketNode = 'off';
  await kill(nodes.get('b'));
  await wait(()=>disabledConnections>0,'recovery socket reaches a node whose feature is disabled');
  await pause(250);
  check(navigations===1 && await page.getByRole('textbox').inputValue()==='ação 📝 249','a node with recovery disabled cannot downgrade a private session or erase its local draft');
  const unavailableCookie=await fetch(`http://127.0.0.1:${nodes.get('off').port}/one/cookies?s=${boot.s}`,{method:'POST',headers:{'X-One-Proof':boot.proof}});
  check(unavailableCookie.status===503,'a disabled node cannot report successful private cookie delivery through its legacy handler');
  socketNode='a';
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

  fs.writeFileSync(path.join(directory, 'hold-reads'), '1');
  await fetch(`http://127.0.0.1:${nodes.get('a').port}/arm-effect-kill`, {headers: {'X-Test-User': 'alice'}});
  socketNode = 'b';
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: 'Pick file', exact: true}).click();
  const recoveredChooser = await chooser;
  await wait(() => !alive(nodes.get('a')), 'owner exits after checkpoint commit and before picker delivery');
  check(checkpoint().effects.some(effect => JSON.parse(effect.message).t === 'pick'), 'a committed picker effect survives owner death before browser delivery');
  await start('a');
  const uploadNode = nodes.get('a').port;
  refuseUpload = 4;
  await recoveredChooser.setFiles({name: 'ação.txt', mimeType: 'text/plain', buffer: Buffer.from('shared opaque bytes ç')});
  await wait(() => checkpoint().files?.length === 1 && checkpoint().app.reading > 0, 'pending file read descriptor is durable before owner loss');
  socketNode = 'a';
  await kill(nodes.get('b'));
  fs.unlinkSync(path.join(directory, 'hold-reads'));
  await page.getByText('Read bytes: shared opaque bytes ç', {exact: true}).waitFor();
  check(checkpoint().app.reading === 0 && checkpoint().files.length === 0, 'pending file read is resubmitted on the next owner and consumed with its checkpoint');
  check(requests.some(request => request.url.startsWith('/one/upload') && request.port === uploadNode), 'upload completes on a different node and attached owner reads its opaque handle');
  check(uploadNonces.length === 5 && /^[a-f0-9]{32}$/.test(uploadNonces[0]) && uploadNonces.every(nonce => nonce === uploadNonces[0]), 'temporary lease contention retries beyond three attempts with the same opaque upload nonce');
  check(navigations === 1, 'cookie and upload recovery keep the document alive');
  await start('b');

  pageNode = 'b'; socketNode = 'b';
  await page.reload();
  await page.waitForSelector('html[data-one-ready]');
  check(await page.getByRole('textbox').inputValue() === 'ação 📝 249' && (await page.evaluate(() => window.__one.s)) === boot.s, 'explicit page reload can restore the same draft on another node');
  await page.getByText('Read bytes: shared opaque bytes ç', {exact: true}).waitFor();
  check(!Object.hasOwn(checkpoint().app, 'content') && checkpoint().app.contentBytes > 0 && checkpoint().files.every(job => job.request > 0), 'trusted pre-ready hydration restores file buffers without storing bytes or temporary request IDs in the checkpoint');
  await page.getByRole('textbox').fill('after reload');
  await page.getByRole('button', {name: 'Edit view', exact: true}).click();
  await page.waitForURL(`${base}/recovery`);
  await stored('after reload');
  check(checkpoint().typed > 250, 'fresh page counters resume above saved typing and held submit is released');
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  await page.waitForURL(`${base}/recovery/other`);
  check(await page.getByRole('textbox').inputValue() === 'after reload', 'durable navigation effects preserve draft and browser history');
  await page.locator('[data-one="view-title"]').filter({hasText: 'Other view'}).waitFor();
  await page.getByRole('button', {name: 'Edit view', exact: true}).click();
  await page.waitForURL(`${base}/recovery`);
  check(await page.evaluate(() => !Object.values(sessionStorage).some(value => value.includes('after reload') || value.includes('ação 📝'))), 'browser persistence contains opaque delivery IDs and no draft payload');

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

  fs.writeFileSync(path.join(directory, 'unavailable'), '1');
  await page.evaluate(() => {
    const field = document.querySelector('input');
    for (let i = 0; i < 600; i++) {
      field.value = 'outage burst ' + i;
      field.dispatchEvent(new Event('input', {bubbles: true}));
    }
  });
  await page.locator('[data-one-backpressure]').waitFor({timeout: 10000});
  check(await page.getByRole('textbox').inputValue() === 'outage burst 599', 'full replay buffer keeps the latest draft during a shared-store outage');
  fs.unlinkSync(path.join(directory, 'unavailable'));
  await stored('outage burst 599');
  await page.locator('[data-one-backpressure]').waitFor({state: 'hidden', timeout: 15000});
  check(await page.getByRole('textbox').inputValue() === 'outage burst 599', 'backpressure drains the retained draft after the store recovers');

  await start('b'); socketNode = 'b';
  await fetch(`http://127.0.0.1:${nodes.get('a').port}/arm-kill`, {headers: {'X-Test-User': 'alice'}});
  await page.getByRole('button', {name: 'Commit once', exact: true}).click();
  await page.getByText('Committed mutations: 1', {exact: true}).waitFor({timeout: 15000});
  const business = JSON.parse(fs.readFileSync(path.join(directory, 'business.json'), 'utf8'));
  check(business.count === 1 && Object.keys(business.seen).length === 1, 'death after business commit before checkpoint replays one opaque operation key');
  check(navigations === 2 && await page.getByRole('textbox').inputValue() === 'outage burst 599', 'business replay preserves route, view and draft without page reload');

  const foreign = await fetch(`${base}/one/cookies?s=${boot.s}`, {method: 'POST', headers: {'X-Test-User': 'bob', 'X-One-Proof': boot.proof}});
  check(foreign.status === 403, 'foreign account cannot read cookie or recovery storage with another tab capability');
  const tampered = await fetch(`${base}/one/cookies?s=${boot.s}`, {method: 'POST', headers: {'X-Test-User': 'alice', 'X-One-Proof': '0'.repeat(64)}});
  check(tampered.status === 403, 'tampered tab capability is refused');

  const rawContext = await browser.newContext();
  await rawContext.addCookies([{name: 'test-user', value: 'alice', url: base}]);
  const rawPage = await rawContext.newPage();
  await rawPage.route('**/one/host.js', route => route.abort());
  await rawPage.goto(`${base}/recovery`);
  const rawBoot = await rawPage.evaluate(() => window.__one);
  const rawPath = path.join(directory, `${rawBoot.s}.json`);
  const rawCheckpoint = JSON.parse(JSON.parse(fs.readFileSync(rawPath, 'utf8')).payload);
  const field = rawCheckpoint.maps.at(-1).events.find(event => event.place.endsWith('#onChange'));
  fs.rmSync(path.join(directory, 'restoring'), {force: true});
  fs.writeFileSync(path.join(directory, 'hold-ready'), '1');
  fs.writeFileSync(path.join(directory, 'attach-conflict'), '1');
  await rawPage.evaluate(boot => new Promise(resolve => {
    window.rawFrames = [];
    window.rawSocket = new WebSocket(`${location.origin.replace('http', 'ws')}/one/live?s=${boot.s}`);
    rawSocket.onmessage = message => rawFrames.push(JSON.parse(message.data));
    rawSocket.onopen = () => { rawSocket.send(JSON.stringify({t: 'hello', proof: boot.proof, r: boot.r, w: 1280})); resolve(); };
  }), rawBoot);
  await pause(500);
  check(!fs.existsSync(path.join(directory, 'restoring')) && await rawPage.evaluate(() => rawFrames.length === 0 && rawSocket.readyState === WebSocket.OPEN), 'attach conflict holds the original recovery claim without opening a fresh app');
  fs.unlinkSync(path.join(directory, 'attach-conflict'));
  await wait(() => fs.existsSync(path.join(directory, 'restoring')), 'restore reaches deliberately delayed hydration');
  await rawPage.evaluate(({saved, field}) => {
    rawSocket.send(JSON.stringify({t: 'event', r: saved.revision, id: field.id, v: 'injected before authorization', c: saved.typed + 1, n: saved.frontier + 1, u: 'crafted-before-ready'}));
    rawSocket.send(JSON.stringify({t: 'route', p: '/recovery/other', e: 'forged-entry', n: saved.asked + 1}));
  }, {saved: rawCheckpoint, field});
  await pause(300);
  check(await rawPage.evaluate(() => rawFrames.length) === 0, 'crafted input and route frames receive no patch or acknowledgement before hydration');
  fs.unlinkSync(path.join(directory, 'hold-ready'));
  await wait(() => rawPage.evaluate(() => rawFrames.some(frame => frame.t === 'patch')), 'authorized restored app emits first patch');
  const hydrated = JSON.parse(JSON.parse(fs.readFileSync(rawPath, 'utf8')).payload);
  check(hydrated.app.draft === '' && hydrated.route === '/recovery' && hydrated.frontier === 0 && hydrated.asked === 0, 'server rejects pre-hydration controls without changing draft, route or durable frontier');
  const endingOwner=JSON.parse(fs.readFileSync(rawPath,'utf8')).owner;
  assert.match(endingOwner,/^[a-f0-9]{32}$/);
  fs.writeFileSync(path.join(directory, `end-session-${endingOwner}`), rawBoot.s);
  await wait(() => JSON.parse(fs.readFileSync(rawPath, 'utf8')).revoked, 'asynchronous end commits a durable tombstone');
  const ended = await fetch(`${base}/one/cookies?s=${rawBoot.s}`, {method: 'POST', headers: {'X-Test-User': 'alice', 'X-One-Proof': rawBoot.proof}});
  check(ended.status === 403, 'an ended session cannot recover cookies using its old tab proof');
  await rawContext.close();
  console.log(`PASS recovery: ${proofs} checks`);
} finally {
  fs.writeFileSync(path.join(directory,'transport.json'),JSON.stringify(trace));
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
