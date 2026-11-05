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
  const child = spawn(executable, [], {cwd: process.cwd(), env: {...process.env, ONE_RECOVERY_TEST_DIR: directory, ONE_RECOVERY_TEST_CSS_NODE: name, ONE_RECOVERY_TEST_HOST:hostFile, ONE_RECOVERY_TEST_ASYNC_MS: '150', ONE_RECOVERY_TEST_DISABLED: disabled?'1':'0', ONE_TEST_PORT_FILE: portFile, ONE_TEST_PORT: '0'}, stdio: ['ignore', log, log]});
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
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${proxy.address().port}`;
  browser=await chromium.launch({executablePath:'/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
  const context=await browser.newContext({viewport:{width:1280,height:900},extraHTTPHeaders:{'X-Test-User':'alice'}});
  await context.addCookies([{name:'test-user',value:'alice',url:base}]);
  const page=await context.newPage();
  let documents=0;
  page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;});
  await page.goto(`${base}/recovery`);
  await page.waitForSelector('html[data-one-ready]');
  const boot=await page.evaluate(()=>({s:window.__one.s,proof:window.__one.proof}));
  const row=()=>JSON.parse(fs.readFileSync(path.join(directory,`${boot.s}.json`),'utf8'));
  const checkpoint=()=>JSON.parse(row().payload);
  const business=()=>fs.existsSync(path.join(directory,'raw-business.json'))?JSON.parse(fs.readFileSync(path.join(directory,'raw-business.json'),'utf8')):{count:0,seen:{}};
  const picked=async(name,bytes)=>{
    const chooser=page.waitForEvent('filechooser');
    await page.getByRole('button',{name:'Pick file',exact:true}).click();
    await (await chooser).setFiles({name,mimeType:'application/octet-stream',buffer:bytes});
    await wait(()=>checkpoint().app.file?.name===name && checkpoint().app.reading===0 && checkpoint().app.contentBytes>0,'picked file is durably ready',30000);
  };
  const result=async(status,count,timeout=30000)=>{
    await page.getByText(`Raw result: ${status}/${count}`,{exact:true}).waitFor({timeout});
    await wait(()=>checkpoint().app.rawStatus===status && checkpoint().app.rawCount===count,'raw completion is durable',timeout);
  };
  const big=Buffer.alloc(16*1024*1024,0x61);Buffer.from('raw-secret-not-a-checkpoint\0').copy(big);big[big.length-1]=0xff;
  await picked('large.bin',big);
  const baseline=row();
  const oldFrontier=checkpoint().frontier;
  if(process.env.ONE_RAW_OLD_CONTROL!=='1')fs.writeFileSync(path.join(directory,'raw-mid-hold'),'1');
  await page.getByRole('button',{name:'Send raw file',exact:true}).click();
  if(process.env.ONE_RAW_OLD_CONTROL==='1')await result(200,1,15000);
  else {
    await wait(()=>{
      if(checkpoint().app.rawStatus===501)throw new Error('old raw recovery501 path reached instead of shared materialization');
      return fs.existsSync(path.join(directory,'raw-mid-marker'));
    },'mid-assembly after thirty-two chunks',45000);
    const marker=JSON.parse(fs.readFileSync(path.join(directory,'raw-mid-marker'),'utf8'));
    check(marker.offset===8*1024*1024 && marker.request<0,'internal chunk IDs and ordered offsets stay separate from app requests');
    check(row().version>baseline.version && row().payload===baseline.payload && checkpoint().frontier===oldFrontier,'consumption-only CAS advances version while retaining exact app payload and unacknowledged frontier');
    check(business().count===0,'no HTTP effect is dispatched from partial materialization');
    socketNode='a';
    await kill(nodes.get('b'));
    fs.unlinkSync(path.join(directory,'raw-mid-hold'));
    await result(200,1,60000);
    check(Buffer.from(business().bodyBase64,'base64').equals(big),'new node replays and assembles all sixty-five exact binary chunks');
    check(Object.keys(business().seen).length===1 && business().count===1 && row().epoch>baseline.epoch,'node death during assembly produces exactly one fenced business effect on the new owner');
    check(documents===1,'raw assembly recovery keeps the same browser document');
    check(!row().payload.includes('raw-header-secret') && !row().payload.includes('/raw-upload') && !row().payload.includes('raw-secret-not-a-checkpoint') && !Object.hasOwn(checkpoint(),'rawRequest'),'checkpoints contain no raw request, private header or assembled bytes');
    await start('b');
    const small=Buffer.from('multipart\0binary ação');
    await picked('a"b.bin',small);
    await page.getByRole('button',{name:'Send multipart file',exact:true}).click();
    await result(200,2);
    const stored=business();
    const form=await new Response(Buffer.from(stored.bodyBase64,'base64'),{headers:{'content-type':stored.contentType}}).formData();
    check(JSON.stringify(form.getAll('tag'))===JSON.stringify(['first','last']),'independent multipart parser preserves duplicate text-part order');
    const files=form.getAll('same');
    check(files.length===2 && files.every(file=>file.name==='a"b.bin') && Buffer.from(await files[0].arrayBuffer()).equals(small) && Buffer.from(await files[1].arrayBuffer()).equals(small),'duplicate file parts preserve quoted filenames and exact binary bytes');
    const prior=business().count;
    fs.writeFileSync(path.join(directory,'raw-kill-after-effect'),'1');
    socketNode='b';
    await page.getByRole('button',{name:'Send raw file',exact:true}).click();
    await wait(()=>!alive(nodes.get('a')),'owner dies after raw effect before acknowledgement');
    await result(200,prior+1);
    check(business().count===prior+1 && Object.keys(business().seen).length===prior+1,'lost post-dispatch acknowledgement replays the same operation with one effect');
    check(documents===1,'multipart and post-effect failover also avoid page reload');
    await page.getByRole('button',{name:'Send oversized multipart',exact:true}).click();
    await result(413,prior+1);
    check(business().count===prior+1,'part-count refusal never reaches the business handler');
    fs.writeFileSync(path.join(directory,'raw-slow'),'1');
    const slowAt=Date.now();
    await page.getByRole('button',{name:'Send slow file',exact:true}).click();
    await result(504,prior+1,75000);
    const elapsed=Date.now()-slowAt;
    fs.unlinkSync(path.join(directory,'raw-slow'));
    check(elapsed>=59000 && elapsed<70000 && business().count===prior+1,'a real waiting client hits the sixty-second materialization deadline without an HTTP effect');
    check(documents===1,'deadline refusal keeps the existing document usable');
  }
  console.log(`PASS raw recovery: ${proofs} checks`);
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
