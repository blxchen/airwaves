const STORAGE_KEY = "airwaves-set-calculator-v1";

const state = {
  limitMinutes: 30,
  tracks: [],
};

const dom = {
  form: document.querySelector("#add-form"),
  links: document.querySelector("#youtube-links"),
  setlist: document.querySelector("#setlist"),
  empty: document.querySelector("#empty-state"),
  trackCount: document.querySelector("#track-count"),
  clear: document.querySelector("#clear-button"),
  demo: document.querySelector("#demo-button"),
  limit: document.querySelector("#limit-minutes"),
  limitDown: document.querySelector("#limit-down"),
  limitUp: document.querySelector("#limit-up"),
  total: document.querySelector("#total-time"),
  meterFill: document.querySelector("#meter-fill"),
  meterEnd: document.querySelector("#meter-end"),
  verdict: document.querySelector("#verdict"),
  verdictIcon: document.querySelector("#verdict-icon"),
  verdictLabel: document.querySelector("#verdict-label"),
  verdictTime: document.querySelector("#verdict-time"),
  verdictCopy: document.querySelector("#verdict-copy"),
  cutCard: document.querySelector("#cut-card"),
  cutTitle: document.querySelector("#cut-title"),
  cutArtist: document.querySelector("#cut-artist"),
  cutDuration: document.querySelector("#cut-duration"),
  cutResult: document.querySelector("#cut-result"),
  cutButton: document.querySelector("#cut-button"),
  copy: document.querySelector("#copy-button"),
  toast: document.querySelector("#toast"),
  youtubeReader: document.querySelector("#youtube-players"),
  youtubePlayerHost: document.querySelector("#youtube-player-host"),
  youtubeReaderStatus: document.querySelector("#youtube-reader-status"),
  youtubeReaderStart: document.querySelector("#youtube-reader-start"),
};

let dragId = null;
let cutCandidateId = null;
let toastTimer;
let saveTimer;
let youtubeReady = false;
const playerQueue = [];
let durationReaderBusy = false;
let activeDurationPlayer = null;
const animatedTrackIds = new Set();
let displayedTotal = 0;
let totalAnimationFrame;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(seconds, forceHours = false) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours || forceHours) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function extractVideoId(input) {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/")[1]?.slice(0, 11) || null;
    if (host.endsWith("youtube.com")) {
      if (url.searchParams.get("v")) return url.searchParams.get("v").slice(0, 11);
      const match = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
      return match?.[1] || null;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function extractLinks(value) {
  const tokens = value.match(/(?:https?:\/\/|www\.)[^\s,]+|(?:youtu\.be|youtube\.com)[^\s,]+|\b[\w-]{11}\b/g) || [];
  return [...new Set(tokens.map(extractVideoId).filter(Boolean))];
}

function splitMetadata(rawTitle, authorName = "") {
  let cleaned = rawTitle
    .replace(/\s*[\[(](official\s*)?(music\s*)?(video|audio|lyric(s)?|visuali[sz]er|live|hd|hq)[^\])]*[\])]/gi, "")
    .replace(/\s*\/\/\s*(official|audio|lyrics?).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(/\s+(?:-|–|—|\|)\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { artist: parts.shift().trim(), title: parts.join(" — ").trim() };
  }

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };

  return {
    title: cleaned || "Untitled track",
    artist: authorName.replace(/\s+-\s+Topic$/i, "").trim() || "Unknown artist",
  };
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, 120);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.tracks)) return;
    state.limitMinutes = Math.min(360, Math.max(1, Number(saved.limitMinutes) || 30));
    state.tracks = saved.tracks.map((track) => ({
      ...track,
      id: track.id || uid(),
      duration: Math.max(0, Number(track.duration) || 0),
      status: track.duration ? "ready" : "error",
    }));
  } catch (_) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2600);
}

function totalSeconds() {
  return state.tracks.reduce((sum, track) => sum + (Number(track.duration) || 0), 0);
}

function bestSingleCut(total, limit) {
  if (total <= limit || !state.tracks.length) return null;
  const overage = total - limit;
  const getsUnder = state.tracks.filter((track) => track.duration >= overage);
  const pool = getsUnder.length ? getsUnder : state.tracks;
  return [...pool].sort((a, b) => {
    const aDistance = Math.abs(total - a.duration - limit);
    const bDistance = Math.abs(total - b.duration - limit);
    return aDistance - bDistance || a.duration - b.duration;
  })[0];
}

