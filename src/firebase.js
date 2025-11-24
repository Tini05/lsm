// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyChkz92LImyEty7Zd_KwC_tW5IjuzZTA0A",
  authDomain: "tetovo-lms.firebaseapp.com",
  databaseURL: "https://tetovo-lms-default-rtdb.firebaseio.com",
  projectId: "tetovo-lms",
  storageBucket: "tetovo-lms.appspot.com",
  messagingSenderId: "301649840807",
  appId: "1:301649840807:web:2bd2ff2fd1eb0a489b2982",
};

console.log("firebaseConfig at runtime:", firebaseConfig);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export function createRecaptcha(containerId = "recaptcha-container") {
  if (!window.recaptchaRendered) {
    const verifier = new RecaptchaVerifier(containerId, { size: "invisible" }, auth);
    verifier.render().then(() => {
      window.recaptchaRendered = true;
    });
    return verifier;
  }
  return null;
}

export default app;
