// Bot Exploder - Popup Configuration
// Depends on shared.js (BE_DEFAULT_CONFIG, BEStorage, BEAudio)

let config = { ...BE_DEFAULT_CONFIG };
let dislikedUsers = [];

const SLIDERS = ['duration', 'volume', 'particles', 'spread', 'nudge'];

// ============================================
// CONFIG
// ============================================

// chrome.storage.sync allows ~120 writes/minute; dragging a slider fires
// far more input events than that, so coalesce them.
let saveTimer = null;

function saveConfig() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushConfig, 250);
}

function flushConfig() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  BEStorage.setConfig(config);
}

// The popup closes the moment focus leaves it; don't drop a pending save
window.addEventListener('pagehide', flushConfig);

function updateUI() {
  document.querySelectorAll('#sound-options input').forEach(input => {
    input.checked = input.value === config.soundType;
  });
  document.querySelectorAll('#visual-options input').forEach(input => {
    input.checked = input.value === config.visualStyle;
  });
  document.querySelectorAll('.option').forEach(opt => {
    opt.classList.toggle('selected', opt.querySelector('input').checked);
  });

  SLIDERS.forEach(id => {
    document.getElementById(id).value = config[id];
    document.getElementById(id + '-value').textContent = config[id];
  });

  document.querySelectorAll('.toggle').forEach(toggle => {
    const on = !!config[toggle.dataset.setting];
    toggle.classList.toggle('active', on);
    toggle.setAttribute('aria-checked', String(on));
  });
}

function setupListeners() {
  document.querySelectorAll('#sound-options input').forEach(input => {
    input.addEventListener('change', () => {
      config.soundType = input.value;
      saveConfig();
      updateUI();
      BEAudio.play(config);
    });
  });

  document.querySelectorAll('#visual-options input').forEach(input => {
    input.addEventListener('change', () => {
      config.visualStyle = input.value;
      saveConfig();
      updateUI();
    });
  });

  SLIDERS.forEach(id => {
    const slider = document.getElementById(id);
    const row = slider.closest('.slider-row');
    slider.setAttribute('aria-label', row.querySelector('.slider-label').textContent);

    slider.addEventListener('input', () => {
      config[id] = parseInt(slider.value, 10);
      document.getElementById(id + '-value').textContent = slider.value;
      saveConfig();
    });
  });

  document.querySelectorAll('.toggle').forEach(toggle => {
    const row = toggle.closest('.toggle-row');
    toggle.setAttribute('aria-label', row.querySelector('.toggle-label').textContent);

    toggle.addEventListener('click', () => {
      const setting = toggle.dataset.setting;
      config[setting] = !config[setting];
      saveConfig();
      updateUI();
    });
  });

  document.getElementById('test-btn').addEventListener('click', testEffect);
  document.getElementById('clear-disliked').addEventListener('click', clearAllDisliked);
}

function testEffect() {
  BEAudio.play(config);

  if (config.nudge > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const amount = config.nudge;
    document.body.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${amount}px)`, offset: 0.33 },
      { transform: `translateX(${-amount * 0.5}px)`, offset: 0.66 },
      { transform: 'translateX(0)' }
    ], { duration: 150, easing: 'ease-out' });
  }
}

// ============================================
// DISLIKED USERS
// ============================================

function updateDislikedList() {
  const countEl = document.getElementById('dislike-count');
  const listEl = document.getElementById('dislike-list');

  countEl.textContent = dislikedUsers.length;
  document.getElementById('clear-disliked').disabled = dislikedUsers.length === 0;
  listEl.replaceChildren();

  if (dislikedUsers.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'dislike-empty';
    empty.textContent = 'None';
    listEl.appendChild(empty);
    return;
  }

  [...dislikedUsers].sort().forEach(user => {
    const tag = document.createElement('span');
    tag.className = 'dislike-tag';

    const link = document.createElement('a');
    link.href = `https://x.com/${encodeURIComponent(user)}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `@${user}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.title = `Remove @${user}`;
    remove.setAttribute('aria-label', `Remove @${user}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeDislikedUser(user));

    tag.append(link, remove);
    listEl.appendChild(tag);
  });
}

async function removeDislikedUser(username) {
  dislikedUsers = dislikedUsers.filter(u => u !== username);
  updateDislikedList();
  await BEStorage.setDisliked(dislikedUsers);
}

async function clearAllDisliked() {
  if (!confirm(`Clear all ${dislikedUsers.length} disliked users?`)) return;
  dislikedUsers = [];
  updateDislikedList();
  await BEStorage.setDisliked(dislikedUsers);
}

// ============================================
// INIT
// ============================================

async function init() {
  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;
  setupListeners();

  config = await BEStorage.getConfig();
  dislikedUsers = await BEStorage.getDisliked();
  updateUI();
  updateDislikedList();

  // Dislikes added from a tab while the popup is open
  BEStorage.onChange(({ dislikedUsers: users }) => {
    if (users) {
      dislikedUsers = users;
      updateDislikedList();
    }
  });
}

init();
