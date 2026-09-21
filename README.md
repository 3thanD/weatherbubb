# WeatherBubb

**[weatherbubb.com](https://3thand.github.io/weatherbubb/) — reinventing the homepage.**

A dashboard made of floating glass bubbles. Each one does a thing — weather,
stocks, crypto, news, a subreddit, a clock, a calculator, a to-do list — and
they drift around a physics canvas you can shove, resize, lock, merge and
rearrange.

It is a single HTML file plus one small Cloudflare Worker. No build step, no
framework, no database, no accounts, no tracking.

---

## Try it

Open the site. You get a starter dashboard immediately; everything after that
is yours to change from the hamburger menu.

Nothing is uploaded anywhere. Your layout lives in your browser's
`localStorage` and goes nowhere else unless you deliberately copy a sync code
out of it.

---

## Bubbles

| Bubble | What it does | Where the data comes from |
|---|---|---|
| **Weather** | Current conditions + 7-day forecast for a ZIP code | Open-Meteo (keyless) |
| **Stock** | Any ticker — `NVDA`, `BRK.B`, `SPY` | Yahoo Finance, via relay |
| **Crypto** | Any coin by name — `bitcoin`, `cardano` | CoinGecko (keyless) |
| **News** | Headlines by topic | Google News RSS, via relay |
| **Reddit** | Last 10 posts of any subreddit | `reddit.com/r/<sub>/.rss`, via relay |
| **RSS Feed** | Any RSS or Atom feed | The feed itself, direct or via relay |
| **Web Search** | Google / DuckDuckGo / Bing, plus site searches | Nothing — goes straight to the engine |
| **Sports** | Live and recent scores, 8 leagues | ESPN's public scoreboard |
| **Currency** | Exchange rates | Frankfurter (ECB rates, keyless) |
| **On This Day** | Historical events for today's date | Wikipedia (keyless) |
| **Commute** | Saved route, opens live directions | Links out to Maps |
| **Quick Links** | Your own list of links, drag to reorder | You |
| **YouTube** | Plays a pasted video or playlist | youtube-nocookie.com |
| **Quote / Joke** | Quote of the day, jokes by category | ZenQuotes, JokeAPI |
| **Clocks** | Digital, analog, world clock | Your device |
| **Timer / Countdown** | Counts down to or from | Your device |
| **Note / To-do / Calculator / Image** | Local tools | You |

### Things the bubbles do

- **Merge** — drag the two-circles handle from one bubble onto another and
  they combine into one bubble with a row per member. Three tickers become
  three lines. The ⤢ on each row splits it back out.
- **Resize** — drag the bottom-right corner. Size is saved.
- **Lock** — hold a bubble still. Unchecked, it floats.
- **Gust** — drag across empty canvas to shove every unlocked bubble. Strength
  scales with how far you drag.
- **Sleep** — dim and freeze a bubble without closing it.

---

## Sync between computers

Browser sync doesn't carry `localStorage`. Chrome and Firefox sync bookmarks,
passwords and tabs, but site storage is treated as per-device cache and never
crosses machines. So moving a dashboard has to be explicit.

**Layout → Sync to Another Computer** generates a code containing the whole
dashboard — bubbles, positions, sizes, theme, background. Paste it into the
same box on the other machine and press Load. A seven-bubble dashboard is
about 410 characters.

The code *is* the configuration. There is no server, no account and no stored
credential; nothing leaves your machine unless you paste it somewhere.

---

## The relay (Cloudflare Worker)

Some sources — Yahoo Finance, Google News, ZenQuotes, Reddit — send no CORS
headers, so a static page cannot read them however well-formed the request is.
The worker in [`worker/`](worker/) is a narrow relay that fetches those on the
page's behalf.

It was written after every free public CORS proxy the app relied on failed:
corsproxy.io started returning 401 on everything, codetabs burned its full
timeout without ever succeeding, thingproxy's domain stopped resolving, and
allorigins went to timing out on 100% of requests.

**It holds no keys.** None of the upstream APIs need one, so there is nothing
secret in the worker or in its URL.

Two paths, fenced differently:

- **Allowlisted path** — will only ever fetch four named hosts. Every one is a
  public API anyone could already call directly, so the worker is worth
  nothing to someone who finds the URL.
- **`/feed` path** — for RSS bubbles, which can point anywhere. https and
  default port only; no IP literals, so `169.254.169.254`, `127.0.0.1` and
  `192.168.x` can't be named; no bare or `.local`/`.internal` hostnames; and
  the response must parse as RSS/Atom or it is discarded unread. Set
  `FEED_MODE_ENABLED = false` to turn it off.

Both: GET only, no cookies or auth forwarded upstream, 2 MB cap, 10s timeout,
origin-checked, 60s edge cache. `/health` reports which build is deployed.

38 unit tests cover the refusals — arbitrary hosts, cloud metadata IPs,
localhost, subdomain lookalikes like `zenquotes.io.evil.com`, non-TLS, POST,
credential hygiene — each asserting **zero upstream calls**.

Deploy notes: [`worker/README.md`](worker/README.md).

---

## Running it yourself

```
git clone https://github.com/3thanD/weatherbubb
cd weatherbubb
python3 -m http.server 8000
```

Then open `http://localhost:8000`. That's the whole setup — `index.html` has
no build step and no dependencies beyond two CDN scripts (Matter.js and
Tailwind).

Relay-backed bubbles need a worker. Deploy `worker/weatherbubb-proxy.js`
(instructions in `worker/README.md`), add your origin to `ALLOWED_ORIGINS`,
then paste the URL into **Debug → Data relay URL** and press **Test relay**.
No redeploy of the site required.

---

## When something breaks

The sidebar has a **Debug** section with a live log — every fetch, which relay
served it, how long it took, and every error. It is local to your browser and
never sent anywhere; the Copy button puts it on your clipboard.

**Test relay** distinguishes the failure modes that all look identical from
inside a `fetch()`: nothing deployed, something else deployed, the relay
refusing your origin, or a healthy relay.

The build stamp at the bottom of the menu and the `[Build]` log line tell you
whether you're looking at a cached copy — `index.html` has no hashed filename,
so a stale cache otherwise looks exactly like a change that never shipped.

---

## Architecture

```
index.html                     the entire app — markup, styles, logic
build.txt                      deployed build id, compared at runtime
wrangler.toml                  deploys the worker from this repo
worker/weatherbubb-proxy.js    the relay
worker/README.md               deploy + troubleshooting
.github/workflows/deploy.yml   publishes to GitHub Pages on push to main
```

**Physics.** [Matter.js](https://brm.io/matter-js/). Each bubble is a DOM
element mirrored by a rectangle body; a render loop copies body positions onto
`transform` every frame. A one-second sweep recovers any body that has escaped
the walls, because a large resize next to an edge, or a hard collision, can
eject one otherwise.

**Rendering.** Each bubble type has a `build…Bubble` function. Merged bubbles
call those same builders per member, so a merged row can't drift away from its
standalone version and every type is mergeable for free.

**Storage.** One `localStorage` key holds an array of bubble descriptors
(type, position, size, and whatever that type needs). Positions are synced
from the physics bodies on save and on `pagehide`.

---

## Notes on privacy and security

- **No keys anywhere.** Every source is keyless. Every push is scanned for
  credential patterns before it goes out.
- **Nothing is collected.** No analytics, no telemetry, no cookies set by this
  app. The debug log stays in your tab.
- **Searches don't touch this app.** The search bubble builds a URL and opens
  it; your query never reaches this site or the worker.
- **Favicons** in Quick Links load from each site's own origin, not a favicon
  service, so opening the dashboard doesn't announce your link list to a third
  party.
- **User text is escaped** before rendering. This matters more than it looks:
  sync codes are meant to be passed between people, so text typed on one
  dashboard can end up rendered on another's.
- **Links open** with `rel="noopener noreferrer"`.
- **The relay forwards no credentials** and reaches only what's described
  above.

---

## Known limits

Stated plainly, because each is a platform constraint rather than a to-do:

- **YouTube can't be browsed signed in.** `youtube.com` sends
  `X-Frame-Options: SAMEORIGIN` and refuses to load in a frame at all. The
  bubble plays pasted links instead.
- **Commute shows no travel time.** Every routing API with live traffic needs
  a paid key, and a static page can't hold one safely. It links out to Maps.
- **Reddit blocks relays.** Its `.json` endpoints refuse datacenter IPs, which
  is why the bubble reads RSS. If Reddit tightens that too, it will stop
  working and say so.
- **Fuel prices** have no free keyless source, so the currency bubble covers
  only exchange rates.

---

## Contributing

Issues and pull requests welcome. If you're reporting a bug, the Debug log is
worth more than a screenshot — it has the exact error, the timings and which
relay served what.

---

Built with [Claude Code](https://claude.com/claude-code).