function updateDashboard() {
  const total = totalSeconds();
  const limit = state.limitMinutes * 60;
  const difference = total - limit;
  const over = difference > 0;
  const exact = difference === 0 && state.tracks.length > 0;
  const displayMax = Math.max(limit, total, 1);
  const fillPercent = Math.min(100, (total / displayMax) * 100);
  const targetPercent = Math.min(100, (limit / displayMax) * 100);

  animateTotal(total);
  dom.meterFill.style.width = `${fillPercent}%`;
  dom.meterFill.style.background = over ? "var(--hot)" : "var(--acid)";
  document.querySelector("#meter-target").style.left = `calc(${targetPercent}% - 2px)`;
  dom.meterEnd.textContent = formatTime(displayMax, displayMax >= 3600);

  dom.verdict.className = `verdict ${over ? "over" : exact ? "exact" : "under"}`;
  dom.verdictIcon.textContent = over ? "!" : exact ? "=" : "✓";

  if (over) {
    dom.verdictLabel.textContent = "SET RUNS LONG";
    dom.verdictTime.textContent = `${formatTime(difference)} OVER`;
    dom.verdictCopy.textContent = "You’ll need a cut, a shorter intro, or a very forgiving stage manager.";
  } else if (exact) {
    dom.verdictLabel.textContent = "DEAD ON TIME";
    dom.verdictTime.textContent = "PERFECT FIT";
    dom.verdictCopy.textContent = "Exactly on the mark. Don’t add another cymbal crash.";
  } else {
    dom.verdictLabel.textContent = state.tracks.length ? "ROOM TO PLAY" : "READY TO BUILD";
    dom.verdictTime.textContent = `${formatTime(Math.abs(difference))} UNDER`;
    dom.verdictCopy.textContent = state.tracks.length
      ? "You’re under the limit. That’s it — the rest is yours."
      : "Add tracks to start building your set.";
  }

  const candidate = bestSingleCut(total, limit);
  cutCandidateId = candidate?.id || null;
  dom.cutCard.hidden = !candidate;
  if (candidate) {
    const afterCut = total - candidate.duration;
    const afterDifference = limit - afterCut;
    dom.cutTitle.textContent = candidate.title;
    dom.cutArtist.textContent = candidate.artist;
    dom.cutDuration.textContent = formatTime(candidate.duration);
    dom.cutResult.textContent = afterDifference >= 0
      ? `This is the closest one-song cut. You’ll finish ${formatTime(afterDifference)} under.`
      : `No single track gets you under. This cut leaves you ${formatTime(Math.abs(afterDifference))} over.`;
  }
}

function animateTotal(target) {
  cancelAnimationFrame(totalAnimationFrame);
  const start = displayedTotal;
  const change = target - start;
  const startedAt = performance.now();
  const duration = Math.min(650, Math.max(220, Math.abs(change) * 1.2));
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    displayedTotal = Math.round(start + change * eased);
    dom.total.textContent = formatTime(displayedTotal, target >= 3600);
    if (progress < 1) totalAnimationFrame = requestAnimationFrame(tick);
  };
  totalAnimationFrame = requestAnimationFrame(tick);
}

