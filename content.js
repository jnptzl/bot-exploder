// Bot Exploder - Content Script
// Depends on shared.js (BE_DEFAULT_CONFIG, BEStorage, BEAudio)

(function() {
  'use strict';

  const TWEET = 'article[data-testid="tweet"]';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let config = { ...BE_DEFAULT_CONFIG };
  let dislikedUsers = new Set();

  async function loadState() {
    config = await BEStorage.getConfig();
    dislikedUsers = new Set(await BEStorage.getDisliked());
  }

  // Popup (or another tab) changed something
  BEStorage.onChange(({ config: newConfig, dislikedUsers: users }) => {
    if (newConfig) config = newConfig;
    if (users) dislikedUsers = new Set(users);
    requestFullScan();
  });

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ============================================
  // VISUALS
  // ============================================

  function createVisual(element) {
    if (config.visualStyle === 'none') return;

    const rect = element.getBoundingClientRect();
    const container = document.createElement('div');
    container.className = 'be-container';
    container.style.left = `${rect.left + rect.width / 2}px`;
    container.style.top = `${rect.top + rect.height / 2}px`;

    switch (config.visualStyle) {
      case 'dots': createDots(container); break;
      case 'lines': createLines(container); break;
      case 'ring': createRing(container); break;
    }

    document.body.appendChild(container);
    setTimeout(() => container.remove(), 600);
  }

  function createDots(container) {
    const count = config.particles;
    const spread = config.spread;

    for (let i = 0; i < count; i++) {
      const dot = document.createElement('div');
      const angle = (i / count) * Math.PI * 2;
      const distance = spread * (0.5 + Math.random() * 0.5);
      const size = 2 + Math.random() * 3;

      dot.className = 'be-dot';
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.setProperty('--be-duration', `${300 + Math.random() * 200}ms`);
      dot.style.setProperty('--be-dx', `${Math.cos(angle) * distance}px`);
      dot.style.setProperty('--be-dy', `${Math.sin(angle) * distance}px`);

      container.appendChild(dot);
    }
  }

  function createLines(container) {
    const count = Math.max(2, Math.floor(config.particles / 2));
    const spread = config.spread;

    for (let i = 0; i < count; i++) {
      const line = document.createElement('div');

      line.className = 'be-line';
      line.style.height = `${spread * (0.4 + Math.random() * 0.6)}px`;
      line.style.setProperty('--be-angle', `${(i / count) * Math.PI * 2}rad`);
      line.style.setProperty('--be-duration', `${250 + Math.random() * 150}ms`);

      container.appendChild(line);
    }
  }

  function createRing(container) {
    const ring = document.createElement('div');
    ring.className = 'be-ring';
    ring.style.setProperty('--be-size', `${config.spread * 2}px`);
    container.appendChild(ring);
  }

  // Shake the timeline column, not <body>: a transform on <body> turns it
  // into the containing block for X's position:fixed layers (menus, dialogs),
  // which pushes the report dialog off-screen.
  function nudge(tweet) {
    if (!config.nudge || reducedMotion.matches) return;

    const target = document.querySelector('[data-testid="primaryColumn"]') || tweet;
    const amount = config.nudge;
    target.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${amount}px)`, offset: 0.33 },
      { transform: `translateX(${-amount * 0.4}px)`, offset: 0.66 },
      { transform: 'translateX(0)' }
    ], { duration: 120, easing: 'ease-out' });
  }

  // X renders light, dim and lights-out themes; flip particle color to match
  function updateTheme() {
    const rgba = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    const opaque = rgba.length === 3 || (rgba.length === 4 && rgba[3] > 0);
    const dark = opaque && (0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2]) < 128;
    document.documentElement.classList.toggle('be-dark', dark);
  }

  // ============================================
  // DISLIKE SYSTEM
  // ============================================

  const RESERVED_PATHS = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'settings',
    'compose', 'i', 'hashtag', 'lists', 'communities', 'premium'
  ]);

  function parseUserHref(href) {
    const match = href && href.match(/^\/([A-Za-z0-9_]{1,15})$/);
    if (!match || RESERVED_PATHS.has(match[1].toLowerCase())) return null;
    return match[1].toLowerCase();
  }

  function getUsername(tweet) {
    // The author block. Avoids the "X reposted" link above retweets.
    const authorLink = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
    const author = authorLink && parseUserHref(authorLink.getAttribute('href'));
    if (author) return author;

    for (const link of tweet.querySelectorAll('a[href^="/"]')) {
      if (link.closest('[data-testid="socialContext"]') ||
          link.querySelector('[data-testid="socialContext"]')) continue;
      const user = parseUserHref(link.getAttribute('href'));
      if (user) return user;
    }
    return null;
  }

  function isDisliked(username) {
    return !!username && dislikedUsers.has(username);
  }

  async function toggleDislike(username) {
    if (dislikedUsers.has(username)) {
      dislikedUsers.delete(username);
    } else {
      dislikedUsers.add(username);
    }
    requestFullScan();
    await BEStorage.setDisliked(dislikedUsers);
    return dislikedUsers.has(username);
  }

  function applyDislikeStyle(tweet) {
    const disliked = isDisliked(getUsername(tweet));
    tweet.classList.toggle('be-disliked', disliked);

    const btn = tweet.querySelector('.be-dislike-btn');
    if (btn && btn.getAttribute('aria-pressed') !== String(disliked)) {
      btn.classList.toggle('active', disliked);
      btn.setAttribute('aria-pressed', String(disliked));
      btn.title = disliked ? 'Remove from disliked' : 'Dislike this user';
    }
  }

  // ============================================
  // AD HIDING
  // ============================================

  const adCache = new WeakMap();

  function hasAdLabel(tweet) {
    for (const span of tweet.querySelectorAll('span')) {
      if (span.childElementCount) continue;
      const text = span.textContent.trim();
      if (text === 'Ad' || text === 'Promoted') return true;
    }
    return false;
  }

  function processAd(tweet) {
    if (!adCache.has(tweet)) {
      // Wait until the header has rendered before deciding
      if (!tweet.querySelector('[data-testid="User-Name"]')) return;
      adCache.set(tweet, hasAdLabel(tweet));
    }
    tweet.classList.toggle('be-ad', config.hideAds && adCache.get(tweet));
  }

  // ============================================
  // VIDEO HOLD
  // ============================================

  const watchedVideos = new WeakSet();
  const startedVideos = new WeakSet();
  // Remembered per post, not per <video>: X swaps the element when playback
  // starts or the post re-renders, and the new one must stay revealed.
  const revealedPosts = new Set();
  const revealedPlayers = new WeakSet(); // fallback when a post has no status link

  function postKey(video) {
    const tweet = video.closest(TWEET);
    if (!tweet) return null;
    const link = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
    const match = link?.getAttribute('href').match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function isRevealed(video) {
    const key = postKey(video);
    return (!!key && revealedPosts.has(key)) || revealedPlayers.has(playerOf(video));
  }

  // Cover the whole player, controls included, so X's own play button
  // can't start a held video.
  function playerOf(video) {
    return video.closest('[data-testid="videoPlayer"]') ||
           video.closest('[data-testid="videoComponent"]') ||
           video.parentElement;
  }

  // Mute through X's own button when it's there, so its speaker icon stays
  // in sync; otherwise it takes two clicks to unmute.
  function muteAtStart(video) {
    if (video.muted) return;
    const player = playerOf(video);
    const button = player && [...player.querySelectorAll('button, [role="button"]')]
      .find(b => /^mute$/i.test(b.getAttribute('aria-label') || ''));
    if (button) button.click();
    if (!video.muted) video.muted = true;
  }

  function watchVideo(video) {
    if (watchedVideos.has(video)) return;
    watchedVideos.add(video);

    video.addEventListener('play', () => {
      // X restarts playback as videos scroll into view
      if (config.holdVideos && !isRevealed(video)) {
        video.pause();
        return;
      }
      // Every video starts muted, even if X remembers you unmuted the last one
      if (!startedVideos.has(video)) {
        startedVideos.add(video);
        muteAtStart(video);
      }
    });
  }

  function processVideos(tweet) {
    for (const video of tweet.getElementsByTagName('video')) {
      watchVideo(video);
      if (config.holdVideos) holdVideo(video);
    }
  }

  function holdVideo(video) {
    const player = playerOf(video);
    if (!player) return;
    const overlay = player.querySelector('.be-video-overlay');

    if (isRevealed(video)) {
      overlay?.classList.add('be-video-revealed');
      return;
    }

    // Also catches a fresh <video> swapped in under an existing overlay
    if (!video.paused) video.pause();
    video.autoplay = false;
    if (overlay) return;

    if (getComputedStyle(player).position === 'static') {
      player.style.position = 'relative';
    }

    const el = document.createElement('div');
    el.className = 'be-video-overlay';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Play video');
    el.tabIndex = 0;
    el.innerHTML = `
      <div class="be-video-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polygon points="7,4 20,12 7,20" fill="currentColor"/>
        </svg>
      </div>
      <span class="be-video-text">Click to play</span>
    `;

    const reveal = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = postKey(video);
      if (key) revealedPosts.add(key);
      revealedPlayers.add(player);
      el.classList.add('be-video-revealed');

      const current = player.querySelector('video') || video;
      startedVideos.add(current);
      watchVideo(current);
      muteAtStart(current);
      current.play().catch(() => {});
    };

    el.addEventListener('click', reveal);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') reveal(e);
    });

    player.appendChild(el);
  }

  // ============================================
  // REPORT FLOW
  // ============================================
  // Every lookup is scoped to #layers, where X renders menus and dialogs.
  // Searching the whole document would match tweet text in the timeline
  // ("next", "block", "done"...) and click random things.

  const CLICKABLE = [
    '[role="menuitem"]', '[role="button"]', '[role="radio"]',
    '[role="option"]', '[role="checkbox"]', 'button', 'label'
  ].join(', ');

  function layers() {
    return document.getElementById('layers');
  }

  function normalize(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function isEnabled(el) {
    return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }

  // X builds options from adjacent spans ("Spam" + "Fake engagement, ..."),
  // whose combined textContent has no separator, so test each leaf too.
  function matchesText(el, pattern) {
    if (pattern.test(normalize(el.textContent))) return true;
    for (const leaf of el.querySelectorAll('*')) {
      if (!leaf.childElementCount && pattern.test(normalize(leaf.textContent))) return true;
    }
    return false;
  }

  function findInLayers(pattern) {
    const root = layers();
    if (!root) return null;
    for (const el of root.querySelectorAll(CLICKABLE)) {
      if (isEnabled(el) && matchesText(el, pattern)) return el;
    }
    return null;
  }

  async function waitFor(pattern, timeout = 2500) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const el = findInLayers(pattern);
      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  async function clickWhenReady(pattern, timeout) {
    const el = await waitFor(pattern, timeout);
    if (!el) return false;
    el.click();
    await sleep(250);
    return true;
  }

  function dismissMenu() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }

  const NEXT = /^(next|submit)$/i;

  // Returns a short description of how far it got, for logging
  async function reportTweet(tweet) {
    const caret = tweet.querySelector('[data-testid="caret"]');
    if (!caret) return 'no menu button';

    caret.click();
    if (!await clickWhenReady(/^report\b/i)) {
      dismissMenu();
      return 'no report option';
    }

    // Category, then (optionally) a sub-category. Each may need "Next".
    if (!await clickWhenReady(/^spam\b/i)) return 'no spam category';
    await clickWhenReady(NEXT, 1500);

    if (await clickWhenReady(/^(fake engagement|fake account|spam)\b/i, 1500)) {
      await clickWhenReady(NEXT, 1500);
    }

    if (config.blockEnabled) {
      if (await clickWhenReady(/^block\b/i, 2500)) {
        // Some flows confirm the block in a second sheet
        const confirm = layers()?.querySelector('[data-testid="confirmationSheetConfirm"]');
        if (confirm) { confirm.click(); await sleep(250); }
      }
    }

    await clickWhenReady(/^(done|submit)$/i, 1500);
    return 'ok';
  }

  // One dialog at a time: rapid clicks on several tweets queue up
  let reportQueue = Promise.resolve();

  function enqueueReport(tweet) {
    const run = reportQueue.then(() => reportTweet(tweet)).catch(e => String(e));
    reportQueue = run;
    return run;
  }

  // ============================================
  // TWEET BUTTONS
  // ============================================

  async function onDislikeClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const tweet = e.currentTarget.closest(TWEET);
    const username = tweet && getUsername(tweet);
    if (!username) return;

    const nowDisliked = await toggleDislike(username);
    if (config.volume > 0) {
      const freq = nowDisliked ? 300 : 500;
      BEAudio.tone(freq, freq, 50, config.volume / 400);
    }
  }

  async function onRemoveClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const btn = e.currentTarget;
    const tweet = btn.closest(TWEET);
    if (!tweet || btn.disabled) return;
    btn.disabled = true;

    BEAudio.play(config);
    createVisual(tweet);
    nudge(tweet);

    if (config.fadeEnabled) {
      tweet.style.transition = 'opacity 0.4s ease-out';
      tweet.style.opacity = '0.15';
    }

    if (config.reportEnabled) {
      const result = await enqueueReport(tweet);
      if (result !== 'ok') console.warn(`[Bot Exploder] report incomplete: ${result}`);
    }

    await sleep(200);
    tweet.style.transition = 'opacity 0.3s ease-out';
    tweet.style.opacity = '0';
    await sleep(300);
    tweet.style.display = 'none';
  }

  // Icons are CSS masks (see content.css): inline SVGs in every post
  // measurably slowed X's paint while scrolling
  function makeButton(className, label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function ensureButtons(tweet) {
    const actionBar = tweet.querySelector('[data-testid="reply"]')?.closest('[role="group"]') ||
                      tweet.querySelector('[role="group"]');
    // React re-renders can drop our wrapper, so check the DOM rather than a cache
    if (!actionBar || actionBar.querySelector('.be-btn-wrap')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'be-btn-wrap';
    wrapper.appendChild(makeButton('be-dislike-btn', 'Dislike this user', onDislikeClick));
    wrapper.appendChild(makeButton('be-btn', 'Remove', onRemoveClick));
    actionBar.appendChild(wrapper);
  }

  // ============================================
  // SCAN
  // ============================================

  // ============================================
  // SIDEBAR
  // ============================================
  // Modules are found by their heading, then hidden at the largest ancestor
  // that holds no other module. X loads modules lazily, so a box hidden
  // early can later turn out to contain more; it's re-checked every pass.

  const SIDEBAR_MODULES = [
    { setting: 'hideLive', heading: /^live on /i },
    { setting: 'hideTrends', heading: /^(what[’']s happening|trends for you|trending now)$/i },
    { setting: 'hideWhoToFollow', heading: /^(who to follow|you might like)$/i }
  ];

  const HEADING = 'h2, [role="heading"]';
  const SEARCH = '[role="search"], [data-testid="SearchBox_Search_Input"]';

  function moduleFor(heading) {
    const text = normalize(heading.textContent);
    return SIDEBAR_MODULES.find(m => m.heading.test(text));
  }

  function moduleBox(heading, sidebar) {
    let box = heading;
    while (box.parentElement && box.parentElement !== sidebar) {
      const parent = box.parentElement;
      if (parent.querySelectorAll(HEADING).length > 1 || parent.querySelector(SEARCH)) break;
      box = parent;
    }
    return box === heading ? null : box;
  }

  function processSidebar() {
    const sidebar = document.querySelector('[data-testid="sidebarColumn"]');
    if (!sidebar) return;

    for (const box of sidebar.querySelectorAll('[data-be-hidden]')) {
      const headings = box.querySelectorAll(HEADING);
      const module = headings.length === 1 && moduleFor(headings[0]);
      if (!module || !config[module.setting] || box.querySelector(SEARCH)) {
        box.removeAttribute('data-be-hidden');
      }
    }

    for (const heading of sidebar.querySelectorAll(HEADING)) {
      const module = moduleFor(heading);
      if (!module || !config[module.setting] || heading.closest('[data-be-hidden]')) continue;
      moduleBox(heading, sidebar)?.setAttribute('data-be-hidden', module.setting);
    }
  }

  // ============================================
  // SCAN
  // ============================================
  // X mutates the DOM constantly. Rather than re-checking every post on
  // every change, collect the posts that changed and process those once
  // per frame. Settings changes trigger a full pass.

  const dirtyTweets = new Set();
  let fullScanPending = true;
  let scanPending = false;
  let lastThemeCheck = 0;

  function processTweet(tweet) {
    ensureButtons(tweet);
    applyDislikeStyle(tweet);
    processAd(tweet);
    processVideos(tweet);
  }

  function scan() {
    scanPending = false;
    const now = performance.now();

    if (fullScanPending) {
      fullScanPending = false;
      dirtyTweets.clear();
      if (!config.holdVideos) {
        document.querySelectorAll('.be-video-overlay').forEach(o => o.remove());
      }
      document.querySelectorAll(TWEET).forEach(processTweet);
    } else {
      for (const tweet of dirtyTweets) {
        if (tweet.isConnected) processTweet(tweet);
      }
      dirtyTweets.clear();
    }

    processSidebar();

    // getComputedStyle forces a style recalc; X's theme rarely changes
    if (now - lastThemeCheck > 1000) {
      lastThemeCheck = now;
      updateTheme();
    }
  }

  function scheduleScan() {
    if (scanPending) return;
    scanPending = true;
    requestAnimationFrame(scan);
  }

  function requestFullScan() {
    fullScanPending = true;
    scheduleScan();
  }

  // Our own buttons, overlays and particles
  function isOurs(node) {
    return node.nodeType === 1 && typeof node.className === 'string' && node.className.startsWith('be-');
  }

  function onlyOurs(nodes) {
    for (const node of nodes) if (!isOurs(node)) return false;
    return true;
  }

  function onMutations(records) {
    let relevant = false;

    for (const record of records) {
      // Skip our own insertions, but not removals: X dropping our buttons
      // during a re-render is exactly what needs noticing
      if (!record.removedNodes.length && onlyOurs(record.addedNodes)) continue;
      relevant = true;

      const tweet = record.target.closest?.(TWEET);
      if (tweet) dirtyTweets.add(tweet);

      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(TWEET)) {
          dirtyTweets.add(node);
        } else if (node.firstElementChild) {
          for (const t of node.querySelectorAll(TWEET)) dirtyTweets.add(t);
        }
      }
    }

    if (relevant) scheduleScan();
  }

  async function init() {
    await loadState();
    scan();
    new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
