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

  async function initAuth() {
    console.log("Auth: Starting initialization...");
    try {
      // 1. Fetch Clerk Publishable Key from backend
      // In production, use the current origin since frontend and backend are on the same domain
      const API_BASE_URL = window.location.hostname === 'localhost' ? '' : '';
      const response = await fetch(`${API_BASE_URL}/api/auth-config`);
      
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
          await clerk.load({
            publishableKey: publishableKey // Explicitly pass key to load
          });
        } catch (err) {
           console.warn("Clerk load error (retrying without key param):", err);
           await clerk.load(); 
        }
        
        console.log("Auth: Clerk Loaded. User:", clerk.user ? "Signed In" : "Signed Out");

        if (clerk.user) {
          // User is signed in
          mountUserButton();
          showApp();
        } else {
          // User is not signed in - Show Landing Page
          showLandingPage();
        }
      }
    } catch (error) {
      console.error("Auth initialization failed:", error);
      // Fallback: show Landing Page, but "Start" will just open app (offline mode)
      showLandingPage();
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

  function showLandingPage() {
    console.log("Auth: Showing Landing Page");
    const landing = document.getElementById("landing-page");
    const app = document.getElementById("app");
    
    if (landing) landing.style.display = "flex";
    if (app) app.style.display = "none";
    
    // Bind Start Button
    const startBtn = document.getElementById("landing-start-btn");
    if (startBtn) {
      startBtn.onclick = showSignInModal;
    }
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

    clerk.mountSignIn(document.getElementById("sign-in-mount"), {
      afterSignInUrl: "/",
      afterSignUpUrl: "/",
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
