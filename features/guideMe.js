(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
    } catch (_) {}
    return fallback || key;
  }

  function initGuideMe() {
    const button = document.querySelector('[data-role="guide-me"]');
    if (!button) {
      console.warn("[GuideMe] button not found.");
      return;
    }
    button.addEventListener("click", openGuideModal);
  }

  function openGuideModal() {
    closeExistingModals();

    const overlay = document.createElement("div");
    overlay.className = "guide-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "guide-modal";
    modal.innerHTML = `
      <header class="guide-modal-header">
        <div>
          <h2>${tr("guide.title", null, "Need a walkthrough?")}</h2>
          <p>${tr("guide.subtitle", null, "Learn what each button does, then pick a flow to start.")}</p>
        </div>
        <button type="button" class="guide-close-btn" aria-label="Close">&times;</button>
      </header>
      
      <section class="guide-section">
        <h3>${tr("guide.overview", null, "Button Overview")}</h3>
        <ul class="guide-button-list">
          <li><strong>${tr("guide.btn.upload", null, "Upload Photos")}:</strong> ${tr("guide.desc.upload", null, "")}</li>
          <li><strong>${tr("guide.btn.floorPlan", null, "Floor Plan")}:</strong> ${tr("guide.desc.floorPlan", null, "Upload and view your floor plan to organize rooms.")}</li>
          <li><strong>${tr("guide.btn.match", null, "Match Photo-Room ▾")}</strong> ${tr("guide.desc.match", null, "")}</li>
          <li><strong>${tr("guide.btn.room", null, "Room")}:</strong> ${tr("guide.desc.room", null, "")}</li>
          <li><strong>${tr("guide.btn.enhance", null, "Enhance Quality")}:</strong> ${tr("guide.desc.enhance", null, "")}</li>
          <li><strong>${tr("guide.btn.renovate", null, "Renovate ▾")}:</strong> ${tr("guide.desc.renovate", null, "")}</li>
          <li><strong>${tr("guide.btn.furniture", null, "Furniture ▾")}:</strong> ${tr("guide.desc.furniture", null, "")}</li>
          <li><strong>${tr("guide.btn.style", null, "Style ▾")}:</strong> ${tr("guide.desc.style", null, "")}</li>
          <li><strong>${tr("guide.btn.magic", null, "✨ AlgoreitAI")}:</strong> ${tr("guide.desc.magic", null, "")}</li>
          <li><strong>${tr("guide.btn.reset", null, "Reset")}:</strong> ${tr("guide.desc.reset", null, "")}</li>
        </ul>
      </section>

      <section class="guide-section">
        <h3>${tr("guide.howTo", null, "How to Renovate & Stage")}</h3>
        <ol>
          <li>${tr("guide.steps.1a", null, "Optional: Upload a Floor Plan to define your rooms.")}</li>
          <li>${tr("guide.steps.1", null, "")}</li>
          <li>${tr("guide.steps.2", null, "")}</li>
          <li>${tr("guide.steps.3", null, "")}</li>
          <li>${tr("guide.steps.4", null, "")}</li>
          <li>${tr("guide.steps.5", null, "")}</li>
          <li>${tr("guide.steps.6", null, "")}</li>
          <li>${tr("guide.steps.7", null, "")}</li>
          <li>${tr("guide.steps.8", null, "")}</li>
        </ol>
      </section>
      <section class="guide-section">
        <h3>${tr("guide.tips", null, "Pro Tips")}</h3>
        <ul>
          <li>${tr("guide.tipsList.1", null, "")}</li>
          <li>${tr("guide.tipsList.2", null, "")}</li>
          <li>${tr("guide.tipsList.3", null, "")}</li>
        </ul>
      </section>
      <footer class="guide-modal-footer">
        <button type="button" class="op-btn guide-close-secondary">${tr("guide.close", null, "Got it")}</button>
      </footer>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeExistingModals();
      }
    });
    modal.querySelector(".guide-close-btn").addEventListener("click", closeExistingModals);
    modal.querySelector(".guide-close-secondary").addEventListener("click", closeExistingModals);
  }

  function closeExistingModals() {
    const existing = document.querySelector(".guide-modal-overlay");
    if (existing) {
      existing.remove();
    }
  }

  window.initGuideMe = initGuideMe;
})();

