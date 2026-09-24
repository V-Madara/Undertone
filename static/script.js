// Undertone — frontend logic for the BiGRU emotion API

const EMOTIONS = [
  { key: "joy", emoji: "😄", color: "var(--joy)" },
  { key: "love", emoji: "❤️", color: "var(--love)" },
  { key: "surprise", emoji: "😲", color: "var(--surprise)" },
  { key: "sadness", emoji: "😢", color: "var(--sadness)" },
  { key: "fear", emoji: "😨", color: "var(--fear)" },
  { key: "anger", emoji: "😠", color: "var(--anger)" },
];

const form = document.getElementById("predictForm");
const textInput = document.getElementById("textInput");
const charCount = document.getElementById("charCount");
const analyzeBtn = document.getElementById("analyzeBtn");
const pulseWrap = document.getElementById("pulseWrap");
const errorMsg = document.getElementById("errorMsg");

const resultsSection = document.getElementById("results");
const callout = document.getElementById("callout");
const emojiBadge = document.getElementById("emojiBadge");
const calloutEmoji = document.getElementById("calloutEmoji");
const calloutName = document.getElementById("calloutName");
const calloutConfidence = document.getElementById("calloutConfidence");
const spectrum = document.getElementById("spectrum");

let confidenceRAF = null;

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const glow = document.querySelector(".glow");

// ---- build the six spectrum bands once ----

const bandEls = {};

EMOTIONS.forEach(({ key, emoji, color }) => {
  const band = document.createElement("div");
  band.className = "band";
  band.style.setProperty("--band-color", color);

  band.innerHTML = `
    <div class="band-track">
      <div class="band-fill" style="background:${color}"></div>
    </div>
    <div class="band-label">${emoji}</div>
    <div class="band-name">${key}</div>
    <div class="band-pct">0%</div>
  `;

  spectrum.appendChild(band);
  bandEls[key] = {
    root: band,
    fill: band.querySelector(".band-fill"),
    pct: band.querySelector(".band-pct"),
  };
});

// ---- character counter ----

textInput.addEventListener("input", () => {
  charCount.textContent = `${textInput.value.length} / 2000`;
});

// ---- keyboard shortcut: Cmd/Ctrl + Enter submits ----

textInput.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    form.requestSubmit();
  }
});

// ---- health check, polls while the model is still loading ----

async function checkHealth() {
  try {
    const res = await fetch("/health");
    const data = await res.json();
    if (data.model_loaded) {
      statusDot.classList.remove("waking");
      statusDot.classList.add("ready");
      statusText.textContent = "Model ready";
      return true;
    }
    statusDot.classList.add("waking");
    statusText.textContent = "Waking up…";
    return false;
  } catch {
    statusText.textContent = "Can't reach server";
    return false;
  }
}

(async function pollHealth() {
  const ready = await checkHealth();
  if (!ready) setTimeout(pollHealth, 4000);
})();

// ---- submit handler ----

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;

  setLoading(true);
  hideError();

  try {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body.detail || "The model's still waking up. Try again in a few seconds."
      );
    }

    const data = await res.json();
    renderResult(data);
  } catch (err) {
    showError(err.message || "Something went wrong. Try again.");
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  analyzeBtn.disabled = isLoading;
  analyzeBtn.querySelector(".btn-label").textContent = isLoading
    ? "Reading…"
    : "Analyze";
  pulseWrap.classList.toggle("active", isLoading);
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.hidden = false;
}

function hideError() {
  errorMsg.hidden = true;
}

function renderResult(data) {
  resultsSection.hidden = false;

  const dominant = data.predicted_emotion;
  const dominantMeta = EMOTIONS.find((e) => e.key === dominant) || EMOTIONS[0];
  const dominantPct = Math.round(data.confidence * 100);

  calloutEmoji.textContent = dominantMeta.emoji;
  calloutName.textContent = dominant;
  callout.style.setProperty("--band-color", dominantMeta.color);
  emojiBadge.style.setProperty("--band-color", dominantMeta.color);

  glow.style.background = `radial-gradient(closest-side, color-mix(in srgb, ${dominantMeta.color} 20%, transparent), transparent 70%)`;

  // restart the emoji-pop / ring-pulse animations even on repeat predictions
  callout.classList.remove("show");
  calloutEmoji.classList.remove("pop");
  emojiBadge.classList.remove("ping");
  void callout.offsetWidth; // force reflow so the animations replay

  callout.classList.add("show");
  calloutEmoji.classList.add("pop");
  emojiBadge.classList.add("ping");

  animateConfidence(dominantPct);

  EMOTIONS.forEach(({ key }, i) => {
    const prob = data.all_probabilites[key] ?? 0;
    const pct = Math.max(4, Math.round(prob * 100)); // keep a sliver visible at 0%
    const el = bandEls[key];

    // stagger the rise so the spectrum reads as one cascading motion
    el.fill.style.transitionDelay = `${i * 70}ms`;
    el.fill.style.height = `${pct}%`;
    el.pct.textContent = `${Math.round(prob * 100)}%`;
    el.root.classList.toggle("dominant", key === dominant);
  });

  resultsSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function animateConfidence(target) {
  if (confidenceRAF) cancelAnimationFrame(confidenceRAF);

  const duration = 700;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);
    // ease-out cubic, so it starts fast and settles gently on the number
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(eased * target);

    calloutConfidence.textContent = `${value}% confidence`;

    if (t < 1) {
      confidenceRAF = requestAnimationFrame(tick);
    } else {
      confidenceRAF = null;
    }
  }

  confidenceRAF = requestAnimationFrame(tick);
}
