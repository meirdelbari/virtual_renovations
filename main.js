// Entry point: wire up independent feature modules using globals.

document.addEventListener("DOMContentLoaded", function () {
  if (window.initUploadFloorPlans) {
    window.initUploadFloorPlans();
  }
  if (window.initUploadPhotos) {
    window.initUploadPhotos();
  }
  if (window.initRoomViewer) {
    window.initRoomViewer();
  }
  if (window.initEnhancePhotos) {
    window.initEnhancePhotos();
  }
  if (window.initGuideMe) {
    window.initGuideMe();
  }
  if (window.initGeminiAI) {
    window.initGeminiAI();
  }
  if (window.initStyleSelector) {
    window.initStyleSelector();
  }
  if (window.initRenovateSelector) {
    window.initRenovateSelector();
  }
  if (window.initFurnitureSelector) {
    window.initFurnitureSelector();
  }
  if (window.initResetApp) {
    window.initResetApp();
  }
  console.info("AlgoreitAI Virtual Renovations app loaded.");
});

