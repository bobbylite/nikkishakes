import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const AUTH_PROVIDER = "oidc.pingone";

export async function upsertUser(firebaseUser, pingOneUserId, email, displayName) {
  if (!window.firebaseApp || !firebaseUser?.uid) {
    return;
  }

  const db = getFirestore(window.firebaseApp);
  const userRef = doc(db, "users", firebaseUser.uid);

  try {
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      await setDoc(userRef, {
        uuid: firebaseUser.uid,
        pingOneUserId: pingOneUserId || "",
        email: email || "",
        displayName: displayName || "",
        authProvider: AUTH_PROVIDER,
        status: "active",
        version: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      });
    } else {
      await setDoc(userRef, {
        pingOneUserId: pingOneUserId || snapshot.data().pingOneUserId || "",
        email: email || "",
        displayName: displayName || "",
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error("Failed to upsert user record:", err);
  }
}
