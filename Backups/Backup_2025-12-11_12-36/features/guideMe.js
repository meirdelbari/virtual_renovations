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
          <p>Learn what each button does, then pick a flow to start.</p>
        </div>
        <button type="button" class="guide-close-btn" aria-label="Close">&times;</button>
      </header>
      
      <section class="guide-section">
        <h3>Button Overview</h3>
        <ul class="guide-button-list">
          <li><strong>Upload Photos:</strong> Import your home photos (Rooms, kitchen, Bath, Exterior, Garden...etc).</li>
          <li><strong>Match Photo-Room ▾</strong> (Feature at the bottom of each uploaded photo): Helps AlgoreitAI adapt and generate the best design for you.</li>
          <li><strong>Room:</strong> Select a photo from the gallery to open it in the Working Area.</li>
          <li><strong>Enhance Quality:</strong> Sharpen and upscale your photos.</li>
          <li><strong>Renovate ▾:</strong> Select renovation tasks like updating floors, walls, or exterior.</li>
          <li><strong>Furniture ▾:</strong> Choose to remove existing furniture or stage with new items.</li>
          <li><strong>Style ▾:</strong> Pick the design style for your renovation (e.g., Modern, Scandinavian).</li>
          <li><strong>✨ AlgoreitAI:</strong> The magic button! Click this to generate your new design.</li>
          <li><strong>Reset:</strong> Clear everything and start over.</li>
        </ul>
      </section>

      <section class="guide-section">
        <h3>How to Renovate & Stage</h3>
        <ol>
          <li><strong>Upload Photos</strong> and match each one to a room type (e.g., "Living Room") using the selector at the uploaded photos bottom.</li>
          <li>Click <strong>Room</strong> to select which photo to edit in the Working Area.</li>
          <li>Use <strong>Enhance Quality</strong> to improve photo resolution if needed.</li>
          <li>Use <strong>Renovate ▾</strong> to update floors, walls, exterior, or garden.</li>
          <li>Use <strong>Furniture ▾</strong> to clear the room or stage it with new furniture.</li>
          <li>Use <strong>Style ▾</strong> to choose the design aesthetic (e.g., Modern, Farmhouse).</li>
          <li>Click <strong>✨ AlgoreitAI</strong> to generate your renovation (after selecting Renovate/Furniture and Style options).</li>
          <li>All results appear in the "Renovation Photos" row—click them to chain more edits!</li>
        </ol>
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

