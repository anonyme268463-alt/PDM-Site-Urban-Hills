// config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAI3qBm_8zltFCTyPyLFNLcY-aU9GI1itM",
  authDomain: "pdm-urban-hills.firebaseapp.com",
  projectId: "pdm-urban-hills",
  storageBucket: "pdm-urban-hills.firebasestorage.app",
  messagingSenderId: "426355558661",
  appId: "1:426355558661:web:8364782043dd5ad2270f6c",
  measurementId: "G-RGM2DWVFLT"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