function render() {
  dom.limit.value = state.limitMinutes;
  document.querySelectorAll("[data-limit]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.limit) === state.limitMinutes);
  });

  dom.setlist.replaceChildren();
  state.tracks.forEach((track, index) => {
    const row = document.createElement("article");
    row.className = `track${animatedTrackIds.has(track.id) ? "" : " new-track"}`;
    row.style.animationDelay = `${Math.min(index * 45, 270)}ms`;
    row.dataset.id = track.id;
    row.draggable = true;
    row.innerHTML = `
      <button class="drag-handle" type="button" aria-label="Drag to reorder">⠿</button>
      <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
      <div class="track-copy">
        <strong class="track-title" contenteditable="true" role="textbox" aria-label="Track title" spellcheck="false"></strong>
        <span class="track-artist" contenteditable="true" role="textbox" aria-label="Artist name" spellcheck="false"></span>
      </div>
      <button class="track-time ${track.status === "loading" ? "loading" : ""}" type="button" title="Edit duration">${track.status === "loading" ? "00:00" : formatTime(track.duration)}</button>
      <button class="delete-track" type="button" aria-label="Remove ${escapeAttribute(track.title)}">×</button>
      ${track.status === "error" ? `<div class="track-error"><span>${escapeAttribute(track.error || "Couldn’t read this video automatically.")}</span><button type="button" class="retry-reader">RETRY READER</button>${track.url ? `<a href="${escapeAttribute(track.url)}" target="_blank" rel="noopener">OPEN VIDEO</a>` : ""}<button type="button" class="set-duration">SET DURATION</button></div>` : ""}
    `;
    row.querySelector(".track-title").textContent = track.title;
    row.querySelector(".track-artist").textContent = track.artist;
    dom.setlist.appendChild(row);
    animatedTrackIds.add(track.id);
  });

  const hasTracks = state.tracks.length > 0;
  dom.empty.hidden = hasTracks;
  dom.clear.hidden = !hasTracks;
  dom.copy.disabled = !hasTracks;
  dom.trackCount.textContent = `${state.tracks.length} ${state.tracks.length === 1 ? "TRACK" : "TRACKS"}`;
  updateDashboard();
  save();
}

function escapeAttribute(value) {
  return String(value || "").replace(/[&"<>]/g, (char) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" }[char]));
}

async function fetchMetadata(videoId) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoints = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { mode: "cors", credentials: "omit" });
      if (!response.ok) continue;
      const data = await response.json();
      if (data.title) return splitMetadata(data.title, data.author_name || "");
    } catch (_) {
      // Try the next public metadata provider.
    }
  }
  throw new Error("Metadata unavailable");
}

function parseIsoDuration(value) {
  const match = String(value || "").match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return 0;
  return Math.round((Number(match[1]) || 0) * 86400 + (Number(match[2]) || 0) * 3600 + (Number(match[3]) || 0) * 60 + (Number(match[4]) || 0));
}

