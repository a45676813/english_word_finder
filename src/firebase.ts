import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const addWordToVocab = async (userId: string, word: string) => {
  try {
    const vocabRef = collection(db, 'users', userId, 'vocab');
    
    // Optional: Check if word already exists to avoid duplicates
    const q = query(vocabRef, where("word", "==", word));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return { success: true, alreadyExists: true };
    }

    await addDoc(vocabRef, {
      word,
      userId,
      addedAt: serverTimestamp(),
      source: 'WordFinder'
    });
    return { success: true, alreadyExists: false };
  } catch (error) {
    console.error("Error adding word to vocab:", error);
    throw error;
  }
};
