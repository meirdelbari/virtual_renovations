/**
 * Logic Table for Button/Feature Selection
 * Defines the conditions under which each feature can be selected.
 * 
 * Rules:
 * 1. Style cannot be selected before Renovate or Furniture is selected.
 * 2. AlgoreitAI cannot be selected first (requires Renovate, Furniture, Enhance, or Custom).
 * 3. AlgoreitAI requires Style if Renovate or Furniture was selected.
 * 4. Other buttons are generally blocked if a "flow lock" is active (meaning a step is pending).
 * 5. Feature buttons (Renovate, Furniture, Enhance, Custom) require a photo in the working area.
 */

(function() {

    // Helper: Check if a photo is currently loaded in the working area
    function isPhotoInWorkingArea() {
        // 1. Check logical state from uploadPhotos.js / roomViewer.js
        if (window.lastFocusedRoomPhoto && window.lastFocusedRoomPhoto.url) {
            return true;
        }

        // 2. Fallback: Check DOM visibility
        const workingArea = document.getElementById("photo-working-area");
        if (workingArea && workingArea.style.display !== "none") {
            const img = workingArea.querySelector("img");
            if (img && img.src && img.src !== "") {
                return true;
            }
        }
        
        return false;
    }

    // Helper: Check if any photos have been uploaded
    function hasUploadedPhotos() {
        return window.currentPhotoMatches && window.currentPhotoMatches.length > 0;
    }

    const SELECTION_RULES = [
        {
            role: "product-selector",
            label: "Products",
            condition: (state) => {
                // Require a main photo in the Working Area before browsing/choosing products
                if (!isPhotoInWorkingArea()) {
                    return {
                        allowed: false,
                        messageKey: "alerts.selectPhotoFirst",
                        messageDefault: "Please upload and select a photo to the working area first."
                    };
                }
                return { allowed: true };
            }
        },
        {
            role: "renovate-selector",
            label: "Renovate",
            condition: (state) => {
                if (!isPhotoInWorkingArea()) {
                    return {
                        allowed: false,
                        messageKey: "alerts.selectPhotoFirst",
                        messageDefault: "Please upload and select a photo to the working area first."
                    };
                }
                return { allowed: true };
            }
        },
        {
            role: "furniture-selector",
            label: "Furniture",
            condition: (state) => {
                if (!isPhotoInWorkingArea()) {
                    return {
                        allowed: false,
                        messageKey: "alerts.selectPhotoFirst",
                        messageDefault: "Please upload and select a photo to the working area first."
                    };
                }
                return { allowed: true };
            }
        },
        {
            role: "enhance-photos",
            label: "Enhance Quality",
            condition: (state) => {
                if (!isPhotoInWorkingArea()) {
                    return {
                        allowed: false,
                        messageKey: "alerts.selectPhotoFirst",
                        messageDefault: "Please upload and select a photo to the working area first."
                    };
                }
                return { allowed: true };
            }
        },
        {
            role: "gemini-tweak",
            label: "Custom",
            condition: (state) => {
                // Rule 1: Photo Required
                if (!isPhotoInWorkingArea()) {
                    return {
                        allowed: false,
                        messageKey: "alerts.selectPhotoFirst",
                        messageDefault: "Please upload and select a photo to the working area first."
                    };
                }
                
                // Rule 2: Respect Flow Lock (e.g., must finish Renovation/Stage flow first)
                if (state.flowLock && state.flowLock.active) {
                     return {
                         allowed: false,
                         messageKey: state.flowLock.type === "stage" 
                            ? "alerts.completeStageFlow" 
                            : "alerts.completeRenovationFlow",
                         messageDefault: state.flowLock.type === "stage"
                            ? "Please select Style and apply AlgoreitAI"
                            : "Please complete Renovation by select Style and apply AlgoreitAI"
                     };
                }

                return { allowed: true };
            }
        },
        {
            role: "room-viewer",
            label: "Room",
            condition: (state) => {
                if (!hasUploadedPhotos()) {
                     return {
                        allowed: false,
                        messageKey: "alerts.noPhotosUploadedYet",
                        messageDefault: "No photos uploaded yet. Please upload photos first."
                    };
                }
                return { allowed: true };
            }
        },
        {
            role: "style-selector",
            label: "Style",
            condition: (state) => {
                // BLOCK Style if a Product is already selected (to avoid confusion)
                if (window.currentProductSelection) {
                     return {
                        allowed: false,
                        messageKey: "alerts.styleNotNeeded",
                        messageDefault: "Style selection is not needed when a specific Product is selected."
                    };
                }

                // BLOCK Style if Enhance Quality is selected (Enhance doesn't need style)
                if (state.enhanceSelected) {
                     return {
                        allowed: false,
                        messageKey: "alerts.styleNotNeededForEnhance",
                        messageDefault: "Style selection is not needed for Enhance Quality."
                    };
                }

                if (state.flowLock && state.flowLock.active && state.flowLock.requiresStyleAck) {
                     return { allowed: true };
                }
                if (!state.currentRenovationId) {
                    return {
                        allowed: false,
                        messageKey: "alerts.selectRenovationOrFurniture",
                        messageDefault: "Please select Renovation or Furniture first."
                    };
                }
                return { allowed: true };
            }
        },
        {
            role: "gemini-ai",
            label: "AlgoreitAI",
            condition: (state) => {
                const hasRenovate = !!state.currentRenovationId;
                const hasEnhance = !!state.enhanceSelected;
                const hasCustom = !!state.customPromptPending;
                const hasProduct = !!window.currentProductSelection; // Check for product

                if (!hasRenovate && !hasEnhance && !hasCustom && !hasProduct) {
                    return {
                        allowed: false,
                        messageKey: "alerts.selectSomethingFirst",
                        messageDefault: "Please select Renovation, Furniture, Enhance Quality or Custom"
                    };
                }
                
                // IF Product is selected, SKIP the style check.
                if (hasProduct) {
                    return { allowed: true };
                }

                // If Enhance is selected, SKIP style check
                if (hasEnhance) {
                    return { allowed: true };
                }

                if (hasRenovate && (!state.currentStyleContext || !state.currentStyleContext.id)) {
                     // EXCEPTION: "Remove" does not require style.
                     if (state.currentRenovationId === "furniture_clear_remove") {
                         return { allowed: true };
                     }
                     return {
                        allowed: false,
                        messageKey: "alerts.selectStyleThenAlgoreit",
                        messageDefault: "Please select Style and then apply AlgoreitAI"
                    };
                }
                return { allowed: true };
            }
        },
        // Default rule for others: Check Flow Lock
        {
            role: "*", // Wildcard for others
            condition: (state) => {
                 if (state.flowLock && state.flowLock.active) {
                     // If locked, usually only Style is allowed (handled by its own rule above).
                     // So if we are here for another button, it's blocked.
                     // Exception: Reset is usually handled before this check in main.js
                     return {
                         allowed: false,
                         messageKey: state.flowLock.type === "stage" 
                            ? "alerts.completeStageFlow" 
                            : "alerts.completeRenovationFlow",
                         messageDefault: state.flowLock.type === "stage"
                            ? "Please select Style and apply AlgoreitAI"
                            : "Please complete Renovation by select Style and apply AlgoreitAI"
                     };
                 }
                 return { allowed: true };
            }
        }
    ];

    // Helper to check a specific role against the rules
    function checkSelectionLogic(role, state) {
        // Find specific rule or fallback to wildcard
        const rule = SELECTION_RULES.find(r => r.role === role) || SELECTION_RULES.find(r => r.role === "*");
        
        if (rule) {
            return rule.condition(state);
        }
        
        return { allowed: true };
    }

    // Expose to window
    window.checkSelectionLogic = checkSelectionLogic;
    window.SELECTION_RULES = SELECTION_RULES; // For debugging or documentation display
    window.isPhotoInWorkingArea = isPhotoInWorkingArea; // Expose for other checks if needed

})();
