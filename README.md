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

## Development

```sh
npm install npm install      # Playwright, for testsnpm install      # Playwright, for tests npx playwright install chromium
npm test         # loads the extension into Chromium against a mock X page
npm run icons    # regenerate assets/icon*.png
```

---

v2.2
