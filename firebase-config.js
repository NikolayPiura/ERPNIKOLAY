// Firebase web config is intentionally public. Authentication and Firestore
// Security Rules protect the data; never place service-account keys here.
export const firebaseConfig = {
  apiKey: 'AIzaSyBNTLYV4bgG0V-SG6X-A5bsLA_CV7G-ElA',
  authDomain: 'erp-design-checklist.firebaseapp.com',
  projectId: 'erp-design-checklist',
  storageBucket: 'erp-design-checklist.firebasestorage.app',
  messagingSenderId: '492208094755',
  appId: '1:492208094755:web:6ec64db679907576fe7b96',
};

// This is an account identifier, not a secret. Firestore Security Rules remain
// the source of truth and reject every other signed-in account.
export const firebaseOwnerEmail = 'kol9932@gmail.com';

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  value => value && !String(value).startsWith('YOUR_'),
);
