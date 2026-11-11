import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const base=process.argv[2] || process.env.ONE_TEST_BASE;
const browser=await chromium.launch({executablePath:'/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures=0;
const check=(ok,label)=>{console.log(`${ok?'ok  ':'FAIL'} ${label}`);if(!ok)failures++;};
try {
 for(const cookie of [null,390,1280]) {
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  if(cookie)await context.addCookies([{name:'one_width',value:String(cookie),url:base}]);
  const page=await context.newPage();await page.clock.install();
  const patches=[];let next;let socket;
  await page.routeWebSocket('**/one/live*',client=>{
   socket=client;const server=client.connectToServer();
   server.onMessage(message=>{
    const parsed=JSON.parse(message.toString());
    if(parsed.t!=='patch'){client.send(message);return;}
    patches.push({message,parsed});if(next){next();next=null;}
   });
  });
  const waitPatch=async width=>{
   while(!patches.some(p=>p.parsed.viewport===width))await new Promise(resolve=>{next=resolve;});
   return patches.find(p=>p.parsed.viewport===width).message;
  };
  await page.goto(`${base}/viewport`);
  const first=await waitPatch(1280);
  check(await page.evaluate(()=>document.cookie.includes('one_width=1280')),'cookie is present before layout acknowledgement');
  await page.clock.fastForward(2000);
  const matched=cookie===1280;
  if(matched){
   // Laid out for this window: shown before the socket answers, and a press made now is replayed on it.
   check(await page.locator('#one-root').isVisible() && await page.getByText('Desktop layout',{exact:true}).isVisible(),'a page laid out for the window width shows before its acknowledgement');
   check(await page.getByRole('status').isHidden(),'and without a connection state while the wait is short');
   check(await page.evaluate(()=>!document.documentElement.hasAttribute('data-one-ready')),'it is not ready before its acknowledgement');
   await page.getByRole('status').waitFor({timeout:6000});
   check(await page.locator('#one-root').isVisible(),'a long wait adds the connection state without hiding the page');
  } else {
   await page.getByRole('status').waitFor({timeout:3000});
   check(await page.locator('#one-root').isHidden(),`delayed layout stays held beyond1.5s (cookie ${cookie})`);
   socket.send(JSON.stringify({t:'cookies'}));
   await page.clock.runFor(50);
   check(await page.locator('#one-root').isHidden(),'an unrelated socket message cannot reveal guessed controls');
  }
  await page.setViewportSize({width:1440,height:900});await page.clock.runFor(200);
  const resized=await waitPatch(1440);
  socket.send(first);await page.clock.runFor(20);
  check(matched || await page.locator('#one-root').isHidden(),'an earlier viewport acknowledgement cannot reveal the resized page');
  check(await page.evaluate(()=>!document.documentElement.hasAttribute('data-one-ready')),'an earlier viewport acknowledgement does not make the resized page ready');
  socket.send(resized);
  await page.getByText('Width 1440',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Desktop action',exact:true}).click();
  // Forward normal patches after releasing the held layout.
  // The fixture's click response is also intercepted; release it explicitly.
  while(!patches.some(p=>p.parsed.html?.includes('Desktop hits 1') ))await new Promise(resolve=>{next=resolve;});
  const clicked=patches.find(p=>p.parsed.html?.includes('Desktop hits 1'));
  socket.send(clicked.message);
  await page.getByText('Desktop hits 1; phone hits 0',{exact:true}).waitFor();
  check(await page.getByRole('button',{name:'Phone action',exact:true}).count()===0,'first desktop click reaches its own handler once');
  check(await page.getByRole('status').isHidden(),'connection state goes away only after the matching layout');
  await context.close();
 }
 {
  // A press on a shown page, made before the socket has answered anything, lands once on the layout it was made on.
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:'one_width',value:'1280',url:base}]);
  const page=await context.newPage();const held=[];let open=false;
  await page.routeWebSocket('**/one/live*',client=>{
   const server=client.connectToServer();
   server.onMessage(message=>{if(open)client.send(message);else held.push(()=>client.send(message));});
  });
  await page.goto(`${base}/viewport`);
  await page.getByRole('button',{name:'Desktop action',exact:true}).click();
  check(await page.evaluate(()=>!document.documentElement.hasAttribute('data-one-ready')) && await page.getByText('Desktop hits 0; phone hits 0',{exact:true}).isVisible(),'a press before the first answer waits');
  open=true;for(const send of held)send();
  await page.getByText('Desktop hits 1; phone hits 0',{exact:true}).waitFor();
  await page.waitForSelector('html[data-one-ready]');
  await page.waitForTimeout(300);
  check(await page.getByText('Desktop hits 1; phone hits 0',{exact:true}).isVisible() && await page.getByRole('status').isHidden(),'and is replayed once when the socket answers');
  await context.close();
 }
 const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:1280,height:900}});
 const page=await noJS.newPage();await page.goto(`${base}/viewport`);
 check(await page.getByText('Phone layout',{exact:true}).isVisible() && await page.locator('#one-root').isVisible(),'SSR stays readable without JavaScript');
 check(await page.getByRole('status').isHidden(),'no-JS readers do not see a false connection state');await noJS.close();
 const broken=await browser.newPage({viewport:{width:1280,height:900}});
 await broken.route('**/one/host.js',route=>route.abort());await broken.goto(`${base}/viewport?origin=proof#signin-proof`);
 await broken.getByRole('status').waitFor({timeout:3000});
 check(await broken.getByRole('status').isVisible() && await broken.locator('#one-root').isHidden(),'failed host script leaves a useful connection state');
 await Promise.all([broken.waitForNavigation(),broken.getByRole('link',{name:'Reload',exact:true}).click()]);
 check(broken.url()===`${base}/viewport?origin=proof#signin-proof`,'reload preserves the full current URL including query and sign-in fragment');await broken.close();
}finally{await browser.close();}
if(failures)process.exit(1);
console.log('PASS viewport handshake');
