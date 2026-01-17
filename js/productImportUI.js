// Product Import UI wiring (kept separate to avoid touching the large portal script)
// Depends on globals provided by `js/supplierPortal.js`: apiCall, showStatusBanner, loadProducts, currentSupplier, isAdminView

(function () {
  // Mark that the dedicated importer UI is active so other scripts don't double-bind.
  try {
    window.VR_IMPORT_UI_BOUND = true;
  } catch (_) {}

  function setImportStatus(message, isError) {
    const el = document.getElementById("import-status");
    if (!el) return;
    el.classList.remove("hidden");
    el.classList.toggle("text-red-600", !!isError);
    el.classList.toggle("text-gray-600", !isError);
    el.textContent = message;
  }

  async function runImport() {
    const btn = document.getElementById("import-products-btn");
    if (!btn) return;

    try {
      if (typeof isAdminView !== "undefined" && isAdminView) {
        alert("Import is disabled in admin view.");
        return;
      }
      if (typeof currentSupplier === "undefined" || !currentSupplier) {
        alert("Supplier profile not loaded yet.");
        return;
      }

      const url = (document.getElementById("import-website-url")?.value || "").trim();
      const maxProducts = Number(document.getElementById("import-max-products")?.value || "30");
      const downloadImages = !!document.getElementById("import-download-images")?.checked;
      const deepScan = !!document.getElementById("import-deep-scan")?.checked;
      const replaceExisting = !!document.getElementById("import-replace-existing")?.checked;
      const updateExisting = !!document.getElementById("import-update-existing")?.checked;

      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = "Importing...";
      setImportStatus("Reading your website and extracting products... (this may take ~10-30 seconds)");

      const payload = {
        websiteUrl: url || undefined,
        maxProducts,
        downloadImages,
        deepScan,
        replaceExisting,
        updateExisting,
      };

      if (typeof apiCall !== "function") {
        throw new Error("Importer is not ready (apiCall missing). Refresh the page.");
      }

      const result = await apiCall("/products/import", "POST", payload);
      const note = result.note ? ` Note: ${result.note}` : "";
      const updatedCount = Number(result.updatedCount || 0);
      const removed = Number(result.removedExistingImported || 0);

      const parts = [
        `Imported ${result.importedCount} products`,
        updatedCount ? `Updated ${updatedCount} products` : null,
        `Skipped ${result.skippedCount}`,
        removed ? `(Replaced ${removed})` : null,
      ].filter(Boolean);

      setImportStatus(`${parts.join(". ")}.${note}`, false);
      if (typeof showStatusBanner === "function") {
        const msg = updatedCount
          ? `Updated ${updatedCount} products ✅`
          : `Imported ${result.importedCount} products ✅ Waiting for admin approval.`;
        showStatusBanner(msg);
      }
      if (typeof loadProducts === "function") {
        await loadProducts();
      }

      btn.textContent = prev;
    } catch (e) {
      setImportStatus(`Import failed: ${e?.message || String(e)}`, true);
    } finally {
      const btn = document.getElementById("import-products-btn");
      if (btn) btn.disabled = false;
      if (btn && btn.textContent === "Importing...") btn.textContent = "Import";
    }
  }

  function init() {
    const btn = document.getElementById("import-products-btn");
    if (!btn) return;
    btn.addEventListener("click", runImport);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

