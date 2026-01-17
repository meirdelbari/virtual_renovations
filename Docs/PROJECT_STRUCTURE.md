# Project structure

This repo is intentionally **framework-free** on the frontend (plain HTML/CSS/JS) and uses a single Express app on the backend.

## Top-level map

- `index.html`: main UI entry (loads scripts via `<script src="...">`)
- `features/`: **main app features** (one file per capability; each exposes `window.initX()` / module globals)
- `js/`: shared UI/util scripts (i18n, supplier portal/admin tooling)
- `api/`: backend (Express app + services). Entry is `api/index.js`
- `locales/`: runtime translations loaded by `js/i18n.js`
- `Docs/`: documentation and internal specs
- `styles.css`, `landing.css`, `renovate.css`, `main.css`: styling
- `supplier.html`, `supplier_admin.html`: supplier portal pages
- `importer.html`: legacy/simple scraper UI (kept for quick manual testing)
- `widget.js`: embeddable widget that loads the app in an iframe (`?mode=embed`)

## Backend structure (`api/`)

- `api/index.js`: Express app + routes, exported for Vercel and runnable locally (`npm start`)
- `api/geminiClient.js`: AlgoreitAI (Gemini) client
- `api/paymentService.js`: Stripe + credits
- `api/productScraper.js`: scrape products from supplier URLs
- `api/supplierRoutes.js`: supplier portal API routes
- `api/data/*.json`: simple JSON persistence for products/suppliers (dev/small scale)

## Frontend structure (`features/`)

Pattern:

- One feature per file (e.g. `features/uploadPhotos.js`)
- Expose a single initializer like `window.initUploadPhotos = function () { ... }`
- Keep shared cross-feature state on `window.*` only when needed

Entrypoint wiring:

- `index.html` loads `features/*` scripts and then `main.js`
- `main.js` calls each `window.initX()` on `DOMContentLoaded`

## Conventions (recommended)

- Add new user-facing functionality as a new file in `features/` (or extend the most relevant feature file).
- Add shared helpers that are not a “feature” into `js/` (e.g. i18n).
- Add new backend endpoints in `api/index.js` and keep the heavy lifting in a dedicated module in `api/`.
- Keep **generated/large** folders out of git (already covered by `.gitignore`: `node_modules/`, `Backups/`, `raw_photos/`, `Renovated Photos/`, etc.).

## Legacy / cleanup notes

- `backend/` currently appears to be a legacy folder (contains `node_modules/` only). It is not used by `npm start` (which runs `api/index.js`).
  - Recommended: delete `backend/` entirely to reduce repo size and confusion.

