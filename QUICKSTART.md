# Quick Start

This repo is a **single app**:

- **Frontend**: static files (`index.html`, `features/`, `js/`, CSS, assets)
- **Backend**: Express app exported from `api/index.js` (works on Vercel + local dev)

## Local development (recommended)

1. Install deps:

```bash
npm install
```

2. Create a **root** `.env` (do not commit it):

```env
GOOGLE_GEMINI_API_KEY=AIzaSy_your_key_here
OPENAI_API_KEY=sk_your_openai_key_here
PORT=4000
```

3. Start the server:
- **Windows**: double-click `Docs/run_virtual_renovations.bat`
- **Any OS**:

```bash
npm start
```

4. Open `http://localhost:4000`

Avoid `file://index.html` because `/api/...` calls will fail in the browser.

## How to use (main flow)

- Upload photos (and optionally a floor plan)
- Pick **Renovate** / **Furniture** / **Style**
- Click **✨ AlgoreitAI**

## Translations (i18n)

- **Files**: `locales/english.json`, `locales/hebrew.json`
- **Runtime loader**: `js/i18n.js`
- **Storage key**: `VR_LOCALE`

## More docs

- `GEMINI_INTEGRATION.md`: AlgoreitAI / Gemini details
- `Docs/SELECTION_LOGIC.md`: button/flow rules
- `Docs/README.md`: doc index

