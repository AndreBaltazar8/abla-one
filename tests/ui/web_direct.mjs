// Direct uploads in a real browser: the page PUTs a picked file's parts to storage (here a local stand-in that answers
// as S3 does, with CORS and ETags) and the live server only relays the picker and the answers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';

let checks = 0;
const check = (value, label) => { assert(value, label); checks++; console.log(`ok ${label}`); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const parts = new Map();
let failNext = 1;
let liveBytes = 0;
const storage = http.createServer((request, response) => {
  const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': 'ETag'};
  if (request.method === 'OPTIONS') { response.writeHead(204, cors); return response.end(); }
  const part = Number(new URL(request.url, 'http://x').searchParams.get('partNumber'));
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    // The second part fails once, as storage sometimes does: the page tries it again.
    if (part === 2 && failNext > 0) { failNext--; response.writeHead(503, cors); return response.end(); }
    const body = Buffer.concat(chunks);
    parts.set(part, body);
    response.writeHead(200, {...cors, ETag: `"${createHash('md5').update(body).digest('hex')}"`});
    response.end();
  });
});
await new Promise(resolve => storage.listen(0, '127.0.0.1', resolve));
const storageBase = `http://127.0.0.1:${storage.address().port}`;

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'one-direct-'));
const portFile = path.join(directory, 'port');
const executable = fs.realpathSync('build/direct-live');
const child = spawn(executable, [], {env: {...process.env, ONE_TEST_PORT_FILE: portFile, ONE_DIRECT_STORAGE: storageBase}, stdio: ['ignore', 'inherit', 'inherit']});
let browser;
try {
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await pause(100);
  const base = `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8').trim()}`;
  browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
  const page = await browser.newPage();
  // What reaches the live server: no file bytes.
  page.on('websocket', socket => socket.on('framesent', event => { liveBytes += String(event.payload).length; }));
  page.on('request', request => { if (request.url().startsWith(base) && request.method() === 'POST') liveBytes += (request.postDataBuffer() || Buffer.alloc(0)).length; });
  await page.goto(`${base}/`);
  await page.waitForSelector('html[data-one-ready]');
  const bytes = Buffer.alloc(3 * 1048576 + 12345);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 253;
  const choose = async (name, buffer) => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Pick big file'}).click();
    await (await chooser).setFiles({name, mimeType: 'application/zip', buffer});
  };
  await choose('big.zip', bytes);
  await page.getByText(/^parts /).waitFor({timeout: 30000});
  const shown = await page.getByText(/^parts /).textContent();
  const joined = Buffer.concat([1, 2, 3, 4].map(n => parts.get(n) || Buffer.alloc(0)));
  check(parts.size === 4 && joined.equals(bytes), `the page sent ${bytes.length} bytes as 4 parts of 1 MiB, in order`);
  for (const n of [1, 2, 3, 4]) check(shown.includes(`${n}="${createHash('md5').update(parts.get(n)).digest('hex')}"`), `part ${n}'s ETag comes back to the app`);
  check(failNext === 0, 'a part storage refused once was sent again');
  check(liveBytes < 100000, `the file's bytes never went to the live server (${liveBytes} bytes of messages)`);

  await choose('huge.zip', Buffer.alloc(5242881));
  await page.getByText('error: File exceeds the upload limit').waitFor();
  check(true, 'a file over the picker\'s limit is refused in the page');

  await page.getByRole('button', {name: 'Forget file'}).click();
  await page.getByText('released').waitFor();
  await page.getByRole('button', {name: 'Send again'}).click();
  await page.getByText('error: Direct file unavailable').waitFor();
  check(true, 'a released file can no longer be sent');

  await page.reload();
  await page.waitForSelector('html[data-one-ready]');
  const cancel = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: 'Pick big file'}).click();
  await (await cancel).setFiles([]);
  await page.getByText('cancelled').waitFor();
  check(true, 'a cancelled pick completes empty');
  console.log(`web_direct: ${checks} checks`);
} finally {
  if (browser) await browser.close();
  child.kill('SIGTERM');
  storage.close();
  fs.rmSync(directory, {recursive: true, force: true});
}
