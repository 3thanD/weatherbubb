# WeatherBubb CORS proxy (Cloudflare Worker)

Stock, quote and news bubbles need APIs that don't send CORS headers, so a
static site can't call them directly. This worker is the relay that makes
them work. It replaces the free public CORS proxies the app used to depend
on, all of which eventually failed (auth walls, permanent timeouts, dead
domains).

Free tier covers 100,000 requests/day. With the 60-second edge cache in
`weatherbubb-proxy.js`, normal use is nowhere near that.

## Deploy it (about 10 minutes, no command line needed)

1. Sign up at **https://dash.cloudflare.com/sign-up** (free — you do *not*
   need to move your domain to Cloudflare for this).
2. In the dashboard sidebar: **Compute (Workers) → Workers & Pages →
   Create → Start with Hello World → Deploy**. Name it something like
   `weatherbubb-proxy`. (Deploy the placeholder first; you replace the code
   in the next step.)
3. Open the worker → **Edit code**. Delete the placeholder, paste the
   entire contents of `weatherbubb-proxy.js`, then **Deploy**.
4. Your URL will look like:
   `https://weatherbubb-proxy.<your-subdomain>.workers.dev`
5. Sanity check it by opening **`<your worker URL>/health`** in a browser
   tab. You should get a JSON blob with `"worker": "weatherbubb-proxy"`
   plus the origin it saw and both allowlists. That confirms *this* code
   is the code actually deployed — if you instead see `Hello World!`, the
   placeholder from step 2 is still live and the paste in step 3 didn't
   take.
6. Opening the worker's **root** URL in a plain tab gives
   `{"error":"Origin not allowed: (none sent)"}`. **That's also correct**
   — a plain tab sends no Origin header. It works from the site itself.
7. Send that URL over and it gets wired into the app (one line —
   `CUSTOM_PROXY_URL` at the top of the script in `index.html`).

## If Cloudflare's dashboard fights you: Deno Deploy instead

Cloudflare's newer "create a Worker" flows can produce a project that
serves **static assets** rather than running your script. The signature is
unmistakable and worth recognising, because every symptom points away
from the real cause:

- the worker URL's root returns an HTML page, so the browser rejects it
  for having no CORS headers and reports a bare `Failed to fetch`
- `/health` (or any other path) returns a **404 page**

A tab navigation isn't subject to CORS, so anything the script returned
would be *displayed* in the tab. A 404 page there proves the script never
ran. Check **Edit code**: if there's a `public/` or `assets/` folder
beside the script, that's the cause. Delete the folder and redeploy, or
recreate the Worker choosing **Worker only** rather than Worker + Assets.

If that's more fight than it's worth, `weatherbubb-proxy.js` runs
unmodified on Deno Deploy, which has no assets layer to get in the way:

1. Go to **https://dash.deno.com** and sign in with GitHub.
2. **New Playground**.
3. Delete the sample, paste the entire contents of
   `weatherbubb-proxy.js`, and **Save & Deploy**.
4. The URL shown is your relay, e.g.
   `https://<name>.deno.dev`.
5. Open `<that URL>/health` in a tab. JSON naming
   `"worker": "weatherbubb-proxy"` means it's live.
6. Paste the URL into the app: sidebar → **Debug** → **Data relay URL** →
   **Test relay**. No site redeploy needed.

The one Cloudflare-specific line is the `cf: { cacheTtl }` fetch option,
and other runtimes ignore an unrecognised property. Losing it costs the
60-second edge cache and nothing else. Add the new origin to
`ALLOWED_ORIGINS` the same way regardless of where it runs.

## If the bubbles still don't load

Open the in-app debug panel. Every relay refusal now reports its own
reason, e.g.:

    [Quote] worker: failed after 5ms -- HTTP 403 -- {"error":"Origin not allowed: https://example.com"}

and the startup line reports the origin the browser is actually sending:

    [Env] origin: https://3thand.github.io | page: /weatherbubb/ | relay: https://...workers.dev

If the origin in that line isn't in `ALLOWED_ORIGINS`, add it and
redeploy — that's the whole fix.

A bare `Failed to fetch` with no status means the response carried no CORS
headers at all, which this worker never does. That points at something
other than this code answering: the Hello World placeholder, a worker
that threw before returning (check the Cloudflare dashboard's Logs tab),
or the request never arriving.

## What it will and won't do

It will only ever fetch these hosts:

- `query1.finance.yahoo.com`, `query2.finance.yahoo.com` — stock quotes
- `zenquotes.io` — quote of the day
- `news.google.com` — news RSS

Anything else gets a 403. That allowlist is the main safeguard: every host
it can reach is a public API that anyone could already call directly, so
the worker isn't worth abusing even if someone finds the URL. It also only
accepts GET, only accepts requests from a WeatherBubb origin, forwards no
cookies or auth headers upstream, caps response size at 2 MB, and times out
after 10 seconds.

Refusals are returned *with* CORS headers so the browser can read them.
That's deliberate and costs nothing: the request is still refused and no
upstream call is made, but the caller learns which rule it tripped instead
of getting an unexplained network error. `/health` is read-only and makes
no upstream call either, even if you hand it a `?url=`.

There are no API keys or secrets in the worker — none of these APIs need
one, so there's nothing sensitive to leak.

## Adding another API later

Add the hostname to `ALLOWED_TARGET_HOSTS` in `weatherbubb-proxy.js` and
redeploy. Keep that list as short as the app actually needs — it's the
control doing the real work here.
