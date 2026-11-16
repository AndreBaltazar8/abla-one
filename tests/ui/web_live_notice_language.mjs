import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const base=process.argv[2] || process.env.ONE_TEST_BASE;
const browser=await chromium.launch({executablePath:'/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures=0;
const check=(ok,label)=>{console.log(`${ok?'ok  ':'FAIL'} ${label}`);if(!ok)failures++;};
try {
  for (const [lang,status,reload] of [
    ['en','Connecting…','Reload'],
    ['PT-pt','A estabelecer ligação…','Recarregar página'],
    ['pt-BR','A ligar…','Recarregar'],
    ['fr-FR','Connecting…','Reload'],
    ['constructor','Connecting…','Reload'],
    ['x-proof','<img src=x onerror=alert(1)>"&</script>','<b>Reload</b>']
  ]) {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    // Selection must also work when the application host never loads.
    await page.route('**/one/host.js',route=>route.abort());
    await page.goto(`${base}/viewport?lang=${encodeURIComponent(lang)}&origin=proof#signin-proof`);
    await page.getByRole('status').waitFor();
    check(await page.getByRole('status').textContent()===status,`${lang}: connection text follows the document language without host.js`);
    check(await page.locator('#one-connecting a').textContent()===reload,`${lang}: reload text uses the same language`);
    check(await page.locator('#one-connecting img, #one-connecting b').count()===0,`${lang}: configured text stays literal`);
    check(await page.locator('#one-root').isHidden(),`${lang}: localization cannot reveal guessed first-paint controls`);
    console.log(`NOTICE ${lang} ${JSON.stringify({status:await page.getByRole('status').textContent(),reload:await page.locator('#one-connecting a').textContent()})}`);
    if(lang==='en' || lang==='PT-pt') {
      fs.mkdirSync('build/ui',{recursive:true});
      await page.screenshot({path:`build/ui/connection-notice-${lang==='en'?'en':'pt'}.png`});
    }
    await page.evaluate(()=>{document.documentElement.lang='pt-PT';});
    await page.getByRole('link',{name:'Recarregar página',exact:true}).waitFor();
    check(await page.getByRole('status').textContent()==='A estabelecer ligação…',`${lang}: a later language change updates the existing notice`);
    if(lang==='PT-pt') {
      const current=page.url();
      await Promise.all([page.waitForNavigation(),page.getByRole('link',{name:'Recarregar página',exact:true}).click()]);
      check(page.url()===current,'localized reload preserves the full query and sign-in fragment');
    }
    await page.close();
  }
} finally { await browser.close(); }
if(failures)process.exit(1);
console.log('PASS connection notice language');
