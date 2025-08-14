import { getCurrentUser } from "../../firebase/firebase-config";
import { getAuthManager } from "../../firebase/initFirebase";
import { wrapRead } from "../../Logging";
import NotificationSystem from "../NotificationSystem";
import CacheSystem from "../../Data/CacheSystem";
import { additionalPresenceWatchIds, refreshUserStatusListeners } from "../../Listeners";
import { addOnlineStatusIndicator } from "../../../front-end/UserIcons";

const FriendsDiscoverySystem = {
  currentFilter: "all",
  allUsers: [],
  currentFriends: [],
  friendRequests: [],
  pendingRequests: [],
  isInitialized: false,
  isLoading: false,
  isInitializing: false, // Prevent initialization loops

  // Initialize the system - Only called when friendship tab is clicked
  async init() {
    if (!getCurrentUser()) {
      NotificationSystem.show("Please sign in to view friends.", "warning");
      return;
    }

    // Prevent multiple simultaneous initializations
    if (this.isLoading || this.isInitializing || this._initInFlight) {
      console.log(
        "Friends system already loading or initializing, skipping init"
      );
      return;
    }

    // Check if already initialized and cache is fresh
    if (this.isInitialized && !this.isCacheExpired()) {
      console.log("Using cached friends data");
      this.displayUsers();
      return;
    }

    // Singleflight guard
    this._initInFlight = true;
    // Show loading state
    this.isLoading = true;
    this.isInitializing = true;
    this.showLoadingState();

    try {
      console.log("🔄 Initializing FriendsDiscoverySystem...");

      // Initialize arrays if they don't exist
      if (!Array.isArray(this.allUsers)) this.allUsers = [];
      if (!Array.isArray(this.currentFriends)) this.currentFriends = [];
      if (!Array.isArray(this.friendRequests)) this.friendRequests = [];
      if (!Array.isArray(this.pendingRequests)) this.pendingRequests = [];

      // Load data with aggressive caching
      await this.loadAllUsersOptimized();
      await this.loadCurrentFriendsOptimized();
      await this.loadFriendRequests();
      await this.loadPendingRequests();

      this.isInitialized = true;
      console.log("✅ FriendsDiscoverySystem initialized successfully");
      this.displayUsers();
      this.startRequestCheck();
    } catch (error) {
      console.error("Error initializing friends system:", error);
      NotificationSystem.show("Failed to load friends data.", "error");

      // Set default empty arrays on error
      this.allUsers = [];
      this.currentFriends = [];
      this.friendRequests = [];
      this.pendingRequests = [];
      this.displayUsers();
    } finally {
      this.isLoading = false;
      this.isInitializing = false;
      this._initInFlight = false;
      this.hideLoadingState();
    }
  },

  // Check if cache is expired
  isCacheExpired() {
    const cache = DataLayer.load("friends_cache_timestamp", 0);
    const now = Date.now();
    return now - cache > CacheSystem.CACHE_DURATIONS.FRIENDS;
  },

  // Show loading state
  showLoadingState() {
    const content = document.getElementById("friends-content");
    if (content) {
      content.innerHTML = `
          <div style="text-align: center; padding: 2rem;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 1rem; color: var(--muted-text-color);">Loading friends...</p>
          </div>
        `;
    }
  },

  // Hide loading state
  hideLoadingState() {
    // Will be replaced by actual content
  },

  // Queue user for background loading
  queueUserForLoading(userId) {
    if (!this._userLoadingQueue) {
      this._userLoadingQueue = new Set();
    }
    if (!this._userLoadingQueue.has(userId)) {
      this._userLoadingQueue.add(userId);
      // Process queue in background
      this._processUserLoadingQueue();
    }
  },

  // Process user loading queue
  async _processUserLoadingQueue() {
    if (
      this._processingQueue ||
      !this._userLoadingQueue ||
      this._userLoadingQueue.size === 0
    ) {
      return;
    }

    this._processingQueue = true;
    const userIds = Array.from(this._userLoadingQueue);
    this._userLoadingQueue.clear();

    try {
      const { collection, query, where, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );
      const usersCollection = collection(getAuthManager().db, "users");
      const q = query(usersCollection, where("__name__", "in", userIds));
      const snapshot = await getDocs(q);

      snapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        const user = {
          id: docSnap.id,
          displayName: userData.displayName || "Unknown User",
          username: userData.username || "",
          avatar: userData.avatar || "?",
          adjustmentFactor: userData.adjustmentFactor || 0,
          personalityType: userData.personalityType || "Not Set",
          isPremium: userData.isPremium || false,
        };

        // Cache user data individually for faster lookups
        CacheSystem.set(`USER_${user.id}`, user);

        // Add to allUsers array
        if (Array.isArray(this.allUsers)) {
          const existingIndex = this.allUsers.findIndex(
            (u) => u.id === user.id
          );
          if (existingIndex >= 0) {
            this.allUsers[existingIndex] = user;
          } else {
            this.allUsers.push(user);
          }
        }
      });

      // Trigger feed refresh to show updated user data
      if (typeof FeedSystem !== "undefined" && FeedSystem.displayFeed) {
        setTimeout(() => FeedSystem.displayFeed(), 100);
      }

      console.log("✅ Loaded and cached", snapshot.size, "users from queue");
    } catch (error) {
      console.error("Error processing user loading queue:", error);
    } finally {
      this._processingQueue = false;
    }
  },

  // Load all users from Firebase with aggressive caching (server-side pagination: 20 per page)
  async loadAllUsersOptimized() {
    if (this._loadUsersInFlight) return;
    this._loadUsersInFlight = true;
    // Check cache first
    const cached = CacheSystem.get(
      "ALL_USERS_PAGINATED",
      CacheSystem.CACHE_DURATIONS.ALL_USERS_BASIC
    );
    if (cached && Array.isArray(cached.items)) {
      this.allUsers = cached.items;
      this._usersPageCursor = cached.lastCursorValue || null;
      this._usersHasMore = !!cached.hasMore;
      console.log("Using cached paginated users:", this.allUsers.length);
      this._loadUsersInFlight = false;
      return;
    }

    try {
      console.log("Loading first users page from Firebase (paginated)...");
      const { collection, query, orderBy, limit, startAfter, getDocs } =
        await import(
          "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
        );
      const usersCollection = collection(getAuthManager().db, "users");
      let q = query(usersCollection, orderBy("createdAt", "desc"), limit(20));
      const snapshot = await wrapRead(getDocs(q), "getDocs", "users", {
        source: "friendsDiscovery",
        paginated: true,
      });

      this.allUsers = [];
      snapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        if (docSnap.id !== getCurrentUser().uid) {
          this.allUsers.push({
            id: docSnap.id,
            displayName: userData.displayName || "Unknown User",
            username: userData.username || "",
            avatar: userData.avatar || "?",
            adjustmentFactor: userData.adjustmentFactor || 0,
            personalityType: userData.personalityType || "Not Set",
            status: userData.status || "offline",
            isActive: userData.isActive || false,
            isOnline: userData.isOnline || false,
            location: userData.location || null,
          });
        }
      });

      this._usersPageCursor =
        snapshot.docs[snapshot.docs.length - 1]?.data()?.createdAt || null;
      this._usersHasMore = snapshot.size === 20;

      CacheSystem.set("ALL_USERS_PAGINATED", {
        items: this.allUsers,
        lastCursorValue: this._usersPageCursor,
        hasMore: this._usersHasMore,
      });
      console.log("Loaded and cached first users page:", this.allUsers.length);
    } catch (error) {
      console.error("Error loading users:", error);
      this.allUsers = [];
    } finally {
      this._loadUsersInFlight = false;
    }
  },

  async loadMoreUsers() {
    if (!this._usersHasMore || this._usersLoadingMore) return;
    if (!getCurrentUser() || !getAuthManager()) return;
    this._usersLoadingMore = true;
    try {
      const { collection, query, orderBy, limit, startAfter, getDocs } =
        await import(
          "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
        );
      const usersCollection = collection(getAuthManager().db, "users");
      let q = query(usersCollection, orderBy("createdAt", "desc"), limit(20));
      if (this._usersPageCursor) {
        q = query(q, startAfter(this._usersPageCursor));
      }
      const snapshot = await wrapRead(getDocs(q), "getDocs", "users", {
        paginated: true,
      });
      const page = [];
      snapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        if (docSnap.id !== getCurrentUser().uid) {
          page.push({
            id: docSnap.id,
            displayName: userData.displayName || "Unknown User",
            username: userData.username || "",
            avatar: userData.avatar || "?",
            adjustmentFactor: userData.adjustmentFactor || 0,
            personalityType: userData.personalityType || "Not Set",
            status: userData.status || "offline",
            isActive: userData.isActive || false,
            isOnline: userData.isOnline || false,
            location: userData.location || null,
          });
        }
      });

      this.allUsers = [...this.allUsers, ...page];
      this._usersPageCursor =
        snapshot.docs[snapshot.docs.length - 1]?.data()?.createdAt ||
        this._usersPageCursor;
      this._usersHasMore = snapshot.size === 20;
      CacheSystem.set("ALL_USERS_PAGINATED", {
        items: this.allUsers,
        lastCursorValue: this._usersPageCursor,
        hasMore: this._usersHasMore,
      });
      this.displayUsers();
    } catch (error) {
      console.error("Error loading more users:", error);
    } finally {
      this._usersLoadingMore = false;
    }
  },

  // Legacy function for compatibility
  async loadAllUsers() {
    return this.loadAllUsersOptimized();
  },

  // Load current friends with caching
  async loadCurrentFriendsOptimized() {
    // Check cache first
    const cachedFriends = CacheSystem.get(
      "FRIENDS",
      CacheSystem.CACHE_DURATIONS.FRIENDS
    );
    if (cachedFriends) {
      this.currentFriends = cachedFriends;
      console.log("Using cached friends:", this.currentFriends.length);
      return;
    }

    try {
      console.log("Loading friends from Firebase...");
      const { collection, query, where, getDocs, getDoc, doc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      const friendsCollection = collection(getAuthManager().db, "friends");
      const queries = [
        query(friendsCollection, where("user1Id", "==", getCurrentUser().uid)),
        query(friendsCollection, where("user2Id", "==", getCurrentUser().uid)),
      ];

      this.currentFriends = [];
      const friendIds = new Set();

      for (const q of queries) {
        const querySnapshot = await wrapRead(
          getDocs(q),
          "getDocs",
          "friends",
          {}
        );

        for (const docSnap of querySnapshot.docs) {
          const friendshipData = docSnap.data();
          const friendId =
            friendshipData.user1Id === getCurrentUser().uid
              ? friendshipData.user2Id
              : friendshipData.user1Id;

          if (!friendIds.has(friendId)) {
            friendIds.add(friendId);

            const friendDoc = await wrapRead(
              getDoc(doc(getAuthManager().db, "users", friendId)),
              "getDoc",
              `users/${friendId}`,
              {}
            );
            if (friendDoc.exists()) {
              const friendData = friendDoc.data();
              this.currentFriends.push({
                id: friendDoc.id,
                displayName: friendData.displayName || "Unknown User",
                username: friendData.username || "",
                avatar: friendData.avatar || "?",
                adjustmentFactor: friendData.adjustmentFactor || 0,
                personalityType: friendData.personalityType || "Not Set",
                status: friendData.status || "offline",
                isActive: friendData.isActive || false,
                location: friendData.location || null,
                bio: friendData.bio || "",
              });
            }
          }
        }
      }

      // Cache the data
      CacheSystem.set("FRIENDS", this.currentFriends);
      console.log("Loaded and cached friends:", this.currentFriends.length);
    } catch (error) {
      console.error("Error loading friends:", error);
      this.currentFriends = [];
    }
  },

  // Legacy function for compatibility
  async loadCurrentFriends() {
    return this.loadCurrentFriendsOptimized();
  },

  // Load friend requests
  async loadFriendRequests() {
    try {
      const { collection, query, where, getDocs, getDoc, doc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      const requestsCollection = collection(
        getAuthManager().db,
        "friendRequests"
      );
      const requestsQuery = query(
        requestsCollection,
        where("toUserId", "==", getCurrentUser().uid),
        where("status", "==", "pending")
      );
      const querySnapshot = await getDocs(requestsQuery);

      this.friendRequests = [];
      for (const docSnap of querySnapshot.docs) {
        const requestData = docSnap.data();
        const fromUserDoc = await getDoc(
          doc(getAuthManager().db, "users", requestData.fromUserId)
        );
        if (fromUserDoc.exists()) {
          this.friendRequests.push({
            requestId: docSnap.id,
            fromUser: {
              id: fromUserDoc.id,
              ...fromUserDoc.data(),
            },
            createdAt: requestData.createdAt,
          });
        }
      }

      console.log("Loaded friend requests:", this.friendRequests.length);
      this.updateFriendRequestBadge();
    } catch (error) {
      console.error("Error loading friend requests:", error);
      this.friendRequests = [];
    }
  },

  // Load pending requests sent by current user
  async loadPendingRequests() {
    try {
      const { collection, query, where, getDocs } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      const requestsCollection = collection(
        getAuthManager().db,
        "friendRequests"
      );
      const requestsQuery = query(
        requestsCollection,
        where("fromUserId", "==", getCurrentUser().uid),
        where("status", "==", "pending")
      );
      const querySnapshot = await getDocs(requestsQuery);

      this.pendingRequests = [];
      for (const docSnap of querySnapshot.docs) {
        const requestData = docSnap.data();
        this.pendingRequests.push({
          requestId: docSnap.id,
          toUserId: requestData.toUserId,
          createdAt: requestData.createdAt,
        });
      }

      console.log("Loaded pending requests:", this.pendingRequests.length);
    } catch (error) {
      console.error("Error loading pending requests:", error);
      this.pendingRequests = [];
    }
  },

  // Set filter
  async setFilter(filter) {
    this.currentFilter = filter;

    // Update active dropdown items instead of tabs
    document
      .querySelectorAll("#friendship-filter-menu .filter-dropdown-item")
      .forEach((item) => {
        item.classList.remove("active");
      });

    // Find and activate the correct dropdown item
    const filterMap = {
      all: "All Users",
      similar: "Similar to You",
      friends: "My Friends",
      requests: "Friend Requests",
    };

    const filterText = filterMap[filter] || "All Users";
    const targetItem = Array.from(
      document.querySelectorAll("#friendship-filter-menu .filter-dropdown-item")
    ).find((item) => item.textContent.trim().includes(filterText));

    if (targetItem) {
      targetItem.classList.add("active");
      // Update button text
      const textElement = document.getElementById("friendship-filter-text");
      if (textElement) {
        textElement.textContent = filterText;
      }
    }

    // When switching to 'friends', ensure we have fresh data
    if (filter === "friends") {
      console.log("Switching to My Friends - refreshing friends data");
      // Force fresh friends data by invalidating cache
      CacheSystem.invalidateFriendsCache();
      await this.loadCurrentFriendsOptimized();
      console.log(
        "Friends data refreshed:",
        this.currentFriends.length,
        "friends found"
      );
    }

    this.displayUsers();
  },

  // Filter users based on search with debounce
  filterUsers() {
    // Clear any existing timeout
    if (this.filterTimeout) {
      clearTimeout(this.filterTimeout);
    }

    // Debounce the filter to prevent excessive calls
    this.filterTimeout = setTimeout(() => {
      this.displayUsers();
    }, 300);
  },

  // Display users based on current filter with debounce
  displayUsers() {
    // Prevent excessive calls
    if (this.displayTimeout) {
      clearTimeout(this.displayTimeout);
    }

    this.displayTimeout = setTimeout(() => {
      this._displayUsersInternal();
    }, 100);
  },

  // Internal display function with safety checks
  _displayUsersInternal() {
    // Prevent recursive calls
    if (this.isDisplaying) return;
    this.isDisplaying = true;

    try {
      const searchTerm =
        document.getElementById("friends-search")?.value?.toLowerCase() || "";
      let usersToDisplay = [];

      // Ensure arrays exist and are valid
      if (!Array.isArray(this.allUsers)) this.allUsers = [];
      if (!Array.isArray(this.currentFriends)) this.currentFriends = [];
      if (!Array.isArray(this.friendRequests)) this.friendRequests = [];

      switch (this.currentFilter) {
        case "all":
          usersToDisplay = this.allUsers.filter(
            (user) =>
              user &&
              ((user.displayName &&
                user.displayName.toLowerCase().includes(searchTerm)) ||
                (user.username &&
                  user.username.toLowerCase().includes(searchTerm)) ||
                (user.personalityType &&
                  user.personalityType.toLowerCase().includes(searchTerm)))
          );
          break;
        case "similar":
          const currentUser = DataLayer.load("currentUser");
          if (currentUser && currentUser.adjustmentFactor !== undefined) {
            usersToDisplay = this.allUsers.filter((user) => {
              if (!user || user.adjustmentFactor === undefined) return false;
              const personalityDiff = Math.abs(
                user.adjustmentFactor - currentUser.adjustmentFactor
              );
              return (
                personalityDiff <= 0.3 && // Similar personality
                ((user.displayName &&
                  user.displayName.toLowerCase().includes(searchTerm)) ||
                  (user.username &&
                    user.username.toLowerCase().includes(searchTerm)))
              );
            });
          }
          break;
        case "friends":
          usersToDisplay = this.currentFriends.filter(
            (user) =>
              user &&
              ((user.displayName &&
                user.displayName.toLowerCase().includes(searchTerm)) ||
                (user.username &&
                  user.username.toLowerCase().includes(searchTerm)))
          );
          break;
        case "requests":
          usersToDisplay = this.friendRequests
            .filter((request) => request && request.fromUser)
            .map((request) => request.fromUser)
            .filter(
              (user) =>
                user &&
                ((user.displayName &&
                  user.displayName.toLowerCase().includes(searchTerm)) ||
                  (user.username &&
                    user.username.toLowerCase().includes(searchTerm)))
            );
          break;
      }

      // Compute visible user IDs for presence subscriptions
      additionalPresenceWatchIds.clear();
      usersToDisplay
        .slice(0, 20)
        .forEach((u) => additionalPresenceWatchIds.add(u.id));
      refreshUserStatusListeners();

      // Apply client pagination for filtered list (UI only)
      const PAGE_SIZE = import.meta.env.PAGINATION;
      this.currentPage = this.currentPage || 1;
      const totalItems = usersToDisplay.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      const start = (this.currentPage - 1) * PAGE_SIZE;
      const pageItems = usersToDisplay.slice(start, start + PAGE_SIZE);

      this.renderUsers(pageItems, totalPages);
    } catch (error) {
      console.error("Error in _displayUsersInternal:", error);
    } finally {
      this.isDisplaying = false;
    }
  },

  // Render users in the UI
  renderUsers(users, totalPages = 1) {
    const container = document.getElementById("friendship-content");

    // Ensure users is an array
    if (!Array.isArray(users)) {
      console.warn("renderUsers called with non-array:", users);
      users = [];
    }

    if (users.length === 0) {
      let message = "";
      switch (this.currentFilter) {
        case "all":
          message = "No users found matching your search.";
          break;
        case "similar":
          message = "No users with similar personality found.";
          break;
        case "friends":
          message = "You haven't added any friends yet.";
          break;
        case "requests":
          message = "No pending friend requests.";
          break;
      }

      container.innerHTML = `
          <div style="text-align: center; padding: 3rem 1rem; color: #666;">
            <div style="font-size: 3rem; color: #ddd; margin-bottom: 1rem;">👥</div>
            <h3>${message}</h3>
          </div>
        `;
      return;
    }

    const usersHtml = users
      .map((user) => {
        // Ensure user has valid ID and arrays exist
        if (!user || !user.id) {
          console.warn("Skipping user without valid ID:", user);
          return "";
        }

        // Ensure arrays exist and are valid
        if (!Array.isArray(this.currentFriends)) this.currentFriends = [];
        if (!Array.isArray(this.friendRequests)) this.friendRequests = [];
        if (!Array.isArray(this.pendingRequests)) this.pendingRequests = [];

        const isFriend = this.currentFriends.some(
          (friend) => friend && friend.id && friend.id === user.id
        );
        const hasRequest = this.friendRequests.some(
          (request) =>
            request &&
            request.fromUser &&
            request.fromUser.id &&
            request.fromUser.id === user.id
        );
        const hasPendingRequest = this.pendingRequests.some(
          (request) =>
            request && request.toUserId && request.toUserId === user.id
        );

        return `
          <div class="user-card" data-user-id="${user.id}" style="
            border: 1px solid #eee; 
            border-radius: 12px; 
            padding: 1.5rem; 
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            margin-bottom: 1rem;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--secondary-gradient); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem;">
                  ${user.avatar || user.displayName?.charAt(0) || "?"}
                </div>
                <div>
                  <h3 style="margin: 0 0 0.3rem 0; font-size: 1.1rem;">${addOnlineStatusIndicator(
                    user.displayName || "Unknown User",
                    user.id,
                    user.isOnline,
                    user.isActive
                  )}</h3>
                  <p style="margin: 0; color: #666; font-size: 0.9rem;">@${
                    user.username || "unknown"
                  }</p>
                  <p style="margin: 0.3rem 0 0 0; color: var(--secondary-color); font-size: 0.8rem; font-weight: bold;">
                    ${user.personalityType || "Not Set"}
                  </p>
                </div>
              </div>
              
              <div class="user-actions" style="text-align: right;">
                ${this.getActionButton(
                  user,
                  isFriend,
                  hasRequest,
                  hasPendingRequest
                )}
              </div>
            </div>
            
            ${
              user.bio && user.bio !== "undefined"
                ? `
              <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                <p style="margin: 0; color: #666; font-style: italic;">"${user.bio}"</p>
              </div>
            `
                : ""
            }
          </div>
        `;
      })
      .join("");

    const pagination = this._renderPagination(totalPages);
    container.innerHTML =
      usersHtml +
      pagination +
      (this._usersHasMore
        ? `
        <div style=\"display:flex; justify-content:center; margin:8px 0 24px;\">
          <button class=\"btn btn-secondary\" onclick=\"FriendsDiscoverySystem.loadMoreUsers()\">Load More Users</button>
        </div>
      `
        : "");

    // After render, expand presence watch list to currently rendered cards as well
    try {
      const cards = Array.from(document.querySelectorAll(".user-card")) || [];
      additionalPresenceWatchIds.clear();
      cards.forEach((card) => {
        const userId = card.getAttribute("data-user-id");
        if (userId) additionalPresenceWatchIds.add(userId);
      });
      refreshUserStatusListeners();
    } catch (_) {}
  },

  _renderPagination(totalPages) {
    if (totalPages <= 1) return "";
    const prevDisabled = (this.currentPage || 1) <= 1 ? "disabled" : "";
    const nextDisabled =
      (this.currentPage || 1) >= totalPages ? "disabled" : "";
    const prevPage = Math.max(1, (this.currentPage || 1) - 1);
    const nextPage = Math.min(totalPages, (this.currentPage || 1) + 1);
    return `
        <div style="display:flex; justify-content:center; align-items:center; gap:8px; margin:16px 0;">
          <button class="btn btn-secondary" ${prevDisabled} onclick="FriendsDiscoverySystem.gotoPage(${prevPage})">Prev</button>
          <span>Page ${this.currentPage || 1} of ${totalPages}</span>
          <button class="btn btn-secondary" ${nextDisabled} onclick="FriendsDiscoverySystem.gotoPage(${nextPage})">Next</button>
        </div>
      `;
  },

  gotoPage(page) {
    this.currentPage = page;
    this.displayUsers();
  },

  // Get appropriate action button for user
  getActionButton(user, isFriend, hasRequest, hasPendingRequest) {
    // Respect local cooldowns to prevent rapid re-requests
    if (this.isInCooldown(user.id)) {
      return `
          <button class="btn" style="font-size: 0.8rem; padding: 6px 12px; background: #e5e7eb; color: #6b7280; border: 1px solid #d1d5db;" disabled>
            <i class="fas fa-hourglass-half"></i> Try again soon
          </button>
        `;
    }
    if (isFriend) {
      return `
          <div style="text-align: center;">
            <span style="background: rgba(74, 144, 226, 0.1); color: var(--primary-color); font-size: 0.8rem; font-weight: bold; padding: 4px 8px; border-radius: 12px; border: 1px solid var(--primary-color); display: inline-block;">✓ Friend</span>
            <br>
            <button class="btn btn-danger" style="font-size: 0.8rem; padding: 4px 8px; margin-top: 0.5rem;" onclick="FriendsDiscoverySystem.removeFriend('${user.id}')">
              Remove
            </button>
          </div>
        `;
    } else if (hasRequest) {
      return `
          <div style="text-align: center;">
            <button class="btn btn-success" style="font-size: 0.8rem; padding: 4px 8px; margin: 0.2rem;" onclick="FriendsDiscoverySystem.acceptRequest('${user.id}')">
              Accept
            </button>
            <br>
            <button class="btn btn-danger" style="font-size: 0.8rem; padding: 4px 8px;" onclick="FriendsDiscoverySystem.rejectRequest('${user.id}')">
              Decline
            </button>
          </div>
        `;
    } else if (hasPendingRequest) {
      return `
          <button class="btn" data-pending-for="${user.id}" style="font-size: 0.8rem; padding: 6px 12px; background: #fbbf24; color: #1f2937; border: 1px solid #f59e0b;" onclick="FriendsDiscoverySystem.cancelPendingRequest('${user.id}')">
            <i class="fas fa-clock"></i> Pending
          </button>
        `;
    } else {
      return `
          <button class="btn" style="font-size: 0.8rem; padding: 6px 12px;" onclick="FriendsDiscoverySystem.sendFriendRequest('${user.id}')">
            Add Friend
          </button>
        `;
    }
  },

  // Send friend request
  async sendFriendRequest(userId) {
    if (!getCurrentUser()) {
      NotificationSystem.show(
        "Please sign in to send friend requests.",
        "warning"
      );
      return;
    }

    // Guard: prevent duplicate clicks or requests while pending/cooldown
    if (
      this.isInCooldown(userId) ||
      this.pendingRequests.some((r) => r.toUserId === userId)
    ) {
      return;
    }

    try {
      const {
        collection,
        addDoc,
        serverTimestamp,
        query,
        where,
        getDocs,
        limit,
      } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      const requestData = {
        fromUserId: getCurrentUser().uid,
        toUserId: userId,
        status: "pending",
        createdAt: serverTimestamp(),
      };

      // Preflight: avoid composite indexes by using single-field queries and client filtering
      const requestsCollection = collection(
        getAuthManager().db,
        "friendRequests"
      );
      const fiveMinutesMs = 5 * 60 * 1000;

      // Outgoing: only filter by fromUserId (single field), then narrow in-memory
      const outgoingQ = query(
        requestsCollection,
        where("fromUserId", "==", getCurrentUser().uid),
        limit(20)
      );
      const outgoingSnap = await getDocs(outgoingQ);

      // Incoming: only filter by fromUserId of the other user (single field), then narrow in-memory
      const incomingQ = query(
        requestsCollection,
        where("fromUserId", "==", userId),
        limit(20)
      );
      const incomingSnap = await getDocs(incomingQ);

      const now = Date.now();
      const hasBlocking = (snap, targetToUserId) => {
        const relevant = snap.docs
          .map((d) => d.data())
          .filter((d) => d.toUserId === targetToUserId);
        if (relevant.length === 0) return false;
        // Any pending blocks; recent rejected (5m) also blocks
        const pendingExists = relevant.some((d) => d.status === "pending");
        if (pendingExists) return true;
        const latestRejected = relevant
          .filter((d) => d.status === "rejected" && d.createdAt)
          .reduce(
            (max, d) =>
              Math.max(
                max,
                d.createdAt.toDate ? d.createdAt.toDate().getTime() : 0
              ),
            0
          );
        return latestRejected > 0 && now - latestRejected < fiveMinutesMs;
      };

      const blocked =
        hasBlocking(outgoingSnap, userId) ||
        hasBlocking(incomingSnap, getCurrentUser().uid);

      if (blocked) {
        this.setCooldown(userId, fiveMinutesMs);
        NotificationSystem.show(
          "Please wait before sending another request.",
          "info"
        );
        this.displayUsers();
        return;
      }

      await wrapWrite(
        addDoc(collection(getAuthManager().db, "friendRequests"), requestData),
        "addDoc",
        "friendRequests",
        { toUserId: userId }
      );

      NotificationSystem.show("Friend request sent!", "success");

      // Update the button to show "Pending" with yellow background
      const button = document.querySelector(
        `[onclick="FriendsDiscoverySystem.sendFriendRequest('${userId}')"]`
      );
      if (button) {
        button.innerHTML = '<i class="fas fa-clock"></i> Pending';
        button.style.background = "#fbbf24";
        button.style.color = "#1f2937";
        button.style.border = "1px solid #f59e0b";
        button.setAttribute("data-pending-for", userId);
        button.onclick = () =>
          FriendsDiscoverySystem.cancelPendingRequest(userId);
      }

      // Update local pending list to avoid reads
      this.pendingRequests = [
        ...(this.pendingRequests || []),
        { toUserId: userId, requestId: null, createdAt: new Date() },
      ];
      this.displayUsers(); // minimal refresh
    } catch (error) {
      console.error("Error sending friend request:", error);
      NotificationSystem.show("Failed to send friend request.", "error");
    }
  },

  // Cancel an outgoing pending friend request
  async cancelPendingRequest(userId) {
    try {
      const { collection, query, where, getDocs, deleteDoc, doc } =
        await import(
          "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
        );
      const requestsCollection = collection(
        getAuthManager().db,
        "friendRequests"
      );
      // Find pending requests from me to this user
      const q = query(
        requestsCollection,
        where("fromUserId", "==", getCurrentUser().uid),
        where("toUserId", "==", userId),
        where("status", "==", "pending")
      );
      const snapshot = await getDocs(q);
      for (const d of snapshot.docs) {
        await deleteDoc(doc(getAuthManager().db, "friendRequests", d.id));
      }

      // Update local state
      this.pendingRequests = (this.pendingRequests || []).filter(
        (r) => r.toUserId !== userId
      );
      NotificationSystem.show("Friend request canceled.", "info");
      this.displayUsers();

      // Also update any buttons on activity/feed cards
      const buttons = document.querySelectorAll(
        `[data-pending-for="${userId}"]`
      );
      buttons.forEach((btn) => {
        btn.innerHTML = "Add Friend";
        btn.style.background = "";
        btn.style.color = "";
        btn.style.border = "";
        btn.removeAttribute("data-pending-for");
        btn.onclick = () => FriendsSystem.addFriend(userId);
      });
    } catch (error) {
      console.error("Error canceling pending request:", error);
      NotificationSystem.show("Failed to cancel request.", "error");
    }
  },

  // Accept friend request with proper real-time updates
  async acceptRequest(userId) {
    try {
      const {
        collection,
        query,
        where,
        getDocs,
        updateDoc,
        doc,
        serverTimestamp,
        addDoc,
      } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      // Find the request
      const requestsCollection = collection(
        getAuthManager().db,
        "friendRequests"
      );
      const requestQuery = query(
        requestsCollection,
        where("fromUserId", "==", userId),
        where("toUserId", "==", getCurrentUser().uid)
      );
      const requestSnapshot = await getDocs(requestQuery);

      if (!requestSnapshot.empty) {
        const requestDoc = requestSnapshot.docs[0];
        const requestData = requestDoc.data();

        // Step 1: Update request status to 'accepted' (this triggers real-time listeners)
        await wrapWrite(
          updateDoc(doc(getAuthManager().db, "friendRequests", requestDoc.id), {
            status: "accepted",
            acceptedAt: serverTimestamp(),
          }),
          "updateDoc",
          `friendRequests/${requestDoc.id}`,
          { status: "accepted" }
        );

        // Step 2: Create friendship record (this also triggers real-time listeners)
        await wrapWrite(
          addDoc(collection(getAuthManager().db, "friends"), {
            user1Id: requestData.fromUserId,
            user2Id: requestData.toUserId,
            createdAt: serverTimestamp(),
          }),
          "addDoc",
          "friends",
          { user1Id: requestData.fromUserId, user2Id: requestData.toUserId }
        );

        // Invalidate friend-related caches BEFORE reloading
        CacheSystem.invalidateFriendsCache();

        NotificationSystem.show("Friend request accepted!", "success");

        // Force immediate cache invalidation and reload
        this.isInitialized = false; // Force complete re-initialization

        // Clear all arrays to force fresh load
        this.currentFriends = [];
        this.friendRequests = [];
        this.pendingRequests = [];

        // Force immediate fresh reload from Firebase (not cache)
        await this.loadCurrentFriendsOptimized();
        await this.loadFriendRequests();
        await this.loadPendingRequests();

        // Force complete UI refresh
        this.displayUsers();

        // Delay refresh to ensure Firebase propagation
        setTimeout(async () => {
          console.log("Delayed refresh after friend acceptance");
          await this.loadCurrentFriendsOptimized();
          this.displayUsers();
        }, 2000);

        console.log("Friend request accepted, UI updated immediately");
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
      NotificationSystem.show("Failed to accept friend request.", "error");
    }
  },

  // Reject friend request
  async rejectRequest(userId) {
    try {
      const {
        collection,
        query,
        where,
        getDocs,
        updateDoc,
        doc,
        serverTimestamp,
      } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );

      const requestsCollection = collection(
        getAuthManager().db,
        "friendRequests"
      );
      const requestQuery = query(
        requestsCollection,
        where("fromUserId", "==", userId),
        where("toUserId", "==", getCurrentUser().uid)
      );
      const requestSnapshot = await getDocs(requestQuery);

      if (!requestSnapshot.empty) {
        const requestDoc = requestSnapshot.docs[0];
        await wrapWrite(
          updateDoc(doc(getAuthManager().db, "friendRequests", requestDoc.id), {
            status: "rejected",
            rejectedAt: serverTimestamp(),
          }),
          "updateDoc",
          `friendRequests/${requestDoc.id}`,
          { status: "rejected" }
        );
      }

      NotificationSystem.show("Friend request declined.", "info");

      // Local cooldown for 5 minutes to prevent spam re-requests
      this.setCooldown(userId, 5 * 60 * 1000);
      // Update local lists
      this.friendRequests = (this.friendRequests || []).filter(
        (r) => r.fromUser?.id !== userId
      );
      this.pendingRequests = (this.pendingRequests || []).filter(
        (r) => r.toUserId !== userId
      );
      this.displayUsers();
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      NotificationSystem.show("Failed to reject friend request.", "error");
    }
  },

  // Remove friend
  async removeFriend(userId) {
    try {
      const { collection, query, where, getDocs, deleteDoc, doc } =
        await import(
          "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
        );

      const friendsCollection = collection(getAuthManager().db, "friends");
      const queries = [
        query(
          friendsCollection,
          where("user1Id", "==", getCurrentUser().uid),
          where("user2Id", "==", userId)
        ),
        query(
          friendsCollection,
          where("user1Id", "==", userId),
          where("user2Id", "==", getCurrentUser().uid)
        ),
      ];

      for (const q of queries) {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const friendshipDoc = querySnapshot.docs[0];
          await deleteDoc(
            doc(getAuthManager().db, "friends", friendshipDoc.id)
          );
        }
      }

      NotificationSystem.show("Friend removed successfully!", "success");

      // Force immediate UI update
      await this.loadCurrentFriendsOptimized();
      await this.loadFriendRequests();
      await this.loadPendingRequests();
      this.displayUsers();
    } catch (error) {
      console.error("Error removing friend:", error);
      NotificationSystem.show("Failed to remove friend.", "error");
    }
  },

  // Update friend request badge
  updateFriendRequestBadge() {
    const badge = document.getElementById("friend-request-badge");
    if (badge) {
      const requestCount = this.friendRequests.length;
      if (requestCount > 0) {
        badge.style.display = "flex";
        badge.textContent = requestCount > 9 ? "9+" : requestCount.toString();
      } else {
        badge.style.display = "none";
      }
    }

    // If friendship UI is visible, ensure it re-renders immediately to show Accept/Decline without manual refresh
    if (
      typeof FriendsDiscoverySystem !== "undefined" &&
      FriendsDiscoverySystem.displayUsers
    ) {
      FriendsDiscoverySystem.displayUsers();
    }
  },

  // --- Cooldown system to reduce repeated writes/reads ---
  _cooldowns: new Map(),
  isInCooldown(userId) {
    const until = this._cooldowns.get(userId);
    return until ? Date.now() < until : false;
  },
  setCooldown(userId, durationMs) {
    const until = Date.now() + durationMs;
    this._cooldowns.set(userId, until);
    setTimeout(() => {
      this._cooldowns.delete(userId);
      this.displayUsers();
    }, durationMs);
  },

  // Force refresh specific user card
  forceRefreshUserCard(userId) {
    const userCard = document.querySelector(`[data-user-id="${userId}"]`);
    if (userCard) {
      // Add a brief flash effect to indicate update
      userCard.style.transition = "all 0.3s ease";
      userCard.style.transform = "scale(1.02)";
      userCard.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";

      setTimeout(() => {
        userCard.style.transform = "scale(1)";
        userCard.style.boxShadow = "0 2px 8px rgba(0,0,0,0.05)";
      }, 300);
    }
  },

  // Show friend request notification
  showFriendRequestNotification() {
    const requestCount = this.friendRequests.length;
    if (requestCount > 0) {
      NotificationSystem.show(
        `You have ${requestCount} new friend request${
          requestCount > 1 ? "s" : ""
        }! Click here to view.`,
        "info",
        5000,
        () => {
          // Navigate to feed page and show friendship section
          showPage("feed");

          // Wait a moment for page to load, then switch to friendship tab
          setTimeout(() => {
            const friendshipTab = document.getElementById("friendship-tab");
            if (friendshipTab) {
              friendshipTab.click();
            }

            // Also set the filter to show requests
            setTimeout(() => {
              if (
                typeof FriendsDiscoverySystem !== "undefined" &&
                FriendsDiscoverySystem.setFilter
              ) {
                FriendsDiscoverySystem.setFilter("requests");
              }
            }, 500);
          }, 100);
        }
      );
    }
  },

  // Check for new friend requests periodically
  startRequestCheck() {
    if (getCurrentUser()) {
      // Check immediately on login
      setTimeout(async () => {
        await this.loadFriendRequests();
        this.showFriendRequestNotification();
      }, 2000);

      // Real-time friend request checking is now handled by initializeRealtimeSystem()
    }
  },
};

export default FriendsDiscoverySystem;
