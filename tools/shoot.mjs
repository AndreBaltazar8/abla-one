// Screenshots pages with Playwright: node tools/shoot.mjs WIDTHxHEIGHT out.png url [url...]
// Several URLs are placed side by side. Reports horizontal overflow.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const [size, out, ...urls] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 2});
const shots = [];
for (const url of urls) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) console.log(`OVERFLOW ${overflow}px ${url}`);
  shots.push(await page.screenshot());
}
if (shots.length === 1) (await import('node:fs')).writeFileSync(out, shots[0]);
else {
  const html = `<body style="margin:0;display:flex;gap:16px;background:#888">${shots.map(s => `<img style="width:${width}px" src="data:image/png;base64,${s.toString('base64')}">`).join('')}</body>`;
  const sheet = await browser.newPage({viewport: {width: (width + 16) * shots.length, height}, deviceScaleFactor: 1});
  await sheet.setContent(html);
  await sheet.screenshot({path: out});
}
await browser.close();
