import {createHash} from 'node:crypto';
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
try {
  {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8959/');
    const bytes = Buffer.alloc(1200003);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Pick file'}).click();
    await (await chooser).setFiles({name:'large.bin', mimeType:'application/octet-stream', buffer:bytes});
    const hash = createHash('sha256').update(bytes).digest('hex');
    await page.getByText(`read: ${bytes.length} ${hash}`).waitFor({timeout: 20000});
    console.log('ok large file read byte for byte across the cap');
    await page.close();
  }
  {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8959/');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Pick file'}).click();
    await (await chooser).setFiles({name:'too-large.bin', mimeType:'application/octet-stream', buffer:Buffer.alloc(16777217)});
    await page.getByText('pick: error File exceeds the 16 MiB upload limit').waitFor({timeout: 10000});
    console.log('ok oversize upload reports its limit');
    await page.close();
  }
  for (const mode of ['http', 'network']) {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8959/');
    await page.route('**/one/upload?**', route => mode === 'http' ? route.fulfill({status: 503, body: 'no'}) : route.abort());
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Pick file'}).click();
    await (await chooser).setFiles({name:'file.bin', mimeType:'application/octet-stream', buffer:Buffer.from('abc')});
    await page.getByText(/pick: error/).waitFor({timeout: 5000});
    console.log(`ok picker reports ${mode} failure`);
    await page.close();
  }
} finally { await browser.close(); }
