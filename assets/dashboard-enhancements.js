
/* Destiny Dashboard interaction polish.
 * Sounds are synthesized locally, start muted, and only run after a user gesture.
 */
(() => {
  "use strict";
  if (window.__DESTINY_UI_ENHANCEMENTS__) return;
  window.__DESTINY_UI_ENHANCEMENTS__ = true;

  const STORAGE_KEY = "destiny_ui_preferences_v1";
  const prefersReducedMotion = Boolean(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const defaults = { soundEnabled: false, volume: 18, reducedMotion: prefersReducedMotion };
  let preferences = { ...defaults };

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored && typeof stored === "object") {
      preferences.soundEnabled = stored.soundEnabled === true;
      preferences.volume = Number.isFinite(Number(stored.volume))
        ? Math.max(0, Math.min(100, Number(stored.volume))) : defaults.volume;
      preferences.reducedMotion = typeof stored.reducedMotion === "boolean"
        ? stored.reducedMotion : defaults.reducedMotion;
    }
  } catch (_) {
    // Preferences are optional; the dashboard remains usable when storage is blocked.
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }
    catch (_) { /* Private browsing or storage restrictions must not break the UI. */ }
  }

  function applyPreferences() {
    document.body.dataset.reducedMotion = String(preferences.reducedMotion);
  }
  applyPreferences();

  let audioContext = null;
  const tones = {
    click: [430, 0.045, "sine"],
    navigation: [360, 0.065, "sine"],
    toggleOn: [590, 0.075, "triangle"],
    toggleOff: [270, 0.065, "sine"],
    success: [680, 0.095, "sine"],
    error: [205, 0.11, "triangle"]
  };

  function playSound(kind = "click") {
    if (!preferences.soundEnabled || preferences.volume <= 0) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      if (!audioContext) audioContext = new AudioContextClass();
      const context = audioContext;
      const [frequency, duration, wave] = tones[kind] || tones.click;
      const start = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        const peak = Math.max(0.0001, Math.min(0.045, preferences.volume / 100 * 0.045));
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.045, now + duration * 0.58);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.015);
      };
      if (context.state === "suspended") context.resume().then(start).catch(() => {});
      else start();
    } catch (_) {
      // Unsupported or blocked audio is non-fatal.
    }
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addPreferenceRow(parent, title, description, id, checked) {
    const row = make("label", "destiny-preference-row");
    const copy = make("span", "destiny-preference-copy");
    copy.append(make("strong", "", title), make("small", "", description));
    const input = make("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = checked;
    row.append(copy, input);
    parent.append(row);
    return input;
  }

  function setupPreferencesPanel() {
    const right = document.querySelector(".topbar .right");
    if (!right || document.getElementById("destiny-preferences-trigger")) return;

    const trigger = make("button", "destiny-preferences-trigger", "✧ Effects");
    trigger.type = "button";
    trigger.id = "destiny-preferences-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "destiny-preferences-panel");
    trigger.title = "Interface settings";

    const panel = make("section", "destiny-preferences-panel");
    panel.id = "destiny-preferences-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Interface settings");

    const head = make("div", "destiny-preferences-head");
    const heading = make("div");
    heading.append(
      make("strong", "", "Interface settings"),
      make("small", "", "Personalise the dashboard experience.")
    );
    const close = make("button", "destiny-preferences-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close interface settings");
    head.append(heading, close);
    panel.append(head);

    const soundToggle = addPreferenceRow(
      panel, "Interface sounds",
      "Subtle click, navigation and toggle sounds. Off by default.",
      "destiny-sound-toggle", preferences.soundEnabled
    );
    const motionToggle = addPreferenceRow(
      panel, "Reduced motion",
      "Reduce movement and transitions across the dashboard.",
      "destiny-motion-toggle", preferences.reducedMotion
    );

    const volumeLabel = make("label", "destiny-volume-label");
    volumeLabel.htmlFor = "destiny-volume";
    const volumeTitle = make("span", "", "Sound volume");
    const volumeValue = make("span", "", preferences.volume + "%");
    volumeLabel.append(volumeTitle, volumeValue);
    const volume = make("input", "destiny-volume");
    volume.type = "range";
    volume.id = "destiny-volume";
    volume.min = "0";
    volume.max = "100";
    volume.step = "1";
    volume.value = String(preferences.volume);
    volume.setAttribute("aria-label", "Sound volume");
    volume.disabled = !preferences.soundEnabled;
    const note = make("p", "destiny-preferences-note",
      "Audio is never played automatically. Your choices are saved on this device."
    );
    panel.append(volumeLabel, volume, note);
    document.body.append(panel);

    function openPanel() {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      close.focus({ preventScroll: true });
    }
    function closePanel(returnFocus = false) {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (returnFocus) trigger.focus({ preventScroll: true });
    }
    trigger.addEventListener("click", () => {
      if (panel.hidden) openPanel();
      else closePanel();
    });
    close.addEventListener("click", () => closePanel(true));
    panel.addEventListener("click", event => event.stopPropagation());
    document.addEventListener("click", event => {
      if (!panel.hidden && !panel.contains(event.target) &&
          event.target !== trigger && !trigger.contains(event.target)) closePanel();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !panel.hidden) closePanel(true);
    });

    soundToggle.addEventListener("change", () => {
      preferences.soundEnabled = soundToggle.checked;
      volume.disabled = !preferences.soundEnabled;
      persist();
      if (preferences.soundEnabled) playSound("toggleOn");
    });
    motionToggle.addEventListener("change", () => {
      preferences.reducedMotion = motionToggle.checked;
      applyPreferences();
      persist();
    });
    volume.addEventListener("input", () => {
      preferences.volume = Math.max(0, Math.min(100, Number(volume.value) || 0));
      volumeValue.textContent = preferences.volume + "%";
      persist();
    });

    right.insertBefore(trigger, right.firstElementChild);
  }

  function addToast(kind, message, duration = 3600) {
    let root = document.querySelector(".destiny-toast-root");
    if (!root) {
      root = make("div", "destiny-toast-root");
      root.setAttribute("aria-live", "polite");
      root.setAttribute("aria-atomic", "false");
      document.body.append(root);
    }
    const toast = make("div", "destiny-toast", String(message || ""));
    toast.dataset.kind = ["success", "error"].includes(kind) ? kind : "info";
    root.append(toast);
    if (kind === "success") playSound("success");
    else if (kind === "error") playSound("error");
    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(5px)";
      window.setTimeout(() => toast.remove(), 180);
    }, Math.max(1200, Number(duration) || 3600));
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(".destiny-preferences-panel, .destiny-preferences-trigger")) return;
    const control = target.closest("button, a, [role='button'], .toggle");
    if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;
    if (control.classList.contains("navitem")) playSound("navigation");
    else if (control.classList.contains("toggle")) {
      playSound(control.classList.contains("on") ? "toggleOn" : "toggleOff");
    } else playSound("click");
  });

  setupPreferencesPanel();
  window.DestinyUI = Object.freeze({
    sound: playSound,
    notify: addToast,
    getPreferences: () => ({ ...preferences })
  });
})();
