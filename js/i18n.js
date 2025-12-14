(function () {
  const RTL_LANGS = new Set(["he", "ar", "fa", "ur"]);

  const state = {
    locale: null,
    fallbackLocale: "en",
    dictionaries: Object.create(null),
    pendingLoads: Object.create(null),
  };

  function normalizeLocale(locale) {
    const raw = String(locale || "").trim().toLowerCase();
    if (!raw) return null;
    // Accept full names as well (user preference: store full names, not 2-letter codes)
    if (raw === "english") return "en";
    if (raw === "hebrew" || raw === "עברית") return "he";

    // allow "he-IL" -> "he"
    const base = raw.split("-")[0];
    // legacy alias used by some browsers
    if (base === "iw") return "he";
    return base;
  }

  function getStoredLocale() {
    try {
      const v = localStorage.getItem("VR_LOCALE");
      return normalizeLocale(v);
    } catch (_) {
      return null;
    }
  }

  function detectLocale() {
    return (
      getStoredLocale() ||
      normalizeLocale(document.documentElement.lang) ||
      normalizeLocale((navigator.language || navigator.userLanguage || "en").toString()) ||
      "en"
    );
  }

  async function loadLocale(locale) {
    const lng = normalizeLocale(locale);
    if (!lng) return null;

    if (state.dictionaries[lng]) return state.dictionaries[lng];
    if (state.pendingLoads[lng]) return state.pendingLoads[lng];

    const fileBase = lng === "he" ? "hebrew" : lng === "en" ? "english" : lng;
    const url = `locales/${fileBase}.json`;

    state.pendingLoads[lng] = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${url}: HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        state.dictionaries[lng] = json || {};
        return state.dictionaries[lng];
      })
      .catch((err) => {
        console.warn("[i18n] Could not load locale", lng, err);
        state.dictionaries[lng] = state.dictionaries[lng] || {};
        return state.dictionaries[lng];
      })
      .finally(() => {
        delete state.pendingLoads[lng];
      });

    return state.pendingLoads[lng];
  }

  function getByPath(obj, path) {
    if (!obj) return undefined;
    const parts = String(path || "").split(".");
    let cur = obj;
    for (const p of parts) {
      if (!p) continue;
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return undefined;
      }
    }
    return cur;
  }

  function interpolate(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
      const v = vars[k];
      return v === undefined || v === null ? "" : String(v);
    });
  }

  function t(key, vars, options) {
    const k = String(key || "").trim();
    if (!k) return "";

    const preferredLocale = normalizeLocale(options && options.locale);
    const lng = preferredLocale || state.locale || state.fallbackLocale;

    const dict = state.dictionaries[lng] || {};
    const fallback = state.dictionaries[state.fallbackLocale] || {};

    const value = getByPath(dict, k);
    const fallbackValue = getByPath(fallback, k);

    const out =
      value !== undefined
        ? value
        : fallbackValue !== undefined
          ? fallbackValue
          : (options && options.defaultValue) || k;

    return interpolate(out, vars);
  }

  function setHtmlLangDir(locale) {
    const lng = normalizeLocale(locale) || state.fallbackLocale;
    document.documentElement.lang = lng;
    document.documentElement.dir = RTL_LANGS.has(lng) ? "rtl" : "ltr";
  }

  function applyTranslations(root) {
    const scope = root || document;

    // text nodes
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const html = el.getAttribute("data-i18n-html") === "true";
      const val = t(key);
      if (html) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    });

    // attributes
    scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      const spec = el.getAttribute("data-i18n-attr") || "";
      const parts = spec
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      parts.forEach((attr) => {
        const key = el.getAttribute(`data-i18n-${attr}`);
        if (!key) return;
        el.setAttribute(attr, t(key));
      });
    });
  }

  async function setLocale(locale) {
    const lng = normalizeLocale(locale) || state.fallbackLocale;

    // Load both selected + fallback to guarantee coverage
    await Promise.all([loadLocale(state.fallbackLocale), loadLocale(lng)]);

    state.locale = lng;
    setHtmlLangDir(lng);

    try {
      // Store full language name (not 2-letter code)
      const stored =
        lng === "he" ? "Hebrew" :
        lng === "en" ? "English" :
        lng;
      localStorage.setItem("VR_LOCALE", stored);
    } catch (_) {}

    applyTranslations();

    try {
      window.dispatchEvent(new CustomEvent("i18n:changed", { detail: { locale: lng } }));
    } catch (_) {}

    return lng;
  }

  function getLocale() {
    return state.locale || detectLocale();
  }

  async function initI18n(options) {
    if (options && options.fallbackLocale) {
      state.fallbackLocale = normalizeLocale(options.fallbackLocale) || "en";
    }

    const initial = normalizeLocale(options && options.initialLocale) || detectLocale();
    await setLocale(initial);
  }

  // Expose globally
  window.i18n = {
    initI18n,
    setLocale,
    getLocale,
    t,
    applyTranslations,
  };

  // Convenience alias
  window.t = t;
})();


