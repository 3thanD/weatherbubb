# Screenshots

Referenced from the project README.

| File | Shows |
|---|---|
| `dashboard-beach.webp` | A full dashboard — merged three-stock ticker, weather, r/techsupport feed, quick links, to-do, timer, quote |
| `dashboard-forest.webp` | Merged stock bubble, to-do list, quick links, timer, quote |
| `sidebar.webp` | The menu open: settings, themes, layout controls |

## Format

WebP, resized to 1600px wide. GitHub renders README images at roughly 900px,
so 1600 is already 2x for high-DPI screens and anything larger is only bytes.

WebP rather than PNG, which is the opposite of the usual advice for UI
screenshots: these have photographic backgrounds, and PNG has to store that
losslessly. The same 1600px image came out 755 KB as PNG and 91 KB as WebP —
eight times smaller, with no visible difference in the panel text. If a shot
ever has a flat or gradient background instead, PNG may well win; check both.

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

Hard-refresh first. The first screenshot committed here was taken on a build
whose 7-day forecast icons were broken, so the repo's front page advertised
the bug for a few hours. Check the build stamp at the bottom of the menu
matches the latest commit before shooting.
