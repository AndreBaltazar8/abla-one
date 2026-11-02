// web-canvas UI test: the gallery as a live canvas page. The server lays out
// and paints; the page draws, routes taps through hit regions, edits text in
// an overlay field and scrolls. Screenshots: build/ui/web-canvas-*.png.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const base = process.argv[2] || process.env.ONE_TEST_BASE;
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(ok ? `ok   ${label}` : `FAIL ${label}`); if (!ok) failures++; };
const hit = (page, label) => page.evaluate((label) => {
  const h = (window.__oneFrame?.hits || []).find(h => h[8] === label || h[9] === label);
  return h ? {x: h[1] + h[3] / 2, y: h[2] + h[4] / 2} : null;
}, label);
const texts = (page) => page.evaluate(() => (window.__oneFrame?.paints || []).filter(p => p[0] === 'text').map(p => p[7]));
const waitText = async (page, text) => {
  for (let i = 0; i < 50; i++) { if ((await texts(page)).includes(text)) return true; await page.waitForTimeout(100); }
  return false;
};
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/?render=canvas');
  check(await page.getByText('Adicionar (0)').count() === 1, 'the server-rendered document shows first');
  check(await waitText(page, 'Adicionar (0)'), 'the canvas frame arrives');
  check(await page.locator('canvas').isVisible(), 'the canvas replaces the document');
  await page.waitForTimeout(600);
  await page.screenshot({path: 'build/ui/web-canvas-components.png'});
  const add = await hit(page, 'Adicionar (0)');
  check(!!add, 'press regions carry labels');
  await page.mouse.click(add.x, add.y);
  check(await waitText(page, 'Adicionar (1)'), 'a tap on the canvas reaches the session');
  const search = await hit(page, 'Pesquisar pessoas');
  await page.mouse.click(search.x, search.y);
  await page.keyboard.type('ti', {delay: 50});
  check(await page.evaluate(() => document.activeElement?.tagName) === 'INPUT', 'editing uses a real input over the canvas');
  check(await waitText(page, 'ti'), 'typing reaches the session');
  const people = await hit(page, 'Pessoas');
  await page.mouse.click(people.x, people.y);
  check(await waitText(page, 'Tiago Mendes'), 'navigation');
  check(!(await texts(page)).includes('Sofia Costa'), 'the server filtered the list from the typed query');
  await page.screenshot({path: 'build/ui/web-canvas-people.png'});
  check(new URL(page.url()).pathname === '/people' && new URL(page.url()).search.includes('render=canvas'), `a move changes the URL and stays a canvas page (${page.url()})`);
  check(await page.title() === 'Pessoas · Abla One', 'and the title');
  await page.goBack();
  check(await waitText(page, 'Adicionar (1)'), 'back shows the last screen');
  await page.goForward();
  check(await waitText(page, 'Tiago Mendes'), 'forward');
  await page.reload();
  check(await waitText(page, 'Tiago Mendes'), 'reload keeps the route');
  check(await page.locator('canvas').isVisible(), 'as a canvas page');
  const back = await hit(page, 'Componentes');
  await page.mouse.click(back.x, back.y);
  await waitText(page, 'CARTÃO');
  // The dropdown on the bar: painted over the screen; a click outside only closes it.
  const switcher = await hit(page, 'Estúdio Norte');
  await page.mouse.click(switcher.x, switcher.y);
  check(await waitText(page, 'Oficina Sul'), 'a popover opens on a canvas page');
  await page.screenshot({path: 'build/ui/web-canvas-popover.png'});
  const before = await texts(page);
  await page.mouse.click(30, 600);
  await page.waitForTimeout(400);
  check(!(await texts(page)).includes('Oficina Sul'), 'a click outside closes it');
  check(before.includes('Adicionar (1)') && (await texts(page)).includes('Adicionar (1)'), 'and reached nothing under it');
  await page.setViewportSize({width: 390, height: 480});
  await page.waitForTimeout(500);
  check((await page.evaluate(() => window.__oneFrame.h)) === 480, 'a resize lays the page out again');
  await page.mouse.move(195, 300);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(500);
  const scrolled = await page.evaluate(() => window.__oneFrame.hits.find(h => h[0] === 'scroll')[8]);
  check(Number(scrolled) > 0, `wheel scrolls the scroll area (${scrolled})`);
  // An external link opens a new tab and leaves this page where it was.
  let outside = null;
  for (let i = 0; i < 20; i++) {
    outside = await page.evaluate(() => window.__oneFrame.hits.find(h => h[0] === 'link' && h[9] === 'true'));
    if (outside && outside[2] + outside[4] <= 480 && outside[2] >= 0) break;
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(250);
  }
  check(!!outside, 'an external link carries its flag in the hit');
  const at = page.url();
  const [tab] = await Promise.all([page.context().waitForEvent('page', {timeout: 5000}).catch(() => null), page.mouse.click(outside[1] + outside[3] / 2, outside[2] + outside[4] / 2)]);
  if (tab) await tab.waitForLoadState().catch(() => {});
  check(!!tab && new URL(tab.url()).pathname === '/people' && new URL(tab.url()).searchParams.get('q') === 'ti', `it opens in a new tab (${tab && tab.url()})`);
  await page.waitForTimeout(300);
  check(page.url() === at, `and this page stays (${page.url()})`);
  if (tab) await tab.close();
  check(errors.length === 0, `no page errors ${errors.join(' ')}`);
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'PASS tests/ui/web_canvas_gallery.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
