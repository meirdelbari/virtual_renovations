# Application Selection Logic & Rules

This document outlines the strict logic enforcing the sequence of operations in the AlgoreitAI Virtual Renovations application. These rules are implemented in `features/selectionLogic.js` and enforced by `main.js`.

## Overview

The application enforces a guided flow to ensure users provide necessary context (Photo -> Renovation Type -> Style -> Product) before generating results with AI. Recent updates allow for Supplier Product selection to bypass the Style requirement.

## Logic Table

| Button / Feature | Condition for Selection | Error Message (if blocked) |
|-----------------|-------------------------|----------------------------|
| **Renovate** | Requires **Photo in Working Area**. | "Please upload and select a photo to the working area first." |
| **Furniture** | Requires **Photo in Working Area**. | "Please upload and select a photo to the working area first." |
| **Enhance Quality** | Requires **Photo in Working Area**. | "Please upload and select a photo to the working area first." |
| **Custom** | Requires **Photo in Working Area**.<br>**Blocked** if a "Flow Lock" is active (must finish pending Renovation flow first). | "Please upload and select a photo to the working area first." <br> OR <br> "Please select Style and apply AlgoreitAI" |
| **Products** | Requires **Photo in Working Area** (a main room photo must be uploaded/selected before browsing products). | "Please upload and select a photo to the working area first." |
| **Room (Viewer)** | Requires at least one **Uploaded Photo**. | "No photos uploaded yet. Please upload photos first." |
| **Style** | **Blocked** unless **Renovate** or **Furniture** has been selected first. <br> **Blocked** if a **Supplier Product** is currently selected (Style is inferred/ignored). <br> **Blocked** if **Enhance Quality** is selected (Style not needed). | "Please select Renovation or Furniture first." <br> OR <br> "Style selection is not needed when a specific Product is selected." <br> OR <br> "Style selection is not needed for Enhance Quality." |
| **AlgoreitAI** (Generate) | **Allowed** if a **Supplier Product** is selected (Bypasses Style/Renovate check). <br> **Allowed** if **Furniture -> Remove** is selected (Bypasses Style check). <br> **Allowed** if **Enhance Quality** is selected (Bypasses Style check). <br> **Blocked** if nothing is selected. <br> **Blocked** if Renovate/Furniture (Stage) is selected but **Style** is missing (and no product selected). | "Please select Renovation, Furniture, Enhance Quality or Custom" <br> OR <br> "Please select Style and then apply AlgoreitAI" |
| **Other Buttons** | **Blocked** if a "Flow Lock" is active (meaning the user started a Renovate/Furniture flow but hasn't picked a Style yet). | "Please select Style and apply AlgoreitAI" |

## Special Flows

### Supplier Product Flow
1.  **Renovate/Furniture -> Suppliers**: Opens the Product Selector directly. The system does *not* force a generic Style selection first.
2.  **Product Selected**: The specific product (`window.currentProductSelection`) becomes the context.
3.  **Style Bypass**: The "Style" button is disabled/advised against because the product itself defines the aesthetic.
4.  **AlgoreitAI**: Can be clicked immediately.
    -   **Visuals**: The Working Area immediately updates to show a **Side-by-Side Collage** (Room | Product) as a preview.
    -   **Prompt**: The AI is instructed to "INSERT" the product from the right panel into the room on the left, while **PRESERVING** existing furniture and layout.
    -   **Result**: The final image is automatically cropped to show only the modified room.

### Furniture Remove Flow
1.  **Furniture -> Remove**: Sets `currentRenovationId` to `furniture_clear_remove`.
2.  **Style Bypass**: The "AlgoreitAI" button is unlocked immediately because removing furniture does not require a new style definition.

## Implementation Details

### `features/selectionLogic.js`

This file exports `checkSelectionLogic(role, state)` which evaluates the current application state against the rules defined above. It includes helpers like `isPhotoInWorkingArea()` which checks the DOM and global state to verify if a photo is ready for editing.

### `main.js`

The `initOpsGuard` function uses `checkSelectionLogic` to intercept clicks on the operations bar. If a user attempts an invalid action, the event is stopped and an alert is shown.

### Key State Variables

*   `window.currentRenovationId`: Indicates if a Renovation or Furniture action is active.
*   `window.currentStyleContext`: Indicates if a Style has been selected.
*   `window.currentProductSelection`: Indicates if a specific Supplier Product has been picked.
*   `window.flowLock`: A system flag used to enforce multi-step flows (e.g., forcing Style selection after Renovate).
*   `window.lastFocusedRoomPhoto`: Tracks the currently active photo in the working area.
*   `window.currentPhotoMatches`: List of all uploaded/matched photos.

## Modifying Rules

To change these rules, edit `features/selectionLogic.js`. The table structure in that file maps button roles (e.g., `style-selector`) to condition functions.
