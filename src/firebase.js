// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB8x1pbMHU3H-ENtAM5MjVp4UaeSMSzq_U",
  authDomain: "diamondsplay.firebaseapp.com",
  projectId: "diamondsplay",
  storageBucket: "diamondsplay.firebasestorage.app",
  messagingSenderId: "371260462439",
  appId: "1:371260462439:web:e620b38d296b5cf302cbc2",
  measurementId: "G-MTYV02MCZ9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
