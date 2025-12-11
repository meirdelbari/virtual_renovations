# Landing Page Specifications & Customization

## Overview
The landing page (`index.html` + `landing.css`) is designed to be a high-conversion, visually engaging entry point. It features a responsive design, an automated "Before & After" gallery, and clear call-to-action sections.

## 1. Hero Section
- **Layout**: Centered content with a "Medal" badge (`#1 AI Home Design Technology`) and a prominent title.
- **Title**: "Redesign & Stage Your Home in Seconds with AI"
- **Subtitle**: Left-aligned, 4-line paragraph explaining the value proposition ("keep it real", "practically executed").
- **Visual**: 
  - **Medal**: A custom CSS radial-gradient gold medal with red ribbon straps.
  - **Gallery**: A single prominent "Before & After" slider (increased size by ~15%).
    - **Behavior**: Auto-plays through image pairs every 3 seconds.
    - **Manual Control**: Users can drag the slider to compare.
    - **Labels**: "Before" and "After" labels appear at the bottom-left, toggling visibility at the 50% mark.
- **CTA**: "Generate Your Design" button with arrow icon.

## 2. Gallery Customization
To use your own photos in the hero gallery:
1.  Create a folder named **`gallery`** in the project root.
2.  Add image pairs named `1_before.jpg`, `1_after.jpg`, `2_before.jpg`, `2_after.jpg`, etc.
3.  The system automatically detects these local files. If missing, it falls back to the demo (Unsplash) images.

## 3. "How It Works" Section
- **Structure**: 3 Steps (Upload, Choose Style, Generate) displayed in a flex row.
- **Visuals**: Large emoji icons (📸, ✨, 🚀) with a light blue background.
- **Connectors**: Custom SVG "Arc Arrows" (`.step-arrow`) link the steps visually.
- **Typography**: Step descriptions are 15px (increased for readability).

## 4. "Why Choose AlgoreitAI?" Section
- **Structure**: 3 Feature Cards (AI Technology, Real & Reliable, Endless Styles).
- **Layout**: Grid layout (`.features-grid`) with tight spacing.
- **Typography**: Feature descriptions are 16px.

## 5. Styling & Typography
- **Font**: Inter (Google Fonts).
- **Sizes**:
  - Hero Title: 42px
  - Subtitle: 18px
  - Badges/Footer: 16px
  - Step Details: 15px
- **Colors**:
  - Primary: `#6366f1` (Indigo/Purple)
  - Text: `#111827` (Dark Gray/Black)
  - Background: White with subtle radial gradients in Hero.

## 6. Mobile Responsiveness
- **Navigation**: Simplified on mobile (links hidden).
- **Hero**: Stacks vertically; Title adjusts size.
- **Grids**: Steps and Features stack into single columns on small screens.

