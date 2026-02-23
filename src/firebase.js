import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBV0_ATKze5EAnnOihjO2DSQuHsyqxXyjc",
    authDomain: "my-blog-site-78c4a.firebaseapp.com",
    projectId: "my-blog-site-78c4a",
    storageBucket: "my-blog-site-78c4a.firebasestorage.app",
    messagingSenderId: "813944670756",
    appId: "1:813944670756:web:29924c4f3cc476b087e6b1",
    measurementId: "G-6GX0P1PPDH"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
