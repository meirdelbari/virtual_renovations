/**
 * Pricing & Credits Feature
 */

(function () {
  const PRICING_PLANS = {
    credits: [
      { id: "small", name: "Small Pack", credits: 20, price: "$15", desc: "Best for quick projects" },
      { id: "large", name: "Large Pack", credits: 100, price: "$60", desc: "Best value for packs" }
    ],
    subscription: [
      { id: "starter", name: "Starter", credits: 50, price: "$19/mo", desc: "For hobbyists" },
      { id: "pro", name: "Professional", credits: 200, price: "$49/mo", desc: "For designers" },
      { id: "enterprise", name: "Enterprise", credits: 1000, price: "$199/mo", desc: "For volume" }
    ]
  };

  function initPricing() {
    // Wait for auth to be ready
    const checkAuth = setInterval(() => {
      if (window.Clerk && window.Clerk.user) {
        clearInterval(checkAuth);
        mountCreditDisplay();
        updateCredits();
      }
    }, 500);
  }

  function mountCreditDisplay() {
    const userButton = document.getElementById("user-button");
    if (!userButton) return;

    // Create container if not exists
    let creditContainer = document.getElementById("credit-display");
    if (!creditContainer) {
      creditContainer = document.createElement("div");
      creditContainer.id = "credit-display";
      creditContainer.style.display = "flex";
      creditContainer.style.alignItems = "center";
      creditContainer.style.marginRight = "15px";
      creditContainer.style.gap = "10px";
      
      // Insert before user button
      userButton.parentNode.insertBefore(creditContainer, userButton);
    }

    creditContainer.innerHTML = `
      <div id="credit-count" style="font-weight: 600; font-size: 14px; color: #374151;">Loading credits...</div>
      <button id="buy-credits-btn" style="background: #4F46E5; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">
        Get Credits
      </button>
    `;

    document.getElementById("buy-credits-btn").onclick = showPricingModal;
  }

  async function updateCredits() {
    if (!window.Clerk || !window.Clerk.user) return;
    
    try {
      const response = await fetch(getApiUrl(`/api/credits?userId=${window.Clerk.user.id}`));
      if (response.ok) {
        const { credits } = await response.json();
        const display = document.getElementById("credit-count");
        if (display) display.textContent = `${credits} Credits`;
      }
    } catch (e) {
      console.error("Failed to fetch credits", e);
    }
  }

  function showPricingModal() {
    // Check if modal exists
    if (document.getElementById("pricing-modal")) return;

    const modal = document.createElement("div");
    modal.id = "pricing-modal";
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 10000;
      display: flex; justify-content: center; align-items: center;
    `;

    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0;">Get More Credits</h2>
          <button id="close-pricing" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
        </div>

        <div style="margin-bottom: 30px;">
          <h3 style="border-bottom: 1px solid #eee; padding-bottom: 10px;">Monthly Subscriptions</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 15px;">
            ${PRICING_PLANS.subscription.map(plan => renderPlanCard(plan, 'subscription')).join('')}
          </div>
        </div>

        <div>
          <h3 style="border-bottom: 1px solid #eee; padding-bottom: 10px;">One-Time Credit Packs</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 15px;">
            ${PRICING_PLANS.credits.map(plan => renderPlanCard(plan, 'credits')).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("close-pricing").onclick = () => modal.remove();
  }

  function renderPlanCard(plan, type) {
    return `
      <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; text-align: center; transition: all 0.2s;">
        <div style="font-weight: 700; font-size: 18px; margin-bottom: 5px;">${plan.name}</div>
        <div style="color: #4F46E5; font-size: 24px; font-weight: 800; margin-bottom: 10px;">${plan.price}</div>
        <div style="color: #6b7280; margin-bottom: 15px;">${plan.credits} Credits</div>
        <div style="font-size: 13px; color: #888; margin-bottom: 20px;">${plan.desc}</div>
        <button onclick="window.buyCredits('${type}', '${plan.id}')" 
          style="background: #111827; color: white; width: 100%; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
          Select
        </button>
      </div>
    `;
  }

  async function buyCredits(planType, planId) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = "Processing...";
    btn.disabled = true;

    try {
      const user = window.Clerk.user;
      if (!user) {
        alert("Please sign in first.");
        return;
      }

      const response = await fetch(getApiUrl("/api/create-checkout-session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          userEmail: user.primaryEmailAddress.emailAddress,
          planType,
          planId
        })
      });

      if (!response.ok) throw new Error("Failed to start checkout");
      
      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to start payment. Please try again.");
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  // Helper to get API URL
  function getApiUrl(path) {
    const base = window.location.protocol === "file:" ? "http://localhost:4000" : "";
    return base + path;
  }

  // Export
  window.initPricing = initPricing;
  window.updateCredits = updateCredits;
  window.buyCredits = buyCredits;

})();




