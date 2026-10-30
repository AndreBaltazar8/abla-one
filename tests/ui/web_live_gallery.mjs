// Live web UI test: the gallery served by the live server. Checks the
// server-rendered first paint works without JavaScript, then that presses,
// typing and navigation reach the server session and come back as patches,
// that typed text survives patches, and that a reload restores the session.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://127.0.0.1:8950';
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(ok ? `ok   ${label}` : `FAIL ${label}`); if (!ok) failures++; };
try {
  const noScript = await browser.newPage({javaScriptEnabled: false});
  await noScript.goto(base + '/');
  check(await noScript.getByText('Adicionar (0)').count() === 1, 'SSR renders the page without JavaScript');
  await noScript.close();

  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  await page.getByText('Adicionar (0)').waitFor();
  const before = await page.locator('button', {hasText: 'Adicionar'}).elementHandle();
  await page.getByRole('button', {name: 'Adicionar (0)'}).click();
  await page.getByText('Adicionar (1)').waitFor({timeout: 5000});
  check(true, 'a press reaches the session and the patch arrives');
  const after = await page.locator('button', {hasText: 'Adicionar'}).elementHandle();
  check(await page.evaluate(([a, b]) => a === b, [before, after]), 'patching keeps existing DOM nodes (keyed morph)');
  await page.getByRole('button', {name: 'Adicionar (1)'}).click();
  await page.getByRole('button', {name: 'Adicionar (2)'}).click();
  await page.getByText('Adicionar (3)').waitFor({timeout: 5000});
  check(true, 'rapid presses are all delivered');
  const search = page.getByPlaceholder('Pesquisar pessoas');
  await search.click();
  await search.pressSequentially('ma', {delay: 60});
  await page.waitForTimeout(400);
  check(await search.inputValue() === 'ma', 'typed text survives patches while focused');
  check(await page.evaluate(() => document.activeElement?.placeholder) === 'Pesquisar pessoas', 'focus survives patches');
  await page.getByRole('button', {name: 'Pessoas'}).click();
  await page.getByText('Maya Townsend').waitFor({timeout: 5000});
  check(await page.getByText('Sofia Costa').count() === 0, 'the query filters the list on the server');
  await page.getByText('Maya Townsend').click();
  await page.getByRole('button', {name: 'Componentes'}).click();
  await page.getByText('Última pessoa aberta: Maya Townsend').waitFor({timeout: 5000});
  check(true, 'list rows and tabs work');
  await page.reload();
  await page.getByText('Última pessoa aberta: Maya Townsend').waitFor({timeout: 5000});
  check(await page.getByText('Adicionar (3)').count() === 1, 'reload restores the same session from its cookie (SSR with state)');
  const css = await page.evaluate(() => document.getElementById('one-css').textContent.length);
  check(css > 1000, 'styles are present after reload');
  const second = await browser.newPage({viewport: {width: 390, height: 844}});
  await second.goto(base + '/');
  check(await second.getByText('Adicionar (0)').count() === 1, 'another tab gets its own session');
  await second.getByRole('button', {name: 'Adicionar (0)'}).click();
  await second.getByText('Adicionar (1)').waitFor({timeout: 5000});
  await page.waitForTimeout(500);
  check(await page.getByText('Adicionar (3)').count() === 1, 'tabs do not affect each other');
  await second.close();
  check(errors.length === 0, `no page errors ${errors.join(' ')}`);
  await page.screenshot({path: 'build/ui/web-live-gallery.png'});
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'PASS tests/ui/web_live_gallery.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
