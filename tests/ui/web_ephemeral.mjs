import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';

const evidenceRoot=path.resolve(process.env.ONE_EPHEMERAL_TEST_ROOT||'build/ephemeral-evidence');
fs.mkdirSync(evidenceRoot,{recursive:true,mode:0o700});
const directory=fs.mkdtempSync(path.join(evidenceRoot,'one-private593-'));
const executable=fs.realpathSync('build/ephemeral-live');
const secret='SYNTHETIC_PRIVATE_BANK_BYTES_593';
const filename='SYNTHETIC_PRIVATE_FILE_593.txt';
let child,browser,page,port=0,sequence=0;
const frames=[];
const sent=[];
console.log(`synthetic evidence ${directory}`);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(test,label)=>{const end=Date.now()+15000;while(Date.now()<end){if(await test())return;await pause(30);}throw new Error(label);};
let checks=0;
const check=(value,label)=>{assert(value,label);checks++;console.log(`ok ${label}`);};
const start=async()=>{
  const portFile=path.join(directory,`port${++sequence}`);
  const log=fs.openSync(path.join(directory,`node${sequence}.log`),'w');
  child=spawn(executable,[],{env:{...process.env,ONE_RECOVERY_TEST_DIR:directory,ONE_TEST_PORT:String(port),ONE_TEST_PORT_FILE:portFile},stdio:['ignore',log,log]});fs.closeSync(log);
  await wait(()=>{if(child.exitCode!==null)throw new Error(`fixture exited ${child.exitCode}`);return fs.existsSync(portFile);},'listen');
  port=Number(fs.readFileSync(portFile,'utf8'));
};
const kill=async()=>{if(!child || child.exitCode!==null || child.signalCode!==null)return;assert.equal(fs.realpathSync(`/proc/${child.pid}/exe`),executable);child.kill('SIGKILL');await wait(()=>child.exitCode!==null || child.signalCode!==null,'owned process exits');};
const scan=()=>{
  for(const entry of fs.readdirSync(directory)){
    const file=path.join(directory,entry);if(!fs.statSync(file).isFile())continue;
    const bytes=fs.readFileSync(file);
    for(const sentinel of [secret,filename,Buffer.from(secret).toString('base64')])assert(!bytes.includes(Buffer.from(sentinel)),`private sentinel persisted in ${entry}`);
  }
  check(!fs.existsSync(path.join(directory,'unexpected-private-inspect')),'real store receives no private body or original name');
};
try{
  await start();
  browser=await chromium.launch({executablePath:'/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
  const context=await browser.newContext({extraHTTPHeaders:{'X-Test-User':'alice'}});
  const base=`http://127.0.0.1:${port}`;
  await context.addCookies([{name:'test-user',value:'alice',url:base}]);
  page=await context.newPage();
  page.on('websocket',socket=>{socket.on('framereceived',event=>frames.push(event.payload));socket.on('framesent',event=>sent.push(event.payload));});
  await page.goto(`${base}/private`);
  await page.waitForSelector('html[data-one-ready]');
  const choose=async()=>{const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'Choose private file',exact:true}).click()]);await chooser.setFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from(secret)});};
  const visible=()=>page.getByText(secret,{exact:true}).isVisible();
  fs.writeFileSync(path.join(directory,'hold-private-inspect'),'1');
  await choose();
  await wait(()=>fs.existsSync(path.join(directory,'private-inspect-pending')),'real HTTP upload reaches asynchronous authorization');
  scan();check(!(await visible()),'pending authorization exposes no bytes to app');
  fs.unlinkSync(path.join(directory,'hold-private-inspect'));
  await wait(visible,'authorized volatile read reaches app');scan();
  check(await visible(),'actual chooser/upload/read works with recovery enabled');
  const discardCount=()=>sent.filter(frame=>{try{return JSON.parse(frame).t==='ephemeral-discard';}catch{return false;}}).length;
  const before=discardCount();
  const [receiptChooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'Choose receipt',exact:true}).click()]);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await pause(100);
  check(discardCount()===before,'controlled OS receipt-picker handoff preserves the active private selection');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  const receiptDone=page.waitForResponse(response=>response.url().includes('/one/upload') && new URL(response.url()).searchParams.get('kind')==='files' && response.status()===200);
  await receiptChooser.setFiles({name:'SYNTHETIC_RECEIPT_593.txt',mimeType:'text/plain',buffer:Buffer.from('PUBLIC_RECEIPT_BYTES')});
  await receiptDone;
  check(await visible(),'ordinary receipt completion leaves private candidate memory intact');scan();
  await page.getByRole('button',{name:'Discard private file',exact:true}).click();
  await wait(async()=>!(await visible()),'cancel clears app');scan();
  await choose();await wait(visible,'second private read');
  fs.writeFileSync(path.join(directory,'expire-private'),'1');
  await wait(async()=>!(await visible()),'server-enforced expiry clears app');scan();
  await choose();await wait(visible,'third private read');
  await page.reload();await page.waitForSelector('html[data-one-ready]');
  await wait(async()=>!(await visible()),'browser navigation discards private flow');scan();
  check(!(await visible()),'reload/disconnect clears private state even while its node remains alive');
  await choose();await wait(visible,'fourth private read');
  await kill();scan();await start();
  await page.reload();await page.waitForSelector('html[data-one-ready]');await page.getByRole('button',{name:'Choose private file',exact:true}).waitFor();
  await wait(async()=>!(await visible()),'node loss cannot reconstruct private bytes');scan();
  check(!(await visible()),'fresh process and resumed browser do not restore private file or rows');
  check((await page.evaluate(()=>Object.keys(localStorage).length))===0,'browser localStorage receives no private state');
  console.log(`PASS ephemeral browser ${checks} checks; synthetic evidence ${directory}`);
}catch(error){
  fs.writeFileSync(path.join(directory,'failure-frames.json'),JSON.stringify(frames));
  if(page){fs.writeFileSync(path.join(directory,'failure.html'),await page.content());await page.screenshot({path:path.join(directory,'failure.png')});}
  throw error;
}finally{await browser?.close();await kill();}
