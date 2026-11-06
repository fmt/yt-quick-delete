(() => {
  const ITEM_SELECTOR = [
    'ytd-playlist-video-renderer',          // classic playlist rows
    'yt-lockup-view-model'                  // newer lockup rows
  ].join(',');

  const REMOVE_RE = /remove|remover|eliminar|quitar|supprimer|retirer|entfernen|l[oö]schen|rimuovi|elimina|verwijder|usu[nń]|удалить|削除|삭제|移除|删除|刪除|kaldır|حذف/i;

  const TRASH_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4zM6 7v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zm3 10H7.5V9H9v8zm3.75 0h-1.5V9h1.5v8zM16.5 17H15V9h1.5v8z"/></svg>';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let queue = Promise.resolve();

  const isPlaylistPage = () => location.pathname === '/playlist';

  function visible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function findMenuButton(item) {
    // Ordered from most to least specific. Never match our own injected button.
    const selectors = [
      'ytd-menu-renderer yt-icon-button button',
      'ytd-menu-renderer button#button',
      'ytd-menu-renderer button',
      '.yt-lockup-metadata-view-model-wiz__menu-button button',
      '.yt-lockup-metadata-view-model__menu-button button',
      'button-view-model button',
      '[aria-label][class*="menu"] button'
    ];
    for (const sel of selectors) {
      for (const el of item.querySelectorAll(sel)) {
        if (!el.classList.contains('ytqd-btn')) return el;
      }
    }
    return null;
  }

  async function waitFor(fn, timeout = 2000, step = 40) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  function realClick(el) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, opts));
    }
  }

  function entryIsVisible(e) {
    return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  }

  function findRemoveEntry() {
    const entries = document.querySelectorAll(
      'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model, tp-yt-paper-item'
    );
    for (const e of entries) {
      if (!entryIsVisible(e)) continue; // ignore stale entries from closed popups
      const text = (e.textContent || '').trim();
      if (text && REMOVE_RE.test(text)) return e;
    }
    return null;
  }

  function closeMenus() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }

  // Identify a row by its video id, not by DOM node or position, because YouTube recycles rows
  function videoIdOf(item) {
    const a = item.querySelector('a[href*="watch?v="], a[href*="/watch?"]');
    if (!a) return null;
    try { return new URL(a.href, location.origin).searchParams.get('v'); } catch (e) { return null; }
  }

  function findItemById(id) {
    for (const it of document.querySelectorAll(ITEM_SELECTOR)) {
      if (videoIdOf(it) === id) return it;
    }
    return null;
  }

  async function attemptRemove(id) {
    // Make sure nothing from a previous operation is still open
    closeMenus();
    await waitFor(() => !findRemoveEntry(), 1000);

    const item = findItemById(id);
    if (!item) return false;
    const menuBtn = findMenuButton(item);
    if (!menuBtn) return false;

    document.body.classList.add('ytqd-working');
    try {
      realClick(menuBtn);
      let entry = await waitFor(findRemoveEntry, 2500);
      if (!entry) {
        console.log('[ytqd] remove entry not found; menu button was:', menuBtn);
        closeMenus();
        return false;
      }
      // Let the popup finish binding to this row, then re-resolve the entry
      await sleep(200);
      if (findItemById(id) !== item) { closeMenus(); return false; }
      entry = findRemoveEntry() || entry;

      console.log('[ytqd] removing', id, 'via entry:', (entry.textContent || '').trim());
      const inner = entry.querySelector('tp-yt-paper-item, a, button') || entry;
      realClick(inner);

      // Done when that video id is no longer in the list
      await waitFor(() => !findItemById(id), 3000);
      return !findItemById(id);
    } finally {
      document.body.classList.remove('ytqd-working');
    }
  }

  // Track page mutations so we can wait for YouTube to finish refreshing the list
  let lastMutation = Date.now();
  new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (t && t.closest && t.closest('ytd-browse')) { lastMutation = Date.now(); return; }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  async function waitForQuiet(quietMs = 900, maxMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (Date.now() - lastMutation >= quietMs) return;
      await sleep(100);
    }
  }

  async function removeById(id) {
    // Removing while YouTube is still refreshing the list makes the server reject
    // the edit ("Precondition check failed"), so wait for the list to be idle first.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await waitForQuiet(attempt === 1 ? 900 : 1800);
      const ok = await attemptRemove(id);
      await waitForQuiet(900); // let the post-removal refresh finish
      if (ok) return true;
      if (!findItemById(id)) return true;
      console.log('[ytqd] video still present, retrying (' + attempt + ')', id);
    }
    return false;
  }

  function makeButton(item) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ytqd-btn';
    b.title = 'Remove from playlist';
    b.setAttribute('aria-label', 'Remove from playlist');
    b.innerHTML = TRASH_SVG;
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (b.disabled) return;
      // Resolve the target at click time from the row this button currently lives in
      const row = b.closest(ITEM_SELECTOR) || item;
      const id = videoIdOf(row);
      if (!id) { console.log('[ytqd] could not read video id for row', row); return; }
      b.disabled = true;
      queue = queue
        .then(() => removeById(id))
        .catch((e) => console.log('[ytqd] error', e))
        .then(() => { b.disabled = false; });
    });
    return b;
  }

  function inject(item) {
    // Check the DOM, not a flag: YouTube re-renders rows and drops our button
    if (item.querySelector('.ytqd-btn')) return;
    const menuBtn = findMenuButton(item);
    if (!menuBtn) return;

    // Anchor: the element wrapping the three-dot button
    const anchor =
      menuBtn.closest('ytd-menu-renderer') ||
      menuBtn.closest('button-view-model') ||
      menuBtn.parentElement;
    if (!anchor || !anchor.parentElement) return;

    const btn = makeButton(item);
    anchor.parentElement.insertBefore(btn, anchor);
    if (anchor.parentElement.id === 'menu') anchor.parentElement.classList.add('ytqd-row');
  }

  function scan() {
    if (!isPlaylistPage()) return;
    document.querySelectorAll(ITEM_SELECTOR).forEach(inject);
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 150);
  };

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', schedule);
  setInterval(scan, 1500); // safety net for re-renders that fire no useful mutation
  scan();
})();
