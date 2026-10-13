# Bot Exploder

Minimal bot removal for Twitter/X.

## Design

Utilitarian. Black and white. Controlled.

- White, brown, or pink noise
- Small dots, lines, or rings
- Subtle screen nudge
- Quiet by default

## Use

Two buttons are added to every post's action bar:

| Button | Does |
|--------|------|
| ◎ Remove | Plays the effect, reports the post as spam, optionally blocks the author, and hides it |
| ↓ Dislike | Dims every post by that user. Hover to see the post. Manage the list from the popup |

Feed cleanup, both on by default and switchable from the popup:

- **Hide ads**: blurs promoted posts
- **Hold videos**: stops autoplay. Click to play

Videos always start muted, even if X remembers that you unmuted the last one.

Sidebar, all off by default:

- **Hide Live on X**: Spaces and livestreams
- **Hide What's happening**: trends and news
- **Hide Who to follow**: account suggestions

## Parameters

| Setting | Range | Default |
|---------|-------|---------|
| Duration | 20-500ms | 120ms |
| Volume | 0-100 | 30 |
| Particles | 4-48 | 16 |
| Spread | 20-200px | 60px |
| Nudge | 0-8px | 2px |

The nudge and particle animations are skipped when the OS asks for reduced motion.

## Install

1. `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select this folder

## Notes

- Auto-report drives X's own report dialog by matching its English labels.
  With X set to another language, or after X changes the flow, it stops partway
  and leaves the dialog open so you can finish it yourself. Details are logged
  to the console.
- Settings sync across your Chrome profile. The disliked list is stored on this
  device only.

## Performance

No background process: the extension only runs while an X tab is open.
In `npm run perf` (60 posts, one recycled every frame for 5s) it adds about
120 ms of JavaScript and roughly 1 MB of memory, and the memory stays flat
over time. Only posts that changed get re-checked.

## Development

```sh
npm install npm install      # Playwright, for testsnpm install      # Playwright, for tests npx playwright install chromium
npm test         # loads the extension into Chromium against a mock X page
npm run perf     # cost on a busy page, with vs without the extension
npm run icons    # regenerate assets/icon*.png
```

---

v2.3.1
