import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Handle Login
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Fetch Role from Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            localStorage.setItem('userRole', userData.role); // Cache role for UI speed
            localStorage.setItem('orgId', userData.orgId);   // Multi-org support
            window.location.href = "dashboard.html";
        }
    } catch (error) {
        alert("Login Failed: " + error.message);
    }
}

// Security Guard: Protect Pages
export function checkAuth() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "index.html";
        } else {
            setupUIBasedOnRole();
        }
    });
}

function setupUIBasedOnRole() {
    const role = localStorage.getItem('userRole');
    // Hide modules that the staff shouldn't see
    if (role === 'Staff') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
}

// Logout
export async function logout() {
    await signOut(auth);
    localStorage.clear();
    window.location.href = "index.html";
}
