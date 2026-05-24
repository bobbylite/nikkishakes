import { DEFAULT_FLAVOR, FLAVORS, STORAGE_KEYS } from "./constants.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

export { DEFAULT_FLAVOR, FLAVORS };

let db;
let unsubscribe = null;
let cachedShakes = [];
let dataChangeCallbacks = [];
let hasCheckedSeedData = false;

// Initialize Firestore connection
export function initializeFirestore() {
  return new Promise((resolve) => {
    // Wait for Firebase app to be initialized
    if (!window.firebaseApp) {
      const checkApp = setInterval(() => {
        if (window.firebaseApp) {
          clearInterval(checkApp);
          void setupFirestoreAfterAuth().then(resolve);
        }
      }, 100);
    } else {
      void setupFirestoreAfterAuth().then(resolve);
    }
  });
}

async function setupFirestoreAfterAuth() {
  if (window.firebaseAuthReady) {
    await window.firebaseAuthReady;
  }

  db = getFirestore(window.firebaseApp);
  setupRealtimeListener();
}

// Real-time listener for Firestore collection
function setupRealtimeListener() {
  if (!db || unsubscribe) return;

  const q = query(collection(db, "shakes"));
  unsubscribe = onSnapshot(q, (snapshot) => {
    cachedShakes = snapshot.docs
      .map((snapshotDoc) => {
        const normalized = normalizeShake(snapshotDoc.data());
        return normalized ? { ...normalized, id: snapshotDoc.id } : null;
      })
      .filter(Boolean);
    notifyDataChange();
  });
}

// Register callback for when data changes
export function onDataChange(callback) {
  dataChangeCallbacks.push(callback);
}

function notifyDataChange() {
  dataChangeCallbacks.forEach(cb => {
    try {
      cb(cachedShakes);
    } catch (err) {
      console.error("Error in data change callback:", err);
    }
  });
}

const seedShakes = [
  {
    name: "Vanilla Cloud",
    shop: "Soda & Co",
    flavor: "Vanilla",
    rating: 9.4,
    photo: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80",
    notes: "Classic vanilla bean flavor and perfect texture.",
    createdAt: new Date().toISOString()
  },
  {
    name: "Midnight Cocoa",
    shop: "Churn Club",
    flavor: "Chocolate",
    rating: 8.8,
    photo: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=900&q=80",
    notes: "Deep cocoa profile with soft whipped cream.",
    createdAt: new Date().toISOString()
  }
];

export function getShakes() {
  if (!db) {
    void initializeFirestore().then(() => {
      void seedIfCollectionEmpty();
    });
    return cachedShakes;
  }

  void seedIfCollectionEmpty();
  return cachedShakes;
}

async function seedIfCollectionEmpty() {
  if (!db || hasCheckedSeedData) {
    return;
  }

  hasCheckedSeedData = true;

  try {
    const snapshot = await getDocs(collection(db, "shakes"));
    if (!snapshot.empty) {
      return;
    }

    for (const shake of seedShakes) {
      const normalized = normalizeShake(shake);
      try {
        await addDoc(collection(db, "shakes"), normalized);
      } catch (err) {
        console.error("Error seeding data:", err);
      }
    }
  } catch (err) {
    console.error("Error checking seed data:", err);
  }
}

export async function addShake(shake) {
  if (!db) {
    await initializeFirestore();
  }

  const payload = normalizeShake({
    ...shake,
    createdAt: new Date().toISOString()
  });

  if (!payload) {
    throw new Error("Invalid shake payload");
  }

  try {
    const docRef = await addDoc(collection(db, "shakes"), payload);
    return { ...payload, id: docRef.id };
  } catch (err) {
    console.error("Error adding shake:", err);
    throw err;
  }
}

export async function updateShake(id, updates) {
  if (!db) {
    await initializeFirestore();
  }

  const normalized = normalizeShake(updates);
  if (!normalized) {
    throw new Error("Invalid updates");
  }

  try {
    await updateDoc(doc(db, "shakes", id), normalized);
  } catch (err) {
    console.error("Error updating shake:", err);
    throw err;
  }
}

export async function deleteShake(id) {
  if (!db) {
    await initializeFirestore();
  }

  try {
    await deleteDoc(doc(db, "shakes", id));
  } catch (err) {
    console.error("Error deleting shake:", err);
    throw err;
  }
}

export function groupByFlavor(shakes) {
  if (!Array.isArray(shakes)) {
    return {};
  }

  return shakes.reduce((acc, shake) => {
    const flavor = shake.flavor || DEFAULT_FLAVOR;
    if (!acc[flavor]) {
      acc[flavor] = [];
    }
    acc[flavor].push(shake);
    return acc;
  }, {});
}

export function sortByRatingDesc(shakes) {
  if (!Array.isArray(shakes)) {
    return [];
  }

  return [...shakes].sort((a, b) => Number(b.rating) - Number(a.rating));
}

function normalizeShake(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rating = Number(value.rating);
  const normalizedRating = Number.isFinite(rating) ? Math.max(1, Math.min(10, rating)) : 1;

  return {
    name: String(value.name || "Untitled Shake").trim() || "Untitled Shake",
    shop: String(value.shop || "Unknown Shop").trim() || "Unknown Shop",
    flavor: FLAVORS.includes(value.flavor) ? value.flavor : DEFAULT_FLAVOR,
    rating: Number(normalizedRating.toFixed(1)),
    photo: String(value.photo || "").trim(),
    notes: String(value.notes || "").trim(),
    createdAt: String(value.createdAt || new Date().toISOString())
  };
}
