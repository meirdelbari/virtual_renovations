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
    
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      console.warn("Auth: Localhost Bypass Active");

      // Check if we are "signed out"
      const isSignedOut = sessionStorage.getItem("dev_mode_signed_out") === "true";

      // Mock a user session for localhost
      clerk = {
        // Only provide user if NOT signed out
        user: isSignedOut
          ? null
          : {
              id: "user_mock_localhost",
              firstName: "Dev",
              imageUrl:
                "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
              primaryEmailAddress: { emailAddress: "dev@localhost" },
            },
        // Mock loading
        load: async () => {},
        // Mock listener
        addListener: (cb) => {
          // Immediately call with current state
          cb({ user: clerk.user });
          return () => {};
        },
        // Mock Sign Out
        signOut: async () => {
          sessionStorage.setItem("dev_mode_signed_out", "true");
          location.reload();
        },
        // Mock User Button
        mountUserButton: (el) => {
          el.innerHTML = `
                           <div style="display:flex;align-items:center;gap:10px;">
                               <div style='background:#f3f4f6;padding:6px 10px;border-radius:6px;font-weight:600;font-size:12px;color:#374151;border:1px solid #e5e7eb;'>
                                   Dev Mode
                               </div>
                               <button id="dev-sign-out-btn" class="op-btn" style="padding:4px 10px;font-size:12px;height:auto;min-height:0;">
                                   Sign Out
                               </button>
                           </div>
                       `;
          const btn = el.querySelector("#dev-sign-out-btn");
          if (btn) btn.onclick = () => clerk.signOut();
        },
        // Mock Sign In (UI mount)
        mountSignIn: (el) => {
          el.innerHTML = `
                           <div style="text-align:center;padding:20px;">
                               <h3>Dev Mode</h3>
                               <p>Click below to simulate sign in</p>
                               <button id="dev-sign-in-btn" class="op-btn op-btn-gemini">
                                   Sign In as Dev User
                               </button>
                           </div>
                       `;
          const btn = el.querySelector("#dev-sign-in-btn");
          if (btn)
            btn.onclick = () => {
              sessionStorage.removeItem("dev_mode_signed_out");
              location.reload();
            };
        },
        // Mock Sign In (Modal)
        openSignIn: () => {
          sessionStorage.removeItem("dev_mode_signed_out");
          location.reload();
        },
      };

      // If NOT signed out, we behave as logged in
      if (!isSignedOut) {
        mountUserButton();
        showApp();
      } else {
        // If signed out, show landing page
        // The initAuth function continues... but we returned early in the original code.
        // We should let the standard flow handle "clerk.user is null" -> showLandingPage
        showLandingPage();
      }
      return;
    }
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
           // If we are on localhost and the key is rejected, try a BYPASS
           if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
               console.warn("Auth: Localhost Bypass Active");
               // Mock a user session for localhost
               clerk = {
                   user: {
                       id: "user_mock_localhost",
                       firstName: "Dev",
                       imageUrl: "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y",
                       primaryEmailAddress: { emailAddress: "dev@localhost" }
                   },
                   mountUserButton: (el) => {
                       el.innerHTML = "<div style='background:#eee;padding:4px 8px;border-radius:4px;font-weight:bold;font-size:12px'>Dev User</div>";
                   },
                   openSignIn: () => alert("Localhost Dev Mode: You are already signed in as Dev User."),
               };
               // Force success flow
               mountUserButton();
               showApp();
               return;
           }

           try {
             await clerk.load(); 
           } catch (e2) {
             console.error("Clerk final load failed:", e2);
           }
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
      <div class="auth-container" style="position: relative;">
        <button type="button" id="auth-close-btn" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666; z-index: 10;">&times;</button>
        <div id="sign-in-mount" style="min-height: 150px; display: flex; align-items: center; justify-content: center;">
            <!-- Loading state inside the mount point -->
            <div class="auth-loading-spinner">Loading sign in...</div>
        </div>
        <div class="auth-footer">
          By signing in, you agree to our <a href="/terms.html" target="_blank">Terms of Service</a> & <a href="/terms.html" target="_blank">Privacy Policy</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Bind Close Button
    document.getElementById("auth-close-btn").addEventListener("click", () => {
        // Clear intent so it doesn't auto-reopen
        try { sessionStorage.removeItem("vr_auth_intent"); } catch(_) {}
        document.body.classList.remove("auth-locked");
        modal.remove();
        showLandingPage();
    });

    // Redirect back to the current page with a "post auth" hint so we can auto-enter the app.
    let afterUrl = "/";
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("vr_post_auth", "1");
      afterUrl = url.pathname + url.search + url.hash;
    } catch (_) {}

    try {
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
    } catch (err) {
      console.error("Clerk mount failed:", err);
      document.getElementById("sign-in-mount").innerHTML = `
        <div style="padding: 20px; text-align: center; color: #ef4444;">
          <p>Sign-in service unavailable.</p>
          <button class="op-btn" onclick="window.initAuthSkip()">Continue Offline</button>
        </div>
      `;
    }
  }

  // Helper to force skip auth from UI
  window.initAuthSkip = function() {
      try { sessionStorage.removeItem("vr_auth_intent"); } catch(_) {}
      showApp();
  };

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
