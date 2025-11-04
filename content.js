'use strict';

(function () {
  const CONFIG = {
    CONCURRENCY: 8,
    BULK_ONLY: true,
    BULK_ATTEMPTS: 4
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const STATUS = {
    total: 0,
    done: 0,
    failed: 0,
    running: false,
    lastMessage: '',
    startTime: 0
  };

  function ensureStatusOverlay() {
    if (document.getElementById('iconscout-autotag-status')) return;
    const wrap = document.createElement('div');
    wrap.id = 'iconscout-autotag-status';
    wrap.style.position = 'fixed';
    wrap.style.right = '16px';
    wrap.style.bottom = '16px';
    wrap.style.zIndex = '99999';
    wrap.style.background = 'rgba(20,23,26,0.9)';
    wrap.style.color = '#fff';
    wrap.style.fontFamily = 'system-ui, Arial, sans-serif';
    wrap.style.fontSize = '12px';
    wrap.style.padding = '10px 12px';
    wrap.style.borderRadius = '8px';
    wrap.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
    wrap.style.minWidth = '220px';
    wrap.innerHTML = `
      <div style="margin-bottom:6px;font-weight:600">IconScout AutoTag Status</div>
      <div id="iconscout-autotag-lines"></div>
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
        <button id="iconscout-resume" style="background:#2d7ef7;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">Resume</button>
        <button id="iconscout-stop" style="background:#e33;color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer">Stop</button>
      </div>
    `;
    document.body.appendChild(wrap);
    const resumeBtn = document.getElementById('iconscout-resume');
    const stopBtn = document.getElementById('iconscout-stop');
    resumeBtn.addEventListener('click', () => resumeAutoTagging());
    stopBtn.addEventListener('click', () => stopAutoTagging());
    updateStatusOverlay('Ready');
  }

  function updateStatusOverlay(message) {
    STATUS.lastMessage = message || STATUS.lastMessage;
    const linesEl = document.getElementById('iconscout-autotag-lines');
    if (!linesEl) return;
    const runtime = STATUS.startTime ? Math.max(0, Math.floor((Date.now() - STATUS.startTime) / 1000)) : 0;
    linesEl.innerHTML = `
      <div>Status: ${STATUS.running ? 'Running' : 'Idle'}</div>
      <div>Total: ${STATUS.total} &nbsp; Done: ${STATUS.done} &nbsp; Failed: ${STATUS.failed}</div>
      <div>Remaining: ${Math.max(0, STATUS.total - STATUS.done - STATUS.failed)}</div>
      <div>Time: ${runtime}s</div>
      <div>Note: ${STATUS.lastMessage || '-'}</div>
    `;
  }

  function resumeAutoTagging() {
    if (STATUS.running) return;
    window.iconScoutCancelRequested = false;
    window.iconScoutAutoTagStarted = true;
    STATUS.running = true;
    STATUS.startTime = Date.now();
    updateStatusOverlay('Resuming pending cards');
    autoTagAllCards().catch(() => {}).finally(() => {
      STATUS.running = false;
      window.iconScoutAutoTagStarted = false;
      updateStatusOverlay('Done');
    });
  }

  function stopAutoTagging() {
    window.iconScoutCancelRequested = true;
    STATUS.running = false;
    updateStatusOverlay('Stopped by user');
  }

  const isDraftUrl = () => location.href.includes('/icon/draft/');

  function pickKeywordFromTitle(title) {
    if (!title) return '';
    const cleaned = title.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const stop = new Set([
      'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'from', 'as', 'is', 'are',
      'icon', 'vector', 'logo', 'design', 'flat', 'outline', 'filled', 'line', 'color', 'coloured', 'colored', 'minimal', 'simple'
    ]);
    const candidates = tokens.filter((w) => !stop.has(w) && w.length >= 3);
    if (candidates.length === 0) return tokens[0] || '';
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  }

  function deriveKeywordsFromTitle(title, max = 10) {
    if (!title) return [];
    const cleaned = title.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const stop = new Set([
      'the','a','an','and','or','of','to','in','on','for','with','by','at','from','as','is','are',
      'icon','vector','logo','design','flat','outline','filled','line','color','coloured','colored','minimal','simple'
    ]);
    const filtered = tokens.filter((w) => !stop.has(w) && w.length >= 3);
    const seen = new Set();
    const unique = [];
    for (const t of filtered) { if (!seen.has(t)) { seen.add(t); unique.push(t); } }
    return unique.slice(0, max);
  }

  async function waitForPageReady(timeoutMs = 40000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const card = document.querySelector('.card_8BZOE');
        if (card) {
          cleanup();
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          cleanup();
          reject(new Error('Timeout waiting for cards'));
        }
      };
      const iv = setInterval(check, 500);
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true });
      const cleanup = () => {
        clearInterval(iv);
        observer.disconnect();
      };
    });
  }

  async function preloadSuggestedByScrolling({ maxDurationMs = 8000, pauseMs = 25, stepPx = Math.max(180, Math.round(window.innerHeight * 0.9)), stableCycles = 2, behavior = 'smooth' } = {}) {
    try {
      updateStatusOverlay('Preloading suggestions by scrolling');
      const getHeight = () => Math.max(document.body.scrollHeight || 0, document.documentElement.scrollHeight || 0);
      const deadline = Date.now() + maxDurationMs;
      let lastHeight = -1;
      let stable = 0;
      // Scroll down in increments until height stabilizes
      while (Date.now() < deadline && stable < stableCycles) {
        const h = getHeight();
        const bottomReached = (window.scrollY + window.innerHeight + 12) >= h;
        if (!bottomReached) {
          window.scrollBy({ top: stepPx, behavior });
        } else {
          // Nudge near bottom to trigger lazy-load
          window.scrollBy({ top: Math.max(8, Math.round(window.innerHeight * 0.1)), behavior });
        }
        await sleep(pauseMs);
        const newHeight = getHeight();
        if (Math.abs(newHeight - lastHeight) < 8) {
          stable++;
        } else {
          stable = 0;
        }
        lastHeight = newHeight;
      }
      // Ensure we actually reach bottom with visible scroll
      let guard = 0;
      while ((window.scrollY + window.innerHeight + 2) < getHeight() && guard < 200) {
        window.scrollBy({ top: stepPx, behavior });
        await sleep(pauseMs);
        guard++;
      }
      await sleep(200);
      // Smooth scroll back to top for processing
      guard = 0;
      while (window.scrollY > 2 && guard < 200) {
        window.scrollBy({ top: -stepPx, behavior });
        await sleep(pauseMs);
        guard++;
      }
      await sleep(250);
      updateStatusOverlay('Preload finished');
    } catch (_) {}
  }

  function getTagsContainer(card) {
    const within = card ? card.querySelector('[id^="tags-"]') : null;
    if (within) return within;
    const global = document.querySelector('[id^="tags-"]');
    return global || null;
  }

  function getTagInput(tagsContainer) {
    if (!tagsContainer) return null;
    const input = tagsContainer.querySelector('input[type="text"]');
    if (input) return input;
    const alt = document.querySelector('#' + tagsContainer.id + ' input[type="text"]');
    return alt || null;
  }

  function countCurrentTags(card, tagsContainer) {
    let count = 0;
    if (tagsContainer) {
      // Prefer counting chips in the active tags container
      const lis = Array.from(tagsContainer.querySelectorAll('ul.list-unstyled li.font-size-sm'))
        .filter((li) => !li.classList.contains('addNew_okcFC'));
      if (lis.length) count = lis.length;
      // Fallback: read numeric indicator within the tags container
      if (!count) {
        const m2 = (tagsContainer.textContent || '').match(/(\d+)\s*\/\s*10/);
        if (m2) count = parseInt(m2[1], 10);
      }
    }
    if (!count && card) {
      const m = card.textContent.match(/(\d+)\s*\/\s*10/);
      if (m) count = parseInt(m[1], 10);
    }
    return count;
  }

  async function removeExtraTags(tagsContainer, limit = 10) {
    if (!tagsContainer) return;
    let attempts = 0;
    while (attempts < 25) {
      const items = Array.from(tagsContainer.querySelectorAll('ul.list-unstyled li.font-size-sm'))
        .filter((li) => !li.classList.contains('addNew_okcFC'));
      if (items.length <= limit) break;
      const last = items[items.length - 1];
      const anchor = last.querySelector('a');
      const target = anchor || last.querySelector('svg') || last;
      if (target) {
        target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
      attempts++;
      await sleep(120);
    }
  }

  async function waitForSuggestedInCard(card, timeoutMs = 6000) {
    try {
      if (card && card.scrollIntoView) {
        card.scrollIntoView({ behavior: 'auto', block: 'center' });
      }
      const start = Date.now();
      return await new Promise((resolve, reject) => {
        const check = () => {
          const section = getSuggestedSection(card);
          if (section) {
            cleanup();
            resolve(true);
          } else if (Date.now() - start > timeoutMs) {
            cleanup();
            reject(new Error('Suggested section not found in time'));
          }
        };
        const iv = setInterval(check, 250);
        const mo = new MutationObserver(check);
        mo.observe(document.body, { childList: true, subtree: true });
        const cleanup = () => { clearInterval(iv); mo.disconnect(); };
      });
    } catch (_) {
      // ignore
    }
  }

  function getSuggestedSection(card) {
    if (card) {
      const within = card.querySelector('.suggestedTags_bXHhf');
      if (within) return within;
    }
    return document.querySelector('.suggestedTags_bXHhf');
  }

  async function clickAddAllSuggested(card, tagsContainer) {
    const section = getSuggestedSection(card);
    if (!section) return false;
    // Button scoped strictly to this card's suggested section
    const btn = section.querySelector('.addToTag_AT1GT');
    if (btn) {
      const cs = window.getComputedStyle(btn);
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden';
      if (visible && !btn.disabled) {
        const before = countCurrentTags(card, tagsContainer);
        if (before >= 10) return false; // don't add when already at limit
        console.log('[IconScout AutoTag] Clicking "Add all to Tags" (scoped)');
        // Ensure this card is in view and serialize bulk actions
        try { card.scrollIntoView({ behavior: 'auto', block: 'center' }); } catch (_) {}
        // Simulate pointer + mouse sequence to ensure handlers fire on the correct button
        btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await sleep(1400);
        const after = countCurrentTags(card, tagsContainer);
        return after > before;
      }
    }
    return false;
  }

  async function addSuggestedIndividually(card, tagsContainer) {
    const section = getSuggestedSection(card);
    if (!section) return false;
    const before = countCurrentTags(card, tagsContainer);
    console.log('[IconScout AutoTag] Fallback: clicking suggested tags individually.');
    const items = Array.from(section.querySelectorAll('ul li.font-size-sm'));
    let clicked = 0;
    for (const li of items) {
      try {
        const target = li.querySelector('span, svg') || li;
        target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        clicked++;
        await sleep(120);
      } catch (e) {
        // ignore
      }
      if (clicked >= 15) break;
    }
    await sleep(1200);
    const after = countCurrentTags(card, tagsContainer);
    return after > before;
  }

  function extractSuggestedTexts(card) {
    const section = getSuggestedSection(card);
    if (!section) return [];
    const items = Array.from(section.querySelectorAll('ul li.font-size-sm'));
    const texts = items.map((li) => {
      const tn = Array.from(li.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
      const raw = tn ? tn.textContent : li.textContent;
      return (raw || '').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    // de-duplicate while preserving order
    const seen = new Set();
    const dedup = [];
    for (const t of texts) {
      if (!seen.has(t)) { seen.add(t); dedup.push(t); }
    }
    return dedup;
  }

  async function addSuggestedViaInput(card, tagsContainer) {
    const input = getTagInput(tagsContainer);
    if (!input) return false;
    const currentCount = countCurrentTags(card, tagsContainer);
    const remaining = Math.max(0, 10 - currentCount);
    if (remaining === 0) return false;
    const suggestions = extractSuggestedTexts(card).slice(0, remaining);
    if (suggestions.length === 0) return false;
    console.log('[IconScout AutoTag] Fallback: typing suggested tags into input:', suggestions);
    for (const s of suggestions) {
      input.focus();
      input.value = s;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.blur();
      await sleep(220);
    }
    await sleep(800);
    return true;
  }

  async function addTokensViaInput(card, tagsContainer, tokens) {
    const input = getTagInput(tagsContainer);
    if (!input) return false;
    let currentCount = countCurrentTags(card, tagsContainer);
    let remaining = Math.max(0, 10 - currentCount);
    if (remaining === 0) return false;
    const list = (tokens || []).slice(0, remaining);
    if (!list.length) return false;
    console.log('[IconScout AutoTag] Filling with title tokens:', list);
    for (const t of list) {
      input.focus();
      input.value = t;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.blur();
      await sleep(220);
    }
    await sleep(800);
    return true;
  }

  async function seedTag(tagsContainer, keyword) {
    if (!tagsContainer) return false;
    const input = getTagInput(tagsContainer);
    if (!input) return false;
    // avoid adding when already at 10
    try {
      const card = tagsContainer.closest('.card_8BZOE');
      const current = countCurrentTags(card, tagsContainer);
      if (current >= 10) return false;
    } catch (_) {}
    console.log('[IconScout AutoTag] Seeding tag with keyword:', keyword);
    input.focus();
    input.value = keyword;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    input.blur();
    await sleep(2500);
    return true;
  }

  async function autoTagCard(card) {
    try {
      if (!card) return;
      if (window.iconScoutCancelRequested) return;
      const titleInput = card.querySelector('input[name^="title-"], input[id^="title-"]');
      const title = titleInput ? titleInput.value.trim() : '';
      console.log('[IconScout AutoTag] Found card with title:', title || '(unknown)');
      const tagsContainer = getTagsContainer(card);
      let currentCount = countCurrentTags(card, tagsContainer);
      console.log('[IconScout AutoTag] Current tags:', currentCount, '/ 10');
      updateStatusOverlay(`Processing: ${title || '(unknown)'}`);
      if (currentCount >= 10) {
        console.log('[IconScout AutoTag] Already at limit. Skipping additions.');
      }

      // Step 1: memastikan suggested section tersedia sebelum seeding
      await waitForSuggestedInCard(card, 6000).catch(() => {});
      let suggestedPresent = !!getSuggestedSection(card);
      let clickedSuggested = false;
      if (suggestedPresent) {
        clickedSuggested = await clickAddAllSuggested(card, tagsContainer);
      } else {
        console.log('[IconScout AutoTag] Suggested belum terlihat. Menunggu sebentar...');
        await sleep(2500);
        suggestedPresent = !!getSuggestedSection(card);
        if (suggestedPresent) {
          clickedSuggested = await clickAddAllSuggested(card, tagsContainer);
        }
      }

      // Step 2: hanya seed jika setelah menunggu suggested masih tidak tersedia
      if (!clickedSuggested && currentCount < 10) {
        if (!suggestedPresent) {
          console.log('[IconScout AutoTag] Suggested tags tidak tersedia. Melakukan seeding kata kunci.');
          const keyword = pickKeywordFromTitle(title);
          if (keyword) {
            await seedTag(tagsContainer, keyword);
            await waitForSuggestedInCard(card, 6000).catch(() => {});
            clickedSuggested = await clickAddAllSuggested(card, tagsContainer);
            if (!clickedSuggested) {
              console.log('[IconScout AutoTag] Suggested masih belum bisa bulk add. Coba ulang seed sekali.');
              await seedTag(tagsContainer, keyword);
              await waitForSuggestedInCard(card, 6000).catch(() => {});
              clickedSuggested = await clickAddAllSuggested(card, tagsContainer);
            }
          } else {
            console.log('[IconScout AutoTag] Tidak ada keyword yang cocok dari judul.');
          }
        }
        // Step 3: jika suggested ada namun bulk click gagal
        if (!clickedSuggested && suggestedPresent) {
          if (!CONFIG.BULK_ONLY) {
            console.log('[IconScout AutoTag] Bulk add gagal. Mencoba fallback lain.');
            const okClick = await addSuggestedIndividually(card, tagsContainer);
            if (!okClick) {
              await addSuggestedViaInput(card, tagsContainer);
            }
          }
        }
      }

      currentCount = countCurrentTags(card, tagsContainer);
      console.log('[IconScout AutoTag] Tags after addition:', currentCount, '/ 10');

      // Pastikan mencapai 10 sebelum lanjut dengan BULK ONLY: lakukan beberapa percobaan bulk.
      let guardLoops = 0;
      while (currentCount < 10 && guardLoops < CONFIG.BULK_ATTEMPTS) {
        const tokens = deriveKeywordsFromTitle(title, 3);
        if (!suggestedPresent) {
          // Seed beberapa kata untuk memicu lebih banyak suggested
          for (const t of tokens) {
            await seedTag(tagsContainer, t);
            await sleep(500);
          }
        }
        await waitForSuggestedInCard(card, 6000).catch(() => {});
        suggestedPresent = !!getSuggestedSection(card);
        const ok = await clickAddAllSuggested(card, tagsContainer);
        await sleep(800);
        currentCount = countCurrentTags(card, tagsContainer);
        if (currentCount > 10) {
          console.log('[IconScout AutoTag] Over 10 after bulk. Trimming to 10.');
          await removeExtraTags(tagsContainer, 10);
          await sleep(400);
          currentCount = countCurrentTags(card, tagsContainer);
          break;
        }
        if (!ok && !suggestedPresent) {
          // coba seed lagi jika suggested masih tidak ada
          const k = pickKeywordFromTitle(title);
          if (k) await seedTag(tagsContainer, k);
        }
        guardLoops++;
      }

      if (currentCount > 10) {
        console.log('[IconScout AutoTag] Removing extra tags to keep 10.');
        await removeExtraTags(tagsContainer, 10);
        await sleep(800);
        currentCount = countCurrentTags(card, tagsContainer);
        console.log('[IconScout AutoTag] Final tag count:', currentCount, '/ 10');
      }

      console.log(`✅ Finished auto-tagging card ${title || '(unknown)'}`);
      // mark processed to avoid duplicate runs
      try { card.dataset.autotagDone = '1'; } catch (_) {}
      STATUS.done++;
      updateStatusOverlay('Card completed');
    } catch (err) {
      console.error('[IconScout AutoTag] Error during autoTagSingleCard:', err);
      STATUS.failed++;
      updateStatusOverlay('Error in card');
    }
  }

  async function autoTagAllCards() {
    const cards = Array.from(document.querySelectorAll('.card_8BZOE'));
    if (!cards.length) {
      console.log('[IconScout AutoTag] No cards found.');
      return;
    }
    console.log(`[IconScout AutoTag] Processing cards in batches of ${CONFIG.CONCURRENCY}.`);
    const pending = cards.filter((c) => c.dataset.autotagDone !== '1');
    STATUS.total = pending.length;
    STATUS.startTime = STATUS.startTime || Date.now();
    STATUS.running = true;
    updateStatusOverlay('Batch started');
    for (let i = 0; i < pending.length; i += CONFIG.CONCURRENCY) {
      const batch = pending.slice(i, i + CONFIG.CONCURRENCY);
      await Promise.all(batch.map((c) => autoTagCard(c)));
      await sleep(800);
      if (window.iconScoutCancelRequested) break;
    }
    STATUS.running = false;
    updateStatusOverlay('Batch finished');
  }

  function patchHistoryNavigation() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    function notify() {
      window.dispatchEvent(new Event('iconscout:navigation'));
    }
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      notify();
      return r;
    };
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      notify();
      return r;
    };
    window.addEventListener('popstate', notify);
    window.addEventListener('hashchange', notify);
  }

  async function start() {
    if (!isDraftUrl()) return;
    if (window.iconScoutAutoTagStarted) return;
    window.iconScoutAutoTagStarted = true;
    console.log('[IconScout AutoTag] Draft page detected. Waiting for cards and suggested tags...');
    try {
      ensureStatusOverlay();
      STATUS.running = true;
      STATUS.startTime = Date.now();
      updateStatusOverlay('Waiting for page readiness');
      await waitForPageReady(40000);
      console.log('[IconScout AutoTag] Page ready. Starting automation.');
      updateStatusOverlay('Starting automation');
      // Scroll seluruh halaman untuk memicu render/lazy-load suggested
      await preloadSuggestedByScrolling();
      await autoTagAllCards();
    } catch (e) {
      console.warn('[IconScout AutoTag] Wait timed out or error:', e);
    } finally {
      setTimeout(() => {
        window.iconScoutAutoTagStarted = false;
        STATUS.running = false;
        updateStatusOverlay('Idle');
      }, 15000);
    }
  }

  patchHistoryNavigation();

  window.addEventListener('iconscout:navigation', () => {
    console.log('[IconScout AutoTag] Navigation event detected:', location.href);
    if (isDraftUrl()) start();
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();