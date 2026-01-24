// Bot Exploder - Minimal Configuration

const DEFAULT_CONFIG = {
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
  hideSpaces: false,
  hideTrends: false
};

let config = { ...DEFAULT_CONFIG };
let dislikedUsers = [];
let audioCtx = null;

// ============================================
// MINIMAL AUDIO SYSTEM
// ============================================

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// White noise - all frequencies equal
function playWhiteNoise(duration, volume) {
  const ctx = getAudioContext();
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

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

// Brown noise - random walk, low frequency emphasis
function playBrownNoise(duration, volume) {
  const ctx = getAudioContext();
  const samples = ctx.sampleRate * (duration / 1000);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0;
  for (let i = 0; i < samples; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5; // Compensate for volume loss
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

// Pink noise - 1/f spectrum
function playPinkNoise(duration, volume) {
  const ctx = getAudioContext();
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
    data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    data[i] *= 0.11;
    b6 = white * 0.115926;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

// Blip - short sine click
function playBlip(duration, volume) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const dur = Math.min(duration, 80) / 1000;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + dur);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

function playSound() {
  const duration = config.duration;
  const volume = config.volume / 100;

  switch (config.soundType) {
    case 'white':
      playWhiteNoise(duration, volume);
      break;
    case 'brown':
      playBrownNoise(duration, volume);
      break;
    case 'pink':
      playPinkNoise(duration, volume);
      break;
    case 'blip':
      playBlip(duration, volume);
      break;
  }
}

// ============================================
// CONFIG MANAGEMENT
// ============================================

async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(['botExploderConfig', 'dislikedUsers']);
    if (result.botExploderConfig) {
      config = { ...DEFAULT_CONFIG, ...result.botExploderConfig };
    }
    if (result.dislikedUsers) {
      dislikedUsers = result.dislikedUsers;
    }
  } catch (e) {
    console.log('Using default config');
  }
  updateUI();
  updateDislikedList();
}

async function saveConfig() {
  try {
    await chrome.storage.sync.set({ botExploderConfig: config });
    const tabs = await chrome.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] });
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'configUpdated', config }).catch(() => {});
    });
  } catch (e) {
    console.log('Could not save config');
  }
}

function updateUI() {
  // Sound options
  document.querySelectorAll('#sound-options .option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.value === config.soundType);
  });

  // Visual options
  document.querySelectorAll('#visual-options .option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.value === config.visualStyle);
  });

  // Sliders
  document.getElementById('duration').value = config.duration;
  document.getElementById('duration-value').textContent = config.duration;

  document.getElementById('volume').value = config.volume;
  document.getElementById('volume-value').textContent = config.volume;

  document.getElementById('particles').value = config.particles;
  document.getElementById('particles-value').textContent = config.particles;

  document.getElementById('spread').value = config.spread;
  document.getElementById('spread-value').textContent = config.spread;

  document.getElementById('nudge').value = config.nudge;
  document.getElementById('nudge-value').textContent = config.nudge;

  // Toggles
  document.getElementById('toggle-fade').classList.toggle('active', config.fadeEnabled);
  document.getElementById('toggle-report').classList.toggle('active', config.reportEnabled);
  document.getElementById('toggle-block').classList.toggle('active', config.blockEnabled);
  document.getElementById('toggle-spaces').classList.toggle('active', config.hideSpaces);
  document.getElementById('toggle-trends').classList.toggle('active', config.hideTrends);
}

function setupListeners() {
  // Sound options
  document.querySelectorAll('#sound-options .option').forEach(opt => {
    opt.addEventListener('click', () => {
      config.soundType = opt.dataset.value;
      saveConfig();
      updateUI();
    });
  });

  // Visual options
  document.querySelectorAll('#visual-options .option').forEach(opt => {
    opt.addEventListener('click', () => {
      config.visualStyle = opt.dataset.value;
      saveConfig();
      updateUI();
    });
  });

  // Sliders
  const sliders = ['duration', 'volume', 'particles', 'spread', 'nudge'];
  sliders.forEach(id => {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(id + '-value');
    slider.addEventListener('input', () => {
      config[id] = parseInt(slider.value);
      valueEl.textContent = slider.value;
      saveConfig();
    });
  });

  // Toggles
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const setting = toggle.dataset.setting;
      config[setting] = !config[setting];
      saveConfig();
      updateUI();
    });
  });

  // Test button
  document.getElementById('test-btn').addEventListener('click', testEffect);
}

function testEffect() {
  playSound();

  // Small nudge on popup
  if (config.nudge > 0) {
    const nudgeAmount = config.nudge;
    document.body.style.transition = 'transform 0.1s ease-out';
    document.body.style.transform = `translateX(${nudgeAmount}px)`;
    setTimeout(() => {
      document.body.style.transform = `translateX(-${nudgeAmount * 0.5}px)`;
      setTimeout(() => {
        document.body.style.transform = 'translateX(0)';
      }, 50);
    }, 50);
  }
}

// ============================================
// DISLIKED USERS MANAGEMENT
// ============================================

function updateDislikedList() {
  const countEl = document.getElementById('dislike-count');
  const listEl = document.getElementById('dislike-list');

  countEl.textContent = dislikedUsers.length;

  if (dislikedUsers.length === 0) {
    listEl.innerHTML = '<span class="dislike-empty">None</span>';
    return;
  }

  listEl.innerHTML = dislikedUsers.map(user => `
    <span class="dislike-tag">
      @${user}
      <button data-user="${user}" title="Remove">×</button>
    </span>
  `).join('');

  // Add remove listeners
  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => removeDislikedUser(btn.dataset.user));
  });
}

async function removeDislikedUser(username) {
  dislikedUsers = dislikedUsers.filter(u => u !== username);
  await chrome.storage.sync.set({ dislikedUsers });
  updateDislikedList();

  // Notify content scripts
  const tabs = await chrome.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] });
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, { type: 'dislikedUsersUpdated', users: dislikedUsers }).catch(() => {});
  });
}

async function clearAllDisliked() {
  dislikedUsers = [];
  await chrome.storage.sync.set({ dislikedUsers: [] });
  updateDislikedList();

  // Notify content scripts
  const tabs = await chrome.tabs.query({ url: ['*://twitter.com/*', '*://x.com/*'] });
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, { type: 'dislikedUsersUpdated', users: [] }).catch(() => {});
  });
}

// Initialize
loadConfig();
setupListeners();

// Clear disliked button
document.getElementById('clear-disliked').addEventListener('click', clearAllDisliked);
