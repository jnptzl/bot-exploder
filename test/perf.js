#!/usr/bin/env node
// Rough cost of the extension on a busy X-like page: runs the same mutation
// storm with and without the extension and compares main-thread time and
// JS heap.   node test/perf.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
const TWEETS = 60;
const STORM_MS = 5000;
const VIDEO_EVERY = Number(process.env.VIDEO_EVERY ?? 10); // 0 = no videos

async function run(withExtension) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-perf-'));
  const args = withExtension
    ? [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
    : [];
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', headless: true, args
  });
  await context.route('https://x.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));

  const page = await context.newPage();
  await page.goto('https://x.com/home');
  await page.evaluate(({ n, every: VIDEO_EVERY }) => {
    for (let i = 0; i < n; i++) addTweet({ user: `user_${i}`, text: `post ${i}`, video: VIDEO_EVERY > 0 && i % VIDEO_EVERY === 0 });
  }, { n: TWEETS, every: VIDEO_EVERY });
  if (withExtension) await page.waitForSelector('article[data-user="user_0"] .be-btn-wrap');
  await page.waitForTimeout(1000);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map(m => [m.name, m.value]));
  };

  const before = await metrics();

  // Mimic X: recycle a post every frame (virtualized scrolling) and keep
  // updating counters inside the visible ones
  await page.evaluate(({ ms, every }) => new Promise(resolve => {
    let n = 100000;
    const end = performance.now() + ms;
    (function frame() {
      const timeline = document.getElementById('timeline');
      timeline.querySelector('article').remove();
      addTweet({ user: `user_${n++}`, text: 'new post', video: every > 0 && n % every === 0 });
      timeline.querySelectorAll('[data-testid="like"]').forEach((b, i) => {
        if (i % 7 === n % 7) b.textContent = String(n);
      });
      if (performance.now() < end) requestAnimationFrame(frame); else resolve();
    })();
  }), { ms: STORM_MS, every: VIDEO_EVERY });

  const after = await metrics();
  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });

  return {
    script: (after.ScriptDuration - before.ScriptDuration) * 1000,
    style: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
    layout: (after.LayoutDuration - before.LayoutDuration) * 1000,
    task: (after.TaskDuration - before.TaskDuration) * 1000,
    heap: after.JSHeapUsedSize / 1024 / 1024
  };
}

(async () => {
  const runs = Number(process.env.RUNS || 3);
  const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const results = { without: [], with: [] };
  for (let i = 0; i < runs; i++) {
    results.without.push(await run(false));
    results.with.push(await run(true));
  }

  const row = (label, key, unit) => {
    const a = median(results.without.map(r => r[key]));
    const b = median(results.with.map(r => r[key]));
    console.log(`${label.padEnd(18)} ${a.toFixed(1).padStart(8)} ${b.toFixed(1).padStart(8)} ${(b - a >= 0 ? '+' : '') + (b - a).toFixed(1)} ${unit}`);
  };

  console.log(`${TWEETS} posts, ${STORM_MS / 1000}s mutation storm, median of ${runs} runs\n`);
  console.log(`${''.padEnd(18)} ${'without'.padStart(8)} ${'with'.padStart(8)} delta`);
  row('JS (main thread)', 'script', 'ms');
  row('Style recalc', 'style', 'ms');
  row('Layout', 'layout', 'ms');
  row('Total busy', 'task', 'ms');
  row('JS heap after GC', 'heap', 'MB');
})().catch(e => { console.error(e); process.exit(1); });
