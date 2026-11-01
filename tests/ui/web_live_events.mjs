// A press or a keystroke lands on what it was made for, or nowhere. On /moment the gallery changes
// its screen within one path, with another handler at the same place. Presses are replayed by
// resending the page's own frames, with the revision they were made for.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://127.0.0.1:8950';
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(ok ? `ok   ${label}` : `FAIL ${label}`); if (!ok) failures++; };
const open = async () => {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.__frames = [];
    window.WebSocket = class extends Native {
      constructor(...args) { super(...args); window.__socket = this; }
      send(text) { window.__frames.push(text); super.send(text); }
    };
  });
  await page.goto(base + '/moment');
  await page.getByText('Emitidas: 0').waitFor();
  await page.waitForFunction(() => window.__socket && window.__socket.readyState === 1);
  await page.waitForTimeout(100);
  return page;
};
const button = (name) => `[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(name)})`;
const lastPress = (page) => page.evaluate(() => [...window.__frames].reverse().find(f => { const m = JSON.parse(f); return m.t === 'event' && !m.c; }));
const resend = (page, frame) => page.evaluate((f) => window.__socket.send(f), frame);
const settled = (page) => page.waitForTimeout(200);
const typeNow = (page, text, then) => page.evaluate(({text, then}) => {
  const field = document.querySelector('input[placeholder="Rascunho"]');
  field.value = text;
  field.dispatchEvent(new Event('input', {bubbles: true}));
  if (then) [...document.querySelectorAll('button')].find(b => b.textContent === then).click();
}, {text, then});
try {
  {
    const page = await open();
    // Two presses in one go: both made for "Emitir", the second arrives after the screen changed.
    await page.evaluate(`(() => { const b = ${button('Emitir')}; b.click(); b.click(); })()`);
    await page.getByText('Emitidas: 1').waitFor({timeout: 5000});
    await settled(page);
    check(await page.getByText('Emitidas: 1, anuladas: 0').count() === 1, 'a second press in the same batch doesn\'t run the handler now at that place');
    // The same, a round trip later: the frame carries the revision of "Emitir", the page shows "Anular".
    await page.getByRole('button', {name: 'Anular'}).waitFor();
    const stale = await lastPress(page);
    await resend(page, stale);
    await settled(page);
    check(await page.getByText('Emitidas: 1, anuladas: 0').count() === 1, 'a press for an older revision doesn\'t run the handler now at that place');
    check(await page.getByText('Perdidos: 0').count() === 1, 'and a second press of what already landed isn\'t lost: nobody meant more by it');
    await page.getByRole('button', {name: 'Anular'}).click();
    await page.getByText('Emitidas: 1, anuladas: 1').waitFor({timeout: 5000});
    check(true, 'a press on what\'s shown does');
    await page.getByRole('button', {name: 'Emitir'}).click();
    await page.getByText('Emitidas: 2, anuladas: 1').waitFor({timeout: 5000});
    // The app hears of a press that went nowhere, when that press wasn't the one before it.
    await page.getByRole('button', {name: 'Anular'}).waitFor();
    await resend(page, stale);
    await settled(page);
    check(await page.getByText('Perdidos: 1').count() === 1 && await page.getByText('Emitidas: 2, anuladas: 1').count() === 1, 'a press lost across a change reaches the app as pressLost');
    await page.close();
  }
  {
    const page = await open();
    // Something re-rendered in between, and the control still says the same: it counts.
    await page.getByRole('button', {name: 'Contar'}).click();
    await page.getByText('Contadas: 1').waitFor({timeout: 5000});
    const press = await lastPress(page);
    await typeNow(page, 'x');
    await page.getByRole('button', {name: 'Enviar'}).waitFor();
    await settled(page);
    await resend(page, press);
    await page.getByText('Contadas: 2').waitFor({timeout: 5000});
    check(true, 'a press for an older revision reaches the same control');
    // Too old: past the revisions kept.
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', {name: 'Emitir'}).click();
      await page.getByRole('button', {name: 'Anular'}).click();
      await page.getByRole('button', {name: 'Emitir'}).waitFor();
    }
    await settled(page);
    await resend(page, press);
    await settled(page);
    check(await page.getByText('Contadas: 2').count() === 1, 'one too old is dropped');
    await page.close();
  }
  for (const [control, expected] of [['Enviar', 'Enviado: agora'], ['Guardar', 'Enviado: guardado:agora']]) {
    const page = await open();
    // Nothing yet at this control: no press number, or aria-disabled. Typed and pressed in one go.
    await typeNow(page, 'agora', control);
    await page.getByText(expected).waitFor({timeout: 5000});
    check(true, `a press right after typing reaches "${control}"`);
    await settled(page);
    check(await page.getByText(expected).count() === 1, 'once');
    await page.close();
  }
  {
    const page = await open();
    // Re-rendering with the same controls ages nothing, however often: only the text around them changed.
    await page.getByRole('button', {name: 'Contar'}).click();
    await page.getByText('Contadas: 1').waitFor({timeout: 5000});
    const before = await page.evaluate(() => window.__socket && JSON.parse([...window.__frames].reverse().find(f => JSON.parse(f).t === 'event')).r);
    for (let i = 2; i <= 12; i++) {
      await page.getByRole('button', {name: 'Contar'}).click();
      await page.getByText(`Contadas: ${i}`).waitFor({timeout: 5000});
    }
    const after = await page.evaluate(() => JSON.parse([...window.__frames].reverse().find(f => JSON.parse(f).t === 'event')).r);
    check(after === before, `controls that don't change keep their revision (${before}, ${after})`);
    await page.close();
  }
  {
    const page = await open();
    // Still disabled after the answer: the press goes away, and doesn't fire later.
    await typeNow(page, 'ab', 'Só com três');
    await settled(page);
    check(await page.getByText('Enviado: ').count() === 1 && await page.getByText('três:').count() === 0, 'a press on a control the text doesn\'t bring alive does nothing');
    await typeNow(page, 'abc');
    await settled(page);
    check(await page.getByText('três:').count() === 0, 'nor later');
    // Typing again after the press takes it back.
    await page.evaluate(`(() => {
      const field = document.querySelector('input[placeholder="Rascunho"]');
      field.value = '';
      field.dispatchEvent(new Event('input', {bubbles: true}));
      ${button('Enviar')}.click();
      field.value = 'mais';
      field.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
    await settled(page);
    check(await page.getByText('Enviado: mais').count() === 0, 'typing after the press cancels it');
    await page.close();
  }
  {
    const page = await open();
    // Moving away with a press waiting: it doesn't land on the next screen.
    await page.evaluate(`(() => {
      const field = document.querySelector('input[placeholder="Rascunho"]');
      field.value = 'x';
      field.dispatchEvent(new Event('input', {bubbles: true}));
      ${button('Enviar')}.click();
      history.pushState(null, '', '/people');
      dispatchEvent(new PopStateEvent('popstate', {state: null}));
    })()`);
    await page.getByText('Maya Townsend').waitFor({timeout: 5000});
    await settled(page);
    await page.goBack();
    await page.getByText('Emitidas: 0').waitFor({timeout: 5000});
    check(await page.getByText('Enviado: x').count() === 0, 'a press waiting doesn\'t survive a move');
    await page.close();
  }
  {
    // Typing raced with a move: the field that says it's the same on both routes keeps it, and
    // the focus; the one that only looks the same doesn't get it.
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    await page.goto(base + '/field/1');
    await page.getByText('Campos em /field/1').waitFor();
    await page.waitForTimeout(200);
    await page.getByPlaceholder('Mantido').focus();
    await page.evaluate(`(() => {
      ${button('Mudar')}.click();
      const put = (name, value) => { const f = document.querySelector('input[placeholder="' + name + '"]'); f.value = value; f.dispatchEvent(new Event('input', {bubbles: true})); };
      put('Outro', 'xyz');
      put('Mantido', 'abc');
    })()`);
    await page.getByText('Campos em /field/2').waitFor({timeout: 5000});
    await settled(page);
    check(await page.getByText('Mantido: abc, outro: ', {exact: true}).count() === 1, 'typing raced with a move reaches the same field, and no other');
    check(await page.getByPlaceholder('Mantido').inputValue() === 'abc', 'the field shows it');
    check(await page.getByPlaceholder('Outro').inputValue() === '', 'the other field shows it was dropped');
    check(await page.evaluate(() => document.activeElement.placeholder) === 'Mantido', 'the field keeps the focus across the move');
    await page.keyboard.type('d');
    await page.getByText('Mantido: abcd, outro: ', {exact: true}).waitFor({timeout: 5000});
    check(true, 'and typing goes on');
    await page.close();
  }
  {
    // A move that changes nothing on the screen: what the person does on it isn't dropped or disturbed.
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    await page.goto(base + '/same/1');
    await page.getByText('O mesmo ecrã').waitFor();
    await page.waitForTimeout(200);
    await page.getByPlaceholder('Outro').focus();
    await page.evaluate(`(() => {
      ${button('Mudar')}.click();
      ${button('Contar')}.click();
      const f = document.querySelector('input[placeholder="Outro"]'); f.value = 'ok'; f.dispatchEvent(new Event('input', {bubbles: true}));
    })()`);
    await page.waitForURL('**/same/2', {timeout: 5000});
    await settled(page);
    check(await page.evaluate(() => document.activeElement.placeholder) === 'Outro', 'the focus stays');
    check(await page.getByPlaceholder('Outro').inputValue() === 'ok', 'and the text');
    await page.goto(base + '/moment');
    await page.getByText('Contadas: 1').waitFor({timeout: 5000}).then(() => check(true, 'a press raced with such a move lands'), () => check(false, 'a press raced with such a move lands'));
    await page.close();
  }
  {
    // A link followed from the page starts that page's own session; a reload keeps this one.
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    await page.goto(base + '/moment');
    await page.getByText('Emitidas: 0').waitFor();
    await page.waitForTimeout(200);
    const session = await page.evaluate(() => window.__one.s);
    await page.reload();
    check(await page.evaluate(() => window.__one.s) === session, 'a reload resumes');
    await page.waitForTimeout(200);
    await page.getByText('Outra página').click();
    await page.getByText('Maya Townsend').waitFor({timeout: 5000});
    const followed = await page.evaluate(() => window.__one.s);
    check(followed !== session, 'a followed link starts a new session');
    await page.waitForTimeout(200);
    await page.goBack();
    await page.getByText('Emitidas: 0').waitFor({timeout: 5000});
    await page.waitForTimeout(200);
    const popup = page.context().waitForEvent('page');
    await page.getByText('Outra página').click({modifiers: ['Control']});
    await (await popup).close();
    const here = await page.evaluate(() => window.__one.s);
    await page.reload();
    check(await page.evaluate(() => window.__one.s) === here, 'a link opened in another tab leaves this one resuming');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'PASS tests/ui/web_live_events.mjs' : `${failures} failed`);
process.exit(failures ? 1 : 0);
