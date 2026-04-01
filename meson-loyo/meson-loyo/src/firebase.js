import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey:            "AIzaSyBTVC5mQAW2hmKX5Bo6iFlXDpgtB0cBvUE",
  authDomain:        "meson-loyo.firebaseapp.com",
  databaseURL:       "https://meson-loyo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "meson-loyo",
  storageBucket:     "meson-loyo.firebasestorage.app",
  messagingSenderId: "1052148784587",
  appId:             "1:1052148784587:web:752862e39c5345660caa4e",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
