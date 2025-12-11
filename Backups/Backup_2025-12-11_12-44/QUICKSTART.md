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
```bash
cd backend
npm start
```

Then open `index.html` in your browser!

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

