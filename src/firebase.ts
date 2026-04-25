import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// In Vite, client-side environment variables must be prefixed with VITE_
// and accessed via import.meta.env
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey;

if (!apiKey || apiKey === "REPLACE_WITH_FIREBASE_API_KEY") {
  console.error("CRITICAL: VITE_FIREBASE_API_KEY is not set. Please set the VITE_FIREBASE_API_KEY environment variable.");
  // We don't throw here to allow the app to boot, but Firebase functions will fail.
  // This allows the UI to handle the error gracefully.
}

const config = {
  ...firebaseConfig,
  apiKey: apiKey || "",
};

const app = initializeApp(config);
export const db = getFirestore(app, config.firestoreDatabaseId);
export const auth = getAuth(app);
