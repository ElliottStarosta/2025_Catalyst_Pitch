import { setCurrentUser } from "../firebase/firebase-config.js";
import { wrapRead } from "../Logging.js";
import DataLayer from "../Data/DataLayer.js";
import {
  updateDashboard,
  updateProfile,
} from "../../front-end/UIManagement.js";
import {
  initializeRealtimeSystem,
  setupActivityTracking,
} from "../Listeners.js";
import {
  showPage,
  updateNavigationVisibility,
} from "../../front-end/UIManagement.js";

let authManager = null;
let userManager = null;
let friendsManager = null;

const managers = {
  auth: null,
  user: null,
  friends: null,
};

export const getAuthManager = () => managers.auth;
export const setAuthManager = (m) => {
  managers.auth = m;
};

export const getUserManager = () => managers.user;
export const setUserManager = (m) => {
  managers.user = m;
};

export const getFriendsManager = () => managers.friends;
export const setFriendsManager = (m) => {
  managers.friends = m;
};

// Initialize Firebase Authentication
export async function initializeFirebaseAuth() {
  try {
    // Import Firebase modules
    const { initializeApp } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
    );
    const { getAuth, onAuthStateChanged } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"
    );
    const { getFirestore } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );

    // Import Firebase configuration
    const { firebaseConfig } = await import("../firebase/firebase-config.js");

    // Check if Firebase is properly configured
    if (!firebaseConfig.apiKey) {
      console.warn(
        "Firebase not configured. Please update firebase-config.js with your Firebase project details."
      );
      NotificationSystem.show(
        "Firebase not configured. Please check the console for setup instructions.",
        "warning"
      );
      return false;
    }

    console.log("Firebase config loaded:", {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      hasApiKey: !!firebaseConfig.apiKey,
    });

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Set up auth state listener
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);

        console.log("User signed in:", user.uid);
        await loadUserProfile(user.uid);
        setupActivityTracking();
        showPage("dashboard");
        updateNavigationVisibility();
      } else {
        setCurrentUser(null);
        console.log("User signed out");
        showPage("login");
        updateNavigationVisibility();
      }
    });

    // Initialize managers
    setAuthManager({ auth, db });
    setUserManager({ db });
    setFriendsManager({ db });

    console.log("Firebase Auth initialized successfully");
    return true;
  } catch (error) {
    console.error("Error initializing Firebase Auth:", error);
    NotificationSystem.show(
      "Failed to initialize Firebase. Please check your configuration.",
      "error"
    );
    return false;
  }
}

// Load user profile from Firestore
async function loadUserProfile(userId) {
  try {
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );
    const userDoc = await wrapRead(
      getDoc(doc(getAuthManager().db, "users", userId)),
      "getDoc",
      `users/${userId}`,
      {}
    );
    console.log("User doc:", userDoc);

    if (userDoc.exists()) {
      const userData = userDoc.data();

      // Update current user data
      DataLayer.save("currentUser", {
        id: userId,
        username: userData.username,
        displayName: userData.displayName,
        avatar: userData.avatar,
        adjustmentFactor: userData.adjustmentFactor || 0.0,
        personalityType: userData.personalityType || "Not Set",
        isPremium: userData.isPremium || false,
        location: userData.location || null,
      });

      // Save personality data to local storage if available
      if (userData.adjustmentFactor !== undefined && userData.personalityType) {
        DataLayer.save("personalityScore", {
          adjustmentFactor: userData.adjustmentFactor,
        });
        DataLayer.save("personalityType", { type: userData.personalityType });

        // Remove assessment tab if user has completed assessment
        const assessmentTab = document.querySelector(
          "li:has([onclick=\"showPage('assessment')\"])"
        );
        if (assessmentTab) {
          assessmentTab.remove();
        }
      }

      // Update UI
      updateDashboard();
      updateProfile();

      // Start real-time system
      initializeRealtimeSystem();
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
  }
}
