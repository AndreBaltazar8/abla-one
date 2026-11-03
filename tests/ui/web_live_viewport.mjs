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
  check(await page.locator('#one-root').isHidden() && await page.getByRole('status').isVisible(),`delayed layout stays held beyond1.5s (cookie ${cookie})`);
  socket.send(JSON.stringify({t:'cookies'}));
  await page.clock.runFor(50);
  check(await page.locator('#one-root').isHidden(),'an unrelated socket message cannot reveal guessed controls');
  await page.setViewportSize({width:1440,height:900});await page.clock.runFor(200);
  const resized=await waitPatch(1440);
  socket.send(first);await page.clock.runFor(20);
  check(await page.locator('#one-root').isHidden(),'an earlier viewport acknowledgement cannot reveal the resized page');
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
 const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:1280,height:900}});
 const page=await noJS.newPage();await page.goto(`${base}/viewport`);
 check(await page.getByText('Phone layout',{exact:true}).isVisible() && await page.locator('#one-root').isVisible(),'SSR stays readable without JavaScript');
 check(await page.getByRole('status').isHidden(),'no-JS readers do not see a false connection state');await noJS.close();
 const broken=await browser.newPage({viewport:{width:1280,height:900}});
 await broken.route('**/one/host.js',route=>route.abort());await broken.goto(`${base}/viewport?origin=proof#signin-proof`);
 check(await broken.getByRole('status').isVisible() && await broken.locator('#one-root').isHidden(),'failed host script leaves a useful connection state');
 await Promise.all([broken.waitForNavigation(),broken.getByRole('link',{name:'Reload',exact:true}).click()]);
 check(broken.url()===`${base}/viewport?origin=proof#signin-proof`,'reload preserves the full current URL including query and sign-in fragment');await broken.close();
}finally{await browser.close();}
if(failures)process.exit(1);
console.log('PASS viewport handshake');
