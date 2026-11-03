// Abla One thin web host (web-document). The server renders the page (SSR);
// this script only forwards events and applies patches. It hydrates the
// server-rendered markup by event delegation, so nothing is re-created on
// load. The app runs either on the server (live mode: messages go over a
// WebSocket) or in the page (`boot.wasm`: the same messages go to the app's
// Wasm module, and this script runs its fetches, storage and timers).
(() => {
  const boot = window.__one;
  if (!boot) return;
  const root = document.getElementById('one-root');
  const style = document.getElementById('one-css');
  let revision = boot.r;
  let socket = null;
  let retry = 0;
  const queue = [];
  // Do not discard an event when the socket sends it: it may reach the server
  // just before the connection breaks. Keep it until a durable acknowledgement.
  const unacked = [];
  const beforeHello = [];
  let eventSequence = 0;
  let eventReady = false;
  let viewportAfterHello = false;
  // Relative URLs mean the app's root on every route: the page's <base> is fixed
  // when it loads, whatever pushState does later.
  const base = document.baseURI;
  const basePath = new URL(base).pathname;

  let local = null;
  const liveEvent = (message) => {
    message.n = ++eventSequence;
    message.u = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    unacked.push(message);
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));
  };
  const send = (message) => {
    if (boot.wasm) {
      if (local) local(message);
      else queue.push(message);
      return;
    }
    if (message.t === 'event') {
      if (eventReady) liveEvent(message);
      else beforeHello.push(message);
      return;
    }
    const text = JSON.stringify(message);
    if (socket && socket.readyState === 1) socket.send(text);
    else queue.push(text);
  };
  const event = (id, value) => send({t: 'event', r: revision, id: Number(id), v: value == null ? '' : String(value)});
  // Typing the session hasn't answered yet, and a press waiting for it: a control may only come
  // alive once the text reaches the session (a send button on a draft).
  let typed = 0;
  let typedSeen = 0;
  let held = null;
  const change = (id, value) => {
    held = null;
    send({t: 'event', r: revision, id: Number(id), v: String(value), c: ++typed});
  };
  const live = (target) => {
    const id = target.getAttribute('data-one-press');
    return id && id !== '0' && target.getAttribute('aria-disabled') !== 'true' ? id : null;
  };
  // The press lands if the same control is there, saying the same, and now takes it.
  const release = () => {
    if (!held || typedSeen !== typed) return;
    const {key, says} = held;
    held = null;
    const target = root.querySelector(`[data-one="${CSS.escape(key)}"]`);
    const id = target && target.textContent === says && live(target);
    if (id) event(id, '');
  };

  // --- events -------------------------------------------------------------
  root.addEventListener('click', (e) => {
    // With a <base>, "#section" would leave a page that isn't at the root.
    const anchor = e.target.closest('a[href^="#"]');
    if (anchor && new URL(anchor.href).pathname !== location.pathname) {
      e.preventDefault();
      const hash = anchor.getAttribute('href');
      history.replaceState(history.state, '', location.pathname + location.search + hash);
      const place = hash.length > 1 && document.getElementById(hash.slice(1));
      if (place) place.scrollIntoView();
      else scrollTo(0, 0);
    }
    const target = e.target.closest('[data-one-press]');
    if (!target) return;
    if (!live(target) && !target.hasAttribute('data-one-route')) {
      if (typedSeen !== typed) held = {key: target.getAttribute('data-one'), says: target.textContent};
      return;
    }
    if (target.getAttribute('aria-disabled') === 'true') return;
    // A link to a route: a plain click moves here; the others open a tab as usual.
    if (target.hasAttribute('data-one-route')) {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
    const id = target.getAttribute('data-one-press');
    if (id && id !== '0') event(id, '');
  });
  root.addEventListener('input', (e) => {
    const id = e.target.getAttribute && e.target.getAttribute('data-one-change');
    if (id) change(id, e.target.value);
    if (e.target.tagName === 'TEXTAREA') grow(e.target);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const field = e.target;
    const submit = field.getAttribute && field.getAttribute('data-one-submit');
    // Enter submits a field that declares onSubmit; Shift+Enter keeps a newline.
    if (submit && submit !== '0') {
      e.preventDefault();
      event(submit, '');
    }
  });
  const grow = (area) => {
    area.style.height = 'auto';
    area.style.height = Math.min(area.scrollHeight, 140) + 'px';
  };

  // --- feeds: anchoring and read positions --------------------------------
  const visible = new Map();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const feed = entry.target.closest('[data-one-feed]');
      if (!feed || !entry.isIntersecting || entry.intersectionRatio < 0.99) continue;
      const item = Number(entry.target.getAttribute('data-one-item'));
      const id = feed.getAttribute('data-one-visible');
      if (id && id !== '0' && item > (visible.get(feed.getAttribute('data-one')) || 0)) {
        visible.set(feed.getAttribute('data-one'), item);
        event(id, item);
      }
    }
  }, {threshold: [0.99]});
  const watchFeeds = () => {
    for (const feed of root.querySelectorAll('[data-one-feed]')) {
      if (!feed.__oneAnchored) {
        feed.__oneAnchored = true;
        const anchor = feed.getAttribute('data-one-feed');
        if (anchor === 'bottom') feed.scrollTop = feed.scrollHeight;
      }
      for (const item of feed.querySelectorAll('[data-one-item]')) observer.observe(item);
    }
  };

  // --- patching -------------------------------------------------------------
  const keyOf = (node) => node.nodeType === 1 ? node.getAttribute('data-one') : null;
  const morph = (from, to) => {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName || keyOf(from) !== keyOf(to)) {
      from.replaceWith(to);
      return;
    }
    if (from.nodeType === 3) {
      if (from.data !== to.data) from.data = to.data;
      return;
    }
    if (from.nodeType !== 1) return;
    for (const attr of Array.from(from.attributes)) if (!to.hasAttribute(attr.name) && attr.name !== 'style') from.removeAttribute(attr.name);
    for (const attr of Array.from(to.attributes)) {
      if (from.getAttribute(attr.name) !== attr.value) from.setAttribute(attr.name, attr.value);
    }
    // Keep what the person is typing: a focused field keeps its value unless the
    // server cleared it (a sent message) or changed it deliberately. Until the session
    // has seen all the typing, what it sends is an echo of older text, not a decision.
    if (from.tagName === 'INPUT' || from.tagName === 'TEXTAREA') {
      const wanted = to.tagName === 'TEXTAREA' ? to.textContent : to.getAttribute('value') || '';
      if (document.activeElement !== from || (typedSeen === typed && (wanted === '' || from.__oneLast !== wanted))) {
        if (from.value !== wanted) from.value = wanted;
        if (from.tagName === 'TEXTAREA') grow(from);
      }
      from.__oneLast = wanted;
      return;
    }
    const current = Array.from(from.childNodes);
    const next = Array.from(to.childNodes);
    const keyed = new Map();
    for (const child of current) {
      const key = keyOf(child);
      if (key) keyed.set(key, child);
    }
    let index = 0;
    for (const child of next) {
      const key = keyOf(child);
      let match = key ? keyed.get(key) : current[index];
      if (match && keyOf(match) !== key) match = null;
      const position = from.childNodes[index];
      if (match) {
        if (match !== position) from.insertBefore(match, position || null);
        morph(match, child);
      } else {
        from.insertBefore(child, position || null);
      }
      index++;
    }
    while (from.childNodes.length > next.length) from.lastChild.remove();
  };

  // --- routes ----------------------------------------------------------------
  // The browser holds the history. Each entry remembers its place (`i`) and an id
  // (`e`) from the session, which decides when a move is to a new entry: only then
  // does the scroll reset. Positions are saved per entry on leaving it, and in
  // sessionStorage so that a reload finds them.
  const here = () => (location.pathname.startsWith(basePath) ? '/' + location.pathname.slice(basePath.length) : location.pathname) + location.search + location.hash;
  const urlOf = (path) => new URL('.' + path, base).href;
  const noHash = (route) => route.split('#')[0];
  let entry = history.state && history.state.one ? history.state : {one: 1, i: 0, e: Date.now()};
  let shown = here();
  let asked = 0;
  let answered = 0;
  const positions = new Map();
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState(entry, '', boot.route ? urlOf(boot.route) : location.href);
  shown = here();
  const scrollers = () => root.querySelectorAll('.k-scroll,.k-feed');
  const saveScroll = () => {
    const areas = {};
    for (const area of scrollers()) if (area.scrollTop) areas[area.getAttribute('data-one')] = area.scrollTop;
    const place = {x: scrollX, y: scrollY, areas};
    positions.set(entry.e, place);
    try { sessionStorage.setItem(`one:scroll:${entry.e}`, JSON.stringify(place)); } catch (_) {}
  };
  const savedScroll = (id) => {
    if (positions.has(id)) return positions.get(id);
    try { return JSON.parse(sessionStorage.getItem(`one:scroll:${id}`)); } catch (_) { return null; }
  };
  // Back at an entry, or at a new one with nothing saved: at the top, feeds at their anchor.
  const placeScroll = (place) => {
    scrollTo(place ? place.x : 0, place ? place.y : 0);
    for (const area of scrollers()) {
      const top = place && place.areas[area.getAttribute('data-one')];
      area.__oneAnchored = !!top;
      area.scrollTop = top || 0;
    }
    if (!place && location.hash.length > 1) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }
  };
  // The screen is about to change under whatever has the focus.
  const leaveScreen = () => {
    const active = document.activeElement;
    if (root.contains(active) && !(active.getAttribute && active.getAttribute('data-one-field'))) active.blur();
    visible.clear();
    held = null;
  };
  const follow = (move) => {
    if (move.e === entry.e) {
      if (move.p !== here()) history.replaceState(entry, '', urlOf(move.p));
      return false;
    }
    saveScroll();
    entry = {one: 1, i: move.x ? entry.i : entry.i + 1, e: move.e};
    if (move.x) history.replaceState(entry, '', urlOf(move.p));
    else history.pushState(entry, '', urlOf(move.p));
    return true;
  };
  // The session's answer: moves it made, then the screen. With no question of ours
  // open, the URL ends up at the route the session says it's at.
  const patched = (message) => {
    if (message.c) typedSeen = message.c;
    let moved = false;
    for (const move of message.nav || []) if (follow(move)) moved = true;
    // A move that changes nothing on the screen (only the URL catches up) disturbs nothing.
    if (message.kept) moved = false;
    if (moved) leaveScreen();
    const carried = moved && document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-one-field');
    const typing = carried ? document.activeElement.value : '';
    apply(message);
    // The same field on this route: it keeps the focus, and what's still on its way to the session.
    if (carried) {
      const field = root.querySelector(`[data-one-field="${CSS.escape(carried)}"]`);
      if (field) {
        if ((message.c || typedSeen) !== typed) field.value = typing;
        field.focus();
      }
    }
    if (message.ack) answered = message.ack;
    if (message.at && answered === asked && noHash(message.at) !== noHash(here())) history.replaceState(entry, '', urlOf(message.at));
    shown = here();
    if (moved) placeScroll(null);
    else if (message.ack && message.ack === asked) placeScroll(savedScroll(entry.e));
    watchFeeds();
    release();
    // Cookie state and unrelated socket messages do not acknowledge a layout.
    // A resize while the first answer is in flight must wait for its own width.
    if (message.viewport === innerWidth) {
      document.documentElement.removeAttribute('data-one-held');
      document.documentElement.setAttribute('data-one-ready', '');
    }
  };
  const ask = (path, id) => {
    leaveScreen();
    asked++;
    send({t: 'route', p: path, e: id, n: asked});
  };
  addEventListener('popstate', (e) => {
    const route = here();
    // A fragment within the page isn't a move.
    if (noHash(route) === noHash(shown)) { shown = route; return; }
    saveScroll();
    entry = e.state && e.state.one ? e.state : {one: 1, i: 0, e: Date.now()};
    if (!(e.state && e.state.one)) history.replaceState(entry, '', location.href);
    shown = route;
    ask(route, entry.e);
  });
  const goBack = (to) => {
    if (entry.i > 0) return history.back();
    if (!to) return;
    saveScroll();
    entry = {one: 1, i: 0, e: Date.now()};
    history.replaceState(entry, '', urlOf(to));
    shown = here();
    ask(to, entry.e);
  };

  // --- popovers --------------------------------------------------------------
  // Fixed to the window, so a scroll area can't clip it: below the anchor, or above when only that
  // fits. The focus goes in when one opens, and back to where it was when it closes.
  let opener = null;
  const popovers = () => {
    const panels = root.querySelectorAll('.one-panel');
    for (const panel of panels) {
      const anchor = panel.parentElement.firstElementChild.getBoundingClientRect();
      const end = panel.getAttribute('data-side') === 'end';
      const x = Math.max(8, Math.min(end ? anchor.right - panel.offsetWidth : anchor.left, innerWidth - 8 - panel.offsetWidth));
      const below = anchor.bottom + 4;
      const y = below + panel.offsetHeight > innerHeight - 8 && anchor.top - 4 - panel.offsetHeight >= 8 ? anchor.top - 4 - panel.offsetHeight : below;
      panel.style.cssText = `position:fixed;margin:0;right:auto;left:${x}px;top:${y}px`;
      if (!panel.__oneOpened) {
        panel.__oneOpened = true;
        opener = document.activeElement;
        const first = panel.querySelector('button,a[href],input,textarea');
        if (first) first.focus();
      }
    }
    if (!panels.length && opener) {
      if (opener.isConnected && (document.activeElement === document.body || !document.activeElement)) opener.focus();
      opener = null;
    }
  };
  addEventListener('resize', popovers);
  addEventListener('scroll', popovers, true);
  document.addEventListener('keydown', (e) => {
    const scrims = e.key === 'Escape' ? root.querySelectorAll('.one-scrim') : [];
    if (scrims.length) scrims[scrims.length - 1].click();
  });

  const apply = (message) => {
    if (message.css) style.appendChild(document.createTextNode(message.css));
    if (message.title && document.title !== message.title) document.title = message.title;
    const feeds = new Map();
    for (const feed of root.querySelectorAll('[data-one-feed]')) {
      feeds.set(feed.getAttribute('data-one'), feed.scrollHeight - feed.scrollTop - feed.clientHeight < 24);
    }
    if (message.html != null) {
      const template = document.createElement('template');
      template.innerHTML = message.html;
      const fresh = template.content.firstElementChild;
      if (root.firstElementChild && fresh) morph(root.firstElementChild, fresh);
      else if (fresh) root.replaceChildren(fresh);
    }
    revision = message.r;
    for (const feed of root.querySelectorAll('[data-one-feed]')) {
      const atBottom = feeds.get(feed.getAttribute('data-one'));
      if (atBottom === undefined) feed.__oneAnchored = false;
      else if (atBottom) feed.scrollTop = feed.scrollHeight;
    }
    watchFeeds();
    popovers();
  };

  // --- file pickers --------------------------------------------------------
  // The session asks for a file; the picker opens while the tap that caused it
  // still counts as a user action. Images are normalized like the Android host.
  const upload = async (query, body, headers = {}) => {
    if (!boot.wasm) return fetch(`one/upload?s=${encodeURIComponent(boot.s)}&${query}`, {method: 'POST', body, headers, credentials: 'same-origin'});
    // In the page, the module takes the bytes directly.
    const q = new URLSearchParams(query);
    const base64 = typeof body === 'string' ? body : await new Promise((done) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
      reader.readAsDataURL(body);
    });
    send({t: 'upload', id: Number(q.get('id')), kind: q.get('kind'), files: q.get('files') || '', base64,
      name: decodeURIComponent(headers['X-One-Name'] || ''), mime: headers['Content-Type'] || '', last: headers['X-One-Last'] === '1'});
    return {text: async () => ''};
  };
  const encode = (canvas, type, limit) => {
    let quality = 0.9;
    let data = canvas.toDataURL(type, quality);
    while (type === 'image/jpeg' && data.length > limit && quality > 0.3) data = canvas.toDataURL(type, quality -= 0.1);
    return data.slice(data.indexOf(',') + 1);
  };
  const normalize = async (file, kind) => {
    const bitmap = await createImageBitmap(file);
    const limit = 13336;
    let size = kind === 'emoji' ? 128 : 256;
    for (;;) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const g = canvas.getContext('2d');
      const side = Math.min(bitmap.width, bitmap.height);
      if (kind === 'emoji') {
        const scale = size / Math.max(bitmap.width, bitmap.height);
        g.drawImage(bitmap, (size - bitmap.width * scale) / 2, (size - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
      } else {
        g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
      }
      const data = encode(canvas, kind === 'emoji' ? 'image/png' : 'image/jpeg', limit);
      if (data.length <= limit || size <= 32) return data;
      size = Math.round(size * 0.75);
    }
  };
  const pick = (message) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = (message.accept || []).join(',');
    input.multiple = !!message.multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = () => { done = true; input.remove(); };
    input.addEventListener('cancel', () => { if (!done) { finish(); upload(`id=${message.id}&kind=cancel${message.kind === 'files' ? '&files=1' : ''}`, ''); } });
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      finish();
      if (!files.length) return upload(`id=${message.id}&kind=cancel${message.kind === 'files' ? '&files=1' : ''}`, '');
      if (message.kind !== 'files') {
        try {
          return upload(`id=${message.id}&kind=${message.kind}`, await normalize(files[0], message.kind));
        } catch (_) {
          return upload(`id=${message.id}&kind=cancel`, '');
        }
      }
      try {
        // Live sessions accept one file per HTTP request, at most 16 MiB.
        if (!boot.wasm && files.some(file => file.size > 16777216)) throw new Error('File exceeds the 16 MiB upload limit');
        let picked = '';
        for (let i = 0; i < files.length; i++) {
          const response = await upload(`id=${message.id}&kind=files&picked=${encodeURIComponent(picked)}`, files[i], {
            'Content-Type': files[i].type || 'application/octet-stream',
            'X-One-Name': encodeURIComponent(files[i].name),
            'X-One-Last': i === files.length - 1 ? '1' : '0'});
          if (response.ok === false) throw new Error(`File upload failed (${response.status})`);
          const handle = await response.text();
          picked = picked ? `${picked},${handle}` : handle;
        }
      } catch (error) {
        send({t: 'pick-error', id: message.id, error: error.message || 'File upload failed'});
      }
    });
    input.click();
  };

  // --- connection -------------------------------------------------------------
  const receive = (message) => {
    if (message.t === 'patch') patched(message);
    else if (message.t === 'back') goBack(message.to);
    else if (message.t === 'forward') history.forward();
    else if (message.t === 'pick') pick(message);
    else if (message.t === 'cookies') fetch(`one/cookies?s=${encodeURIComponent(boot.s)}`, {method: 'POST', credentials: 'same-origin'});
    else if (message.t === 'reload') location.reload();
    else if (message.t === 'fetch') request(message);
    else if (message.t === 'store') store(message.storage);
    else if (message.t === 'wait') { clearTimeout(ticking); ticking = setTimeout(() => send({t: 'tick'}), message.ms); }
    if (!boot.wasm && message.t === 'patch' && Number.isSafeInteger(message.a) && message.a >= 0) {
      if (!eventReady) {
        eventSequence = message.a;
        eventReady = true;
        while (beforeHello.length) liveEvent(beforeHello.shift());
        if (viewportAfterHello) {
          viewportAfterHello = false;
          send({t: 'viewport', w: innerWidth});
        }
      } else if (message.a <= eventSequence) {
        while (unacked.length && unacked[0].n <= message.a) unacked.shift();
      }
    }
  };

  // Wasm mode: the module's requests, storage and timers.
  let ticking = 0;
  const bytes = (base64) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const request = async ({id, request: r}) => {
    const abort = new AbortController();
    const timer = r.timeoutMs > 0 ? setTimeout(() => abort.abort(), r.timeoutMs) : 0;
    let payload;
    try {
      const response = await fetch(new URL(r.url, base), {method: r.method, headers: r.headers,
        body: r.method === 'GET' || r.method === 'HEAD' ? undefined : (r.bodyBase64 ? bytes(r.bodyBase64) : r.body),
        credentials: 'same-origin', signal: abort.signal});
      const headers = {};
      response.headers.forEach((value, name) => { headers[name] = value; });
      payload = {requestId: id, status: response.status, body: '', error: '', headers};
      if (r.binary || r.save) {
        const data = new Uint8Array(await response.arrayBuffer());
        let text = '';
        for (let i = 0; i < data.length; i += 32768) text += String.fromCharCode.apply(null, data.subarray(i, i + 32768));
        payload.bodyBase64 = btoa(text);
        payload.name = decodeURIComponent(new URL(r.url, base).pathname.split('/').pop() || '');
      } else payload.body = await response.text();
    } catch (error) {
      payload = {requestId: id, status: 0, body: '', error: String(error && error.message || error)};
    }
    clearTimeout(timer);
    send({t: 'result', payload: JSON.stringify(payload), save: !!r.save});
  };
  const prefix = 'one:';
  const stored = () => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(prefix)) out[key.slice(prefix.length)] = localStorage.getItem(key);
      }
    } catch (_) {}
    return out;
  };
  const store = (values) => {
    try {
      for (const [key, value] of Object.entries(values)) {
        if (value === '') localStorage.removeItem(prefix + key);
        else localStorage.setItem(prefix + key, value);
      }
    } catch (_) {}
  };
  const run = async () => {
    let memory = null;
    const host = {
      clock_ns: (clock) => BigInt(Math.round((clock === 0 ? Date.now() : performance.now()) * 1e6)),
      write: (fd, data, length) => { console[fd === 2 ? 'error' : 'log'](new TextDecoder().decode(new Uint8Array(memory.buffer, data, length))); return length; },
      exit: (code) => { throw new Error(`Abla One app exited (${code})`); },
      random: (data, length) => { crypto.getRandomValues(new Uint8Array(memory.buffer, data, length)); return length; }
    };
    const response = await fetch(new URL(boot.wasm, base));
    const {instance} = await WebAssembly.instantiate(await response.arrayBuffer(), {abla_host: host});
    memory = instance.exports.memory;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    local = (message) => {
      const data = encoder.encode(JSON.stringify(message));
      const pointer = instance.exports.one_alloc(data.length);
      new Uint8Array(memory.buffer, pointer, data.length).set(data);
      const packed = instance.exports.one_message(pointer, data.length);
      const text = decoder.decode(new Uint8Array(memory.buffer, Number(packed >> 32n), Number(packed & 0xffffffffn)));
      for (const message of JSON.parse(text)) receive(message);
    };
    local({t: 'hello', r: revision, w: innerWidth, h: innerHeight, e: entry.e, p: noHash(here()), storage: stored()});
    // Taps before the module was ready, against the revision now shown.
    while (queue.length) {
      const message = queue.shift();
      if (message.t === 'event') message.r = revision;
      local(message);
    }
    document.documentElement.setAttribute('data-one-ready', '');
  };

  let leaving = false;
  const connect = () => {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Relative to the page, so the app also works under a path prefix.
    const url = new URL(`one/live?s=${encodeURIComponent(boot.s)}`, base);
    socket = new WebSocket(`${scheme}//${url.host}${url.pathname}${url.search}`);
    socket.onopen = () => {
      retry = 0;
      document.documentElement.removeAttribute('data-one-offline');
      // Early scripted intents were made on the SSR revision: replay them there, then acknowledge the real viewport.
      const waiting = queue.length > 0 || unacked.length > 0 || beforeHello.length > 0;
      socket.send(JSON.stringify(waiting ? {t: 'hello', r: revision, e: entry.e} : {t: 'hello', r: revision, w: innerWidth, e: entry.e}));
      while (queue.length) socket.send(queue.shift());
      for (const message of unacked) socket.send(JSON.stringify(message));
      if (waiting && !eventReady && beforeHello.length) viewportAfterHello = true;
      else if (waiting) socket.send(JSON.stringify({t: 'viewport', w: innerWidth}));
    };
    socket.onmessage = (e) => receive(JSON.parse(e.data));
    socket.onclose = (e) => {
      document.documentElement.setAttribute('data-one-offline', '');
      // An unknown or ended session needs a fresh page, unless one is already on its way.
      if (e.code === 1008) return setTimeout(() => location.reload(), leaving ? 3000 : 0);
      setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000));
    };
  };
  // Layout follows the viewport width; the cookie is only a hint for the next
  // SSR page. Cookies are for the whole app, whatever route set them.
  let resizing = 0;
  const viewport = () => {
    document.cookie = `one_width=${innerWidth}; path=${basePath}; max-age=31536000; samesite=lax`;
    send({t: 'viewport', w: innerWidth});
  };
  addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(viewport, 150); });
  document.cookie = `one_width=${innerWidth}; path=${basePath}; max-age=31536000; samesite=lax`;
  document.cookie = `one_resume=; path=${basePath}; max-age=0; samesite=lax`;
  // A reload resumes this tab's session: the next page request carries it.
  // beforeunload runs before the browser requests the next page; pagehide
  // covers navigations that skip it. A link followed from the page goes to another
  // page, which starts its own session, so the session isn't offered. The mark is short: the browser
  // asks for the page right after the click, and a link that turns out to be a download stays here.
  let followed = 0;
  const resume = () => { if (!followed) document.cookie = `one_resume=${boot.s}; path=${basePath}; max-age=15; samesite=lax`; };
  document.addEventListener('click', (e) => {
    const link = !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.target.closest && e.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const to = new URL(link.href);
    if (to.pathname === location.pathname && to.search === location.search && to.hash) return;
    clearTimeout(followed);
    followed = setTimeout(() => { followed = 0; }, 1000);
  });
  if (!boot.wasm) {
    addEventListener('beforeunload', () => { leaving = true; resume(); });
    addEventListener('pagehide', resume);
  }
  addEventListener('pagehide', saveScroll);
  for (const area of root.querySelectorAll('textarea')) grow(area);
  watchFeeds();
  popovers();
  const left = savedScroll(entry.e);
  if (left) placeScroll(left);
  // What was done on the painted page before this script ran: it waits in the queue like anything else until the app can take it.
  const early = window.__oneEarly;
  if (early) {
    early.stop();
    for (const {t: target, k: kind} of early) {
      if (kind === 'click') target.click();
      else if (kind === 'input') target.dispatchEvent(new Event('input', {bubbles: true}));
      else target.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    }
  }
  if (boot.wasm) run().catch((error) => { console.error(error); document.documentElement.setAttribute('data-one-offline', ''); });
  else connect();
})();
