# Run Instructions (Windows)

These steps start the Virtual Renovations app locally on your Windows PC.

## 1) Requirements
- Install Node.js (LTS): https://nodejs.org
- This also installs npm automatically.

## 2) Start the app (recommended)
- Double-click `Docs/run_virtual_renovations.bat`

What it does:
- Installs dependencies (first run only)
- Starts the server on `http://localhost:4000`
- Opens the app in your browser

## 3) Start the app (manual)
Open PowerShell in the project folder (`C:\Users\Meir\virtual_renovations`) and run:

```powershell
npm install
npm start
```

Then open:

```
http://localhost:4000
```

## 4) Important notes
- Do not open `index.html` directly (file://...). The API calls will fail.
- Always use `http://localhost:4000`

## 5) If it does not start
If port 4000 is busy or the server is stuck:

```powershell
taskkill /F /IM node.exe
```

Then run `Docs/run_virtual_renovations.bat` again.
