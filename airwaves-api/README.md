# Airwaves duration service

This optional Cloudflare Worker avoids YouTube iframe error 153 by reading duration through the official YouTube Data API. The API key is a Worker secret and never enters the GitHub Pages repository or browser.

1. Create a YouTube Data API v3 key in Google Cloud and restrict it to that API.
2. Install Wrangler and authenticate with Cloudflare.
3. From this directory, run `wrangler secret put YOUTUBE_API_KEY` and paste the key.
4. Adjust `ALLOWED_ORIGINS` in `wrangler.toml` to the exact deployed site origins.
5. Run `wrangler deploy`.
6. Put the resulting `/youtube-duration` URL in `youtubeDurationEndpoint` inside `site.config.js`.

Do not commit the API key. The Worker validates video IDs, restricts browser origins, caches successful results, and exposes only duration/title/channel data. Configure Cloudflare rate limiting for the `/youtube-duration` route before public launch.