async function fetchConfiguredDuration(videoId) {
  const endpoint = String(window.AIRWAVES_SITE?.youtubeDurationEndpoint || "").trim();
  if (!endpoint) return null;
  const url = new URL(endpoint, location.href);
  url.searchParams.set("id", videoId);
  const response = await fetch(url, { mode: "cors", credentials: "omit", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 429 ? "Duration service rate limit reached" : "Duration service unavailable");
  const data = await response.json();
  const duration = Number(data.duration) || parseIsoDuration(data.isoDuration || data.contentDetails?.duration);
  if (!duration) throw new Error("Duration service returned no duration");
  return { duration: Math.round(duration), title: data.title || "", author: data.artist || data.author || "" };
}

async function fetchDuration(videoId) {
  try {
    const serviceResult = await fetchConfiguredDuration(videoId);
    if (serviceResult) return serviceResult;
  } catch (error) {
    console.warn("Airwaves duration service failed; trying hosted player.", error);
  }
  if (!/^https?:$/.test(location.protocol)) {
    throw new Error("YouTube blocks duration reads from file pages. Open this site through HTTPS or localhost.");
  }
  return fetchPlayerDuration(videoId);
}

function fetchPlayerDuration(videoId) {
  return new Promise((resolve, reject) => {
    const task = { videoId, resolve, reject };
    playerQueue.push(task);
    loadYouTubeApi();
    pumpDurationQueue();
  });
}

function failDurationQueue(message) {
  const error = new Error(message);
  while (playerQueue.length) playerQueue.shift().reject(error);
}

function pumpDurationQueue() {
  if (durationReaderBusy || !youtubeReady || !window.YT?.Player) return;
  const task = playerQueue.shift();
  if (!task) return;
  durationReaderBusy = true;
  const complete = (method, value) => {
    durationReaderBusy = false;
    method(value);
    pumpDurationQueue();
  };
  createDurationPlayer({
    ...task,
    resolve: (value) => complete(task.resolve, value),
    reject: (error) => complete(task.reject, error),
  });
}

function createDurationPlayer({ videoId, resolve, reject }) {
  const host = document.createElement("iframe");
  host.id = `yt-${uid()}`;
  host.width = "324";
  host.height = "200";
  host.title = "YouTube duration reader";
  host.allow = "autoplay; encrypted-media; picture-in-picture";
  host.referrerPolicy = "strict-origin-when-cross-origin";
  host.setAttribute("frameborder", "0");
  const pageOrigin = location.origin;
  const embedParameters = new URLSearchParams({
    enablejsapi: "1", playsinline: "1", controls: "1", autoplay: "0", mute: "1", rel: "0",
    origin: pageOrigin, widget_referrer: location.href.split("#")[0],
  });
  host.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${embedParameters}`;
  dom.youtubePlayerHost.replaceChildren(host);
  dom.youtubeReader.hidden = false;
  dom.youtubeReaderStatus.textContent = "LOADING VIDEO…";
  dom.youtubeReaderStart.hidden = true;
  let settled = false;
  let player;
  let assistTimer;
  const timeout = setTimeout(() => finish(0, new Error("Duration timed out")), 35000);

  function finish(duration, error, title = "", author = "") {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    clearTimeout(assistTimer);
    activeDurationPlayer = null;
    try { player?.destroy(); } catch (_) {}
    dom.youtubePlayerHost.replaceChildren();
    dom.youtubeReaderStart.hidden = true;
    dom.youtubeReader.hidden = true;
    if (error || !duration) reject(error || new Error("Duration unavailable"));
    else resolve({ duration: Math.round(duration), title, author });
  }

  function readPlayerData(target, attempt = 0) {
    let duration = 0;
    let title = "";
    let author = "";
    try {
      duration = Number(target.getDuration()) || 0;
      const videoData = target.getVideoData?.() || {};
      title = videoData.title || "";
      author = videoData.author || "";
    } catch (_) {}
    if (duration > 0) {
      try { target.pauseVideo(); } catch (_) {}
      return finish(duration, null, title, author);
    }
    if (attempt < 120) setTimeout(() => readPlayerData(target, attempt + 1), 250);
    else finish(0, new Error("Duration unavailable"));
  }

  function requestPlayback(target, userInitiated = false) {
    try {
      target.mute();
      target.playVideo();
      dom.youtubeReaderStatus.textContent = userInitiated ? "READING DURATION…" : "AUTOMATIC READ…";
      dom.youtubeReaderStart.hidden = true;
      setTimeout(() => readPlayerData(target), 180);
    } catch (_) {
      showPlaybackAssist();
    }
  }

  function showPlaybackAssist() {
    if (settled) return;
    dom.youtubeReaderStatus.textContent = "TAP ONCE TO READ DURATION";
    dom.youtubeReaderStart.hidden = false;
  }

  player = new YT.Player(host, {
    events: {
      onReady(event) {
        activeDurationPlayer = event.target;
        try { event.target.cueVideoById(videoId); } catch (_) {}
        readPlayerData(event.target);
        assistTimer = setTimeout(() => {
          let duration = 0;
          try { duration = Number(event.target.getDuration()) || 0; } catch (_) {}
          if (!duration) requestPlayback(event.target);
        }, 2500);
      },
      onStateChange(event) { readPlayerData(event.target); },
      onAutoplayBlocked() { showPlaybackAssist(); },
      onError(event) {
        const messages = { 2: "Invalid video ID", 5: "HTML5 playback failed", 100: "Video is private or removed", 101: "Embedding disabled", 150: "Embedding disabled", 153: "YouTube rejected the browser referrer. Configure the secure duration service or try Chrome over HTTPS." };
        finish(0, new Error(messages[event.data] || "Video unavailable"));
      },
    },
  });
}

function markYouTubeReady() {
  youtubeReady = true;
  pumpDurationQueue();
}

const previousYouTubeReady = window.onYouTubeIframeAPIReady;
window.onYouTubeIframeAPIReady = () => {
  try {
    if (typeof previousYouTubeReady === "function") previousYouTubeReady();
  } finally {
    markYouTubeReady();
  }
};
function loadYouTubeApi() {
  if (window.YT?.Player) return markYouTubeReady();
  const existing = document.querySelector('script[data-youtube-reader]');
  if (existing) return;
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  script.dataset.youtubeReader = "true";
  let readinessCheck;
  script.onerror = () => {
    clearInterval(readinessCheck);
    script.remove();
    failDurationQueue("YouTube reader blocked by browser privacy settings");
    toast("YOUTUBE READER BLOCKED — CHECK PRIVACY SETTINGS");
  };
  document.head.appendChild(script);
  let checks = 0;
  readinessCheck = setInterval(() => {
    checks += 1;
    if (window.YT?.Player) {
      clearInterval(readinessCheck);
      markYouTubeReady();
    } else if (checks >= 60) {
      clearInterval(readinessCheck);
      script.remove();
      failDurationQueue("YouTube player API did not load");
      toast("YOUTUBE READER DID NOT LOAD — RETRY OR CHECK CONTENT BLOCKERS");
    }
  }, 250);
}

dom.youtubeReaderStart.addEventListener("click", () => {
  if (!activeDurationPlayer) return;
  try {
    activeDurationPlayer.mute();
    activeDurationPlayer.playVideo();
    dom.youtubeReaderStatus.textContent = "READING DURATION…";
    dom.youtubeReaderStart.hidden = true;
  } catch (_) {
    toast("YOUTUBE COULD NOT START THIS VIDEO");
  }
});

async function hydrateTrack(track) {
  const [metadataResult, durationResult] = await Promise.allSettled([
    fetchMetadata(track.videoId),
    fetchDuration(track.videoId),
  ]);

  const current = state.tracks.find((item) => item.id === track.id);
  if (!current) return;

  if (metadataResult.status === "fulfilled") Object.assign(current, metadataResult.value);
  if (durationResult.status === "fulfilled") {
    current.duration = durationResult.value.duration;
    current.error = "";
    if (metadataResult.status === "rejected" && durationResult.value.title) {
      Object.assign(current, splitMetadata(durationResult.value.title, durationResult.value.author));
    }
  } else current.error = durationResult.reason?.message || "Couldn’t read this video automatically.";
  current.status = current.duration ? "ready" : "error";
  render();
}

function addVideoIds(videoIds) {
  const existing = new Set(state.tracks.map((track) => track.videoId));
  const fresh = videoIds.filter((id) => !existing.has(id));
  if (!fresh.length) {
    toast("NO NEW YOUTUBE LINKS FOUND");
    return;
  }

  const additions = fresh.map((videoId) => ({
    id: uid(),
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: "Loading track…",
    artist: "Reading YouTube metadata",
    duration: 0,
    status: "loading",
    error: "",
  }));
  state.tracks.push(...additions);
  render();
  additions.forEach(hydrateTrack);
  toast(`${additions.length} ${additions.length === 1 ? "TRACK" : "TRACKS"} ADDED`);
}

function setLimit(value) {
  state.limitMinutes = Math.min(360, Math.max(1, Math.round(Number(value) || 30)));
  render();
}

function removeTrack(id) {
  const row = dom.setlist.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const finish = () => {
    state.tracks = state.tracks.filter((track) => track.id !== id);
    animatedTrackIds.delete(id);
    render();
  };
  if (!row) return finish();
  if (row.classList.contains("leaving")) return;
  row.classList.add("leaving");
  setTimeout(finish, 210);
}

function promptDuration(track) {
  const current = track.duration ? formatTime(track.duration) : "3:30";
  const value = window.prompt("Enter duration as M:SS or seconds", current);
  if (value == null) return;
  const parts = value.trim().split(":").map(Number);
  let seconds;
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  else seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    toast("USE M:SS — FOR EXAMPLE, 3:42");
    return;
  }
  track.duration = Math.round(seconds);
  track.status = "ready";
  render();
}

dom.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const ids = extractLinks(dom.links.value);
  if (!ids.length) {
    dom.form.classList.remove("shake");
    void dom.form.offsetWidth;
    dom.form.classList.add("shake");
    toast("THAT DOESN’T LOOK LIKE A YOUTUBE LINK");
    return;
  }
  addVideoIds(ids);
  dom.links.value = "";
});

dom.links.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") dom.form.requestSubmit();
});

dom.limit.addEventListener("change", () => setLimit(dom.limit.value));
dom.limitDown.addEventListener("click", () => setLimit(state.limitMinutes - 5));
dom.limitUp.addEventListener("click", () => setLimit(state.limitMinutes + 5));
document.querySelectorAll("[data-limit]").forEach((button) => {
  button.addEventListener("click", () => setLimit(button.dataset.limit));
});

dom.demo.addEventListener("click", () => {
  const demos = [
    { title: "Neon Weather", artist: "Airwaves", duration: 244 },
    { title: "Say It Back", artist: "Airwaves", duration: 196 },
    { title: "Dead Frequency", artist: "Airwaves", duration: 231 },
    { title: "Runaway Signal", artist: "Airwaves", duration: 268 },
    { title: "Last One Out", artist: "Airwaves", duration: 218 },
  ].map((track) => ({ ...track, id: uid(), videoId: "", url: "", status: "ready" }));
  state.tracks.push(...demos);
  render();
  toast("DEMO SET LOADED — EVERYTHING IS EDITABLE");
});

dom.clear.addEventListener("click", () => {
  if (!window.confirm("Clear the whole setlist?")) return;
  state.tracks = [];
  render();
  toast("SETLIST CLEARED");
});

dom.setlist.addEventListener("click", (event) => {
  const row = event.target.closest(".track");
  if (!row) return;
  const track = state.tracks.find((item) => item.id === row.dataset.id);
  if (!track) return;
  if (event.target.closest(".delete-track")) removeTrack(track.id);
  if (event.target.closest(".retry-reader")) {
    track.status = "loading";
    track.duration = 0;
    track.error = "";
    render();
    hydrateTrack(track);
  }
  if (event.target.closest(".track-time") || event.target.closest(".set-duration")) promptDuration(track);
});

dom.setlist.addEventListener("focusout", (event) => {
  const row = event.target.closest(".track");
  if (!row || !event.target.matches("[contenteditable]")) return;
  const track = state.tracks.find((item) => item.id === row.dataset.id);
  const value = event.target.textContent.replace(/\s+/g, " ").trim();
  if (event.target.classList.contains("track-title")) track.title = value || "Untitled track";
  else track.artist = value || "Unknown artist";
  render();
});

dom.setlist.addEventListener("keydown", (event) => {
  if (event.target.matches("[contenteditable]") && event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
  }
});

dom.setlist.addEventListener("dragstart", (event) => {
  const row = event.target.closest(".track");
  if (!row || !event.target.closest(".drag-handle")) {
    event.preventDefault();
    return;
  }
  dragId = row.dataset.id;
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

dom.setlist.addEventListener("dragover", (event) => {
  const row = event.target.closest(".track");
  if (!row || row.dataset.id === dragId) return;
  event.preventDefault();
  dom.setlist.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
  row.classList.add("drag-over");
});

dom.setlist.addEventListener("drop", (event) => {
  const row = event.target.closest(".track");
  if (!row || !dragId || row.dataset.id === dragId) return;
  event.preventDefault();
  const from = state.tracks.findIndex((track) => track.id === dragId);
  const to = state.tracks.findIndex((track) => track.id === row.dataset.id);
  const [moved] = state.tracks.splice(from, 1);
  state.tracks.splice(to, 0, moved);
  render();
});

dom.setlist.addEventListener("dragend", () => {
  dragId = null;
  dom.setlist.querySelectorAll(".dragging, .drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
});

dom.cutButton.addEventListener("click", () => {
  if (!cutCandidateId) return;
  const candidate = state.tracks.find((track) => track.id === cutCandidateId);
  removeTrack(cutCandidateId);
  toast(`${candidate.title.toUpperCase()} CUT FROM THE SET`);
});

dom.copy.addEventListener("click", async () => {
  const total = totalSeconds();
  const limit = state.limitMinutes * 60;
  const lines = [
    "AIRWAVES — SETLIST",
    ...state.tracks.map((track, index) => `${index + 1}. ${track.artist} — ${track.title} (${formatTime(track.duration)})`),
    "",
    `TOTAL: ${formatTime(total)} / ${formatTime(limit)} limit`,
    total > limit ? `${formatTime(total - limit)} over` : `${formatTime(limit - total)} under`,
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    toast("SET SUMMARY COPIED");
  } catch (_) {
    toast("COPY FAILED — TRY AGAIN");
  }
});

load();
render();
