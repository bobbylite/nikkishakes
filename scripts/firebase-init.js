import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { firebaseConfig } from "./firebaseConfig.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);

const authReady = new Promise((resolve) => {
	const unsubscribe = onAuthStateChanged(auth, () => {
		window.firebaseAuthReadyError = null;
		unsubscribe();
		resolve();
	});
});

// Make Firebase app globally available
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseAuthReady = authReady;
