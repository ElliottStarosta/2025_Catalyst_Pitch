import { showPage } from "../front-end/UIManagement.js";
import { getCurrentUser } from "./firebase/firebase-config.js";
import { getAuthManager } from "./firebase/initFirebase.js";
import { batchLoadEssentialData } from "./Data/CacheSystem.js";
import DataLayer from "./Data/DataLayer.js";
import { updateDashboardFriendRequestIndicator,updateProfilePageFriendRequestButton, updateUserStatus } from "../front-end/UserIcons.js";
import FriendsSystem from "./System/Friends/FriendsSystem.js";
import NotificationSystem from "./System/NotificationSystem.js";
import CacheSystem from "./Data/CacheSystem.js";

let activityTrackingInitialized = false;
let statusUpdateInterval = null;
let locationSchedulerStarted = false;
let lastStatusUpdateTime = 0;
let areRealtimeListenersActive = false;

let activityTimeout = null;
let isUserActive = true;
let lastActivityTime = Date.now();

// Additional presence watch list for currently visible users (e.g., friendship page)

export let additionalPresenceWatchIds = new Set();


// Single-flight/debounce for user-status listeners
let isUserStatusInitInFlight = false;
let userStatusRefreshTimer = null;

// Throttle UI churn from presence updates
let lastUserStatusUIUpdate = 0;
const USER_STATUS_UI_MIN_INTERVAL = 2000; // 2s between UI refreshes
let _initRealtimeInFlight = false;

let realtimeListenersInitialized = false;
let isResumingListeners = false;

let realtimeListeners = {
  friendRequests: null,
  outgoingRequests: null,
  friendships1: null,
  friendships2: null,
  groups: null,
  userStatus: null,
  friendStatuses: null,
};

export function setupActivityTracking() {
  if (activityTrackingInitialized) return;
  activityTrackingInitialized = true;
  // Track mouse movements, clicks, and keyboard activity - more responsive
  const events = [
    "mousedown",
    "mousemove",
    "keypress",
    "scroll",
    "touchstart",
    "click",
    "keydown",
  ];
  let activityThrottle = null;

  const throttledTrackActivity = () => {
    if (activityThrottle) return;
    activityThrottle = setTimeout(() => {
      trackUserActivity();
      activityThrottle = null;
    }, 800); // Throttle to ~1.25 times per second
  };

  events.forEach((event) => {
    document.addEventListener(event, throttledTrackActivity, true);
  });

  // Track page visibility changes (no Firebase status writes on tab switch)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseRealtimeListeners();
    } else {
      // User returned to the page
      // Do not force status write; activity will trigger heartbeat if needed
      resumeRealtimeListeners();
    }
  });

  // Track window focus/blur for more granular presence
  window.addEventListener("focus", () => {
    if (!document.hidden) {
      resumeRealtimeListeners();
    }
  });

  window.addEventListener("blur", () => {
    // Do not mark inactive on blur; simply pause listeners to reduce reads
    pauseRealtimeListeners();
  });

  // Write offline on pagehide/beforeunload to ensure immediate presence accuracy
  // Avoid costly network waits by using a short, best-effort write.
  const handleFastOffline = () => {
    try {
      if (!getCurrentUser() || !getAuthManager()) return;
      // Fire-and-forget status update (no throttling)
      updateUserStatus("offline", false, true);
    } catch (_) {}
  };

  window.addEventListener("pagehide", handleFastOffline, { capture: true });
  window.addEventListener("beforeunload", handleFastOffline, { capture: true });

  // Periodic activity heartbeat (respects cooldown and no-op if unchanged)
  setInterval(() => {
    if (!document.hidden && isUserActive) {
      updateUserStatus("online", true, false);
    }
  }, 60000);
}

// Initialize real-time listeners for critical data only
export async function initializeRealTimeListeners() {
  if (realtimeListenersInitialized) return;
  realtimeListenersInitialized = true;

  console.log("🔄 Setting up real-time listeners...");

  try {
    const {
      collection,
      query,
      where,
      onSnapshot,
      doc,
      onSnapshot: docOnSnapshot,
    } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );

    // 1. REAL-TIME: Friend Request Listeners
    await initializeFriendRequestListeners(
      collection,
      query,
      where,
      onSnapshot
    );

    // 2. REAL-TIME: Group Update Listeners
    await initializeGroupUpdateListeners(
      collection,
      query,
      where,
      onSnapshot,
      doc,
      docOnSnapshot
    );

    // 3. REAL-TIME: User Status Updates (presence system)
    await initializeUserStatusListeners();

    // ACTIVITY TRACKING: Real-time presence detection
    setupActivityTracking();

    console.log("✅ Real-time listeners initialized");
  } catch (error) {
    console.error("❌ Error setting up real-time listeners:", error);
  }
}

