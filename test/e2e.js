#!/usr/bin/env node
// End-to-end test: loads the unpacked extension into Chromium and drives it
// against test/fixture.html served as https://x.com/home.
//
//   npm test            (after `npm install`)

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');

// Unpacked extension IDs are derived from the absolute path
function extensionId(dir) {
  const hash = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32);
  return [...hash].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  await context.route('https://x.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE }));

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  async function load() {
    await page.goto('https://x.com/home');
    await page.waitForSelector('.be-btn-wrap');
  }

  test('adds buttons to every tweet', async () => {
    await load();
    assert.strictEqual(await page.locator('.be-btn-wrap').count(), 5);
  });

  test('re-adds buttons when React drops them', async () => {
    await page.evaluate(() => document.querySelector('.be-btn-wrap').remove());
    await page.waitForFunction(() => document.querySelectorAll('.be-btn-wrap').length === 5);
  });

  test('new tweets get buttons', async () => {
    await page.evaluate(() => addTweet({ user: 'late_bot', text: 'hi' }));
    await page.waitForSelector('article[data-user="late_bot"] .be-btn-wrap');
  });

  test('hides ads', async () => {
    assert.ok(await page.locator('article[data-user="advertiser"]').evaluate(e => e.classList.contains('be-ad')));
    assert.ok(!await page.locator('article[data-user="bot_one"]').evaluate(e => e.classList.contains('be-ad')));
  });

  const video = (user) => `article[data-user="${user}"] video`;
  const isPlaying = (sel) => page.$eval(sel, v => !v.paused);

  test('holds videos behind an overlay, despite autoplay retries', async () => {
    await page.waitForSelector('article[data-user="video_user"] [data-testid="videoPlayer"] > .be-video-overlay');
    await page.waitForTimeout(1000);
    assert.ok(!await isPlaying(video('video_user')));
  });

  test('overlay label sets its own font instead of inheriting the player', async () => {
    const font = await page.$eval('.be-video-text', el => getComputedStyle(el).fontFamily);
    assert.match(font, /^TwitterChirp, -apple-system/);
  });

  test('click to play starts muted, in sync with the player', async () => {
    assert.strictEqual(await page.evaluate(() => window.__xMuted), false);
    await page.click('article[data-user="video_user"] .be-video-overlay');
    await page.waitForFunction(sel => !document.querySelector(sel).paused, video('video_user'));
    assert.ok(await page.$eval(video('video_user'), v => v.muted));
    assert.strictEqual(await page.getAttribute('article[data-user="video_user"] .x-mute', 'aria-label'), 'Unmute');

    // One click on the player's own button unmutes
    await page.click('article[data-user="video_user"] .x-mute');
    assert.ok(!await page.$eval(video('video_user'), v => v.muted));
  });

  test('a revealed post stays revealed when X swaps the <video>', async () => {
    await page.evaluate(() => swapVideo('video_user'));
    await page.waitForFunction(sel => !document.querySelector(sel).paused, video('video_user'));
    await page.waitForTimeout(800);
    assert.ok(await isPlaying(video('video_user')));
    assert.strictEqual(await page.locator('article[data-user="video_user"] .be-video-overlay:not(.be-video-revealed)').count(), 0);
  });

  test('a <video> swapped in under a held overlay stays paused', async () => {
    await page.evaluate(() => swapVideo('video_two'));
    await page.waitForTimeout(1000);
    assert.ok(!await isPlaying(video('video_two')));
  });

  test('dislike targets the author, not the retweeter', async () => {
    await page.click('article[data-user="real_author"] .be-dislike-btn');
    await page.waitForSelector('article[data-user="real_author"].be-disliked');
    assert.strictEqual(
      await page.getAttribute('article[data-user="real_author"] .be-dislike-btn', 'aria-pressed'), 'true');
  });

  test('remove runs the report flow inside #layers only', async () => {
    await page.click('article[data-user="bot_one"] .be-btn');
    await page.waitForFunction(() => (window.__reported || []).includes('bot_one'), null, { timeout: 15000 });

    const clicks = await page.evaluate(() => window.__clicks);
    assert.ok(!clicks.some(c => c.startsWith('DECOY')), `clicked a timeline decoy: ${clicks}`);
    assert.strictEqual(await page.evaluate(() => window.__blocked), 'bot_one');
    assert.deepStrictEqual(clicks, [
      'caret bot_one', 'Report post',
      'SpamFake engagement, scams, fake accounts', 'Next',
      'Fake engagement', 'Next',
      'Block @bot_one', 'Block', 'Done'
    ]);

    await page.waitForFunction(() =>
      document.querySelector('article[data-user="bot_one"]').style.display === 'none');
  });

  test('nudge leaves no transform on <body>', async () => {
    const t = await page.evaluate(() => getComputedStyle(document.body).transform);
    assert.strictEqual(t, 'none');
  });

  test('concurrent removes are reported one at a time', async () => {
    await page.evaluate(() => { window.__clicks = []; window.__reported = []; });
    await page.click('article[data-user="advertiser"] .be-btn', { force: true });
    await page.click('article[data-user="late_bot"] .be-btn');
    await page.waitForFunction(() => window.__reported.length === 2, null, { timeout: 30000 });
    const carets = (await page.evaluate(() => window.__clicks)).filter(c => c.startsWith('caret'));
    assert.deepStrictEqual(carets, ['caret advertiser', 'caret late_bot']);
  });

  test('popup reflects state and pushes config to the page', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId(ROOT)}/popup.html`);
    await popup.waitForSelector('.dislike-tag');
    assert.strictEqual(await popup.textContent('#dislike-count'), '1');
    const stored = await popup.evaluate(() => chrome.storage.local.get('dislikedUsers'));
    assert.deepStrictEqual(stored.dislikedUsers, ['real_author']);
    assert.match(await popup.textContent('#version'), /^v\d+\.\d+\.\d+$/);

    // Turning ads off un-hides them in the open tab
    await page.reload();
    await page.waitForSelector('article[data-user="advertiser"].be-ad');
    await popup.click('#toggle-ads');
    assert.strictEqual(await popup.getAttribute('#toggle-ads', 'aria-checked'), 'false');
    await page.waitForSelector('article[data-user="advertiser"]:not(.be-ad)');

    // ...and back on
    await popup.click('#toggle-ads');
    await page.waitForSelector('article[data-user="advertiser"].be-ad');

    // Removing a disliked user clears the tweet's styling
    await popup.click('.dislike-tag button');
    await page.waitForSelector('article[data-user="real_author"]:not(.be-disliked)');
    assert.strictEqual(await popup.textContent('#dislike-count'), '0');
    await popup.close();
  });

  test('sidebar modules hide and show from the popup', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId(ROOT)}/popup.html`);
    await popup.waitForSelector('#toggle-live');
    const visible = (text) => page.getByRole('heading', { name: text }).isVisible();

    // Only "Live on X" has loaded so far
    await page.reload();
    await page.waitForSelector('.be-btn-wrap');
    await popup.click('#toggle-live');
    await page.waitForFunction(() => !document.querySelector('h2').checkVisibility());
    assert.ok(await page.locator('[data-testid="SearchBox_Search_Input"]').isVisible(), 'search box hidden');

    // Modules that load later must not get caught in the hidden box
    await page.evaluate(() => addSidebarModules());
    await page.waitForFunction(() => [...document.querySelectorAll('h2')].filter(h => h.checkVisibility()).length === 2);
    assert.ok(await visible('What’s happening'));
    assert.ok(await visible('Who to follow'));
    assert.ok(!await visible('Live on X'));

    await popup.click('#toggle-trends');
    await popup.click('#toggle-follow');
    await page.waitForFunction(() => ![...document.querySelectorAll('h2')].some(h => h.checkVisibility()));
    assert.ok(await page.locator('[data-testid="SearchBox_Search_Input"]').isVisible(), 'search box hidden');

    // All back on
    await popup.click('#toggle-live');
    await popup.click('#toggle-trends');
    await popup.click('#toggle-follow');
    await page.waitForFunction(() => [...document.querySelectorAll('h2')].every(h => h.checkVisibility()));
    await popup.close();
  });

  test('no page errors', async () => {
    assert.deepStrictEqual(errors, []);
  });

  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ok    ${name}`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${e.message.split('\n').join('\n        ')}`);
    }
  }

  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
