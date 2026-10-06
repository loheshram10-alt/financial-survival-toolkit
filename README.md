# Financial Survival Toolkit — GitHub Pages Edition

This folder contains the complete, self-contained frontend files ready to be uploaded directly to GitHub and hosted on **GitHub Pages**.

## 📁 Files Included
- `index.html` — The complete web layout with Glassmorphism cards and responsive grid
- `style.css` — Design system, Space Grotesk fonts, colors, and responsive CSS
- `app.js` — All interactive tracking, Chart.js pie chart, and business logic

---

## 🚀 How to Upload to GitHub & Deploy on GitHub Pages

### Option A: Create a New GitHub Repository for GitHub Pages
1. Go to [github.com/new](https://github.com/new).
2. Name your repository (e.g. `financial-survival-toolkit`).
3. Upload the 3 files in this folder (`index.html`, `style.css`, `app.js`):
   - You can drag and drop them directly via the GitHub web interface: **Add file → Upload files**
4. Go to **Settings** → **Pages** in your repository.
5. Under **Branch**, select `main` (root) and click **Save**.
6. In ~1 minute, your site is live at:
   `https://<your-username>.github.io/financial-survival-toolkit/`

### Option B: Push with Git from Terminal
```bash
cd C:\Users\LOHESHRAM\.gemini\antigravity\scratch\financial-survival-toolkit\github-pages
git init
git add .
git commit -m "Initial commit for GitHub Pages"
git branch -M main
git remote add origin https://github.com/<your-username>/financial-survival-toolkit.git
git push -u origin main
```
Then enable GitHub Pages in repository **Settings → Pages**.

---

## 💡 Dual-Mode Architecture
- **When run locally with Spring Boot**: Connects to the REST API endpoints automatically.
- **When hosted on GitHub Pages or double-clicked offline**: Operates seamlessly in standalone mode with full persistence in browser storage!