// Pause all realtime listeners (used when user is inactive/hidden)
function pauseRealtimeListeners() {
  if (!areRealtimeListenersActive) return;
  console.log("⏸️ Pausing real-time listeners due to inactivity/hidden tab");
  cleanupRealtimeListeners();
  areRealtimeListenersActive = false;
}

// Resume realtime listeners with a fresh batch sync
async function resumeRealtimeListeners() {
  if (areRealtimeListenersActive || isResumingListeners) return;

  isResumingListeners = true;
  console.log("▶️ Resuming real-time listeners with batch refresh");

  try {
    await batchLoadEssentialData();
    // Reset the initialization flag to allow fresh setup
    realtimeListenersInitialized = false;
    await initializeRealTimeListeners();
    areRealtimeListenersActive = true;
    startLocationScheduler();
  } catch (error) {
    console.error("Error resuming real-time listeners:", error);
  } finally {
    isResumingListeners = false;
  }
}

// Real-time friend request listeners
async function initializeFriendRequestListeners(
  collection,
  query,
  where,
  onSnapshot
) {
  if (!getCurrentUser() || !getAuthManager()) return;

  // Prevent duplicate initialization
  if (realtimeListeners.friendRequests) return;

  try {
    // Listen for incoming friend requests
    const incomingRequestsQuery = query(
      collection(getAuthManager().db, "friendRequests"),
      where("toUserId", "==", getCurrentUser().uid),
      where("status", "==", "pending")
    );

    realtimeListeners.friendRequests = onSnapshot(
      incomingRequestsQuery,
      (snapshot) => {
        const newRequests = [];
        const previousCount =
          typeof FriendsDiscoverySystem !== "undefined"
            ? FriendsDiscoverySystem.friendRequests.length
            : 0;

        snapshot.forEach((doc) => {
          newRequests.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        // Update local friend requests
        if (typeof FriendsDiscoverySystem !== "undefined") {
          FriendsDiscoverySystem.friendRequests = newRequests;
          FriendsDiscoverySystem.updateFriendRequestBadge();

          // Force immediate UI refresh in any friendship UI
          if (
            typeof FriendsDiscoverySystem !== "undefined" &&
            FriendsDiscoverySystem.displayUsers
          ) {
            FriendsDiscoverySystem.displayUsers();
          }

          // Show notification for new requests only if count increased
          if (newRequests.length > previousCount && newRequests.length > 0) {
            const newCount = newRequests.length - previousCount;
            NotificationSystem.show(
              `You have ${newCount} new friend request${
                newCount > 1 ? "s" : ""
              }! Click to view.`,
              "info",
              7000,
              () => {
                showPage("feed");
                setTimeout(() => {
                  const friendshipTab =
                    document.getElementById("friendship-tab");
                  if (friendshipTab) {
                    friendshipTab.click();
                  }
                }, 100);
              }
            );
          }

          // Presence list may change; refresh per-user listeners
          refreshUserStatusListeners();
        }

        // Update dashboard friend request indicator if on dashboard
        updateDashboardFriendRequestIndicator();

        // Update profile page friend request button if viewing someone's profile
        updateProfilePageFriendRequestButton();

        console.log("Real-time friend requests updated:", newRequests.length);
      },
      (error) => {
        console.error("Error listening to friend requests:", error);
      }
    );

    // Listen for friend request status changes (accepted/rejected)
    const outgoingRequestsQuery = query(
      collection(getAuthManager().db, "friendRequests"),
      where("fromUserId", "==", getCurrentUser().uid)
    );

    realtimeListeners.outgoingRequests = onSnapshot(
      outgoingRequestsQuery,
      (snapshot) => {
        console.log("Outgoing requests updated:", snapshot.size, "requests");

        snapshot.docChanges().forEach((change) => {
          const request = change.doc.data();

          if (change.type === "modified") {
            if (request.status === "accepted") {
              console.log(`Friend request accepted by ${request.toUserId}`);
              FriendsSystem.updateFriendButton(request.toUserId, true);
              NotificationSystem.show("Friend request accepted!", "success");

              // Optimistically update pending list locally to avoid refetches
              if (typeof FriendsDiscoverySystem !== "undefined") {
                FriendsDiscoverySystem.pendingRequests = (
                  FriendsDiscoverySystem.pendingRequests || []
                ).filter((r) => r.toUserId !== request.toUserId);
              }

              // clean up request in background
              setTimeout(async () => {
                try {
                  const { doc, deleteDoc } = await import(
                    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
                  );
                  await wrapWrite(
                    deleteDoc(
                      doc(getAuthManager().db, "friendRequests", change.doc.id)
                    ),
                    "deleteDoc",
                    `friendRequests/${change.doc.id}`,
                    { reason: "accepted_cleanup" }
                  );
                } catch (error) {
                  console.error("Error cleaning up friend request:", error);
                }
              }, 2000);
            } else if (request.status === "rejected") {
              console.log(`Friend request rejected by ${request.toUserId}`);
              FriendsSystem.updateFriendButton(request.toUserId, false);
              NotificationSystem.show(
                "Friend request was declined.",
                "warning"
              );

              // Track cooldown locally
              if (typeof FriendsDiscoverySystem !== "undefined") {
                FriendsDiscoverySystem.setCooldown(
                  request.toUserId,
                  5 * 60 * 1000
                );
                FriendsDiscoverySystem.pendingRequests = (
                  FriendsDiscoverySystem.pendingRequests || []
                ).filter((r) => r.toUserId !== request.toUserId);
              }
            }
          }
        });
      }
    );

    // Listen for new friendships (when requests are accepted by recipient)
    const friendsQuery = query(
      collection(getAuthManager().db, "friends"),
      where("user1Id", "==", getCurrentUser().uid)
    );

    const friendsQuery2 = query(
      collection(getAuthManager().db, "friends"),
      where("user2Id", "==", getCurrentUser().uid)
    );

    // Listen to both friendship queries
    realtimeListeners.friendships1 = onSnapshot(friendsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const friendship = change.doc.data();
          console.log("New friendship detected (user1):", friendship);

          // Update UI to show they're now friends
          const friendId = friendship.user2Id;
          FriendsSystem.updateFriendButton(friendId, true);

          // Minimal local update to avoid heavy refetches
          if (typeof FriendsDiscoverySystem !== "undefined") {
            const exists = (FriendsDiscoverySystem.currentFriends || []).some(
              (u) => u.id === friendId
            );
            if (!exists) {
              FriendsDiscoverySystem.currentFriends = [
                ...(FriendsDiscoverySystem.currentFriends || []),
                { id: friendId },
              ];
            }
            FriendsDiscoverySystem.displayUsers();
            refreshUserStatusListeners();
          }
        }
      });
    });

    realtimeListeners.friendships2 = onSnapshot(friendsQuery2, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const friendship = change.doc.data();
          console.log("New friendship detected (user2):", friendship);

          // Update UI to show they're now friends
          const friendId = friendship.user1Id;
          FriendsSystem.updateFriendButton(friendId, true);

          // Minimal local update to avoid heavy refetches
          if (typeof FriendsDiscoverySystem !== "undefined") {
            const exists = (FriendsDiscoverySystem.currentFriends || []).some(
              (u) => u.id === friendId
            );
            if (!exists) {
              FriendsDiscoverySystem.currentFriends = [
                ...(FriendsDiscoverySystem.currentFriends || []),
                { id: friendId },
              ];
            }
            FriendsDiscoverySystem.displayUsers();
            refreshUserStatusListeners();
          }
        }
      });
    });

    console.log("Friend request real-time listeners initialized");
    // Rebuild presence listeners for the relevant user set
    refreshUserStatusListeners();
  } catch (error) {
    console.error("Error initializing friend request listeners:", error);
  }
}

