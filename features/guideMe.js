(function () {
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
          <h2>Need a walkthrough?</h2>
          <p>Two ways to start—pick the flow that matches how you want to work.</p>
        </div>
        <button type="button" class="guide-close-btn" aria-label="Close">&times;</button>
      </header>
      <section class="guide-section">
        <h3>Option A: Floor Plan First</h3>
        <ol>
          <li><strong>Upload Floor Plans</strong> (JSON for rooms, PDF/image for reference).</li>
          <li>The viewer loads rooms into the context so every photo can be matched.</li>
          <li><strong>Upload Photos</strong> and assign each one to a room using the selector.</li>
          <li>Use <em>Room</em> button to navigate, or click photos in the gallery.</li>
          <li>Use <strong>Enhance Quality</strong> to improve photo resolution.</li>
          <li>Use <strong>Furniture ▾</strong> to Remove (empty room) or Stage (add furniture) based on the selected Style.</li>
          <li>Use <strong>Renovate ▾</strong> and <strong>Style ▾</strong> to design finishes, then click <strong>✨ AlgoreitAI</strong>.</li>
        </ol>
        <p class="guide-tip">Best when you already have a measured plan and want every image tied to a room.</p>
      </section>
      <section class="guide-section">
        <h3>Option B: Photos Only</h3>
        <ol>
          <li>Skip the floor plan and click <strong>Upload Photos</strong>.</li>
          <li>Assign a Room Type (e.g., "Living Room") to each photo in the gallery.</li>
          <li>Click <strong>Room</strong> to select which photo to edit in the Working Area.</li>
          <li>Use <strong>Furniture ▾</strong> to clear the room or stage it with new furniture.</li>
          <li>Use <strong>Renovate ▾</strong> to update floors, walls, or kitchens.</li>
          <li>Click <strong>✨ AlgoreitAI</strong> to generate results.</li>
          <li>All results appear in the "Renovation Photos" row—click them to chain more edits!</li>
        </ol>
        <p class="guide-tip">Perfect for quick mockups when you only have photographs.</p>
      </section>
      <section class="guide-section">
        <h3>Pro Tips</h3>
        <ul>
          <li><strong>Furniture First:</strong> Try removing furniture first to get a clean slate, then stage or renovate.</li>
          <li><strong>Chaining:</strong> Every result is a new starting point. Click a result in the "Renovation Photos" row to keep editing it.</li>
          <li><strong>Room Types:</strong> Assigning the correct room type (e.g., "Bedroom") ensures the AI stages it with the right furniture (beds vs sofas).</li>
        </ul>
      </section>
      <footer class="guide-modal-footer">
        <button type="button" class="op-btn guide-close-secondary">Got it</button>
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

