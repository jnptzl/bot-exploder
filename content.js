// Bot Exploder - Minimal Content Script

(function() {
  'use strict';

  const processedTweets = new WeakSet();
  let dislikedUsers = new Set();

  // Default config
  let config = {
    soundType: 'white',
    visualStyle: 'dots',
    duration: 120,
    volume: 30,
    particles: 16,
    spread: 60,
    nudge: 2,
    fadeEnabled: true,
    reportEnabled: true,
    blockEnabled: true,
    dislikeStyle: 'blur' // blur, dim, grayscale
  };

  // Load config and disliked users
  async function loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['botExploderConfig', 'dislikedUsers']);
      if (result.botExploderConfig) {
        config = { ...config, ...result.botExploderConfig };
      }
      if (result.dislikedUsers) {
        dislikedUsers = new Set(result.dislikedUsers);
      }
    } catch (e) {}
  }

  // Save disliked users
  async function saveDislikedUsers() {
    try {
      await chrome.storage.sync.set({ dislikedUsers: [...dislikedUsers] });
    } catch (e) {}
  }

  // Listen for config updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'configUpdated') {
      config = { ...config, ...msg.config };
    }
    if (msg.type === 'dislikedUsersUpdated') {
      dislikedUsers = new Set(msg.users);
      applyDislikeStyles();
    }
  });

  // ============================================
  // MINIMAL AUDIO
  // ============================================

  const Audio = {
    ctx: null,

    getContext() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    playWhite(duration, volume) {
      const ctx = this.getContext();
      const samples = ctx.sampleRate * (duration / 1000);
      const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < samples; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

      source.connect(gain).connect(ctx.destination);
      source.start();
    },

    playBrown(duration, volume) {
      const ctx = this.getContext();
      const samples = ctx.sampleRate * (duration / 1000);
      const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let last = 0;
      for (let i = 0; i < samples; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * white) / 1.02;
        last = data[i];
        data[i] *= 3.5;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

      source.connect(gain).connect(ctx.destination);
      source.start();
    },

    playPink(duration, volume) {
      const ctx = this.getContext();
      const samples = ctx.sampleRate * (duration / 1000);
      const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < samples; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

      source.connect(gain).connect(ctx.destination);
      source.start();
    },

    playBlip(duration, volume) {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const dur = Math.min(duration, 80) / 1000;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur);
    },

    play() {
      const vol = config.volume / 100;
      const dur = config.duration;

      switch (config.soundType) {
        case 'white': this.playWhite(dur, vol); break;
        case 'brown': this.playBrown(dur, vol); break;
        case 'pink': this.playPink(dur, vol); break;
        case 'blip': this.playBlip(dur, vol); break;
      }
    }
  };

  // ============================================
  // MINIMAL VISUALS
  // ============================================

  function createVisual(element) {
    if (config.visualStyle === 'none') return;

    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + window.scrollX;
    const cy = rect.top + rect.height / 2 + window.scrollY;

    const container = document.createElement('div');
    container.className = 'be-container';
    container.style.cssText = `
      position: absolute;
      left: ${cx}px;
      top: ${cy}px;
      pointer-events: none;
      z-index: 999999;
    `;

    switch (config.visualStyle) {
      case 'dots':
        createDots(container);
        break;
      case 'lines':
        createLines(container);
        break;
      case 'ring':
        createRing(container);
        break;
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
      const duration = 300 + Math.random() * 200;

      dot.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: #000;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        animation: be-dot ${duration}ms ease-out forwards;
        --dx: ${Math.cos(angle) * distance}px;
        --dy: ${Math.sin(angle) * distance}px;
      `;

      container.appendChild(dot);
    }
  }

  function createLines(container) {
    const count = Math.floor(config.particles / 2);
    const spread = config.spread;

    for (let i = 0; i < count; i++) {
      const line = document.createElement('div');
      const angle = (i / count) * Math.PI * 2;
      const length = spread * (0.4 + Math.random() * 0.6);
      const duration = 250 + Math.random() * 150;

      line.style.cssText = `
        position: absolute;
        width: 1px;
        height: ${length}px;
        background: #000;
        transform-origin: center top;
        transform: rotate(${angle}rad);
        animation: be-line ${duration}ms ease-out forwards;
      `;

      container.appendChild(line);
    }
  }

  function createRing(container) {
    const ring = document.createElement('div');
    const spread = config.spread;

    ring.style.cssText = `
      position: absolute;
      width: 10px;
      height: 10px;
      border: 1px solid #000;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: be-ring 400ms ease-out forwards;
      --size: ${spread * 2}px;
    `;

    container.appendChild(ring);
  }

  function nudge() {
    if (config.nudge === 0) return;

    const amount = config.nudge;
    document.body.style.transition = 'transform 0.08s ease-out';
    document.body.style.transform = `translateX(${amount}px)`;

    setTimeout(() => {
      document.body.style.transform = `translateX(-${amount * 0.4}px)`;
      setTimeout(() => {
        document.body.style.transform = 'translateX(0)';
      }, 40);
    }, 40);
  }

  // ============================================
  // DISLIKE SYSTEM
  // ============================================

  function getUsername(tweet) {
    // Find the username link in the tweet
    const links = tweet.querySelectorAll('a[href^="/"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      // Skip non-user links
      if (href && href.match(/^\/[a-zA-Z0-9_]+$/) && !href.includes('/status/')) {
        return href.slice(1).toLowerCase();
      }
    }
    return null;
  }

  function isDisliked(username) {
    return username && dislikedUsers.has(username.toLowerCase());
  }

  function toggleDislike(username) {
    if (!username) return false;
    const lower = username.toLowerCase();

    if (dislikedUsers.has(lower)) {
      dislikedUsers.delete(lower);
    } else {
      dislikedUsers.add(lower);
    }

    saveDislikedUsers();
    applyDislikeStyles();
    return dislikedUsers.has(lower);
  }

  function applyDislikeStyles() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      const username = getUsername(tweet);
      const isUserDisliked = isDisliked(username);

      tweet.classList.toggle('be-disliked', isUserDisliked);

      // Update dislike button state
      const dislikeBtn = tweet.querySelector('.be-dislike-btn');
      if (dislikeBtn) {
        dislikeBtn.classList.toggle('active', isUserDisliked);
        dislikeBtn.title = isUserDisliked ? 'Remove from disliked' : 'Dislike this user';
      }
    });
  }

  // ============================================
  // AD BLOCKING
  // ============================================

  const processedAds = new WeakSet();

  function processAds() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      if (processedAds.has(tweet)) return;

      // Look for "Ad" label in the tweet
      const spans = tweet.querySelectorAll('span');
      let isAd = false;

      for (const span of spans) {
        const text = span.textContent.trim();
        if (text === 'Ad' || text === 'Promoted') {
          isAd = true;
          break;
        }
      }

      if (isAd) {
        processedAds.add(tweet);
        tweet.classList.add('be-ad');
      }
    });
  }

  // ============================================
  // VIDEO BLOCKING
  // ============================================

  const processedVideos = new WeakSet();

  function processVideos() {
    // Find video containers in tweets
    document.querySelectorAll('video').forEach(video => {
      if (processedVideos.has(video)) return;
      processedVideos.add(video);

      // Pause the video
      video.pause();
      video.autoplay = false;

      // Find the container to overlay
      const container = video.closest('[data-testid="videoComponent"]') ||
                        video.closest('[data-testid="videoPlayer"]') ||
                        video.parentElement;

      if (!container || container.querySelector('.be-video-overlay')) return;

      container.style.position = 'relative';

      let overlayRevealed = false;

      const attachOverlay = () => {
        if (container.querySelector('.be-video-overlay')) return null;
        const overlay = document.createElement('div');
        overlay.className = 'be-video-overlay';
        overlay.innerHTML = `
          <div class="be-video-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <polygon points="5,3 19,12 5,21" fill="currentColor"/>
            </svg>
          </div>
          <span class="be-video-text">click to play</span>
        `;

        overlay.addEventListener('click', (e) => {
          e.preventDefault();
          overlayRevealed = true;
          video.play();
          overlay.remove();
        });

        container.appendChild(overlay);
        return overlay;
      };

      attachOverlay();

      // Re-pause if video tries to autoplay
      video.addEventListener('play', () => {
        if (!overlayRevealed) {
          video.pause();
        }
      });

      video.addEventListener('pause', () => {
        if (video.ended) return;
        overlayRevealed = false;
        attachOverlay();
      });
    });
  }

  // ============================================
  // REPORT FUNCTIONALITY
  // ============================================

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function findByText(text) {
    const selectors = ['[role="menuitem"]', '[role="button"]', '[role="option"]', 'span', 'div[dir="ltr"]'];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.textContent.toLowerCase().includes(text.toLowerCase())) {
          return el.closest('[role="menuitem"], [role="button"], [role="option"], label, [tabindex]') || el;
        }
      }
    }
    return null;
  }

  async function reportTweet(tweet) {
    if (!config.reportEnabled) return;

    const caret = tweet.querySelector('[data-testid="caret"]');
    if (!caret) return;

    caret.click();
    await sleep(300);

    const report = findByText('report');
    if (!report) { document.body.click(); return; }

    report.click();
    await sleep(500);

    const spam = findByText('spam') || findByText('fake');
    if (spam) { spam.click(); await sleep(300); }

    const next = findByText('next') || findByText('submit');
    if (next) { next.click(); await sleep(400); }

    const sub = findByText('fake') || findByText('engagement') || findByText('spam');
    if (sub) { sub.click(); await sleep(300); }

    const next2 = findByText('next') || findByText('submit');
    if (next2) { next2.click(); await sleep(400); }

    if (config.blockEnabled) {
      const block = findByText('block');
      if (block) {
        const cb = block.querySelector('input[type="checkbox"]') || block;
        if (cb && !cb.checked) cb.click();
        await sleep(200);
      }
    }

    const done = findByText('done') || findByText('submit');
    if (done) done.click();
  }

  // ============================================
  // TWEET PROCESSING
  // ============================================

  function addButton(tweet) {
    if (processedTweets.has(tweet)) return;
    processedTweets.add(tweet);

    const actionBar = tweet.querySelector('[role="group"]');
    if (!actionBar) return;

    const username = getUsername(tweet);

    // Dislike button (arrow down)
    const dislikeBtn = document.createElement('button');
    dislikeBtn.className = 'be-dislike-btn' + (isDisliked(username) ? ' active' : '');
    dislikeBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 3v10M5 9l4 6 4-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    dislikeBtn.title = isDisliked(username) ? 'Remove from disliked' : 'Dislike this user';

    dislikeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const nowDisliked = toggleDislike(username);

      // Small feedback sound
      if (config.volume > 0) {
        const ctx = Audio.getContext();
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = nowDisliked ? 300 : 500;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(config.volume / 400, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
    });

    // Remove/report button
    const btn = document.createElement('button');
    btn.className = 'be-btn';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1"/>
        <circle cx="9" cy="9" r="2" fill="currentColor"/>
      </svg>
    `;
    btn.title = 'Remove';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.disabled = true;
      btn.style.opacity = '0.3';

      Audio.play();
      createVisual(tweet);
      nudge();

      if (config.fadeEnabled) {
        tweet.style.transition = 'opacity 0.4s ease-out';
        tweet.style.opacity = '0.15';
      }

      await reportTweet(tweet);

      setTimeout(() => {
        tweet.style.opacity = '0';
        setTimeout(() => { tweet.style.display = 'none'; }, 300);
      }, 200);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'be-btn-wrap';
    wrapper.appendChild(dislikeBtn);
    wrapper.appendChild(btn);
    actionBar.appendChild(wrapper);

    // Apply initial dislike style if needed
    if (isDisliked(username)) {
      tweet.classList.add('be-disliked');
    }
  }

  function processTweets() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(addButton);
  }

  // ============================================
  // INIT
  // ============================================

  async function init() {
    await loadConfig();

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      .be-btn-wrap {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: 4px;
      }
      .be-btn,
      .be-dislike-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: #536471;
        border-radius: 4px;
        transition: all 0.15s;
      }

      /* Report button - red square on hover */
      .be-btn:hover {
        background: #dc2626;
        color: #fff;
        border-radius: 4px;
      }
      .be-btn:hover svg {
        transform: scale(1.1);
      }

      /* Dislike button - yellow square on hover */
      .be-dislike-btn:hover {
        background: #eab308;
        color: #000;
        border-radius: 4px;
      }
      .be-dislike-btn:hover svg {
        transform: scale(1.1);
      }
      .be-dislike-btn.active {
        color: #eab308;
      }

      /* Disliked tweet styles - darker treatment */
      .be-disliked {
        position: relative;
        transition: all 0.3s ease-out;
      }
      .be-disliked::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        pointer-events: none;
        z-index: 1;
        transition: opacity 0.2s ease-out;
      }
      .be-disliked::after {
        content: 'you dislike this person';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #fff;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        pointer-events: none;
        z-index: 2;
        opacity: 0.8;
        transition: opacity 0.2s ease-out;
      }
      .be-disliked > * {
        filter: grayscale(0.6) brightness(0.7);
        transition: all 0.2s ease-out;
      }
      .be-disliked:hover > * {
        filter: grayscale(0) brightness(1);
      }
      .be-disliked:hover::before {
        opacity: 0;
      }
      .be-disliked:hover::after {
        opacity: 0;
      }
      .be-disliked .be-btn-wrap {
        filter: none !important;
        position: relative;
        z-index: 3;
      }

      @keyframes be-dot {
        0% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }
        100% {
          transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.5);
          opacity: 0;
        }
      }
      @keyframes be-line {
        0% {
          opacity: 1;
          height: 0;
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 0;
        }
      }
      @keyframes be-ring {
        0% {
          width: 10px;
          height: 10px;
          opacity: 1;
        }
        100% {
          width: var(--size);
          height: var(--size);
          opacity: 0;
        }
      }

      /* Ad blocking styles */
      .be-ad {
        position: relative;
        transition: all 0.3s ease-out;
      }
      .be-ad::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        pointer-events: none;
        z-index: 1;
        transition: opacity 0.2s ease-out;
      }
      .be-ad::after {
        content: 'ad';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #fff;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        pointer-events: none;
        z-index: 2;
        opacity: 0.6;
        transition: opacity 0.2s ease-out;
      }
      .be-ad:hover::before {
        opacity: 0;
      }
      .be-ad:hover::after {
        opacity: 0;
      }

      /* Video blocking styles */
      .be-video-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(20px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        z-index: 10;
        transition: opacity 0.3s ease-out;
      }
      .be-video-overlay.be-video-revealed {
        opacity: 0;
        pointer-events: none;
      }
      .be-video-icon {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        transition: all 0.2s ease-out;
      }
      .be-video-overlay:hover .be-video-icon {
        background: rgba(255, 255, 255, 0.25);
        transform: scale(1.1);
      }
      .be-video-text {
        color: #fff;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        opacity: 0.7;
      }
    `;
    document.head.appendChild(style);

    processTweets();
    processVideos();
    processAds();

    const observer = new MutationObserver(() => {
      processTweets();
      processVideos();
      processAds();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