export async function initializeRealtimeSystem() {
  if (!getCurrentUser() || !getAuthManager()) return;
  if (_initRealtimeInFlight) return; // cooldown: skip duplicate inits
  _initRealtimeInFlight = true;

  // Step 1: BATCH LOAD - Load all essential user data in one go
  await batchLoadEssentialData();

  // Step 2: REAL-TIME LISTENERS - Set up real-time listeners for critical data
  await initializeRealTimeListeners();
  areRealtimeListenersActive = true;
  // Start background location scheduler
  startLocationScheduler();

  console.log("✅ Real-time system fully initialized");
  setTimeout(() => {
    _initRealtimeInFlight = false;
  }, 100);
}

// Cleanup real-time listeners
function cleanupRealtimeListeners() {
  if (realtimeListeners.friendRequests) {
    realtimeListeners.friendRequests();
    realtimeListeners.friendRequests = null;
  }

  if (realtimeListeners.outgoingRequests) {
    realtimeListeners.outgoingRequests();
    realtimeListeners.outgoingRequests = null;
  }

  if (realtimeListeners.friendships1) {
    realtimeListeners.friendships1();
    realtimeListeners.friendships1 = null;
  }

  if (realtimeListeners.friendships2) {
    realtimeListeners.friendships2();
    realtimeListeners.friendships2 = null;
  }

  if (realtimeListeners.friendStatuses) {
    Object.values(realtimeListeners.friendStatuses).forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });
    realtimeListeners.friendStatuses = null;
  }

  if (realtimeListeners.groups) {
    if (Array.isArray(realtimeListeners.groups)) {
      realtimeListeners.groups.forEach((listener) => listener());
    } else {
      realtimeListeners.groups();
    }
    realtimeListeners.groups = null;
  }

  if (realtimeListeners.userStatus) {
    realtimeListeners.userStatus();
    realtimeListeners.userStatus = null;
  }

  if (statusUpdateInterval) {
    clearInterval(statusUpdateInterval);
    statusUpdateInterval = null;
  }
  locationSchedulerStarted = false;

  console.log("Real-time listeners cleaned up");
}
// Initialize real-time user status listeners (per-user doc listeners for minimal reads)
async function initializeUserStatusListeners() {
  if (!getCurrentUser() || !getAuthManager()) return;
  if (isUserStatusInitInFlight) return;
  isUserStatusInitInFlight = true;

  try {
    // Clean up any existing friend status doc listeners
    if (!realtimeListeners.friendStatuses)
      realtimeListeners.friendStatuses = {};
    Object.values(realtimeListeners.friendStatuses).forEach((unsub) => {
      if (typeof unsub === "function") unsub();
    });
    realtimeListeners.friendStatuses = {};

    // Determine which user IDs to watch: friends + incoming + outgoing + visible
    const idsToWatch = new Set();
    if (typeof FriendsDiscoverySystem !== "undefined") {
      (FriendsDiscoverySystem.currentFriends || []).forEach(
        (u) => u?.id && idsToWatch.add(u.id)
      );
      (FriendsDiscoverySystem.friendRequests || []).forEach(
        (r) => r?.fromUser?.id && idsToWatch.add(r.fromUser.id)
      );
      (FriendsDiscoverySystem.pendingRequests || []).forEach(
        (r) => r?.toUserId && idsToWatch.add(r.toUserId)
      );
    }
    if (additionalPresenceWatchIds && additionalPresenceWatchIds.size > 0) {
      additionalPresenceWatchIds.forEach((id) => idsToWatch.add(id));
    }

    // If nothing to watch, skip to avoid unnecessary listeners
    if (idsToWatch.size === 0) {
      console.log("User status listeners initialized (no users to watch)");
      return;
    }

    const { doc, onSnapshot } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
    );

    idsToWatch.forEach((userId) => {
      if (!userId || userId === getCurrentUser().uid) return;
      const userDocRef = doc(getAuthManager().db, "users", userId);
      const unsub = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (!docSnap.exists()) return;
          const userData = docSnap.data();

          // Merge minimal presence fields into allUsers
          if (typeof FriendsDiscoverySystem !== "undefined") {
            const idx = (FriendsDiscoverySystem.allUsers || []).findIndex(
              (u) => u.id === userId
            );
            const newEntry = {
              id: userId,
              displayName: userData.displayName || "Unknown User",
              username: userData.username || "",
              avatar: userData.avatar || "?",
              adjustmentFactor: userData.adjustmentFactor || 0,
              personalityType: userData.personalityType || "Not Set",
              isOnline: userData.isOnline || false,
              isActive: userData.isActive || false,
              status: userData.status || "offline",
              location: userData.location || null,
            };
            if (idx >= 0) {
              FriendsDiscoverySystem.allUsers[idx] = {
                ...FriendsDiscoverySystem.allUsers[idx],
                ...newEntry,
              };
            } else {
              FriendsDiscoverySystem.allUsers = [
                ...FriendsDiscoverySystem.allUsers,
                newEntry,
              ];
            }

            // Throttled UI refresh when friendship section is visible
            const friendshipSection =
              document.getElementById("friendship-section");
            const now = Date.now();
            const isVisible =
              friendshipSection && friendshipSection.style.display !== "none";
            const canRefresh =
              isVisible &&
              now - lastUserStatusUIUpdate >= USER_STATUS_UI_MIN_INTERVAL;
            if (canRefresh) {
              lastUserStatusUIUpdate = now;
              FriendsDiscoverySystem.displayUsers();
            }
          }
        },
        (error) => {
          console.error("Error listening to user status doc:", error);
        }
      );
      realtimeListeners.friendStatuses[userId] = unsub;
    });

    console.log(
      "User status listeners initialized for",
      idsToWatch.size,
      "users"
    );
  } catch (error) {
    console.error("Error initializing user status listeners:", error);
  } finally {
    isUserStatusInitInFlight = false;
  }
}

