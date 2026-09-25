# Screenshots

| File | Shows |
|---|---|
| `dashboard.webp` | The hero image — merged three-stock ticker, weather, a subreddit feed, quick links, to-do, timer, quote |
| `settings-menu.webp` | The menu open: themes, gravity, float speed, zoom, backgrounds, layout controls |

## Naming

Name for **what the shot shows**, not what it looked like on the day.
`dashboard.webp` and `settings-menu.webp` stay accurate when the background
changes; `dashboard-beach.webp` stopped being true the moment the wallpaper
did, and a name that lies is worse than a dull one.

Lowercase, hyphenated, one idea per file. If you need variants later, qualify
by content rather than decoration: `dashboard-mobile.webp`,
`dashboard-merged-bubbles.webp`.

## Format

WebP, resized to 1600px wide. GitHub renders README images at roughly 900px,
so 1600 is already 2x for high-DPI screens and anything larger is only bytes.

WebP rather than PNG, which is the opposite of the usual advice for UI
screenshots: these have photographic backgrounds, and PNG has to store that
losslessly. The same 1600px image came out 755 KB as PNG and 91 KB as WebP —
eight times smaller, with no visible difference in the panel text. A shot with
a flat or gradient background may well go the other way; check both.

To add one:

```bash
python3 -c "
from PIL import Image
im = Image.open('your-screenshot.png')
w = 1600
im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(
    'docs/screenshots/name.webp', 'WEBP', quality=88, method=6)
"
```

## Before you take one

Hard-refresh and check the build stamp at the bottom of the menu matches the
latest commit. The first screenshot committed here was taken on a build whose
7-day forecast icons were broken, so the repo's front page advertised the bug
for a few hours. A stale tab looks entirely fine right up until the part that
changed.
