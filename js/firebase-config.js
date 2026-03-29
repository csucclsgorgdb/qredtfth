import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCgnfzcy6ThdpI5Vri-0_IkFb87va4pzo8",
  authDomain: "ender-8037a.firebaseapp.com",
  projectId: "ender-8037a",
  storageBucket: "ender-8037a.firebasestorage.app",
  messagingSenderId: "908666962657",
  appId: "1:908666962657:web:cdd0ca7f17eb8aa634eda0",
  measurementId: "G-SL8NX4LMD1"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
