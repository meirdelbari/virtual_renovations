# Gallery Customization Instructions

The Virtual Renovations landing page features an automated "Before & After" slider gallery. You can easily customize this gallery with your own renovation photos by following these steps.

## 1. Locate the Gallery Folder
In the root directory of the project, find the folder named:
`gallery/`

## 2. Add Your Photos
Place your photo pairs into this folder.

**Important Naming Convention:**
The system automatically looks for files with specific names. You must rename your files to match this pattern exactly (JPG format):

*   **Project 1:** `1_before.jpg` and `1_after.jpg`
*   **Project 2:** `2_before.jpg` and `2_after.jpg`
*   **Project 3:** `3_before.jpg` and `3_after.jpg`
*   ...and so on.

**Notes:**
*   You can add up to **10 pairs** (e.g., `10_before.jpg`).
*   The system currently supports **.jpg** files only.
*   Ensure the numbers are sequential (start with 1).

## 3. How It Works
*   **Automatic Detection:** When the page loads, it checks the `gallery/` folder.
*   **Your Photos First:** If it finds `1_before.jpg` and `1_after.jpg`, it will prioritize displaying your local photos.
*   **Fallback:** If the folder is empty or the files are missing, the gallery will automatically show the default demo images (Unsplash examples) so the page always looks good.

## 4. Troubleshooting
*   **Images not showing?**
    *   Check that the file extension is exactly `.jpg` (lowercase) and not `.jpeg` or `.png`.
    *   Check that the filenames match the pattern exactly (e.g., `1_before.jpg`).
    *   Ensure the images are inside the `gallery` folder, not the root.