// Rebuild per-user status listeners when friend lists change
export async function refreshUserStatusListeners() {
  if (!areRealtimeListenersActive) return;
  if (userStatusRefreshTimer) clearTimeout(userStatusRefreshTimer);
  userStatusRefreshTimer = setTimeout(() => {
    initializeUserStatusListeners();
  }, 100);
}
// Real-time group update listeners
async function initializeGroupUpdateListeners(
  collection,
  query,
  where,
  onSnapshot,
  doc,
  docOnSnapshot
) {
  if (!getCurrentUser() || !getAuthManager()) return;

  // Prevent duplicate initialization
  if (realtimeListeners.groups) {
    console.log("Group listeners already initialized, skipping...");
    return;
  }

  try {
    // Listen for groups where current user is a member
    const userGroupsQuery = query(
      collection(getAuthManager().db, "groups"),
      where("members", "array-contains", getCurrentUser().uid)
    );

    realtimeListeners.groups = onSnapshot(
      userGroupsQuery,
      (snapshot) => {
        const updatedGroups = [];
        let hasNewGroups = false;

        // Track changes for real-time notifications
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            hasNewGroups = true;
            const groupData = { id: change.doc.id, ...change.doc.data() };
            console.log("New group detected:", groupData.name);

            // Show notification for new group if user didn't create it
            if (groupData.adminId !== getCurrentUser().uid) {
              NotificationSystem.show(
                `You've been added to group: ${groupData.name}!`,
                "success"
              );
            }
          } else if (change.type === "modified") {
            console.log("Group modified:", change.doc.data().name);
          } else if (change.type === "removed") {
            console.log("Group removed:", change.doc.data().name);
          }
        });

        // Build updated groups list
        snapshot.forEach((doc) => {
          updatedGroups.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        // Update local groups data and invalidate cache
        DataLayer.save("groups", updatedGroups);
        CacheSystem.invalidateGroupsCache();

        // Refresh groups display if on groups page
        if (
          document.getElementById("groups").classList.contains("hidden") ===
          false
        ) {
          if (typeof GroupsSystem !== "undefined") {
            GroupsSystem.displayGroups();
          }
        }

        console.log(
          "Real-time groups updated:",
          updatedGroups.length,
          hasNewGroups ? "(new groups detected)" : ""
        );
      },
      (error) => {
        console.error("Error listening to groups:", error);
      }
    );

    // Listen for specific group changes (AI itinerary updates, member additions)
    const groups = DataLayer.load("groups", []);
    groups.forEach((group) => {
      const groupDocRef = doc(getAuthManager().db, "groups", group.id);

      const groupListener = docOnSnapshot(groupDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const updatedGroup = {
            id: docSnapshot.id,
            ...docSnapshot.data(),
          };

          // Check for specific changes
          const oldGroup = groups.find((g) => g.id === group.id);
          if (oldGroup) {
            // Check if AI itinerary changed
            if (
              updatedGroup.aiItinerary &&
              (!oldGroup.aiItinerary ||
                JSON.stringify(updatedGroup.aiItinerary) !==
                  JSON.stringify(oldGroup.aiItinerary))
            ) {
              NotificationSystem.show(
                "AI itinerary updated for your group!",
                "info"
              );
            }

            // Check if new members were added
            if (
              updatedGroup.members &&
              updatedGroup.members.length > oldGroup.members.length
            ) {
              const newMembers = updatedGroup.members.filter(
                (memberId) => !oldGroup.members.includes(memberId)
              );
              if (newMembers.length > 0) {
                NotificationSystem.show(
                  `${newMembers.length} new member${
                    newMembers.length > 1 ? "s" : ""
                  } added to your group!`,
                  "success"
                );
              }
            }
          }

          // Update local group data
          const currentGroups = DataLayer.load("groups", []);
          const groupIndex = currentGroups.findIndex((g) => g.id === group.id);
          if (groupIndex !== -1) {
            currentGroups[groupIndex] = updatedGroup;
            DataLayer.save("groups", currentGroups);
          }
        }
      });

      // Store listener reference for cleanup
      if (!realtimeListeners.groups || !Array.isArray(realtimeListeners.groups)) realtimeListeners.groups = [];
      realtimeListeners.groups.push(groupListener);
    });

    console.log("Group update real-time listeners initialized");
  } catch (error) {
    console.error("Error initializing group update listeners:", error);
  }
}

