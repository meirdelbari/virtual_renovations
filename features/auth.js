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
      const response = await fetch("/api/auth-config");
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
        await clerk.load();
        console.log("Auth: Clerk Loaded. User:", clerk.user ? "Signed In" : "Signed Out");

        if (clerk.user) {
          // User is signed in
          mountUserButton();
          showApp();
        } else {
          // User is not signed in
          showSignInModal();
        }
      }
    } catch (error) {
      console.error("Auth initialization failed:", error);
      // Fallback to showing app in case of error, or show error screen
      showApp();
    }
  }

  function loadClerkSdk(key) {
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

  function mountUserButton() {
    const userButtonDiv = document.getElementById("user-button");
    if (userButtonDiv) {
      // Ensure it's empty
      userButtonDiv.innerHTML = "";
      try {
        clerk.mountUserButton(userButtonDiv);
        console.log("Auth: User button mounted successfully");
      } catch (e) {
        console.error("Auth: Failed to mount user button", e);
      }
    } else {
      console.error("Auth: Could not find #user-button container");
    }
  }

  function showSignInModal() {
    console.log("Auth: Showing Sign In Modal");
    // Hide app content
    document.body.classList.add("auth-locked");
    
    // Check if modal already exists
    if (document.getElementById("auth-modal")) return;

    const modal = document.createElement("div");
    modal.id = "auth-modal";
    modal.className = "auth-modal";
    modal.innerHTML = `
      <div class="auth-container">
        <h2>Welcome to Virtual Renovations</h2>
        <p>Please sign in to continue</p>
        <div id="sign-in-mount"></div>
      </div>
    `;
    document.body.appendChild(modal);

    clerk.mountSignIn(document.getElementById("sign-in-mount"), {
      afterSignInUrl: "/",
      afterSignUpUrl: "/",
    });
  }

  function showApp() {
    document.body.classList.remove("auth-locked");
    const modal = document.getElementById("auth-modal");
    if (modal) modal.remove();
  }

  // Expose init function
  window.initAuth = initAuth;

})();
