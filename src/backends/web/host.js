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
  let cookieWork = Promise.resolve();
  const queue = [];
  // Do not discard an event when the socket sends it: it may reach the server
  // just before the connection breaks. Keep it until a durable acknowledgement.
  const unacked = [];
  const unackedRoutes = [];
  const beforeHello = [];
  let eventSequence = 0;
  let sendOrder = 0;
  let eventReady = false;
  let handshaking = true;
  let viewportAfterHello = false;
  // An unacknowledged operation cannot be discarded or renumbered. Limit
  // admission before assigning its sequence, and keep a single in-flight
  // composition in its field until acknowledgements make room.
  const pendingLimit = 256, pendingByteLimit = 512 * 1024;
  let deferredEdit = null;
  const deferredRest = [];
  const deferredControls = [];
  let manualRecovery = false;
  let deferredRoute = null;
  let deferredNavigation = null;
  let bufferNotice = null;
  let oversizedEdit = false;
  let missingDraftField = false;
  const pendingSize = () => {
    let bytes = 0, count = 0;
    for (const item of [...unacked, ...unackedRoutes, ...beforeHello, ...queue]) {
      const text = item.text || JSON.stringify(item.message || item);
      bytes += new TextEncoder().encode(text).length + 64;
      count++;
    }
    return {bytes, count};
  };
  const fits = (message) => {
    const size = pendingSize();
    return size.count < pendingLimit && size.bytes + new TextEncoder().encode(JSON.stringify(message)).length + 64 <= pendingByteLimit;
  };
  const blocked = () => !!deferredEdit || !!deferredRoute || !!deferredNavigation || !!deferredControls.length || !!bufferNotice;
  const notice = (tooLarge = false, fieldMissing = false) => {
    oversizedEdit = tooLarge;
    missingDraftField ||= fieldMissing;
    if (!bufferNotice) {
      bufferNotice = document.createElement('div');
      bufferNotice.setAttribute('data-one-backpressure', '');
      bufferNotice.setAttribute('role', 'status');
      bufferNotice.style.cssText = 'position:fixed;z-index:2147483647;bottom:1rem;left:1rem;right:1rem;padding:1rem;background:#222;color:white;border-radius:.5rem';
      document.body.appendChild(bufferNotice);
    }
    const pt = document.documentElement.lang.toLowerCase().startsWith('pt');
    const recoveryField = deferredEdit && bufferNotice.contains(deferredEdit.target) ? deferredEdit.target : null;
    bufferNotice.textContent = manualRecovery
      ? (pt ? 'Não foi possível guardar todas as alterações. Copie os rascunhos visíveis antes de continuar.' : 'Some changes could not be queued. Copy the visible drafts before continuing.')
      : missingDraftField
      ? (pt ? 'O campo deixou de estar disponível. Copie o rascunho antes de sair.' : 'The field is no longer available. Copy your draft before leaving.')
      : tooLarge
      ? (pt ? 'O texto é demasiado longo. Reduza-o para continuar.' : 'The text is too long. Shorten it to continue.')
      : (pt ? 'A ligação está atrasada. Aguarde para continuar.' : 'The connection is delayed. Wait to continue.');
    if (recoveryField) bufferNotice.appendChild(recoveryField);
    else if (fieldMissing && deferredEdit && !deferredEdit.target.isConnected) bufferNotice.appendChild(deferredEdit.target);
    if (missingDraftField) {
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.textContent = pt ? 'Descartar rascunho' : 'Discard draft';
      discard.addEventListener('click', () => {
        deferredEdit = deferredRest.shift() || null;
        clearNotice();
        if (deferredEdit) notice();
        drainDeferred();
      });
      bufferNotice.appendChild(discard);
    }
    if (manualRecovery) {
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.textContent = pt ? 'Descartar alterações não guardadas' : 'Discard unqueued changes';
      discard.addEventListener('click', () => {
        manualRecovery = false;
        clearNotice();
        if (deferredEdit || deferredRoute || deferredNavigation || deferredControls.length) notice();
        if (!socket || socket.readyState === 3) connect();
      });
      bufferNotice.appendChild(discard);
    }
  };
  const clearNotice = () => {
    const wasBlocked = !!bufferNotice;
    if (bufferNotice) bufferNotice.remove();
    bufferNotice = null; oversizedEdit = false; missingDraftField = false;
    // Retry visible-feed reports that could not be admitted while full.
    if (wasBlocked) { observer.disconnect(); watchFeeds(); }
  };
  // Relative URLs mean the app's root on every route: the page's <base> is fixed
  // when it loads, whatever pushState does later.
  const base = document.baseURI;
  const basePath = new URL(base).pathname;

  let local = null;
  const wire = (text, duringHello = false) => {
    if (!socket || socket.readyState !== 1 || (handshaking && !duringHello)) return false;
    try { socket.send(text); return true; }
    catch (_) {
      handshaking = true;
      document.documentElement.setAttribute('data-one-offline', '');
      try { socket.close(); } catch (_) {}
      return false;
    }
  };

  const liveEvent = (message, order = ++sendOrder) => {
    message.n = ++eventSequence;
    message.u = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    unacked.push({message, order});
    wire(JSON.stringify(message));
  };
  const send = (message, admittingDeferred = false, reservedOrder = null) => {
    if (boot.wasm) {
      if (local) local(message);
      else queue.push(message);
      return;
    }
    if (message.t === 'event') {
      if ((!admittingDeferred && blocked()) || !fits(message)) { notice(oversizedEdit); return false; }
      const order = reservedOrder === null ? ++sendOrder : reservedOrder;
      if (eventReady) liveEvent(message, order);
      else beforeHello.push({message, order});
      return true;
    }
    if (message.t === 'route') {
      if ((!admittingDeferred && (deferredEdit || deferredRoute || deferredNavigation)) || !fits(message)) {
        deferredRoute = {message, order: reservedOrder === null ? ++sendOrder : reservedOrder};
        notice(oversizedEdit);
        return false;
      }
      const item = {message, order: reservedOrder === null ? ++sendOrder : reservedOrder};
      unackedRoutes.push(item);
      wire(JSON.stringify(message));
      return;
    }
    if (!admittingDeferred && blocked()) {
      const last = deferredControls[deferredControls.length - 1];
      if (message.t === 'viewport' && last && last.message.t === 'viewport' && last.order === sendOrder) {
        last.message = message;
        return false;
      }
      if (deferredControls.length >= 8 || !fits(message) && JSON.stringify(message).length > pendingByteLimit) {
        manualRecovery = true;
        notice();
        try { if (socket) socket.close(); } catch (_) {}
        return false;
      }
      deferredControls.push({message, order: ++sendOrder});
      notice(oversizedEdit);
      return false;
    }
    const text = JSON.stringify(message);
    const order = reservedOrder === null ? ++sendOrder : reservedOrder;
    const viewportOnly = message.t === 'viewport' && !unacked.length && !unackedRoutes.length && !beforeHello.length && !queue.length;
    if (!wire(text, viewportOnly)) {
      const previous = queue[queue.length - 1];
      // Consecutive width reports have no intervening action; only the last
      // width matters. Do not coalesce across an event or navigation.
      if (message.t === 'viewport' && previous && previous.kind === 'viewport' && previous.order === order - 1) {
        previous.text = text;
        previous.order = order;
      } else queue.push({text, order, kind: message.t});
    }
  };
  const event = (id, value) => send({t: 'event', r: revision, id: Number(id), v: value == null ? '' : String(value)});
  // Typing the session hasn't answered yet, and a press waiting for it: a control may only come
  // alive once the text reaches the session (a send button on a draft).
  let typed = 0;
  let typedSeen = 0;
  let held = null;
  const change = (id, value, target) => {
    if (manualRecovery) return;
    held = null;
    const message = {t: 'event', r: revision, id: Number(id), v: String(value), c: typed + 1};
    // Local-only metadata keeps unfocused drafts across a stale recovery render.
    // It is not part of the event's wire payload or the server's authority.
    const field = target.getAttribute('data-one-field');
    Object.defineProperty(message, '_field', {value: field ? `f:${field}` : `k:${target.getAttribute('data-one') || ''}`});
    Object.defineProperty(message, '_entry', {value: entry.e});
    if (!boot.wasm && deferredEdit && !deferredRest.length && oversizedEdit && deferredEdit.target === target && fits(message)) {
      deferredEdit = null;
      clearNotice();
    }
    if (!boot.wasm && (blocked() || !fits(message))) {
      const boundedValue = message.v.length <= pendingByteLimit && new TextEncoder().encode(message.v).length <= pendingByteLimit;
      const edit = {id, target, field: message._field, entry: message._entry, revision, value: boundedValue ? message.v : null, order: 0};
      if (!deferredEdit) { edit.order = ++sendOrder; deferredEdit = edit; }
      else {
        const last = deferredRest.length ? deferredRest[deferredRest.length - 1] : deferredEdit;
        if (last.field === edit.field && last.entry === edit.entry && (!deferredNavigation || last.order > deferredNavigation.order) && (!deferredRoute || last.order > deferredRoute.order) && (!deferredControls.length || last.order > deferredControls[deferredControls.length - 1].order)) {
          last.target = target;
          last.value = edit.value;
          last.id = id;
          last.revision = revision;
        } else {
          // Normally beforeinput stops edits while full. An IME or autofill
          // can still produce a few non-cancelable changes. If even this
          // reserve fills, stop patching rather than silently overwrite them.
          const value = last.value === null ? last.target.value : last.value;
          if (deferredRest.length >= 7 || value.length > pendingByteLimit || new TextEncoder().encode(value).length > pendingByteLimit) {
            if (last.value === null && value.length <= pendingByteLimit) last.value = value;
            manualRecovery = true;
            notice();
            try { if (socket) socket.close(); } catch (_) {}
            return;
          }
          if (last.value === null) last.value = value;
          edit.order = ++sendOrder;
          deferredRest.push(edit);
        }
      }
      notice(new TextEncoder().encode(JSON.stringify(message)).length + 64 > pendingByteLimit);
      return;
    }
    typed++;
    send(message);
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
    if (!boot.wasm && blocked()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
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
    if (id) change(id, e.target.value, e.target);
    if (e.target.tagName === 'TEXTAREA') grow(e.target);
  });
  root.addEventListener('beforeinput', (e) => {
    if (!boot.wasm && blocked() && e.cancelable && !(oversizedEdit && deferredEdit && e.target === deferredEdit.target)) e.preventDefault();
  }, true);
  root.addEventListener('keydown', (e) => {
    if (!boot.wasm && blocked() && e.key === 'Enter') { e.preventDefault(); return; }
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
        if (event(id, item) !== false) visible.set(feed.getAttribute('data-one'), item);
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
    const deferredValues = deferredEdit ? [deferredEdit, ...deferredRest].map(edit => edit.value === null ? edit.target.value : edit.value) : [];
    const deferredValue = deferredValues[0];
    // An unkeyed field on the new screen is not necessarily the old field,
    // even if the renderer reuses its DOM node. Keep a copy for recovery.
    const stranded = moved && deferredEdit && !deferredEdit.field.startsWith('f:') ? deferredEdit.target.cloneNode(false) : null;
    if (stranded) stranded.value = deferredValue;
    apply(message);
    // A recovered checkpoint may be older than a blurred local input too.
    // Preserve every not-yet-durable draft in this history entry until replay.
    const pendingDrafts = new Map();
    for (const item of [...unacked, ...beforeHello]) {
      const edit = item.message;
      if (edit.c > typedSeen && edit._entry === entry.e && edit._field) pendingDrafts.set(edit._field, edit.v);
    }
    for (const [key, value] of pendingDrafts) {
      const attribute = key.startsWith('f:') ? 'data-one-field' : 'data-one';
      const field = root.querySelector(`[${attribute}="${CSS.escape(key.slice(2))}"]`);
      if (field && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA')) {
        field.value = value;
        if (field.tagName === 'TEXTAREA') grow(field);
      }
    }
    // The same field on this route: it keeps the focus, and what's still on its way to the session.
    if (carried) {
      const field = root.querySelector(`[data-one-field="${CSS.escape(carried)}"]`);
      if (field) {
        if ((message.c || typedSeen) !== typed) field.value = typing;
        field.focus();
      }
    }
    if (stranded) {
      deferredEdit.target = stranded;
      notice(false, true);
    } else if (deferredEdit && (deferredEdit.entry === entry.e || deferredEdit.field.startsWith('f:'))) {
      const key = deferredEdit.field;
      const attribute = key.startsWith('f:') ? 'data-one-field' : 'data-one';
      const field = root.querySelector(`[${attribute}="${CSS.escape(key.slice(2))}"]`);
      if (field && field.getAttribute('data-one-change') && field.getAttribute('data-one-change') !== '0') {
        field.value = deferredValue;
        deferredEdit.target = field;
        deferredEdit.entry = entry.e;
        deferredEdit.id = field.getAttribute('data-one-change');
        deferredEdit.revision = revision;
      } else {
        if (deferredEdit.target.isConnected) {
          const copy = deferredEdit.target.cloneNode(false);
          copy.value = deferredValue;
          deferredEdit.target = copy;
        }
        notice(false, true);
      }
    }
    for (let i = 0; i < deferredRest.length; i++) {
      const edit = deferredRest[i];
      if (edit.entry !== entry.e && !edit.field.startsWith('f:')) continue;
      const attribute = edit.field.startsWith('f:') ? 'data-one-field' : 'data-one';
      const field = root.querySelector(`[${attribute}="${CSS.escape(edit.field.slice(2))}"]`);
      if (field) {
        field.value = deferredValues[i + 1];
        edit.target = field;
        edit.entry = entry.e;
        edit.id = field.getAttribute('data-one-change');
        edit.revision = revision;
      }
    }
    if (message.ack) answered = message.ack;
    if (!deferredNavigation && message.at && answered === asked && noHash(message.at) !== noHash(here())) history.replaceState(entry, '', urlOf(message.at));
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
  const ask = (path, id, reservedOrder = null) => {
    leaveScreen();
    asked++;
    send({t: 'route', p: path, e: id, n: asked}, reservedOrder !== null, reservedOrder);
  };
  const drainDeferred = () => {
    for (let i = 0; i < 24; i++) {
      const choices = [];
      if (deferredRoute) choices.push({kind: 'route', order: deferredRoute.order});
      if (deferredEdit) choices.push({kind: 'edit', order: deferredEdit.order});
      if (deferredNavigation) choices.push({kind: 'navigation', order: deferredNavigation.order});
      if (deferredControls.length) choices.push({kind: 'control', order: deferredControls[0].order});
      if (!choices.length) break;
      choices.sort((a, b) => a.order - b.order);
      const first = choices[0].kind;
      if (first === 'route') {
        if (!fits(deferredRoute.message)) break;
        const route = deferredRoute;
        deferredRoute = null;
        send(route.message, true, route.order);
      } else if (first === 'edit') {
        const pending = deferredEdit;
        const candidate = {t: 'event', r: pending.revision, id: Number(pending.id), v: pending.value === null ? pending.target.value : pending.value, c: typed + 1};
        if (!pending.id || pending.entry !== entry.e || !root.contains(pending.target) || !fits(candidate)) break;
        Object.defineProperty(candidate, '_field', {value: pending.field});
        Object.defineProperty(candidate, '_entry', {value: pending.entry});
        deferredEdit = deferredRest.shift() || null;
        typed++;
        send(candidate, true, pending.order);
      } else if (first === 'navigation') {
        const next = deferredNavigation;
        deferredNavigation = null;
        saveScroll();
        entry = next.entry;
        shown = next.route;
        ask(next.route, entry.e, next.order);
      } else {
        const control = deferredControls[0];
        if (!fits(control.message)) break;
        deferredControls.shift();
        send(control.message, true, control.order);
      }
    }
    if (!deferredEdit && !deferredRoute && !deferredNavigation && !deferredControls.length && bufferNotice && fits({t:'event',v:''})) clearNotice();
  };
  addEventListener('popstate', (e) => {
    const route = here();
    // A fragment within the page isn't a move.
    if (noHash(route) === noHash(shown)) { shown = route; return; }
    const nextEntry = e.state && e.state.one ? e.state : {one: 1, i: 0, e: Date.now()};
    if (!boot.wasm && blocked()) {
      const last = deferredRest.length ? deferredRest[deferredRest.length - 1] : deferredEdit;
      if (deferredNavigation && last && last.order > deferredNavigation.order) {
        manualRecovery = true;
        notice();
        try { if (socket) socket.close(); } catch (_) {}
        return;
      }
      deferredNavigation = {route, entry: nextEntry, order: deferredNavigation ? deferredNavigation.order : ++sendOrder};
      shown = route;
      notice(oversizedEdit);
      return;
    }
    saveScroll();
    entry = nextEntry;
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
    if (message.title && document.title !== message.title) document.title = message.title;
    const feeds = new Map();
    for (const feed of root.querySelectorAll('[data-one-feed]')) {
      feeds.set(feed.getAttribute('data-one'), feed.scrollHeight - feed.scrollTop - feed.clientHeight < 24);
    }
    // Full tables replace the SSR/previous-owner namespace atomically. The
    // old DOM's feed position was measured above, before its rules disappear.
    if (message.cssReset === true && typeof message.css === 'string') style.textContent = message.css;
    else if (message.css) style.appendChild(document.createTextNode(message.css));
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
    if (!boot.wasm) {
      // A retry names the same logical upload, even if its first response was
      // lost after the private object and completion were committed.
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      const deadline = Date.now() + (boot.proof ? 180000 : 120000);
      await cookieWork;
      for (let attempt = 0; ; attempt++) {
        if (Date.now() >= deadline) throw new Error("File upload timed out");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(120000, deadline - Date.now()));
        try {
          const response = await fetch(`one/upload?s=${encodeURIComponent(boot.s)}&${query}`, {method: 'POST', body,
            headers: {...headers, ...(boot.proof ? {'X-One-Proof': boot.proof, 'X-One-Upload': nonce} : {})},
            credentials: 'same-origin', redirect: 'error', signal: controller.signal});
          if (!boot.proof || ![502, 503, 504].includes(response.status) || attempt >= 15) {
            // The opaque handle is part of delivery too: losing the response
            // body after headers must retry the same committed upload nonce.
            const text = await response.text();
            if (text.length > 8192) throw new Error('Invalid upload response');
            return {ok: response.ok, status: response.status, text: async () => text};
          }
          await response.body?.cancel();
        } catch (error) {
          if (!boot.proof || attempt >= 15) throw error;
        } finally { clearTimeout(timeout); }
        await new Promise(resolve => setTimeout(resolve, Math.min(4000, 250 * 2 ** attempt, Math.max(0, deadline - Date.now()))));
      }
    }
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
  // The copy arrives over the socket after the tap, so Safari may refuse the
  // clipboard API; a selected textarea and execCommand still work there.
  const copyText = (text) => {
    if (typeof text !== 'string') return;
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch (_) {}
      area.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
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
    const cancel = async () => {
      try {
        const response = await upload(`id=${message.id}&kind=cancel${message.kind === 'files' ? '&files=1' : ''}`, '');
        if (response.ok === false) throw new Error('File upload failed');
      } catch (_) { send({t: 'pick-error', id: message.id, error: 'File upload failed'}); }
    };
    input.addEventListener('cancel', () => { if (!done) { finish(); void cancel(); } });
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      finish();
      if (!files.length) return cancel();
      if (message.kind !== 'files') {
        try {
          const response = await upload(`id=${message.id}&kind=${message.kind}`, await normalize(files[0], message.kind));
          if (response.ok === false) throw new Error('File upload failed');
          return;
        } catch (_) {
          send({t: 'pick-error', id: message.id, error: 'File upload failed'});
          return;
        }
      }
      // This local limit is safe to explain; remote failures remain generic.
      if (!boot.wasm && files.some(file => file.size > 16777216)) {
        send({t: 'pick-error', id: message.id, error: 'File exceeds the 16 MiB upload limit'});
        return;
      }
      try {
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
        send({t: 'pick-error', id: message.id, error: 'File upload failed'});
      }
    });
    input.click();
  };

  // --- connection -------------------------------------------------------------
  const updateCookies = () => {
    const request = async (receipt = false) => {
      const deadline = Date.now() + 45000;
      for (let attempt=0; ; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(10000, Math.max(1,deadline-Date.now())));
        try {
          const response = await fetch(`one/cookies?s=${encodeURIComponent(boot.s)}${receipt ? '&receipt=1' : ''}`, {method: 'POST', credentials: 'same-origin', headers: boot.proof ? {'X-One-Proof': boot.proof} : {}, redirect: 'error', signal: controller.signal});
          if(!boot.proof || ![502,503,504].includes(response.status) || attempt>=7 || Date.now()>=deadline)return response;
          await response.body?.cancel();
        } catch(error) { if(!boot.proof || attempt>=7 || Date.now()>=deadline)throw error; }
        finally { clearTimeout(timeout); }
        await new Promise(resolve=>setTimeout(resolve,Math.min(4000,250*2**attempt,Math.max(0,deadline-Date.now()))));
      }
    };
    const deliver = async () => {
      const response = await request();
      // A fresh Cookie header, not a WebSocket assertion, confirms receipt of
      // a first-login bootstrap before the server consumes its short grant.
      if (boot.proof && response.ok) await request(true);
    };
    cookieWork = cookieWork.catch(() => {}).then(() => {
      if (navigator.locks && navigator.locks.request) return navigator.locks.request(`one:cookies:${basePath}`, deliver).catch(deliver);
      return deliver();
    }).catch(() => {});
  };
  const seenEffects = new Set();
  const savedEffects = new Set();
  let effectsFor = '';
  const rememberEffect = (id, persistent) => {
    if (effectsFor !== boot.s) {
      effectsFor = boot.s;
      seenEffects.clear(); savedEffects.clear();
      try {
        const ids = JSON.parse(sessionStorage.getItem(`one:effects:${boot.s}`));
        if (Array.isArray(ids)) for (const value of ids.slice(-256)) if (typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)) savedEffects.add(value);
      } catch (_) {}
    }
    const existed = seenEffects.has(id) || savedEffects.has(id);
    seenEffects.add(id);
    if (seenEffects.size > 256) seenEffects.delete(seenEffects.values().next().value);
    if (persistent) {
      savedEffects.add(id);
      if (savedEffects.size > 256) savedEffects.delete(savedEffects.values().next().value);
      try { sessionStorage.setItem(`one:effects:${boot.s}`, JSON.stringify([...savedEffects])); } catch (_) {}
    }
    return existed;
  };
  const receive = (message) => {
    if (manualRecovery) return;
    if (message.t === 'effect') {
      if (!boot.proof || typeof message.id !== 'string' || !/^[a-f0-9]{32}$/.test(message.id) || !message.message || !['pick', 'back', 'forward', 'copy'].includes(message.message.t)) return;
      const picker = message.message.t === 'pick';
      const repeated = rememberEffect(message.id, !picker);
      if (!repeated) receive(message.message);
      // Pick delivery remains durable until its scoped result is consumed;
      // acknowledging the chooser alone must not lose a pending selection.
      if (!picker) send({t: 'effect-ack', id: message.id});
      return;
    }
    const first = !boot.wasm && !eventReady && message.t === 'patch' && Number.isSafeInteger(message.a) && message.a >= 0;
    if (first) {
      const savedTyped = Number.isSafeInteger(message.c) && message.c >= 0 ? message.c : 0;
      for (const item of beforeHello) if (item.message.c) item.message.c += savedTyped;
      typed += savedTyped;
      const savedAsked = Number.isSafeInteger(message.ack) && message.ack >= 0 ? message.ack : 0;
      for (const item of unackedRoutes) item.message.n += savedAsked;
      if (deferredRoute) deferredRoute.message.n += savedAsked;
      asked += savedAsked;
    }
    if (message.t === 'patch') patched(message);
    else if (message.t === 'back') goBack(message.to);
    else if (message.t === 'forward') history.forward();
    else if (message.t === 'pick') pick(message);
    else if (message.t === 'copy') copyText(message.text);
    else if (message.t === 'cookies') updateCookies();
    else if (message.t === 'reload') location.reload();
    else if (message.t === 'fetch') request(message);
    else if (message.t === 'store') store(message.storage);
    else if (message.t === 'wait') { clearTimeout(ticking); ticking = setTimeout(() => send({t: 'tick'}), message.ms); }
    if (!boot.wasm && message.t === 'patch' && Number.isSafeInteger(message.ack) && message.ack > 0) {
      while (unackedRoutes.length && unackedRoutes[0].message.n <= message.ack) unackedRoutes.shift();
    }
    if (!boot.wasm && message.t === 'patch' && Number.isSafeInteger(message.a) && message.a >= 0) {
      if (!eventReady) {
        eventSequence = message.a;
        eventReady = true;
        while (beforeHello.length) {
          const item = beforeHello.shift();
          liveEvent(item.message, item.order);
        }
      } else if (message.a <= eventSequence) {
        while (unacked.length && unacked[0].message.n <= message.a) unacked.shift();
      }
      drainDeferred();
      if (handshaking) {
        const pending = [...queue, ...unacked, ...unackedRoutes].sort((a, b) => a.order - b.order);
        queue.length = 0;
        handshaking = false;
        retry = 0;
        document.documentElement.removeAttribute('data-one-offline');
        for (let at = 0; at < pending.length; at++) {
          const item = pending[at];
          if (!wire(item.text || JSON.stringify(item.message))) {
            // Events and routes are still retained in their acknowledgement
            // queues. Keep every unsent ordinary control too.
            for (const rest of pending.slice(at)) if (rest.text) queue.push(rest);
            break;
          }
        }
        if (viewportAfterHello) { viewportAfterHello = false; send({t: 'viewport', w: innerWidth}); }
        release();
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
    const url = new URL(`one/live?s=${encodeURIComponent(boot.s)}${boot.proof ? "&recovery=1" : ""}`, base);
    socket = new WebSocket(`${scheme}//${url.host}${url.pathname}${url.search}`);
    socket.onopen = () => {
      handshaking = true;
      // Only hello crosses the recovery boundary. No old control can run on
      // another node until its authorized app and durable frontier are ready.
      const waiting = queue.length > 0 || unacked.length > 0 || unackedRoutes.length > 0 || beforeHello.length > 0 || !!deferredEdit || !!deferredRoute || !!deferredNavigation || deferredControls.length > 0;
      const hello = waiting ? {t: 'hello', r: revision, e: entry.e} : {t: 'hello', r: revision, w: innerWidth, e: entry.e};
      if (boot.proof) hello.proof = boot.proof;
      wire(JSON.stringify(hello), true);
      viewportAfterHello = waiting;
    };
    socket.onmessage = (e) => receive(JSON.parse(e.data));
    socket.onclose = (e) => {
      handshaking = true;
      document.documentElement.setAttribute('data-one-offline', '');
      if (manualRecovery) return;
      // An unknown or ended session needs a fresh page, unless one is already on its way.
      if (e.code === 1008) {
        if (boot.proof) { try { sessionStorage.removeItem(claimKey); } catch (_) {} }
        Promise.race([cookieWork, new Promise(resolve => setTimeout(resolve, 2000))]).finally(() => setTimeout(() => location.reload(), leaving ? 3000 : 0));
        return;
      }
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
  document.cookie = `one_resume_proof=; path=${basePath}; max-age=0; samesite=lax`;
  // A reload resumes this tab's session: the next page request carries it.
  // beforeunload runs before the browser requests the next page; pagehide
  // covers navigations that skip it. A link followed from the page goes to another
  // page, which starts its own session, so the session isn't offered. The mark is short: the browser
  // asks for the page right after the click, and a link that turns out to be a download stays here.
  let followed = 0;
  const resume = () => {
    if (boot.proof) {
      // No draft, input, token or checkpoint is persisted in the browser.
      try { sessionStorage.setItem(claimKey, JSON.stringify({s: boot.s, proof: boot.proof})); } catch (_) {}
    } else if (!followed) {
      document.cookie = `one_resume=${boot.s}; path=${basePath}; max-age=15; samesite=lax`;
    }
  };
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
  const claimKey = `one:claim:${basePath}`;
  let claimChannel = null;
  const connectTab = async () => {
    if (!boot.proof) { connect(); return; }
    const navigation = performance.getEntriesByType('navigation')[0];
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(claimKey)); } catch (_) {}
    const valid = saved && /^[a-f0-9]{32}$/.test(saved.s) && /^[a-f0-9]{64}$/.test(saved.proof);
    const restoring = valid && navigation && ['reload', 'back_forward'].includes(navigation.type);
    let occupied = false;
    // Advisory clone detection only. Server authentication and the monotonic
    // owner epoch remain authoritative even if this channel is unavailable.
    try {
      claimChannel = new BroadcastChannel(`one:tabs:${basePath}`);
      claimChannel.onmessage = ({data}) => {
        if (!data || typeof data.s !== 'string') return;
        if (data.t === 'probe' && data.s === boot.s && !leaving) claimChannel.postMessage({t: 'occupied', s: boot.s});
        if (data.t === 'occupied' && restoring && data.s === saved.s) occupied = true;
      };
      if (restoring) {
        claimChannel.postMessage({t: 'probe', s: saved.s});
        await new Promise(resolve => setTimeout(resolve, 75));
      }
    } catch (_) {}
    if (restoring && !occupied) { boot.s = saved.s; boot.proof = saved.proof; }
    resume();
    connect();
  };
  if (boot.wasm) run().catch((error) => { console.error(error); document.documentElement.setAttribute('data-one-offline', ''); });
  else connectTab();
})();
