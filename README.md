# DiamondPlay

Ready-to-run React (Vite) project. Neeche diye steps follow karke isse GitHub pe upload karo aur run/deploy karo.

## 1. Local setup (test karne ke liye)

```bash
npm install
npm run dev
```

Ye `http://localhost:5173` pe app khol dega — yahan real browser hai, isliye file upload (screenshot attach) aur localStorage dono properly kaam karenge (Claude ke preview wali limitation yahan nahi hai).

## 2. GitHub pe upload karna (naya repo)

Apne computer pe is poore folder ko rakhne ke baad:

```bash
git init
git add .
git commit -m "Initial commit - DiamondPlay app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

`<your-username>` aur `<your-repo-name>` apne GitHub account/repo ke naam se replace karo. Agar GitHub pe repo pehle se nahi bana, to github.com pe "New repository" bana lo (empty, bina README ke) phir upar wale commands chalao.

## 3. Existing repo mein daalna (copy-paste)

Agar tumhara pehle se ek repo hai aur bas is code ko usme daalna hai:

1. Is poore folder (`package.json`, `vite.config.js`, `index.html`, `src/`) ko apne repo folder mein copy-paste kar do.
2. Phir:
```bash
git add .
git commit -m "Update DiamondPlay app"
git push
```

## 4. Free hosting (deploy) options

- **Vercel** – github repo import karo, "Framework: Vite" auto-detect ho jayega, deploy button dabao.
- **Netlify** – repo connect karo, Build command: `npm run build`, Publish directory: `dist`.
- **GitHub Pages** – `npm run build` karke `dist` folder ko `gh-pages` branch pe push karo (ya `gh-pages` npm package use karo).

## Important note

Is app mein `App.jsx` ke top pe ek `DB` layer hai jo real browser mein `localStorage` use karta hai (data persist hota hai). Sirf Claude ke artifact preview ke andar hi ye automatically in-memory fallback pe switch hota hai (kyunki wahan localStorage allowed nahi). Real deployed site pe upar wale steps follow karne ke baad sab kuch (deposit screenshot upload, data persistence) normally kaam karega.
