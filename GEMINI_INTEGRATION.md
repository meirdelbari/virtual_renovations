# AlgoreitAI Integration (powered by Google Gemini)

This document details the integration of **AlgoreitAI** (built on Google's Gemini models) into the Virtual Renovations app.

## Features

### 1. AI Photo Renovation
- **One-Click Renovation**: Select a **Renovate** option (e.g., "Tiles") and a **Style** (e.g., "Modern"), then click **✨ AlgoreitAI**.
- **Automatic Prompting**: The app automatically builds a professional prompt based on your selections.
- **Model**: Uses **Gemini 3 Pro Image** (`gemini-3-pro-image-preview`) for high-fidelity, photorealistic material changes and details.

### 2. Product Integration (Merging)
- **Real Product Visualization**: Select a product from the catalog and click "AlgoreitAI" to merge it into your room photo.
- **Supplier Portal Source**: Products are managed via the Supplier Portal and can be internal (Base64) or imported (external URLs). The system handles both types seamlessly during collage generation.
- **Smart Collage**: The system builds a side-by-side collage of your room and the product to guide the AI.
- **Chaining & Replacement**: You can merge multiple products sequentially. The result of one merge can serve as the input for the next. The system is context-aware: adding a second flooring product will **replace** the previous floor, while adding furniture will **add** to the scene.
- **Model**: Uses **Gemini 2.5 Flash Image** (`gemini-2.5-flash-image`, aka "Nano Banana") which is optimized for spatial reasoning and image editing tasks like object insertion.

### 3. PDF Floor Plan Analysis
- **Auto-Detection**: Upload a PDF floor plan, and AlgoreitAI Vision will automatically analyze it to identify rooms and dimensions.
- **Model**: Uses **Gemini 2.0 Flash** (`gemini-2.0-flash-exp`) for fast and accurate document analysis.

### 4. Universal "Renovation Photos" Gallery
- **Two-Row Gallery Structure**:
  - **Top Row**: **Renovation Photos** (Results from AlgoreitAI).
  - **Bottom Row**: **Raw Photos** (Original uploads).
- **Non-Destructive**: Renovating a photo *never* overwrites the original. It creates a new entry in the Renovated row.

## Technical Implementation

- **Frontend**: `features/geminiAI.js` handles the UI logic, prompt construction, and gallery updates.
- **Backend**: `api/geminiClient.js` communicates with Google's API (used by `api/index.js`).
- **Model Strategy**:
  - **Renovations & 3D Views**: `gemini-3-pro-image-preview` (Best quality/details).
  - **Product Merging**: `gemini-2.5-flash-image` (Best instruction following for edits).
  - **Vision Analysis**: `gemini-2.0-flash-exp` (Best speed/accuracy for text/layout).

## Usage Guide

1.  **Upload**: Click "Upload Photos".
2.  **Select**: Click a photo thumbnail to load it into the **Working Area**.
3.  **Configure**:
    *   **Style ▾**: Choose a design style.
    *   **Renovate ▾**: Choose an element to change.
4.  **Process**: Click the **✨ AlgoreitAI** button.
5.  **Result**: The renovated photo is added to the **Renovation Photos** row.

## Local vs Vercel

- **Local**: run `npm start` (starts `api/index.js` on `http://localhost:4000`)
- **Vercel**: requests to `/api/*` are rewritten to `api/index.js` via `vercel.json`
