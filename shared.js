// Bot Exploder - Shared between popup and content script

const BE_DEFAULT_CONFIG = {
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
  hideAds: true,
  holdVideos: true
};

// ============================================
// STORAGE
// ============================================
// Config lives in sync storage (small, follows the user across devices).
// Disliked users live in local storage: sync caps a single item at 8KB,
// which a few hundred usernames would exceed.

const BEStorage = {
  async getConfig() {
    try {
      const { botExploderConfig } = await chrome.storage.sync.get('botExploderConfig');
      return { ...BE_DEFAULT_CONFIG, ...botExploderConfig };
    } catch {
      return { ...BE_DEFAULT_CONFIG };
    }
  },

  async setConfig(config) {
    try {
      await chrome.storage.sync.set({ botExploderConfig: config });
    } catch {}
  },

  async getDisliked() {
    try {
      const local = await chrome.storage.local.get('dislikedUsers');
      if (local.dislikedUsers) return local.dislikedUsers;

      // One-time migration from sync storage (pre-2.2)
      const sync = await chrome.storage.sync.get('dislikedUsers');
      if (sync.dislikedUsers) {
        await chrome.storage.local.set({ dislikedUsers: sync.dislikedUsers });
        await chrome.storage.sync.remove('dislikedUsers');
        return sync.dislikedUsers;
      }
    } catch {}
    return [];
  },

  async setDisliked(users) {
    try {
      await chrome.storage.local.set({ dislikedUsers: [...users] });
    } catch {}
  },

  // cb({ config?, dislikedUsers? }) whenever another context writes
  onChange(cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.botExploderConfig) {
        cb({ config: { ...BE_DEFAULT_CONFIG, ...changes.botExploderConfig.newValue } });
      }
      if (area === 'local' && changes.dislikedUsers) {
        cb({ dislikedUsers: changes.dislikedUsers.newValue || [] });
      }
    });
  }
};

// ============================================
// AUDIO
// ============================================

const BEAudio = {
  ctx: null,

  getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  // Fill a buffer using a per-sample generator and play it with a decay
  playNoise(fill, duration, volume) {
    const ctx = this.getContext();
    const samples = Math.max(1, Math.floor(ctx.sampleRate * (duration / 1000)));
    const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
    fill(buffer.getChannelData(0));

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    source.connect(gain).connect(ctx.destination);
    source.start();
  },

  fillWhite(data) {
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  },

  // Random walk, low frequency emphasis
  fillBrown(data) {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  },

  // 1/f spectrum (Paul Kellet's refined method)
  fillPink(data) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
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
  },

  tone(startFreq, endFreq, duration, volume) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const dur = duration / 1000;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  },

  play(config) {
    const vol = config.volume / 100;
    const dur = config.duration;
    if (vol <= 0) return;

    switch (config.soundType) {
      case 'white': this.playNoise(this.fillWhite, dur, vol); break;
      case 'brown': this.playNoise(this.fillBrown, dur, vol); break;
      case 'pink': this.playNoise(this.fillPink, dur, vol); break;
      case 'blip': this.tone(800, 200, Math.min(dur, 80), vol); break;
    }
  }
};
