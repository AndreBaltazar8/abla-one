// The host must bound unacknowledged work without silently losing a draft.
import {chromium} from '/home/andre/Desktop/projects/dualkind/node_modules/playwright/index.mjs';
const base = process.argv[2] || process.env.ONE_TEST_BASE;
const browser = await chromium.launch({executablePath: '/nix/store/62wviylhmg1g9b3ypjxf4l6qzjspvvyw-playwright-chromium-headless-shell/chrome-linux/headless_shell'});
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  let hold = false, socket;
  const held = [], sent = [];
  await page.routeWebSocket('**/one/live*', client => {
    socket = client;
    const server = client.connectToServer();
    client.onMessage(message => { sent.push(JSON.parse(message.toString())); server.send(message); });
    server.onMessage(message => {
      const parsed = JSON.parse(message.toString());
      if (hold && parsed.t === 'patch' && parsed.a > 0) held.push(message);
      else client.send(message);
    });
  });
  await page.goto(base + '/moment');
  await page.waitForSelector('html[data-one-ready]');
  await page.getByText('Emitidas: 0').waitFor();
  hold = true;
  const beginning = sent.length;
  await page.evaluate(() => {
    const field = document.querySelector('input[placeholder="Rascunho"]');
    field.focus();
    for (let i = 0; i < 1500; i++) {
      field.value = `bounded draft ${i}`;
      field.dispatchEvent(new Event('input', {bubbles: true}));
    }
  });
  await page.waitForTimeout(500);
  const events = sent.slice(beginning).filter(message => message.t === 'event');
  check(events.length <= 512, `unacknowledged event count is bounded (${events.length})`);
  check(await page.locator('[data-one-backpressure]').isVisible(), 'the person sees that the connection must catch up');
  const beforePress = sent.length;
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Contar').click());
  await page.waitForTimeout(100);
  check(!sent.slice(beforePress).some(message => message.t === 'event' && !message.c), 'an action is not silently accepted while blocked');
  hold = false;
  for (const message of held.splice(0)) socket.send(message);
  await page.locator('[data-one-backpressure]').waitFor({state: 'hidden', timeout: 15000});
  await page.getByRole('button', {name: 'Enviar'}).click();
  try { await page.getByText('Enviado: bounded draft 1499', {exact: true}).waitFor({timeout: 15000}); }
  catch (error) {
    console.log('DIAGNOSTIC', JSON.stringify({lastSent: sent.slice(-8), text: (await page.locator('body').innerText()).slice(-800), input: await page.locator('input[placeholder="Rascunho"]').inputValue()}));
    throw error;
  }
  check(true, 'the last local draft reaches the app after acknowledgements resume');
  const admitted = sent.slice(beginning).filter(message => message.t === 'event');
  check(admitted.every((message, i) => i === 0 || message.n === admitted[i - 1].n + 1) &&
    new Set(admitted.map(message => message.u)).size === admitted.length,
    'admitted event sequences have no gaps or repeated operation IDs');
  await page.getByRole('button', {name: 'Contar'}).click();
  await page.getByText('Contadas: 1').waitFor({timeout: 10000});
  check(true, 'actions resume once and in order');
  hold = true;
  const largeStart = sent.length;
  const lastLarge = 'x'.repeat(12000) + '-199';
  await page.evaluate(() => {
    document.documentElement.lang = 'en';
    const field = document.querySelector('input[placeholder="Rascunho"]');
    field.focus();
    for (let i = 0; i < 200; i++) {
      field.value = 'x'.repeat(12000) + '-' + i;
      field.dispatchEvent(new Event('input', {bubbles: true}));
    }
  });
  await page.waitForTimeout(500);
  const largeEvents = sent.slice(largeStart).filter(message => message.t === 'event');
  const largeBytes = largeEvents.reduce((total, message) => total + Buffer.byteLength(JSON.stringify(message)), 0);
  check(largeBytes <= 1024 * 1024, `unacknowledged event bytes are bounded (${largeBytes})`);
  check((await page.locator('[data-one-backpressure]').innerText()).includes('The connection is delayed'), 'the delayed-connection notice is available in English');
  hold = false;
  for (const message of held.splice(0)) socket.send(message);
  await page.locator('[data-one-backpressure]').waitFor({state: 'hidden', timeout: 15000});
  await page.getByRole('button', {name: 'Enviar'}).click();
  await page.getByText('Enviado: ' + lastLarge, {exact: true}).waitFor({timeout: 15000});
  check(true, 'the last large draft survives byte backpressure');
  await page.evaluate(() => { document.documentElement.lang = 'pt'; });
  await page.evaluate(() => {
    const field = document.querySelector('input[placeholder="Rascunho"]');
    field.value = 'z'.repeat(600000);
    field.dispatchEvent(new Event('input', {bubbles: true}));
  });
  check(await page.locator('[data-one-backpressure]').isVisible(), 'oversized composition gets a visible explanation');
  await page.getByPlaceholder('Rascunho').fill('shortened');
  await page.locator('[data-one-backpressure]').waitFor({state: 'hidden', timeout: 15000});
  await page.getByRole('button', {name: 'Enviar'}).click();
  await page.getByText('Enviado: shortened', {exact: true}).waitFor({timeout: 15000});
  check(true, 'an oversized draft can be shortened and sent');
  hold = true;
  const routeStart = sent.length;
  await page.evaluate(() => {
    const field = document.querySelector('input[placeholder="Rascunho"]');
    for (let i = 0; i < 300; i++) {
      field.value = 'before-route-' + i;
      field.dispatchEvent(new Event('input', {bubbles: true}));
    }
    for (let i = 0; i < 40; i++) {
      history.replaceState(history.state, '', '/moment?queued=' + i);
      dispatchEvent(new PopStateEvent('popstate', {state: history.state}));
    }
  });
  await page.waitForTimeout(500);
  check(!sent.slice(routeStart).some(message => message.t === 'route'), 'browser navigation waits for buffer space');
  hold = false;
  for (const message of held.splice(0)) socket.send(message);
  await page.waitForFunction(() => location.search === '?queued=39');
  await page.waitForTimeout(1000);
  const resumed = sent.slice(routeStart);
  const finalDraft = resumed.findIndex(message => message.t === 'event' && message.v === 'before-route-299');
  const finalRoute = resumed.findIndex(message => message.t === 'route' && message.p.includes('queued=39'));
  check(finalDraft >= 0 && finalRoute > finalDraft, 'latest navigation follows the pending draft');
  {
    const historyPage = await browser.newPage({viewport: {width: 390, height: 844}});
    let paused = false, historySocket;
    const historyHeld = [], historySent = [];
    await historyPage.routeWebSocket('**/one/live*', client => {
      historySocket = client;
      const server = client.connectToServer();
      client.onMessage(message => { historySent.push(JSON.parse(message.toString())); server.send(message); });
      server.onMessage(message => {
        const parsed = JSON.parse(message.toString());
        if (paused && parsed.t === 'patch' && parsed.a > 0) historyHeld.push(message);
        else client.send(message);
      });
    });
    await historyPage.goto(base + '/field/1');
    await historyPage.getByText('Campos em /field/1').waitFor();
    await historyPage.getByRole('button', {name: 'Mudar'}).click();
    await historyPage.getByText('Campos em /field/2').waitFor();
    paused = true;
    const start = historySent.length;
    await historyPage.evaluate(() => {
      const field = document.querySelector('input[placeholder="Mantido"]');
      field.focus();
      for (let i = 0; i < 300; i++) {
        field.value = 'history-draft-' + i;
        field.dispatchEvent(new Event('input', {bubbles: true}));
      }
    });
    await historyPage.goBack();
    check(!historySent.slice(start).some(message => message.t === 'route'), 'real back waits while a draft is pending');
    paused = false;
    for (const message of historyHeld.splice(0)) historySocket.send(message);
    await historyPage.getByText('Campos em /field/1').waitFor({timeout: 15000});
    await historyPage.getByText('Mantido: history-draft-299, outro: ', {exact: true}).waitFor({timeout: 15000});
    check(new URL(historyPage.url()).pathname === '/field/1', 'back retains the history URL');
    await historyPage.goForward();
    await historyPage.getByText('Campos em /field/2').waitFor({timeout: 15000});
    check(new URL(historyPage.url()).pathname === '/field/2', 'forward history remains intact');
    const historyFrames = historySent.slice(start);
    const draftIndex = historyFrames.findIndex(message => message.v === 'history-draft-299');
    check(draftIndex >= 0 && historyFrames.findIndex(message => message.t === 'route') > draftIndex, 'real back follows the retained draft');
    await historyPage.close();
  }
  {
    const movingPage = await browser.newPage({viewport: {width: 390, height: 844}});
    let paused = false, movingSocket;
    const movingHeld = [];
    await movingPage.routeWebSocket('**/one/live*', client => {
      movingSocket = client;
      const server = client.connectToServer();
      client.onMessage(message => server.send(message));
      server.onMessage(message => {
        const parsed = JSON.parse(message.toString());
        if (paused && parsed.t === 'patch' && parsed.a > 0) movingHeld.push(message);
        else client.send(message);
      });
    });
    await movingPage.goto(base + '/field/1');
    await movingPage.getByText('Campos em /field/1').waitFor();
    paused = true;
    await movingPage.evaluate(() => {
      [...document.querySelectorAll('button')].find(button => button.textContent === 'Mudar').click();
      const field = document.querySelector('input[placeholder="Outro"]');
      for (let i = 0; i < 300; i++) {
        field.value = 'copy-me-' + i;
        field.dispatchEvent(new Event('input', {bubbles: true}));
      }
    });
    await movingPage.waitForTimeout(500);
    paused = false;
    for (const message of movingHeld.splice(0)) movingSocket.send(message);
    await movingPage.getByText('Campos em /field/2').waitFor({timeout: 15000});
    const recovery = movingPage.locator('[data-one-backpressure]');
    await recovery.getByText(/Copie o rascunho|Copy your draft/).waitFor({timeout: 15000});
    check(await recovery.locator('input').inputValue() === 'copy-me-299', 'a draft whose field disappeared remains available to copy');
    await recovery.getByRole('button', {name: /Descartar rascunho|Discard draft/}).click();
    await recovery.waitFor({state: 'hidden'});
    check(true, 'the person can explicitly discard a recovered draft and continue');
    await movingPage.close();
  }
  {
    const fieldsPage = await browser.newPage({viewport: {width: 390, height: 844}});
    let paused = false, fieldsSocket;
    const fieldsHeld = [], fieldsSent = [];
    await fieldsPage.routeWebSocket('**/one/live*', client => {
      fieldsSocket = client;
      const server = client.connectToServer();
      client.onMessage(message => { fieldsSent.push(JSON.parse(message.toString())); server.send(message); });
      server.onMessage(message => {
        const parsed = JSON.parse(message.toString());
        if (paused && parsed.t === 'patch' && parsed.a > 0) fieldsHeld.push(message);
        else client.send(message);
      });
    });
    await fieldsPage.goto(base + '/field/1');
    await fieldsPage.getByText('Campos em /field/1').waitFor();
    paused = true;
    const start = fieldsSent.length;
    await fieldsPage.evaluate(() => {
      const first = document.querySelector('input[placeholder="Mantido"]');
      const second = document.querySelector('input[placeholder="Outro"]');
      for (let i = 0; i < 300; i++) {
        first.value = 'first-' + i;
        first.dispatchEvent(new Event('input', {bubbles: true}));
      }
      second.value = 'second';
      second.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await fieldsPage.waitForTimeout(500);
    paused = false;
    for (const message of fieldsHeld.splice(0)) fieldsSocket.send(message);
    await fieldsPage.getByText('Mantido: first-299, outro: second', {exact: true}).waitFor({timeout: 15000});
    const frames = fieldsSent.slice(start);
    const first = frames.findIndex(message => message.v === 'first-299');
    check(first >= 0 && frames.findIndex(message => message.v === 'second') > first, 'non-cancelable edits in different fields keep their order');
    await fieldsPage.close();
  }
  {
    const orderPage = await browser.newPage({viewport: {width: 390, height: 844}});
    let paused = false, orderSocket;
    const heldFrames = [], sentFrames = [];
    await orderPage.routeWebSocket('**/one/live*', client => {
      orderSocket = client;
      const server = client.connectToServer();
      client.onMessage(message => { sentFrames.push(JSON.parse(message.toString())); server.send(message); });
      server.onMessage(message => {
        const parsed = JSON.parse(message.toString());
        if (paused && parsed.t === 'patch' && parsed.a > 0) heldFrames.push(message);
        else client.send(message);
      });
    });
    await orderPage.goto(base + '/field/1');
    await orderPage.getByText('Campos em /field/1').waitFor();
    paused = true;
    const start = sentFrames.length;
    await orderPage.evaluate(() => {
      const field = document.querySelector('input[placeholder="Mantido"]');
      for (let i = 0; i < 300; i++) {
        field.value = 'before-nav-' + i;
        field.dispatchEvent(new Event('input', {bubbles: true}));
      }
      history.pushState(null, '', '/field/2');
      dispatchEvent(new PopStateEvent('popstate', {state: null}));
      dispatchEvent(new Event('resize'));
    });
    await orderPage.waitForTimeout(250);
    await orderPage.evaluate(() => {
      const field = document.querySelector('input[placeholder="Mantido"]');
      field.value = 'after-nav';
      field.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await orderPage.waitForTimeout(500);
    paused = false;
    for (const message of heldFrames.splice(0)) orderSocket.send(message);
    await orderPage.waitForTimeout(2000);
    const frames = sentFrames.slice(start);
    const first = frames.findIndex(message => message.v === 'before-nav-299');
    const route = frames.findIndex(message => message.t === 'route');
    const viewport = frames.findIndex(message => message.t === 'viewport');
    const last = frames.findIndex(message => message.v === 'after-nav');
    check(first >= 0 && route > first && viewport > route && last > viewport, 'navigation, viewport and a non-cancelable edit retain their order');
    await orderPage.close();
  }
  {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    let paused = false;
    const frames = [];
    await page.routeWebSocket('**/one/live*', client => {
      const server = client.connectToServer();
      client.onMessage(message => { frames.push(JSON.parse(message.toString())); server.send(message); });
      server.onMessage(message => {
        const parsed = JSON.parse(message.toString());
        if (!(paused && parsed.t === 'patch' && parsed.a > 0)) client.send(message);
      });
    });
    await page.goto(base + '/field/1');
    await page.getByText('Campos em /field/1').waitFor();
    paused = true;
    const start = frames.length;
    await page.evaluate(() => {
      const fields = ['Mantido', 'Outro'].map(name => document.querySelector(`input[placeholder="${name}"]`));
      for (let i = 0; i < 300; i++) {
        fields[0].value = 'warm-' + i;
        fields[0].dispatchEvent(new Event('input', {bubbles: true}));
      }
      for (let i = 0; i < 20; i++) {
        const field = fields[i % 2];
        field.value = 'overflow-' + i;
        field.dispatchEvent(new Event('input', {bubbles: true}));
      }
    });
    const warning = page.locator('[data-one-backpressure]');
    await warning.getByText(/Copie os rascunhos|Copy the visible drafts/).waitFor();
    check(await page.getByPlaceholder('Outro').inputValue() === 'overflow-19', 'reserve exhaustion leaves the visible draft available');
    check(frames.slice(start).filter(message => message.t === 'event').length <= 256, 'reserve exhaustion does not assign extra operation IDs');
    paused = false;
    await warning.getByRole('button', {name: /Descartar alterações não guardadas|Discard unqueued changes/}).click();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !frames.some(message => message.v === 'overflow-7')) await page.waitForTimeout(100);
    const recovered = frames.slice(start).filter(message => typeof message.v === 'string' && /^overflow-\d+$/.test(message.v)).map(message => message.v);
    check(recovered.join(',') === Array.from({length: 8}, (_, i) => 'overflow-' + i).join(','), 'accepted reserve edits resume once in order after explicit discard');
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures) process.exit(1);
console.log('PASS tests/ui/web_live_backpressure.mjs');
