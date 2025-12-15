/**
 * Clerk Authentication Integration
 *
 * Handles:
 * 1. Initializing Clerk with the Publishable Key from backend.
 * 2. Mounting the User Button (profile) or Sign In button.
 * 3. Gating the application content until the user is authenticated.
 */

(function () {
  let clerk;
  let authListenerCleanup = null;

  function getQueryParam(name) {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const v = params.get(name);
      return v == null ? null : String(v);
    } catch (_) {
      return null;
    }
  }

  function clearQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(name)) return;
      url.searchParams.delete(name);
      // Avoid full reload; just clean the URL.
      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function isLikelyClerkRedirectUrl() {
    try {
      const search = String(window.location.search || "");
      // Clerk commonly uses __clerk_* params during OAuth redirects.
      return /(?:\?|&)(__clerk_[^=]+)=/i.test(search);
    } catch (_) {
      return false;
    }
  }

  function showAuthLoading(message) {
    const landing = document.getElementById("landing-page");
    const app = document.getElementById("app");
    if (landing) landing.style.display = "none";
    if (app) app.style.display = "none";
    document.body.classList.add("auth-locked");

    // If sign-in modal already exists, don't add a second overlay.
    if (document.getElementById("auth-modal")) return;

    const modal = document.createElement("div");
    modal.id = "auth-modal";
    modal.className = "auth-modal";
    modal.innerHTML = `
      <div class="auth-container" style="text-align:center;">
        <div style="font-size:16px;font-weight:600;margin-bottom:10px;">${message || "Signing you in..."}</div>
        <div style="font-size:13px;opacity:0.8;">Please wait a moment.</div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function initAuth() {
    console.log("Auth: Starting initialization...");

    // If we just reset and want to skip landing once, do it immediately
    try {
      const skipLanding = sessionStorage.getItem("skipLandingOnce");
      if (skipLanding) {
        sessionStorage.removeItem("skipLandingOnce");
        showApp();
        return;
      }
    } catch (_) {}

    // API base helper (supports file:// fallback to http://localhost:4000)
    function getApiUrl(path) {
      if (typeof window.getApiUrl === "function") {
        return window.getApiUrl(path);
      }
      const base = window.location.protocol === "file:" ? "http://localhost:4000" : "";
      const p = String(path || "");
      return base + (p.startsWith("/") ? p : "/" + p);
    }

    // Local development guard: Clerk custom domain blocks localhost (CORS/404)
    // Removed to allow Google Sign In testing on localhost
    /*
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (isLocalhost) {
      console.warn("Auth: Localhost detected, skipping Clerk to avoid CORS issues.");
      showLandingPage({ offlineMode: true });
      return;
    }
    */

    try {
      // When opened directly from the file system, skip auth fetch to avoid CORS errors.
      if (window.location.protocol === "file:") {
        console.warn("Auth: Running from file://, skipping auth and showing landing page.");
        showLandingPage();
        return;
      }

      // 1. Fetch Clerk Publishable Key from backend
      const response = await fetch(getApiUrl("/api/auth-config"));
      
      if (!response.ok) throw new Error("Failed to fetch auth config");
      const { publishableKey } = await response.json();

      console.log("Auth: Key fetched", publishableKey ? "Yes" : "No");

      if (!publishableKey) {
        console.warn("Clerk Publishable Key not found. Auth disabled.");
        showApp(); // Fallback: show app if no auth config
        return;
      }

      // 2. Load Clerk JS SDK
      await loadClerkSdk(publishableKey);
      console.log("Auth: SDK Loaded");

      // 3. Initialize Clerk
      if (window.Clerk) {
        clerk = window.Clerk;
        try {
          console.log("Auth: Loading Clerk...");
          await clerk.load({
            publishableKey: publishableKey // Explicitly pass key to load
          });
        } catch (err) {
           console.warn("Clerk load error (retrying without key param):", err);
           await clerk.load(); 
        }
        
        console.log("Auth: Clerk Loaded. User:", clerk.user ? "Signed In" : "Signed Out");
        console.log("Auth: Current URL:", window.location.href);

        // Always re-bind listeners so we react to sign-in/up redirect states
        bindClerkAuthListener();

        if (clerk.user) {
          // User is signed in
          mountUserButton();
          try {
            sessionStorage.removeItem("vr_auth_intent");
          } catch (_) {}
          clearQueryParam("vr_post_auth");
          showApp();
        } else {
          // If we just returned from OAuth, Clerk may need a moment to hydrate.
          const isPostAuth =
            getQueryParam("vr_post_auth") === "1" || isLikelyClerkRedirectUrl();
          if (isPostAuth) {
            showAuthLoading("Signing you in...");
            // Retry hydration a few times before falling back to sign-in UI.
            for (let i = 0; i < 8; i++) {
              await sleep(250);
              try {
                await clerk.load();
              } catch (_) {}
              if (clerk.user) break;
            }

            if (clerk.user) {
              mountUserButton();
              try {
                sessionStorage.removeItem("vr_auth_intent");
              } catch (_) {}
              clearQueryParam("vr_post_auth");
              showApp();
              return;
            }

            // Still not signed in; show sign-in modal instead of bouncing to landing.
            showSignInModal();
            return;
          }

          // If user previously clicked Start and we asked them to sign in, reopen the modal.
          let intent = null;
          try {
            intent = sessionStorage.getItem("vr_auth_intent");
          } catch (_) {}
          if (intent === "start") {
            showSignInModal();
          } else {
            // User is not signed in - Show Landing Page
            showLandingPage();
          }
        }
      }
    } catch (error) {
      console.error("Auth initialization failed:", error);
      // Fallback: show Landing Page, but "Start" will just open app (offline mode)
      showLandingPage({ offlineMode: true });
    }
  }

  function loadClerkSdk(key) {
    if (window.Clerk) return Promise.resolve(); // Already loaded
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.setAttribute("data-clerk-publishable-key", key);
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function showLandingPage(options = {}) {
    // If Clerk already has an authenticated user (e.g., after sign-up redirect),
    // jump straight into the app instead of flashing the landing page.
    if (clerk && clerk.user) {
      mountUserButton();
      showApp();
      return;
    }

    const { offlineMode = false } = options;
    console.log("Auth: Showing Landing Page");
    const landing = document.getElementById("landing-page");
    const app = document.getElementById("app");
    
    if (landing) landing.style.display = "flex";
    if (app) app.style.display = "none";
    
    // Bind Start Button
    const startBtn = document.getElementById("landing-start-btn");
    if (startBtn) {
      startBtn.onclick = offlineMode ? showApp : showSignInModal;
    }

    // Keep nav CTA in sync with offline/online mode
    const navStartBtn = document.getElementById("nav-start-btn");
    if (navStartBtn) {
      navStartBtn.onclick = offlineMode ? showApp : showSignInModal;
    }
  }

  function bindClerkAuthListener() {
    if (!clerk || typeof clerk.addListener !== "function") return;

    // Clean up previous listener if any to avoid double-calls
    if (authListenerCleanup) {
      try {
        authListenerCleanup();
      } catch (_) {}
      authListenerCleanup = null;
    }

    authListenerCleanup = clerk.addListener(({ user }) => {
      if (user) {
        mountUserButton();
        showApp();
      } else {
        showLandingPage();
      }
    });
  }

  function mountUserButton() {
    const userButtonDiv = document.getElementById("user-button");
    if (userButtonDiv) {
      // Ensure it's empty
      userButtonDiv.innerHTML = "";
      
      // Create greeting element if user has a first name
      if (clerk.user && clerk.user.firstName) {
        const greeting = document.createElement("span");
        greeting.textContent = `Hi, ${clerk.user.firstName}`;
        greeting.style.marginRight = "12px";
        greeting.style.fontWeight = "500";
        greeting.style.fontSize = "14px";
        greeting.style.color = "#111827"; // var(--color-text-main)
        
        // Insert greeting before the button
        userButtonDiv.appendChild(greeting);
      }

      try {
        // Create a wrapper for the actual button to keep it separate
        const buttonContainer = document.createElement("div");
        userButtonDiv.appendChild(buttonContainer);
        clerk.mountUserButton(buttonContainer);
        console.log("Auth: User button mounted successfully");
      } catch (e) {
        console.error("Auth: Failed to mount user button", e);
      }
    } else {
      console.error("Auth: Could not find #user-button container");
    }
  }

  function showSignInModal() {
    // If clerk is not initialized (e.g. backend down), fallback to showApp directly
    if (!clerk) {
      console.warn("Auth: Clerk not initialized, bypassing auth.");
      // Fallback: just show the app if auth failed
      if (confirm("Authentication service is unavailable. Proceed in offline mode?")) {
        showApp();
      }
      return;
    }

    console.log("Auth: Showing Sign In Modal");

    // Remember the user's intent so a refresh/redirect can continue automatically.
    try {
      sessionStorage.setItem("vr_auth_intent", "start");
    } catch (_) {}
    
    // Hide landing page when opening modal
    const landing = document.getElementById("landing-page");
    if (landing) landing.style.display = "none";

    // Hide app content
    document.body.classList.add("auth-locked");
    
    // Check if modal already exists
    if (document.getElementById("auth-modal")) return;

    const modal = document.createElement("div");
    modal.id = "auth-modal";
    modal.className = "auth-modal";
    modal.innerHTML = `
      <div class="auth-container">
        <div id="sign-in-mount"></div>
        <div class="auth-footer">
          By signing in, you agree to our <a href="/terms.html" target="_blank">Terms of Service</a> & <a href="/terms.html" target="_blank">Privacy Policy</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Redirect back to the current page with a "post auth" hint so we can auto-enter the app.
    let afterUrl = "/";
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("vr_post_auth", "1");
      afterUrl = url.pathname + url.search + url.hash;
    } catch (_) {}

    clerk.mountSignIn(document.getElementById("sign-in-mount"), {
      afterSignInUrl: afterUrl,
      afterSignUpUrl: afterUrl,
      appearance: {
        elements: {
          footerActionLink: { color: "#5b46ff" },
          card: { boxShadow: "none", background: "transparent" }
        }
      }
    });
  }

  function showApp() {
    document.body.classList.remove("auth-locked");
    const modal = document.getElementById("auth-modal");
    if (modal) modal.remove();
    
    // Hide landing page, Show App
    const landing = document.getElementById("landing-page");
    const app = document.getElementById("app");
    
    if (landing) landing.style.display = "none";
    if (app) app.style.display = "flex"; // or block depending on your layout, usually flex for #app
  }

  // Expose init function
  window.initAuth = initAuth;

})();
