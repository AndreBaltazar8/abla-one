// Wasm client services UI test: the services demo running in the browser,
// against tests/ui/echo.py (which also serves the page and module). Covers
// the same operations as the Android services test: requests with headers,
// byte and large bodies, a picked 1.5 MB file as a body and in multipart, a
// 3 MB response saved to a file and read back by range, typed secure storage
// in localStorage (surviving a reload), and timers.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'one-port-'));
const portfile = path.join(temp, 'port');
const server = spawn('python3', ['tests/ui/echo.py', '0', 'build/services'], {stdio: 'ignore', env: {...process.env, ONE_TEST_PORT_FILE: portfile}});
for (let i = 0; i < 100 && !fs.existsSync(portfile); i++) {
  if (server.exitCode !== null) throw new Error('echo server failed to start');
  await new Promise(r => setTimeout(r, 100));
}
const base = `http://127.0.0.1:${fs.readFileSync(portfile, 'utf8')}`;
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label, detail = '') => { console.log(ok ? `ok   ${label}` : `FAIL ${label} ${detail}`); if (!ok) failures++; };
const upload = Buffer.from(Array.from({length: 1572864}, (_, i) => (i * 7) % 256));
fs.mkdirSync('build/ui', {recursive: true});
fs.writeFileSync('build/ui/abla-one-upload.bin', upload);
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/client.html')).ok) break; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  const context = await browser.newContext({viewport: {width: 390, height: 900}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/client.html');
  await page.waitForSelector('html[data-one-ready]', {timeout: 10000});
  const line = async (name) => {
    // The log is one text node, newest line first.
    const lines = () => document.getElementById('services-log').textContent.split('\n');
    await page.waitForFunction(([n, f]) => eval(f)().some(l => l.startsWith(n + ':')), [name, lines.toString()], {timeout: 10000});
    return page.evaluate(([n, f]) => eval(f)().find(l => l.startsWith(n + ':')), [name, lines.toString()]);
  };
  const tap = (label) => page.getByRole('button', {name: label, exact: true}).click();

  await tap('JSON PUT'); let l = await line('json');
  check(l.includes('"m": "PUT"') && l.includes('"x": "one"') && l.includes('"type": "application/json"') && l.includes('\\"n\\":7'), 'PUT with custom header and JSON body', l);
  await tap('Bytes POST'); l = await line('bytes');
  check(l.includes('"len": 5') && l.includes('"type": "application/octet-stream"'), 'byte body', l);
  await tap('Large body'); l = await line('large');
  check(l.includes('"len": 500000'), '500 KB in-memory body', l);
  const chooser = page.waitForEvent('filechooser');
  await tap('Pick file');
  await (await chooser).setFiles('build/ui/abla-one-upload.bin');
  l = await line('pick');
  check(l.includes('abla-one-upload.bin 1572864'), 'picked file handle with name and size', l);
  await tap('Upload file'); l = await line('upload');
  check(l.includes('"len": 1572864'), '1.5 MB file as the body', l);
  await tap('Multipart'); l = await line('multipart');
  check(l.includes('"title:6"') && l.includes('"document:1572864"') && l.includes('multipart/form-data'), 'multipart with a text part and a file part', l);
  await tap('Download to file'); l = await line('download');
  check(l.includes('3145728') && l.includes('application/zip'), '3 MB response saved to a file', l);
  await tap('Read saved file'); l = await line('read');
  const expected = Buffer.from(Array.from({length: 16}, (_, i) => (1000000 + i) % 251)).toString('base64');
  check(l.endsWith(expected), 'ranged read of the saved file', l);
  await tap('Secure write'); l = await line('store');
  check(l.endsWith('204'), 'typed secure write');
  check(await page.evaluate(() => localStorage.getItem('one:demo')) === '{"count":3,"on":true}', 'stored in localStorage');
  await tap('Secure read'); l = await line('load');
  check(l.includes('200 count=3'), 'typed secure read', l);
  await tap('Timer'); l = await line('timer');
  check(l.endsWith('200'), 'timer');
  await page.reload();
  await page.waitForSelector('html[data-one-ready]', {timeout: 10000});
  await tap('Secure read'); l = await line('load');
  check(l.includes('200 count=3'), 'storage survives a reload', l);
  check(errors.length === 0, `no page errors ${errors.join(' ')}`);
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(temp, {recursive: true, force: true});
}
console.log(failures === 0 ? 'PASS tests/ui/web_client_services.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
