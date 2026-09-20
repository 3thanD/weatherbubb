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
5. Sanity check it in a browser tab — you should get
   `{"error":"Origin not allowed."}`. **That's the correct response**: it
   means the origin check is working, since a plain tab sends no Origin
   header. It'll work from weatherbubb.com itself.
6. Send that URL over and it gets wired into the app (one line —
   `CUSTOM_PROXY_URL` at the top of the script in `index.html`).

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

There are no API keys or secrets in the worker — none of these APIs need
one, so there's nothing sensitive to leak.

## Adding another API later

Add the hostname to `ALLOWED_TARGET_HOSTS` in `weatherbubb-proxy.js` and
redeploy. Keep that list as short as the app actually needs — it's the
control doing the real work here.
