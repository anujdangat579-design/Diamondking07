# DiamondPlay — Firebase Setup

Yeh project **Firebase Firestore** ko real shared database ki tarah use karta hai —
kisi bhi device se koi bhi change (deposit, bet, admin action) turant baaki sab
devices pe realtime dikhega.

## 1. Firebase project banao

1. https://console.firebase.google.com kholo → **"Add project"**
2. Naam do (e.g. `diamondplay`) → Continue → Google Analytics off kar sakte ho → **Create project**

## 2. Firestore Database on karo

1. Left sidebar mein **Build → Firestore Database**
2. **"Create database"** dabao
3. **"Start in test mode"** select karo (baad mein `firestore.rules` file se rules set karenge)
4. Location choose karo (jo bhi nearest ho, e.g. `asia-south1`) → **Enable**

## 3. Firestore rules laga do

1. Firestore Database screen mein **"Rules"** tab pe jao
2. Is repo ki `firestore.rules` file ka poora content copy karke wahan paste karo
3. **Publish** dabao

## 4. Web app add karo aur config copy karo

1. Project Settings (⚙️) → **"Your apps"** → **`</>`** (Web) icon pe tap karo
2. App nickname do (e.g. `diamondplay-web`) → **Register app**
3. Jo `firebaseConfig` object dikhega, usse copy karo

## 5. Config `src/firebaseClient.js` mein paste karo

`src/firebaseClient.js` file kholo aur `firebaseConfig` object ki saari values apni
real values se replace karo:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

## 6. GitHub pe push + Vercel deploy

1. Yeh poora folder GitHub repo mein push/upload karo (ya commit karo)
2. Vercel mein import karo — Vite project auto-detect ho jayega
3. Deploy hone ke baad app kholo — ab data Firestore mein save hoga aur
   sab devices pe live sync hoga

---

### Kaise kaam karta hai (technical)

- Poora app data (`dp_users`, `dp_transactions`, `dp_platform_config`, etc.) ek
  Firestore collection `app_kv` mein document-per-key store hota hai
- App load hote hi poora `app_kv` collection fetch karke local cache mein bhar
  diya jata hai (`hydrateFromFirebase`)
- Uske baad ek realtime listener (`onSnapshot`) chalu ho jata hai — koi bhi
  device se change hote hi baaki sab devices ka cache turant update ho jata
  hai aur screen refresh ho jati hai
- Koi Firebase Auth use nahi ho raha — app apna khud ka phone+OTP login system
  use karta hai jaisa pehle se tha
