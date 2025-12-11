# AlgoreitAI Integration (powered by Google Gemini Nano Banana)

This document details the integration of **AlgoreitAI** (built on Google's `gemini-2.5-flash-image` model, colloquially referred to as "Nano Banana") into the Virtual Renovations app.

## Features

### 1. AI Photo Renovation
- **One-Click Renovation**: Select a **Renovate** option (e.g., "Tiles") and a **Style** (e.g., "Modern"), then click **✨ AlgoreitAI**.
- **Automatic Prompting**: The app automatically builds a professional prompt based on your selections (e.g., "Replace flooring with high-quality tiles, maintain modern aesthetic, do NOT change furniture").
- **Custom Instructions**: You can also provide custom text instructions if you prefer.

### 2. PDF Floor Plan Analysis
- **Auto-Detection**: Upload a PDF floor plan, and AlgoreitAI Vision (Gemini) will automatically analyze it to identify rooms and dimensions.
- **Smart Cropping**: The app automatically crops whitespace from PDF floor plans to ensure the drawing is large and visible.
- **Visual Reference**: The original PDF image is displayed as a background reference.

### 3. Universal "Renovation Photos" Gallery
Whether you are using a floor plan (Option A) or not (Option B), the application now manages photos in a non-destructive way:
- **Two-Row Gallery Structure**:
  - **Top Row**: **Renovation Photos** (Results from AlgoreitAI).
  - **Bottom Row**: **Raw Photos** (Original uploads).
- **Non-Destructive**: Renovating a photo *never* overwrites the original. It creates a new entry in the Renovated row.
- **Deletion**: You can individually delete photos from either row using the trash icon.

### 4. "Option B" (No Floor Plan Mode)
- **Direct Workflow**: You can skip the floor plan upload and start directly with **Upload Photos**.
- **Working Area**: Click any photo to open it in the large top **Working Area** for easy viewing and editing.

### 5. Room Viewer Improvements (Option A)
- **Multiple Photos**: You can open multiple room photos simultaneously on the floor plan.
- **Interactive Overlays**: Photos can be dragged, resized (bottom-right handle), and maximized (top-right button).

## Technical Implementation

- **Frontend**: `features/geminiAI.js` handles the UI logic, prompt construction, and gallery updates.
- **Backend**: `backend/geminiClient.js` communicates with Google's API.
- **Models**:
  - Renovation: `gemini-2.5-flash-image`
  - Analysis: `gemini-2.0-flash-exp` (or similar vision-capable model)

## Usage Guide

1.  **Upload**: Click "Upload Photos" (or "Upload Floor Plans" first if you want layout matching).
2.  **Select**: 
    - *Option A*: Use the "Room" button to view photos on the plan.
    - *Option B*: Click a photo thumbnail to load it into the **Working Area**.
3.  **Configure**:
    *   **Style ▾**: Choose a design style (e.g., Industrial).
    *   **Renovate ▾**: Choose an element to change (e.g., Wood Floor).
4.  **Process**: Click the **✨ AlgoreitAI** button.
5.  **Result**: The renovated photo is added to the **Renovation Photos** row above your original photos.
