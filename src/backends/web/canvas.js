// Abla One web-canvas host (live mode). The server lays out and paints the
// page (one-layout); this script draws the paint list on a canvas, routes
// input through hit regions, and puts a real text field over an input while
// it is being edited, so typing, IME and selection behave natively. The
// server-rendered document stays visible until the first frame arrives.
(() => {
  const boot = window.__one;
  if (!boot) return;
  const root = document.getElementById('one-root');
  let revision = boot.r;
  let socket = null;
  let retry = 0;
  let frame = null;
  let editor = null;
  const queue = [];
  // As in host.js: <base> is the app's root. The session keeps the scroll, per
  // entry, so moves here only touch the history. `?render=canvas` stays in the URL,
  // so that a reload is a canvas page too.
  const base = document.baseURI;
  const basePath = new URL(base).pathname;
  const here = () => (location.pathname.startsWith(basePath) ? '/' + location.pathname.slice(basePath.length) : location.pathname) + location.search;
  const urlOf = (path) => {
    const url = new URL('.' + path, base);
    url.searchParams.set('render', 'canvas');
    return url.href;
  };
  let entry = history.state && history.state.one ? history.state : {one: 1, i: 0, e: Date.now()};
  let asked = 0;
  let answered = 0;
  history.replaceState(entry, '', boot.route ? urlOf(boot.route) : location.href);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;touch-action:none;display:none';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');

  const fonts = [400, 500, 600, 700].map(w => new FontFace('Inter One', `url(one/fonts/Inter-${w}.ttf)`, {weight: String(w)}));
  Promise.all(fonts.map(f => f.load().then(face => document.fonts.add(face)).catch(() => {}))).then(() => frame && draw());

  const send = (message) => {
    const text = JSON.stringify(message);
    if (socket && socket.readyState === 1) socket.send(text);
    else queue.push(text);
  };
  const event = (id, value) => send({t: 'event', r: revision, id: Number(id), v: value == null ? '' : String(value)});

  // --- drawing --------------------------------------------------------------
  const icons = new Map();
  const images = new Map();
  const icon = (name, tint, w, h) => {
    const key = `${name}|${tint}|${w}|${h}`;
    if (icons.has(key)) return icons.get(key);
    const ratio = devicePixelRatio || 1;
    const off = document.createElement('canvas');
    off.width = Math.ceil(w * ratio);
    off.height = Math.ceil(h * ratio);
    icons.set(key, null);
    const image = new Image();
    image.onload = () => {
      const c = off.getContext('2d');
      c.drawImage(image, 0, 0, off.width, off.height);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = tint || '#111';
      c.fillRect(0, 0, off.width, off.height);
      icons.set(key, off);
      draw();
    };
    image.src = `${boot.icons}/${name}.svg`;
    return null;
  };
  const picture = (src) => {
    if (images.has(src)) return images.get(src);
    images.set(src, null);
    const image = new Image();
    image.onload = () => { images.set(src, image); draw(); };
    image.src = src.includes('/') ? src : `${boot.icons}/${src}.svg`;
    return null;
  };
  const path = (x, y, w, h, r) => {
    g.beginPath();
    if (r > 0 && g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    else g.rect(x, y, w, h);
  };
  const draw = () => {
    if (!frame) return;
    const ratio = devicePixelRatio || 1;
    if (canvas.width !== Math.round(innerWidth * ratio) || canvas.height !== Math.round(innerHeight * ratio)) {
      canvas.width = Math.round(innerWidth * ratio);
      canvas.height = Math.round(innerHeight * ratio);
    }
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const [op, x, y, w, h, radius, color, text, size, weight, sides] of frame.paints) {
      if (op === 'rect') { g.fillStyle = color; path(x, y, w, h, radius); g.fill(); }
      else if (op === 'border') {
        const [t, r, b, l] = sides.split(' ').map(Number);
        g.fillStyle = color || '#ddd';
        if (t === r && r === b && b === l && radius > 0) {
          g.strokeStyle = color; g.lineWidth = t; path(x + t / 2, y + t / 2, w - t, h - t, radius - t / 2); g.stroke();
        } else {
          if (t) g.fillRect(x, y, w, t);
          if (b) g.fillRect(x, y + h - b, w, b);
          if (l) g.fillRect(x, y, l, h);
          if (r) g.fillRect(x + w - r, y, r, h);
        }
      } else if (op === 'text') {
        g.font = `${weight} ${size}px "Inter One", Inter, system-ui, sans-serif`;
        g.fillStyle = color;
        g.textBaseline = 'middle';
        g.fillText(text, x, y + h / 2);
      } else if (op === 'icon') {
        const tinted = icon(text, color, w, h);
        if (tinted) g.drawImage(tinted, x, y, w, h);
      } else if (op === 'image') {
        const image = picture(text);
        if (image) {
          g.save(); path(x, y, w, h, radius); g.clip();
          const scale = weight === 'fit' ? Math.min(w / image.width, h / image.height) : Math.max(w / image.width, h / image.height);
          g.drawImage(image, x + (w - image.width * scale) / 2, y + (h - image.height * scale) / 2, image.width * scale, image.height * scale);
          g.restore();
        }
      } else if (op === 'clip') { g.save(); path(x, y, w, h, radius); g.clip(); }
      else if (op === 'unclip') g.restore();
    }
    placeEditor();
  };

  // --- input --------------------------------------------------------------------
  const hitAt = (px, py, kinds) => {
    if (!frame) return null;
    for (let i = frame.hits.length - 1; i >= 0; i--) {
      const hit = frame.hits[i];
      const [kind, x, y, w, h] = hit;
      if (kinds.includes(kind) && px >= x && px < x + w && py >= y && py < y + h) return hit;
    }
    return null;
  };
  const placeEditor = () => {
    if (!editor) return;
    const hit = frame.hits.find(h => h[0] === 'input' && h[7] === editor.dataset.key);
    if (!hit) { editor.remove(); editor = null; return; }
    const [, x, y, w, h, change, submit, , value] = hit;
    Object.assign(editor.style, {left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px'});
    editor.dataset.change = change;
    editor.dataset.submit = submit;
    if (document.activeElement !== editor || value === '') { if (editor.value !== value) editor.value = value; }
  };
  const openEditor = (hit) => {
    const [, x, y, w, h, change, submit, key, value, placeholder, multiline] = hit;
    if (editor && editor.dataset.key === key) return editor.focus();
    if (editor) editor.remove();
    editor = document.createElement(multiline ? 'textarea' : 'input');
    editor.dataset.key = key;
    editor.placeholder = placeholder;
    editor.value = value;
    editor.style.cssText = `position:fixed;box-sizing:border-box;margin:0;border:0;outline:0;background:transparent;resize:none;padding:${multiline ? 11 : 0}px 16px;font:400 16px "Inter One",Inter,system-ui,sans-serif;color:#111;z-index:2`;
    document.body.appendChild(editor);
    editor.addEventListener('input', () => event(editor.dataset.change, editor.value));
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && editor.dataset.submit !== '0') { e.preventDefault(); event(editor.dataset.submit, ''); }
    });
    placeEditor();
    editor.focus();
  };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const scroll = hitAt(e.clientX, e.clientY, ['scroll']);
    drag = scroll ? {key: scroll[7], start: e.clientY, from: Number(scroll[8]), max: Number(scroll[9]), moved: false} : null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !e.buttons) return;
    const dy = drag.start - e.clientY;
    if (Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) send({t: 'scroll', key: drag.key, y: Math.max(0, Math.min(drag.max, drag.from + dy))});
  });
  canvas.addEventListener('pointerup', (e) => {
    const moved = drag && drag.moved;
    drag = null;
    if (moved) return;
    const hit = hitAt(e.clientX, e.clientY, ['press', 'input', 'link']);
    if (!hit) { if (editor) editor.blur(); return; }
    if (hit[0] === 'link') { if (!hit[8].startsWith('#')) location.href = new URL(hit[8], base).href; return; }
    if (hit[0] === 'input') openEditor(hit);
    else if (hit[5]) event(hit[5], '');
  });
  canvas.addEventListener('wheel', (e) => {
    const hit = hitAt(e.clientX, e.clientY, ['scroll']);
    if (!hit) return;
    e.preventDefault();
    send({t: 'scroll', key: hit[7], y: Math.max(0, Math.min(Number(hit[9]), Number(hit[8]) + e.deltaY))});
  }, {passive: false});
  canvas.addEventListener('pointermove', (e) => {
    canvas.style.cursor = hitAt(e.clientX, e.clientY, ['press', 'link']) ? 'pointer' : hitAt(e.clientX, e.clientY, ['input']) ? 'text' : 'default';
  });
  let resizing = 0;
  addEventListener('resize', () => {
    draw();
    clearTimeout(resizing);
    resizing = setTimeout(() => send({t: 'viewport', w: innerWidth, h: innerHeight}), 120);
  });

  // --- routes -----------------------------------------------------------------------
  const moves = (message) => {
    for (const move of message.nav || []) {
      if (move.e === entry.e) { history.replaceState(entry, '', urlOf(move.p)); continue; }
      entry = {one: 1, i: move.x ? entry.i : entry.i + 1, e: move.e};
      if (move.x) history.replaceState(entry, '', urlOf(move.p));
      else history.pushState(entry, '', urlOf(move.p));
    }
    if (message.ack) answered = message.ack;
    if (message.at && answered === asked && new URL(urlOf(message.at)).pathname !== location.pathname) history.replaceState(entry, '', urlOf(message.at));
    if (message.title && document.title !== message.title) document.title = message.title;
  };
  const ask = (path) => {
    if (editor) { editor.remove(); editor = null; }
    asked++;
    send({t: 'route', p: path, e: entry.e, n: asked});
  };
  addEventListener('popstate', (e) => {
    entry = e.state && e.state.one ? e.state : {one: 1, i: 0, e: Date.now()};
    ask(here());
  });
  const goBack = (to) => {
    if (entry.i > 0) return history.back();
    if (!to) return;
    entry = {one: 1, i: 0, e: Date.now()};
    history.replaceState(entry, '', urlOf(to));
    ask(to);
  };

  // --- connection -------------------------------------------------------------------
  const connect = () => {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`one/live?s=${encodeURIComponent(boot.s)}`, base);
    socket = new WebSocket(`${scheme}//${url.host}${url.pathname}${url.search}`);
    socket.onopen = () => {
      retry = 0;
      socket.send(JSON.stringify({t: 'hello', r: revision, w: innerWidth, h: innerHeight, e: entry.e}));
      while (queue.length) socket.send(queue.shift());
    };
    socket.onmessage = (e) => {
      const message = JSON.parse(e.data);
      if (message.t === 'frame') {
        moves(message);
        if (message.frame) {
          frame = message.frame;
          window.__oneFrame = frame;
          if (canvas.style.display === 'none') { canvas.style.display = 'block'; root.style.display = 'none'; }
          draw();
        }
        revision = message.r;
      } else if (message.t === 'back') goBack(message.to);
      else if (message.t === 'forward') history.forward();
      else if (message.t === 'cookies') fetch(`one/cookies?s=${encodeURIComponent(boot.s)}`, {method: 'POST', credentials: 'same-origin'});
    };
    socket.onclose = (e) => {
      if (e.code === 1008) return location.reload();
      setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000));
    };
  };
  const resume = () => { document.cookie = `one_resume=${boot.s}; path=${basePath}; max-age=15; samesite=lax`; };
  document.cookie = `one_resume=; path=${basePath}; max-age=0; samesite=lax`;
  addEventListener('beforeunload', resume);
  addEventListener('pagehide', resume);
  connect();
})();
