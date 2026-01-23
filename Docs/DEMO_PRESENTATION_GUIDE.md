# AlgoreitAI Supplier Demo Presentation Guide

This guide covers how to prepare a customized demo environment for presenting AlgoreitAI to potential suppliers.

## Part 1: Visual Customization (The "Wow" Factor)
You can replace the default landing page slider images with specific examples relevant to the supplier (e.g., using their flooring or furniture in a before/after shot).

1.  **Locate the Folder**: Go to the `gallery/` folder in the project root.
2.  **Prepare Images**: Prepare "Before" and "After" images in **JPG** format.
3.  **Naming**: Rename them sequentially:
    *   `1_before.jpg` / `1_after.jpg`
    *   `2_before.jpg` / `2_after.jpg`
    *   (Up to 10 pairs supported)
4.  **Verify**: Refresh the landing page (`index.html`). The slider will now cycle through *your* custom images automatically.

---

## Part 2: Creating a Supplier Demo Account
Show the supplier how easily they can manage their catalog.

1.  **Open Supplier Portal**: Go to `http://localhost:4000/supplier.html`.
2.  **Create Account**:
    *   Click "Sign In / Sign Up" (or use the Dev User if in local mode).
    *   If no account exists, you will see the **Registration Form**.
    *   Fill in the supplier's details (Company Name, Website, etc.) to make it look authentic.
3.  **Populate Products**:
    *   **Option A (Fast - Import):** Use the "Import Products" card. Enter their website URL (e.g., `https://www.target-supplier.com`) and click **Import**. This pulls their real images and prices instantly—a powerful demo feature!
    *   **Option B (Manual):** Click "+ Add New Product" to manually upload a specific flagship product.

---

## Part 3: The Integration Demo (The "Widget")
Demonstrate how the tool lives inside *their* website.

### 1. The Script Tag
Show them the simple code snippet they would add to their site:
```html
<script src="https://app.algoreitai.com/widget.js?supplierId=THEIR_ID"></script>
```

### 2. Live Preview
You can simulate how it looks on their site by opening the app in "Embed Mode":

**URL:** `http://localhost:4000/?mode=embed&supplierId=YOUR_SUPPLIER_ID`

*   Replace `YOUR_SUPPLIER_ID` with the ID from the Supplier Portal (visible in the "Supplier" dropdown or URL).
*   **Result:** This opens the app with the header **"Select and Add Our Products"** (instead of the generic title), showing *only* their products in the catalog by default.

---

## Checklist for Presentation
- [ ] `gallery/` folder updated with relevant Before/After photos.
- [ ] Supplier account created in `supplier.html`.
- [ ] 5-10 of their products imported or added.
- [ ] Widget demo link prepared (`?mode=embed...`).
