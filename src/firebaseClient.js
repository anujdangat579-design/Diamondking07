// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBx00yYWJncsMUpoUG-ZhizjSQnb1B4jnM",
  authDomain: "diamondking07-c156c.firebaseapp.com",
  databaseURL: "https://diamondking07-c156c-default-rtdb.firebaseio.com",
  projectId: "diamondking07-c156c",
  storageBucket: "diamondking07-c156c.firebasestorage.app",
  messagingSenderId: "71035401959",
  appId: "1:71035401959:web:39b75add1c8eeb818bd442",
  measurementId: "G-CX5KRLENW8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export default app;
import { getAnalytics } from "firebase/analytics";

const analytics = getAnalytics(app);
