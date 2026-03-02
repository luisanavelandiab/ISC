import { initializeApp } from "firebase/app";
import { getAuth }  from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC6Q628yR9Myyk8n9kmQPUyanwGwSHpgLI",
  authDomain: "iscperu-2411d.firebaseapp.com",
  projectId: "iscperu-2411d",
  storageBucket: "iscperu-2411d.firebasestorage.app",
  messagingSenderId: "1042661465060",
  appId: "1:1042661465060:web:9ae4341280faba0a1bc5f1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);