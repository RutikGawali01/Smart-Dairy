import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBIwQbfZ52QH0wHoWc9tTQwbjaE8IblH1c",
  authDomain: "smart-dairy-bd188.firebaseapp.com",
  projectId: "smart-dairy-bd188",
  storageBucket: "smart-dairy-bd188.firebasestorage.app",
  messagingSenderId: "121688421653",
  appId: "1:121688421653:web:eb7c5f7c3e7b38c854e51c",
  measurementId: "G-6FCLBWL07Y"
};

// Prevent re-initialization
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// -----------------------------------------------------------------------
// Singleton RecaptchaVerifier
// -----------------------------------------------------------------------
let recaptchaVerifier: RecaptchaVerifier | null = null;

function getRecaptchaVerifier(): RecaptchaVerifier {
  if (recaptchaVerifier) return recaptchaVerifier;

  recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {
      console.log('reCAPTCHA solved');
    },
    'expired-callback': () => {
      clearRecaptchaVerifier();
    },
  });

  return recaptchaVerifier;
}

export function clearRecaptchaVerifier() {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch (e) {
      console.warn('Error clearing reCAPTCHA verifier:', e);
    }
    recaptchaVerifier = null;
  }
}

export async function sendPhoneOtp(
  phoneNumber: string
): Promise<ConfirmationResult> {
  const verifier = getRecaptchaVerifier();

  try {
    return await signInWithPhoneNumber(auth, phoneNumber, verifier);
  } catch (error) {
    clearRecaptchaVerifier();
    throw error;
  }
}