async function startLocationScheduler() {
  if (!getCurrentUser() || !getAuthManager()) return;
  if (locationSchedulerStarted) return;

  locationSchedulerStarted = true;

  // Initialize location tracking
  let lastKnownLocation = null;

  // Function to calculate distance between two points (Haversine formula)
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Convert to meters
  }

  // Function to check and update location
  async function checkAndUpdateLocation() {
    if (!navigator.geolocation) return;

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        });
      });

      const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };

      // Check if location has changed significantly (>= 50m radius)
      if (lastKnownLocation) {
        const distance = calculateDistance(
          lastKnownLocation.lat,
          lastKnownLocation.lng,
          newLocation.lat,
          newLocation.lng
        );

        // Only update if moved more than 50 meters
        if (distance >= 50) {
          console.log(
            `Location changed by ${distance.toFixed(
              0
            )}m (>=50m), updating Firebase`
          );
          await updateUserLocation(newLocation);
          lastKnownLocation = newLocation;
        } else {
          console.log(
            `Location change too small (${distance.toFixed(
              0
            )}m < 50m), not updating`
          );
        }
      } else {
        // First time getting location
        console.log("Initial location detected, updating Firebase");
        await updateUserLocation(newLocation);
        lastKnownLocation = newLocation;
      }
    } catch (error) {
      console.log("Could not get current location:", error.message);
    }
  }

  // Location update every 10 minutes with 50m threshold
  statusUpdateInterval = setInterval(async () => {
    try {
      await checkAndUpdateLocation();
    } catch (_) {}
  }, 10 * 60 * 1000);
}


function trackUserActivity() {
      if (!getCurrentUser()) return;

      const now = Date.now();
      lastActivityTime = now;

      // If user was inactive, mark them as active again
      if (!isUserActive) {
        isUserActive = true;
        updateUserStatus('online', true, true); // Force update only on transition to active
        resumeRealtimeListeners();
      } else if (isUserActive && !document.hidden) {
        // Heartbeat only if enough time elapsed since last successful update
        const HEARTBEAT_MS = 60000; // 1 minute
        if (now - lastStatusUpdateTime >= HEARTBEAT_MS) {
          updateUserStatus('online', true, false); // allow cooldown and no-op if unchanged
        }
        resumeRealtimeListeners();
      }

      // Clear existing timeout
      if (activityTimeout) {
        clearTimeout(activityTimeout);
      }

      // Set timeout to mark user as inactive after 10 minutes of no activity
      activityTimeout = setTimeout(() => {
        isUserActive = false;
        // Do NOT push inactive due to tab switching; only after inactivity timeout
        updateUserStatus('inactive', false, true);
        // Pause realtime listeners while inactive (no status change elsewhere)
        pauseRealtimeListeners();
      }, 10 * 60 * 1000);
    }
