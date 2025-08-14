import DataLayer from "../back-end/Data/DataLayer";
import { getCurrentUser } from "../back-end/firebase/firebase-config";
import { getAuthManager } from "../back-end/firebase/initFirebase";

let isUpdatingStatus = false;
let lastStatusUpdateTime = 0;
const STATUS_UPDATE_COOLDOWN = 5000;
let lastUserStatus = { status: null, isActive: null, isOnline: null };
import { wrapWrite } from "../back-end/Logging";

// Helper function to add crown to premium users
export function addCrownToPremiumUser(displayName, userId) {
  // Get current user safely
  const currentUser = DataLayer.load("currentUser");

  const isPremium =
    userId === (currentUser ? currentUser.id : null)
      ? currentUser
        ? currentUser.isPremium
        : false
      : false; // No demo users - all premium status comes from Firebase user data

  if (isPremium) {
    return `${displayName} <i class="fas fa-crown" style="color: #FFD700; margin-left: 0.3rem;"></i>`;
  }
  return displayName;
}

// Update dashboard friend request indicator
export function updateDashboardFriendRequestIndicator() {
  if (!document.getElementById("dashboard").classList.contains("hidden")) {
    const requestCount =
      typeof FriendsDiscoverySystem !== "undefined"
        ? FriendsDiscoverySystem.friendRequests.length
        : 0;

    // Update any existing dashboard friend request elements
    const dashboardFriendElements = document.querySelectorAll(
      ".dashboard-friend-requests"
    );
    dashboardFriendElements.forEach((element) => {
      if (requestCount > 0) {
        element.innerHTML = `<i class="fas fa-user-friends"></i> ${requestCount} New Friend Request${
          requestCount > 1 ? "s" : ""
        }`;
        element.style.display = "block";
      } else {
        element.style.display = "none";
      }
    });
  }
}

// Update profile page friend request button if viewing someone's profile
export function updateProfilePageFriendRequestButton() {
  if (!document.getElementById("profile").classList.contains("hidden")) {
    // Check if there are any pending buttons that need updating
    const pendingButtons = document.querySelectorAll('button[style*="fbbf24"]'); // Yellow background buttons
    pendingButtons.forEach((button) => {
      if (button.innerHTML.includes("Pending")) {
        // Button is still showing pending - real-time listener will handle the update
        console.log("Found pending button on profile page");
      }
    });
  }
}

// Helper function to add online status indicator
export function addOnlineStatusIndicator(
  displayName,
  userId,
  isOnline = false,
  isActive = false
) {
  if (
    userId ===
    (DataLayer.load("currentUser") ? DataLayer.load("currentUser").id : null)
  ) {
    return displayName; // Don't show online status for current user
  }

  // Handle legacy users who don't have isActive field yet
  // If isOnline is true but isActive is undefined, assume they are active
  const isActuallyActive = isActive !== undefined ? isActive : isOnline;

  if (isOnline && isActuallyActive) {
    // Online and active: Green circle
    return `${displayName} <i class="fas fa-circle" style="color: #27ae60; font-size: 0.7rem; margin-left: 0.3rem;" title="Online"></i>`;
  } else if (isOnline && !isActuallyActive) {
    // Online but inactive: Yellow crescent moon
    return `${displayName} <i class="fas fa-moon" style="color: #fbbf24; font-size: 0.7rem; margin-left: 0.3rem;" title="Inactive"></i>`;
  } else {
    // Offline: Grey circle
    return `${displayName} <i class="fas fa-circle" style="color: #6b7280; font-size: 0.7rem; margin-left: 0.3rem;" title="Offline"></i>`;
  }
}

    // Update user status in Firebase
export async function updateUserStatus(status, isActive, forceUpdate = false) {
      if (!getCurrentUser() || !getAuthManager() || isUpdatingStatus) return;

      isUpdatingStatus = true;

      // Map status to isOnline
      const isOnline = status === 'online' || status === 'inactive';

      // Check cooldown period unless forced
      const now = Date.now();
      if (!forceUpdate && (now - lastStatusUpdateTime) < STATUS_UPDATE_COOLDOWN) {
        console.log('Status update throttled - too soon since last update');
        isUpdatingStatus = false;
        return;
      }

      // Only update if status actually changed (unless forced)
      if (!forceUpdate &&
        lastUserStatus.status === status &&
        lastUserStatus.isActive === isActive &&
        lastUserStatus.isOnline === isOnline) {
        isUpdatingStatus = false;
        return;
      }

      try {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        await wrapWrite(
          updateDoc(doc(getAuthManager().db, 'users', getCurrentUser().uid), {
            status: status,
            isOnline: isOnline,
            isActive: isActive,
            lastSeen: serverTimestamp(),
            lastStatusUpdate: serverTimestamp()
          }),
          'updateDoc',
          `users/${getCurrentUser().uid}`,
          { status, isOnline, isActive }
        );

        // Update our cache of last status
        lastUserStatus = { status, isActive, isOnline };
        lastStatusUpdateTime = now;

        console.log(`User status updated: ${status} (online: ${isOnline}, active: ${isActive})`);
      } catch (error) {
        console.error('Error updating user status:', error);
      } finally {
        isUpdatingStatus = false;
      }
}

