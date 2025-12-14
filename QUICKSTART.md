# Quick Start: AlgoreitAI Integration

## ✅ Integration Complete!

Your Virtual Renovations app now has **AlgoreitAI** image transformation capabilities (powered by Google Gemini).

---

## 🚀 To Get Started (3 Steps):

### 1. Get Your API Key
Visit https://ai.google.dev/ and click "Get API key"

### 2. Configure Backend
Create `backend/.env` file:
```env
GOOGLE_GEMINI_API_KEY=AIzaSy_your_key_here
OPENAI_API_KEY=sk-your_openai_key_here
PORT=4000
```

### 3. Start the Server
**Windows (recommended):**
Double-click `Docs/run_virtual_renovations.bat` — it will install deps (if needed), start the backend, and open `http://localhost:4000`.

**Any OS (manual):**
```bash
cd C:\Users\Meir\virtual_renovations   # or your cloned path
npm start
```
Then open `http://localhost:4000` (do **not** use `file://index.html`, APIs will fail).

---

## 🎨 How to Use:

1. Upload floor plan (JSON)
2. Upload photos
3. Click "Room" and select a room
4. Click "✨ AlgoreitAI"
5. Enter transformation instructions
6. Wait ~20 seconds
7. See the AI-transformed image!

---

## 📚 Full Documentation

See `GEMINI_INTEGRATION.md` for:
- Detailed setup instructions
- API configuration
- Troubleshooting guide
- Example prompts
- Advanced features

---

## ⚠️ Important Notes:

1. **API Key Security**: Never commit `.env` to Git
2. **Endpoint May Need Adjustment**: The AlgoreitAI (Gemini Imagen) API is in beta - check `backend/geminiClient.js` if you get errors
3. **Cost**: ~$0.04 per image transformation

---

## 🌍 Translations (English / Hebrew)

This app supports runtime translations (no separate app versions).

### How to switch language
- Open the app at `http://localhost:4000` (not `file://...`)
- Use the language dropdown (🇺🇸 / 🇮🇱) in:
  - the landing page navbar, and
  - the app header (top-right)

**Note:** language choice is saved in browser storage under `VR_LOCALE`.

### Where translations live
- `locales/english.json`
- `locales/hebrew.json`

Edit these files to change wording. The corrected text is kept in your repo and deployed with the app.

### What is translated (important namespaces)
- **Top buttons**: `ops.*` (Upload, Room, Enhance, Renovate, Furniture, Style, Reset, Guide…)
- **Dropdown contents**:
  - `styles.*` (Style list)
  - `renovate.*` (Renovate menu: titles/categories/groups/options)
  - `furniture.*` (Furniture menu)
  - `roomTypes.*` (Match Photo-Room selector)
- **Guide modal**: `guide.*` (all text inside “Guide Me”)
- **Alerts & messages**: `alerts.*`

### Add a new language (example: Spanish)
1. Create `locales/spanish.json` (copy from `locales/english.json`).
2. Add a new `<option value="es">…</option>` to the language selects in `index.html`:
   - `#lang-select` (landing)
   - `#lang-select-app` (app header)
3. Optional: if the language is RTL, add it to the RTL list in `js/i18n.js`.

### File:// limitation
Translations are loaded via `fetch("locales/<lang>.json")`, so they work best when served from the local server:
- ✅ `http://localhost:4000`
- ❌ `file://...`

---

## 🔧 Files Changed:

**Backend:**
- ✅ `backend/geminiClient.js` (NEW)
- ✅ `backend/server.js` (UPDATED)
- ✅ `backend/.env.example` (UPDATED)

**Frontend:**
- ✅ `features/geminiAI.js` (NEW)
- ✅ `index.html` (UPDATED - added button)
- ✅ `main.js` (UPDATED)
- ✅ `styles.css` (UPDATED - Google colors)

**Docs:**
- ✅ `GEMINI_INTEGRATION.md` (NEW)
- ✅ `QUICKSTART.md` (this file)

---

**Ready to transform rooms with AI!** 🎉

