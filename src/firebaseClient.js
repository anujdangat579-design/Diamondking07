import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ── Firebase config ──────────────────────────────────────────────────────
// Get these from: Firebase Console → Project Settings → General →
// "Your apps" → Web app (</>)  → SDK setup and configuration → Config
const firebaseConfig = {
  apiKey: "AIzaSyC1D3F9DCIVigcUzLi2LP3qeEshXmEmOwQ",
  authDomain: "diamondking-ea16e.firebaseapp.com",
  databaseURL: "https://diamondking-ea16e-default-rtdb.firebaseio.com",
  projectId: "diamondking-ea16e",
  storageBucket: "diamondking-ea16e.firebasestorage.app",
  messagingSenderId: "311525526239",
  appId: "1:311525526239:web:7d1ece4e8e1781f790b76a",
  measurementId: "G-J7NEXJC2F3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
