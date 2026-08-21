const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" };

function corsHeaders(origin, allowed) {
  return {
    "access-control-allow-origin": allowed ? origin : "null",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "accept",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function response(body, status, origin, allowed, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...corsHeaders(origin, allowed), ...extra } });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return { origin, allowed: Boolean(origin && list.includes(origin)) };
}

function parseDuration(value) {
  const match = String(value || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return 0;
  return Math.round((Number(match[1]) || 0) * 86400 + (Number(match[2]) || 0) * 3600 + (Number(match[3]) || 0) * 60 + (Number(match[4]) || 0));
}

export default {
  async fetch(request, env, context) {
    const access = allowedOrigin(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(access.origin, access.allowed) });
    if (!access.allowed) return response({ error: "Origin not allowed" }, 403, access.origin, false);
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/youtube-duration") return response({ error: "Not found" }, 404, access.origin, true);
    if (!env.YOUTUBE_API_KEY) return response({ error: "Service is not configured" }, 503, access.origin, true);
    const id = String(url.searchParams.get("id") || "");
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return response({ error: "Invalid video ID" }, 400, access.origin, true);

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/youtube-duration?id=${id}`, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(cached.body, { status: cached.status, headers: { ...Object.fromEntries(cached.headers), ...corsHeaders(access.origin, true) } });

    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    apiUrl.searchParams.set("part", "contentDetails,snippet");
    apiUrl.searchParams.set("id", id);
    apiUrl.searchParams.set("key", env.YOUTUBE_API_KEY);
    const youtube = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    const data = await youtube.json();
    if (!youtube.ok) return response({ error: "YouTube API request failed" }, youtube.status === 403 ? 429 : 502, access.origin, true);
    const video = data.items?.[0];
    if (!video) return response({ error: "Video not found or unavailable" }, 404, access.origin, true);
    const duration = parseDuration(video.contentDetails?.duration);
    if (!duration) return response({ error: "Live or unknown duration" }, 422, access.origin, true);

    const payload = {
      id, duration, isoDuration: video.contentDetails.duration,
      title: video.snippet?.title || "", artist: video.snippet?.channelTitle || "",
    };
    const result = response(payload, 200, access.origin, true, { "cache-control": "public, max-age=86400, s-maxage=2592000" });
    context.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  },
};
