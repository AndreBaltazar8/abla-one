// Soft navigation on the live server: each gallery screen has a path. Moves change
// the URL with no page load; back, forward, reload and a direct link all show the
// same screen, first painted on the server; a press raced with a move stays off the
// new screen.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://127.0.0.1:8950';
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(ok ? `ok   ${label}` : `FAIL ${label}`); if (!ok) failures++; };
const path = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const until = async (fn, timeout = 5000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 25)); }
  return false;
};
const raw = async (url) => { const r = await fetch(base + url, {redirect: 'manual'}); return {status: r.status, text: await r.text(), type: r.headers.get('content-type') || ''}; };
try {
  // First paint: what the server sends for each path, with no JavaScript.
  const noScript = await browser.newPage({javaScriptEnabled: false});
  await noScript.goto(base + '/people');
  check(await noScript.getByText('Maya Townsend').count() === 1, 'direct link: /people is rendered on the server');
  check(await noScript.title() === 'Pessoas · Abla One', 'direct link: its title too');
  await noScript.goto(base + '/people?q=ma');
  check(await noScript.getByText('Maya Townsend').count() === 1 && await noScript.getByText('Sofia Costa').count() === 0, 'a query string reaches the first paint');
  await noScript.goto(base + '/form/3');
  check(await noScript.getByText('Formulário 3').count() === 1, 'direct link: a path with a parameter');
  await noScript.close();
  const nested = await raw('/form/3');
  check(nested.text.includes('<base href="../">'), 'a nested page gets its way back to the root');
  check((await raw('/nope')).status === 404, 'an unclaimed path is still a 404');
  check((await raw('/form/3/4')).status === 404, 'and so is one too deep');
  check((await raw('/one/host.js')).type.includes('javascript'), '/one/* stays the server\'s');
  check((await raw('/one/unknown')).status === 404, 'an unknown /one/ path is not a page');
  const icon = await raw('/icons/nav_home.svg');
  check(icon.status === 200, 'other routes still reach the handler');

  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [];
  const bad = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) bad.push(r.url()); });
  let documents = 0;
  page.on('request', r => { if (r.resourceType() === 'document') documents++; });
  await page.goto(base + '/');
  await page.getByText('Adicionar (0)').waitFor();
  await page.waitForTimeout(200);
  await page.getByRole('button', {name: 'Adicionar (0)'}).click();
  await page.getByText('Adicionar (1)').waitFor();
  const start = documents;

  // Push
  await page.getByRole('button', {name: 'Pessoas'}).click();
  await page.getByText('Maya Townsend').waitFor({timeout: 5000});
  check(path(page) === '/people', `push changes the URL (${path(page)})`);
  check(await page.title() === 'Pessoas · Abla One', 'push updates the title');
  check(documents === start, 'push loads no page');

  // Back and forward
  await page.goBack();
  await page.getByText('Adicionar (1)').waitFor({timeout: 5000});
  check(path(page) === '/', 'back goes to the last screen, with its state');
  check(await page.title() === 'Abla One', 'back restores the title');
  await page.goForward();
  await page.getByText('Maya Townsend').waitFor({timeout: 5000});
  check(path(page) === '/people', 'forward');
  check(documents === start, 'back and forward load no page');

  // Reload and resume
  await page.reload();
  check(await page.getByText('Maya Townsend').count() === 1, 'reload: the first paint is this screen');
  check(await page.title() === 'Pessoas · Abla One', 'reload: with its title');
  await page.waitForTimeout(200);
  await page.getByRole('button', {name: 'Componentes'}).click();
  await page.getByText('Adicionar (1)').waitFor({timeout: 5000});
  check(path(page) === '/', 'reload resumed the session');

  // A route link: a real link, a soft move on a plain click.
  const link = page.getByRole('link', {name: 'Ver pessoas'});
  check(await link.getAttribute('href') === './people', 'a route link is a real link');
  const before = documents;
  await link.click();
  await page.getByText('Maya Townsend').waitFor({timeout: 5000});
  check(path(page) === '/people' && documents === before, 'and moves softly when clicked');
  await page.goBack();
  await page.getByText('Adicionar (1)').waitFor({timeout: 5000});

  // A query string changes as you type, in one history entry, with focus kept.
  const search = page.getByPlaceholder('Pesquisar pessoas');
  const depth = await page.evaluate(() => history.length);
  await search.click();
  await search.pressSequentially('ma', {delay: 30});
  check(await until(() => path(page) === '/?q=ma'), `typing updates the query (${path(page)})`);
  check(await search.inputValue() === 'ma', 'typed text survives the moves');
  check(await page.evaluate(() => document.activeElement?.placeholder) === 'Pesquisar pessoas', 'focus survives them');
  check(await page.evaluate(() => history.length) === depth, 'replace adds no entry');
  await search.fill('');
  check(await until(() => path(page) === '/'), 'and goes away when cleared');
  await page.waitForTimeout(100);

  // Scroll: a nested page's scroll area. New route at the top, back where it was left.
  await page.getByRole('button', {name: 'Abrir formulário'}).click();
  await page.getByText('Formulário 1').waitFor({timeout: 5000});
  check(path(page) === '/form/1', 'a nested path');
  const area = () => page.evaluate(() => document.querySelector('.k-scroll').scrollTop);
  await page.evaluate(() => { document.querySelector('.k-scroll').scrollTop = 1500; });
  check(await area() === 1500, 'the form scrolls');
  // Not the mouse: it would scroll the button into view first.
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Formulário seguinte')).click());
  await page.getByText('Formulário 2').waitFor({timeout: 5000});
  check(await until(async () => await area() === 0), `a new route opens at the top (${await area()})`);
  await page.goBack();
  await page.getByText('Formulário 1').waitFor({timeout: 5000});
  check(await until(async () => await area() === 1500), `back restores the scroll (${await area()})`);
  await page.goForward();
  await page.getByText('Formulário 2').waitFor({timeout: 5000});
  check(await until(async () => await area() === 0), 'forward: where that one was');
  await page.goBack();
  await page.getByText('Formulário 1').waitFor({timeout: 5000});
  await until(async () => await area() === 1500);
  await page.reload();
  check(await page.getByText('Formulário 1').count() === 1, 'reload of a nested path');
  check(await until(async () => await area() === 1500), `reload keeps the scroll (${await area()})`);
  await page.waitForTimeout(200);
  check(bad.length === 0, `relative URLs hold on a nested path ${bad.join(' ')}`);

  // A session doesn't outlive its credentials: `resumes` refuses, on a reload or a new socket.
  {
    const gone = await browser.newPage({viewport: {width: 390, height: 844}});
    await gone.goto(base + '/');
    await gone.waitForTimeout(200);
    await gone.getByRole('button', {name: 'Adicionar (0)'}).click();
    await gone.getByText('Adicionar (1)').waitFor();
    const session = await gone.evaluate(() => window.__one.s);
    await gone.reload();
    check(await gone.evaluate(() => window.__one.s) === session && await gone.getByText('Adicionar (1)').count() === 1, 'resumes allows: a reload continues');
    await gone.waitForTimeout(200);
    await gone.evaluate(() => { document.cookie = 'gallery_signed_out=1; path=/'; });
    // From another page: this one reloads when its session ends.
    const other = await browser.newPage();
    await other.goto(base + '/icons/nav_home.svg');
    await other.context().addCookies([{name: 'gallery_signed_out', value: '1', url: base}]);
    const refused = await other.evaluate((s) => new Promise((done) => {
      const socket = new WebSocket(`ws://${location.host}/one/live?s=${s}`);
      socket.onclose = (e) => done(e.code);
      setTimeout(() => done(0), 3000);
    }), session);
    await other.close();
    check(refused === 1008, `resumes refuses: a new socket is closed (${refused})`);
    await gone.getByText('Adicionar (0)').waitFor({timeout: 5000});
    await gone.waitForTimeout(1500);
    const again = await gone.evaluate(() => window.__one.s);
    check(again !== session, 'and the page starts over in a new session');
    await gone.reload();
    check(await gone.evaluate(() => window.__one.s) !== again, 'a reload while refused: again a new one, and no loop');
    await gone.waitForTimeout(1500);
    check(await gone.getByText('Adicionar (0)').count() === 1, 'and the page stays');
    await gone.close();
  }

  // The app's own back button.
  const shared = await browser.newPage({viewport: {width: 390, height: 844}});
  await shared.goto(base + '/form/5');
  await shared.waitForTimeout(200);
  await shared.getByRole('button', {name: 'Voltar'}).click();
  await shared.getByText('Adicionar (0)').waitFor({timeout: 5000});
  check(path(shared) === '/', 'a shared link\'s back button goes to its fallback, not out of the site');
  await shared.getByRole('button', {name: 'Abrir formulário'}).click();
  await shared.getByText('Formulário 1').waitFor({timeout: 5000});
  await shared.getByRole('button', {name: 'Voltar'}).click();
  await shared.getByText('Adicionar (0)').waitFor({timeout: 5000});
  check(path(shared) === '/', 'with history, it goes back');

  // A press raced with a move: both clicks leave before any patch. At this place on
  // "/" there's "Adicionar"; on "/people" the same event id is a row's.
  await shared.getByRole('button', {name: 'Adicionar (0)'}).click();
  await shared.getByText('Adicionar (1)').waitFor();
  await shared.evaluate(() => {
    const byText = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t));
    byText('Pessoas').click();
    byText('Adicionar').click();
    byText('Eliminar').click();
  });
  await shared.getByText('Maya Townsend').waitFor({timeout: 5000});
  await shared.waitForTimeout(200);
  await shared.goBack();
  await shared.getByText('CARTÃO').waitFor({timeout: 5000});
  check(await shared.getByText('Adicionar (1)').count() === 1, 'a press raced with a move lands nowhere');
  check(await shared.getByText('Ainda não abriu ninguém.').count() === 1, 'not on the new screen');

  // Same, with back: the old page's press arrives after the browser moved.
  await shared.goForward();
  await shared.getByText('Maya Townsend').waitFor({timeout: 5000});
  await shared.evaluate(() => {
    const row = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Sofia'));
    history.back();
    // Right after popstate: the page has told the session, and the DOM is still /people.
    addEventListener('popstate', () => row.click(), {once: true});
  });
  await shared.getByText('CARTÃO').waitFor({timeout: 5000});
  await shared.waitForTimeout(200);
  check(await shared.getByText('Adicionar (1)').count() === 1, 'a press raced with back lands nowhere');
  check(await shared.getByText('Ainda não abriu ninguém.').count() === 1, 'no row was opened');
  check(errors.length === 0, `no page errors ${errors.join(' ')}`);
  await shared.close();
  await page.screenshot({path: 'build/ui/web-live-routes.png'});
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'PASS tests/ui/web_live_routes.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
