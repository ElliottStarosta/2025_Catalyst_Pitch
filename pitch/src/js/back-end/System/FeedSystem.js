import {getUserLocationWithFallback} from "./System/Location.js";
import ActivitySystem from "./ActivitySystem.js";
import FriendsDiscoverySystem from "./Friends/FriendsDiscoverySystem.js";

const FeedSystem = {
      currentFilter: "all",
      searchTerm: "",
      pageSize: import.meta.env.VITE_PAGINATION ?? 3,
      store: { items: [], lastCursorValue: null, hasMore: true, isLoading: false, cacheKey: null },

      init: async () => {
        console.log('🚀 FeedSystem.init() called');

        // Initialize FriendsDiscoverySystem if not already done to load users
        if (typeof FriendsDiscoverySystem !== 'undefined') {
          if (!FriendsDiscoverySystem.isInitialized) {
            console.log('🚀 Initializing FriendsDiscoverySystem for user data...');
            await FriendsDiscoverySystem.init();
          } else if (typeof FriendsDiscoverySystem.loadAllUsersOptimized === 'function') {
            console.log('🚀 Loading users for feed rendering...');
            await FriendsDiscoverySystem.loadAllUsersOptimized();
          }
        }

        FeedSystem.resetAndLoad();
      },

      setFilter: (filter) => {
        FeedSystem.currentFilter = filter;

        // Update active dropdown items instead of tabs
        document.querySelectorAll("#activities-filter-menu .filter-dropdown-item").forEach((item) => {
          item.classList.remove("active");
        });

        // Find and activate the correct dropdown item
        const filterMap = {
          'all': 'All Activities',
          'similar': 'Similar Users',
          'high-rated': 'Top Rated',
          'recent': 'Recent',
          'nearby': 'Near Me'
        };

        const filterText = filterMap[filter] || 'All Activities';
        const targetItem = Array.from(document.querySelectorAll("#activities-filter-menu .filter-dropdown-item"))
          .find(item => item.textContent.trim().includes(filterText));

        if (targetItem) {
          targetItem.classList.add("active");
          // Update button text
          const textElement = document.getElementById('activities-filter-text');
          if (textElement) {
            textElement.textContent = filterText;
          }
        }

        FeedSystem.resetAndLoad();
      },

      filterFeed: () => {
        FeedSystem.searchTerm = document
          .getElementById("feed-search")
          .value.toLowerCase();
        FeedSystem.resetAndLoad();
      },

      getCacheKey: () => {
        return `FEED_${FeedSystem.currentFilter}_${FeedSystem.searchTerm || ''}_${FeedSystem.pageSize}`;
      },

      resetAndLoad: async () => {
        console.log('🔄 FeedSystem.resetAndLoad() called');
        console.log('🔄 Cache key:', FeedSystem.getCacheKey());

        FeedSystem.store = { items: [], lastCursorValue: null, hasMore: true, isLoading: false, cacheKey: FeedSystem.getCacheKey() };
        const cached = CacheSystem.get(FeedSystem.store.cacheKey, CacheSystem.CACHE_DURATIONS.ACTIVITIES);
        console.log('🔄 Cached data found:', !!cached);

        if (cached) {
          console.log('🔄 Using cached data, items count:', cached.items?.length || 0);
          FeedSystem.store = { ...FeedSystem.store, ...cached };
          DataLayer.save('allExperiences', FeedSystem.store.items);
          console.log('🔄 Calling displayFeed with cached data');
          FeedSystem.displayFeed();

          // Update load more button visibility
          const loadMoreContainer = document.getElementById('load-more-container');
          if (loadMoreContainer) {
            loadMoreContainer.style.display = FeedSystem.store.hasMore ? 'block' : 'none';
          }

          // Prefetch next page silently
          console.log('🔄 Prefetching next page');
          FeedSystem.loadNextPage(true).catch(() => { });
        } else {
          console.log('🔄 No cache, loading from Firebase');
          await FeedSystem.loadNextPage(false);
        }
      },

      loadNextPage: async (isPrefetch = false) => {
        console.log('📥 FeedSystem.loadNextPage() called, isPrefetch:', isPrefetch);
        console.log('📥 Current store state:', {
          isLoading: FeedSystem.store.isLoading,
          hasMore: FeedSystem.store.hasMore,
          itemsCount: FeedSystem.store.items?.length || 0,
          lastCursor: FeedSystem.store.lastCursorValue
        });

        if (FeedSystem.store.isLoading || !FeedSystem.store.hasMore) {
          console.log('📥 Skipping load - isLoading:', FeedSystem.store.isLoading, 'hasMore:', FeedSystem.store.hasMore);
          return;
        }
        if (!getCurrentUser() || !getAuthManager()) {
          console.log('📥 Skipping load - no user or auth manager');
          return;
        }

        FeedSystem.store.isLoading = true;
        console.log('📥 Starting Firebase query...');

        try {
          const { collection, query, where, orderBy, limit, startAfter, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

          let q;
          const expCol = collection(getAuthManager().db, 'experiences');
          console.log('📥 Building query for filter:', FeedSystem.currentFilter);

          // Base: order by createdAt desc
          const buildBaseQuery = () => query(expCol, orderBy('createdAt', 'desc'), limit(FeedSystem.pageSize));

          if (FeedSystem.currentFilter === 'similar') {
            console.log('📥 Processing similar users filter');
            const personalityData = DataLayer.load('personalityScore');
            if (personalityData && typeof ActivitySystem.findSimilarUsers === 'function') {
              const similarUsers = await ActivitySystem.findSimilarUsers(personalityData.adjustmentFactor);
              const ids = similarUsers.slice(0, 10).map(u => u.id);
              console.log('📥 Similar user IDs:', ids);
              if (ids.length > 0) {
                // To avoid complex index requirements, use simpler query and filter in memory
                q = query(expCol, orderBy('createdAt', 'desc'), limit(FeedSystem.pageSize * 3)); // Get more to filter
              } else {
                q = buildBaseQuery();
              }
            } else {
              q = buildBaseQuery();
            }
          } else if (FeedSystem.currentFilter === 'high-rated') {
            console.log('📥 Processing top rated filter');
            // For top rated, we'll sort by rating in the display logic
            q = buildBaseQuery();
          } else if (FeedSystem.currentFilter === 'recent') {
            console.log('📥 Processing recent filter');
            // Avoid composite index requirement: fetch recent items and filter by user in-memory
            q = query(expCol, orderBy('createdAt', 'desc'), limit(FeedSystem.pageSize * 3));
          } else {
            q = buildBaseQuery();
          }

          if (FeedSystem.store.lastCursorValue) {
            console.log('📥 Adding startAfter cursor');
            q = query(q, startAfter(FeedSystem.store.lastCursorValue));
          }

          console.log('📥 Executing Firebase query...');
          const snapshot = await wrapRead(getDocs(q), 'getDocs', 'experiences', { paginated: true, filter: FeedSystem.currentFilter });
          console.log('📥 Firebase response - docs count:', snapshot.docs.length);

          const pageItems = snapshot.docs.map(d => {
            const data = d.data();
            return {
              id: data.id || d.id, // Preserve original ID if it exists, otherwise use Firebase doc ID
              firebaseId: d.id, // Store Firebase document ID separately
              ...data,
              timestamp: data.createdAt?.toDate?.() || new Date()
            };
          });
          console.log('📥 Processed page items:', pageItems.length);

          FeedSystem.store.items = [...FeedSystem.store.items, ...pageItems];
          FeedSystem.store.lastCursorValue = snapshot.docs[snapshot.docs.length - 1]?.data()?.createdAt || FeedSystem.store.lastCursorValue;
          FeedSystem.store.hasMore = snapshot.size === FeedSystem.pageSize;

          console.log('📥 Updated store - total items:', FeedSystem.store.items.length, 'hasMore:', FeedSystem.store.hasMore);

          // Persist and cache
          DataLayer.save('allExperiences', FeedSystem.store.items);
          CacheSystem.set(FeedSystem.store.cacheKey, {
            items: FeedSystem.store.items,
            lastCursorValue: FeedSystem.store.lastCursorValue,
            hasMore: FeedSystem.store.hasMore
          });
          console.log('📥 Data saved to DataLayer and CacheSystem');

          if (!isPrefetch) {
            console.log('📥 Calling displayFeed for non-prefetch load');
            FeedSystem.displayFeed();

            // Update load more button visibility
            const loadMoreContainer = document.getElementById('load-more-container');
            if (loadMoreContainer) {
              loadMoreContainer.style.display = FeedSystem.store.hasMore ? 'block' : 'none';
            }
          } else {
            console.log('📥 Skipping displayFeed for prefetch');
          }
        } catch (error) {
          console.error('Paginated feed load failed:', error);
          // Render whatever we have so UI updates even on failure
          try {
            if (!isPrefetch && typeof FeedSystem.displayFeed === 'function') {
              FeedSystem.displayFeed();
            }
          } catch (_) { }
          // Soft notify user if index required
          if (typeof NotificationSystem !== 'undefined' && NotificationSystem.show) {
            NotificationSystem.show('Unable to load activities (index may be required). Showing available results.', 'warning');
          }
        } finally {
          FeedSystem.store.isLoading = false;
          console.log('📥 Load completed, isLoading set to false');
        }
      },

      displaySortedExperiences: (experiences, filterType) => {
        const personalityData = DataLayer.load("personalityScore");
        const userExperiences = DataLayer.load("userExperiences", []);
        const userExperienceNames = userExperiences.map((exp) =>
          exp.name.toLowerCase()
        );

        const feedContent = document.getElementById("feed-content");

        if (experiences.length === 0) {
          if (filterType === "nearby") {
            feedContent.innerHTML = `
              <div class="empty-state">
                <h3>No nearby experiences found</h3>
                <p>Try expanding your search radius or check if you have location access enabled.</p>
                <div style="margin-top: 1rem;">
                  <button class="btn btn-secondary" onclick="FeedSystem.setFilter('all')">
                    <i class="fas fa-globe"></i> Show All Experiences
                  </button>
                </div>
              </div>
            `;
          } else {
            feedContent.innerHTML = `
              <div class="empty-state">
                <h3>No activities found</h3>
                <p>Try adjusting your search or filters to see more results.</p>
              </div>
            `;
          }
          return;
        }

        // Add location info for nearby filter
        let locationInfo = "";
        if (filterType === "nearby") {
          locationInfo = `
            <div style="background: rgba(74, 144, 226, 0.1); padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem;">
              <p style="margin: 0; font-size: 0.9rem; color: #666;">
                <i class="fas fa-map-marker-alt"></i> 
                Showing ${experiences.length} experiences within 50km of your location. Sorted by distance.
              </p>
            </div>
          `;
        }

        feedContent.innerHTML = locationInfo + experiences
          .map((exp) => {
            // Get user information - prioritize Firebase data
            let user = null;
            if (exp.userId === "user-main" || exp.userId === getCurrentUser()?.uid) {
              user = DataLayer.load("currentUser");
            } else if (typeof FriendsDiscoverySystem !== 'undefined' && Array.isArray(FriendsDiscoverySystem.allUsers)) {
              user = FriendsDiscoverySystem.allUsers.find(u => u.id === exp.userId);
            }

            // If still no user found, try cache
            if (!user && exp.userId !== "user-main") {
              const cachedUser = CacheSystem.get(`USER_${exp.userId}`, CacheSystem.CACHE_DURATIONS.USER_PROFILES);
              if (cachedUser) {
                user = cachedUser;
              }
            }

            // If no user found, create a fallback user object
            if (!user) {
              user = {
                id: exp.userId,
                displayName: 'Unknown User',
                username: 'unknown',
                avatar: '?',
                personalityType: 'Unknown',
                adjustmentFactor: 0,
                isPremium: false
              };
              console.log('🔍 Created fallback user for:', exp.userId);
            }

            // Check if user has been to this place
            const hasBeenThere = userExperienceNames.includes(
              exp.name.toLowerCase()
            );
            const isFriend = FriendsSystem.isFriend(exp.userId);

            // Calculate prediction for current user
            let predictionHtml = "";
            if (personalityData && exp.userId !== "user-main" && exp.userId !== getCurrentUser()?.uid) {
              const prediction = ActivitySystem.predictRating(
                personalityData.adjustmentFactor,
                exp,
                user.adjustmentFactor,
                exp.rawScore
              );

              predictionHtml = `
                <div class="prediction-card">
                  <div class="prediction-score">Predicted for you: ${prediction.prediction.toFixed(
                1
              )}/10</div>
                  <div class="prediction-confidence">Confidence: ${(
                  prediction.confidence * 100
                ).toFixed(0)}%</div>
                </div>
              `;
            }

            // Add distance info when coordinates are available (regardless of filter)
            let distanceInfo = "";
            if (exp.coordinates && exp.coordinates.lat && exp.coordinates.lng) {
              distanceInfo = `<div id="distance-${exp.id}" style="font-size: 0.8rem; color: var(--secondary-color); margin-top: 0.3rem;">Calculating distance...</div>`;
              getUserLocationWithFallback()
                .then((position) => {
                  const distance = calculateDistance(
                    position.coords.latitude, position.coords.longitude,
                    exp.coordinates.lat, exp.coordinates.lng
                  );
                  const distanceElement = document.getElementById(`distance-${exp.id}`);
                  if (distanceElement) {
                    distanceElement.textContent = `${distance.toFixed(1)}km away`;
                  }
                })
                .catch(() => {
                  const distanceElement = document.getElementById(`distance-${exp.id}`);
                  if (distanceElement) {
                    distanceElement.remove();
                  }
                });
            }

            // Add friend status and rate button
            let actionButtons = "";
            if (exp.userId !== "user-main" && exp.userId !== getCurrentUser()?.uid) {
              // Check pending status first
              const hasPendingRequest = typeof FriendsDiscoverySystem !== 'undefined' &&
                Array.isArray(FriendsDiscoverySystem.pendingRequests) &&
                FriendsDiscoverySystem.pendingRequests.some(r => r.toUserId === exp.userId);

              if (hasPendingRequest) {
                actionButtons += `
                  <button class="btn" data-pending-for="${exp.userId}" style="font-size: 0.8rem; padding: 6px 12px; margin-right: 0.5rem; background: #fbbf24; color: #1f2937; border: 1px solid #f59e0b;" onclick="FriendsDiscoverySystem.cancelPendingRequest('${exp.userId}')">
                    <i class="fas fa-clock"></i> Pending
                  </button>
                `;
              } else if (!isFriend) {
                actionButtons += `
                  <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 12px; margin-right: 0.5rem;"
                    onclick="FriendsSystem.addFriend('${exp.userId}')">
                    <i class="fas fa-user-plus"></i> Add Friend
                  </button>
                `;
              } else {
                actionButtons += `
                  <span style="background: rgba(74, 144, 226, 0.1); color: var(--primary-color); font-size: 0.8rem; font-weight: bold; padding: 4px 8px; border-radius: 12px; border: 1px solid var(--primary-color); display: inline-block; margin-right: 0.5rem;">✓ Friend</span>
                `;
              }
            }

            if (!hasBeenThere) {
              actionButtons += `
                <button class="btn" style="font-size: 0.8rem; padding: 6px 12px;"
                  onclick="ratePlace('${exp.name.replace(/'/g, "\\'")}', '${exp.category.replace(/'/g, "\\'")}', '${exp.location.replace(/'/g, "\\'")}', '${exp.description ? exp.description.replace(/'/g, "\\'") : ""}')">
                  <i class="fas fa-star"></i> Rate This Place
                </button>
              `;
            } else {
              actionButtons += `
                                  <span style="background: rgba(74, 144, 226, 0.1); color: var(--primary-color); font-size: 0.8rem; font-weight: bold; padding: 4px 8px; border-radius: 12px; border: 1px solid var(--primary-color);">
                    ✓ Been There
                  </span>
              `;
            }

            return `
              <div class="experience-card" style="
                border: 1px solid #eee; 
                border-radius: 12px; 
                padding: 1.5rem; 
                background: white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                transition: all 0.2s ease;
                margin-bottom: 1rem;
              " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                  <div style="flex: 1;">
                    <h4 style="margin-bottom: 0.5rem;">${addCrownToPremiumUser(user.displayName, exp.userId)}</h4>
                    <div style="display: flex; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.9rem;">
                      <span style="background: var(--secondary-color); color: white; padding: 0.2rem 0.6rem; border-radius: 5px 0px 5px 5px; font-size: 0.8rem;">
                        ${exp.category}
                      </span>
                      <span style="color: #666;">
                        <i class="fas fa-map-marker-alt"></i> ${exp.location}
                      </span>
                    </div>
                    <h3 style="margin: 0 0 0.5rem 0; color: var(--primary-color); font-size: 1.2rem;">
                      ${exp.name}
                    </h3>
                    <p style="margin: 0; color: #555; line-height: 1.5; font-size: 0.95rem;">
                      ${exp.description}
                    </p>
                    ${distanceInfo}
                  </div>
                  <div style="text-align: right; min-width: 80px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color);">
                      ${exp.adjustedScore.toFixed(1)}
                    </div>
                    <div style="font-size: 0.8rem; color: #666;">Rating</div>
                  </div>
                </div>
                
                ${predictionHtml}
                
                      <div class="user-actions" style="gap: 0.5rem; margin-top: 1rem;">
                  ${actionButtons}
                </div>
              </div>
            `;
          })
          .join("");
      },

      displayFilteredExperiences: async (experiences, filterType) => {
        const personalityData = DataLayer.load("personalityScore");
        const userExperiences = DataLayer.load("userExperiences", []);
        const userExperienceNames = userExperiences.map((exp) =>
          exp.name.toLowerCase()
        );

        // Sort by distance for nearby filter, otherwise by timestamp
        if (filterType === "nearby") {
          // Get user's current location and sort by distance
          getUserLocationWithFallback()
            .then((position) => {
              const userLat = position.coords.latitude;
              const userLng = position.coords.longitude;

              // Sort by distance
              experiences.sort((a, b) => {
                if (!a.coordinates || !b.coordinates) return 0;
                const distanceA = calculateDistance(
                  userLat, userLng,
                  a.coordinates.lat, a.coordinates.lng
                );
                const distanceB = calculateDistance(
                  userLat, userLng,
                  b.coordinates.lat, b.coordinates.lng
                );
                return distanceA - distanceB;
              });

              // Display the sorted experiences
              FeedSystem.displaySortedExperiences(experiences, filterType);
            })
            .catch((error) => {
              console.error('Error getting location for sorting:', error);
              // Fallback: sort by timestamp
              experiences.sort(
                (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
              );
              FeedSystem.displaySortedExperiences(experiences, filterType);
            });
          return; // Exit early since we're handling the display asynchronously
        } else {
          // Sort based on filter type
          if (FeedSystem.currentFilter === 'high-rated') {
            // Sort by predicted rating for current user
            const personalityData = DataLayer.load('personalityScore');
            if (personalityData) {
              experiences.sort((a, b) => {
                const predictionA = ActivitySystem.predictRating(
                  personalityData.adjustmentFactor,
                  a,
                  (a.userId === "user-main" ? 0 : 0), // Firebase user adjustment factors loaded separately
                  a.rawScore
                );
                const predictionB = ActivitySystem.predictRating(
                  personalityData.adjustmentFactor,
                  b,
                  (b.userId === "user-main" ? 0 : 0), // Firebase user adjustment factors loaded separately
                  b.rawScore
                );
                return predictionB.prediction - predictionA.prediction;
              });
            } else {
              // Fallback to raw score
              experiences.sort((a, b) => (b.rawScore || 0) - (a.rawScore || 0));
            }
          } else if (FeedSystem.currentFilter === 'recent') {
            // Sort by timestamp (newest first) for recent filter
            experiences.sort(
              (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
            );
          } else {
            // Default sort by timestamp (newest first) for other filters
            experiences.sort(
              (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
            );
          }
        }

        const feedContent = document.getElementById("feed-content");

        if (experiences.length === 0) {
          if (filterType === "nearby") {
            feedContent.innerHTML = `
              <div class="empty-state">
                <h3>No nearby experiences found</h3>
                <p>Try expanding your search radius or check if you have location access enabled.</p>
                <div style="margin-top: 1rem;">
                  <button class="btn btn-secondary" onclick="FeedSystem.setFilter('all')">
                    <i class="fas fa-globe"></i> Show All Experiences
                  </button>
                </div>
              </div>
            `;
          } else {
            feedContent.innerHTML = `
              <div class="empty-state">
                <h3>No activities found</h3>
                <p>Try adjusting your search or filters to see more results.</p>
              </div>
            `;
          }
          return;
        }

        // Add location info for nearby filter
        let locationInfo = "";
        if (filterType === "nearby") {
          locationInfo = `
            <div style="background: rgba(74, 144, 226, 0.1); padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem;">
              <p style="margin: 0; font-size: 0.9rem; color: #666;">
                <i class="fas fa-map-marker-alt"></i> 
                Showing ${experiences.length} experiences within 50km of your location. Sorted by distance.
              </p>
            </div>
          `;
        }

        feedContent.innerHTML = locationInfo + experiences
          .map((exp) => {
            // Get user information - prioritize Firebase data
            let user = null;
            if (exp.userId === "user-main" || exp.userId === getCurrentUser()?.uid) {
              user = DataLayer.load("currentUser");
            } else if (typeof FriendsDiscoverySystem !== 'undefined' && Array.isArray(FriendsDiscoverySystem.allUsers)) {
              user = FriendsDiscoverySystem.allUsers.find(u => u.id === exp.userId);
            }

            // If still no user found, try cache
            if (!user && exp.userId !== "user-main") {
              const cachedUser = CacheSystem.get(`USER_${exp.userId}`, CacheSystem.CACHE_DURATIONS.USER_PROFILES);
              if (cachedUser) {
                user = cachedUser;
              }
            }

            // If no user found, create a fallback user object
            if (!user) {
              user = {
                id: exp.userId,
                displayName: 'Unknown User',
                username: 'unknown',
                avatar: '?',
                personalityType: 'Unknown',
                adjustmentFactor: 0,
                isPremium: false
              };
              console.log('🔍 Created fallback user for:', exp.userId);
            }

            // Check if user has been to this place
            const hasBeenThere = userExperienceNames.includes(
              exp.name.toLowerCase()
            );
            const isFriend = FriendsSystem.isFriend(exp.userId);

            // Calculate prediction for current user
            let predictionHtml = "";
            if (personalityData && exp.userId !== "user-main" && exp.userId !== getCurrentUser()?.uid) {
              const prediction = ActivitySystem.predictRating(
                personalityData.adjustmentFactor,
                exp,
                user.adjustmentFactor,
                exp.rawScore
              );

              predictionHtml = `
                <div class="prediction-card">
                  <div class="prediction-score">Predicted for you: ${prediction.prediction.toFixed(
                1
              )}/10</div>
                  <div class="prediction-confidence">Confidence: ${(
                  prediction.confidence * 100
                ).toFixed(0)}%</div>
                </div>
              `;
            }

            // Add distance info for nearby filter
            let distanceInfo = "";
            if (filterType === "nearby" && exp.coordinates) {
              // Get user's current location to calculate distance
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const distance = calculateDistance(
                      position.coords.latitude, position.coords.longitude,
                      exp.coordinates.lat, exp.coordinates.lng
                    );
                    // Update the distance display for this experience
                    const distanceElement = document.getElementById(`distance-${exp.id}`);
                    if (distanceElement) {
                      distanceElement.textContent = `${distance.toFixed(1)}km away`;
                    }
                  }
                );
              }
              distanceInfo = `<div id="distance-${exp.id}" style="font-size: 0.8rem; color: var(--secondary-color); margin-top: 0.3rem;">Calculating distance...</div>`;
            }

            // Add friend status and rate button
            let actionButtons = "";
            if (exp.userId !== "user-main" && exp.userId !== getCurrentUser()?.uid) {
              // Check pending status first
              const hasPendingRequest = typeof FriendsDiscoverySystem !== 'undefined' &&
                Array.isArray(FriendsDiscoverySystem.pendingRequests) &&
                FriendsDiscoverySystem.pendingRequests.some(r => r.toUserId === exp.userId);

              if (hasPendingRequest) {
                actionButtons += `
                  <button class="btn" style="font-size: 0.8rem; padding: 6px 12px; margin-right: 0.5rem; background: #fbbf24; color: #1f2937; border: 1px solid #f59e0b;" disabled>
                    <i class="fas fa-clock"></i> Pending
                  </button>
                `;
              } else if (!isFriend) {
                actionButtons += `
                  <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 12px; margin-right: 0.5rem;"
                          onclick="FriendsSystem.addFriend('${exp.userId}')">
                    Add Friend
                  </button>
                `;
              } else {
                actionButtons += `
                  <span style="background: rgba(74, 144, 226, 0.1); color: var(--primary-color); font-size: 0.8rem; font-weight: bold; padding: 4px 8px; border-radius: 12px; border: 1px solid var(--primary-color); display: inline-block; margin-right: 0.5rem;">✓ Friend</span>
                `;
              }

              if (!hasBeenThere) {
                actionButtons += `
                  <button class="btn" style="font-size: 0.8rem; padding: 6px 12px;"
                          onclick="fillActivityForm('${exp.name}', '${exp.category}', '${exp.location}', '${exp.description.replace(/'/g, "\\'")}')">
                    Rate This Place
                  </button>
                `;
              }
            }

            return `
              <div class="feed-item">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                  <div style="flex: 1;">
                    <h4 style="margin-bottom: 0.5rem;">${addCrownToPremiumUser(user.displayName, exp.userId)}</h4>
                    <div style="display: flex; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.9rem;">
                      <span style="background: var(--secondary-color); color: white; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.8rem;">
                        ${exp.category}
                      </span>
                      <span style="color: #666;">
                        <i class="fas fa-map-marker-alt"></i> ${exp.location}
                      </span>
                    </div>
                    <h3 style="margin: 0 0 0.5rem 0; color: var(--primary-color); font-size: 1.2rem;">
                      ${exp.name} ${hasBeenThere ? '<span style="color: var(--primary-color);">✓ Visited</span>' : ''}
                    </h3>
                    ${exp.description ? `<p style=\"margin: 0; color: #555; line-height: 1.5; font-size: 0.95rem;\">${exp.description}</p>` : ''}
                    ${distanceInfo}
                  </div>
                  <div style="text-align: right; min-width: 80px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color);">
                      ${(exp.adjustedScore ?? exp.rawScore ?? 0).toFixed(1)}
                    </div>
                    <div style="font-size: 0.8rem; color: #666;">Rating</div>
                  </div>
                </div>
                ${predictionHtml}
                 <div class="user-actions" style="gap: 0.5rem; margin-top: 1rem;">
                  ${actionButtons}
                </div>
              </div>
            `;
          })
          .join("");
      },

      displayFeed: () => {
        console.log('🔍 FeedSystem.displayFeed() called');
        console.log('🔍 Current filter:', FeedSystem.currentFilter);
        console.log('🔍 Search term:', FeedSystem.searchTerm);
        console.log('🔍 Store items count:', FeedSystem.store?.items?.length || 0);
        console.log('🔍 Store hasMore:', FeedSystem.store?.hasMore);
        console.log('🔍 Store cacheKey:', FeedSystem.store?.cacheKey);

        const personalityData = DataLayer.load("personalityScore");

        // Use the new paginated data from store instead of old ActivitySystem
        const allExperiences = FeedSystem.store?.items || [];
        console.log('🔍 Using experiences from store:', allExperiences.length);

        const userExperiences = DataLayer.load("userExperiences", []);
        const userExperienceNames = userExperiences.map((exp) =>
          exp.name.toLowerCase()
        );

        let filteredExperiences = [...allExperiences];

        // Apply search filter
        if (FeedSystem.searchTerm) {
          filteredExperiences = filteredExperiences.filter(
            (exp) =>
              exp.name.toLowerCase().includes(FeedSystem.searchTerm) ||
              exp.category.toLowerCase().includes(FeedSystem.searchTerm) ||
              exp.location.toLowerCase().includes(FeedSystem.searchTerm) ||
              false // Demo user search removed - Firebase users handled elsewhere
          );
        }

        // Apply category filters
        console.log('🔍 Applying filter:', FeedSystem.currentFilter);

        if (FeedSystem.currentFilter === "similar" && personalityData) {
          console.log('🔍 Processing similar users filter');
          // Handle async similar users lookup
          ActivitySystem.findSimilarUsers(personalityData.adjustmentFactor)
            .then(similarUsers => {
              console.log('🔍 Found similar users:', similarUsers.length);
              const similarUserIds = similarUsers.slice(0, 10).map(user => user.id);

              // Filter experiences by similar user IDs (in-memory filtering)
              const similarExperiences = filteredExperiences.filter((exp) => {
                // Include current user's activities and similar users' activities
                return similarUserIds.includes(exp.userId) ||
                  exp.userId === "user-main" ||
                  (getCurrentUser() && exp.userId === getCurrentUser().uid);
              });
              console.log('🔍 Filtered to similar experiences:', similarExperiences.length);

              // Sort by timestamp (newest first)
              similarExperiences.sort(
                (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
              );

              FeedSystem.displayFilteredExperiences(similarExperiences, "similar");
            })
            .catch(error => {
              console.error('Error finding similar users:', error);
              FeedSystem.displayFilteredExperiences([], "similar");
            });
          return; // Exit early since we're handling the display asynchronously
        } else if (FeedSystem.currentFilter === "high-rated") {
          console.log('🔍 Processing high-rated filter');

          // Calculate predicted scores for current user for all experiences
          const personalityData = DataLayer.load('personalityScore');
          if (personalityData) {
            // Add predicted scores and sort by them
            filteredExperiences = filteredExperiences.map(exp => {
              const prediction = ActivitySystem.predictRating(
                personalityData.adjustmentFactor,
                exp,
                (exp.userId === "user-main" ? 0 : 0), // Firebase user adjustment factors loaded separately
                exp.rawScore || exp.adjustedScore || 5.0
              );
              return {
                ...exp,
                predictedScore: prediction.prediction
              };
            }).filter(exp => {
              // Use a more reasonable threshold - top 60% or score >= 6.0
              const threshold = Math.max(6.0, exp.predictedScore >= 6.0);
              return exp.predictedScore >= 6.0 || exp.adjustedScore >= 6.0;
            });
          } else {
            // Fallback: use adjusted score with lower threshold
            filteredExperiences = filteredExperiences.filter(
              (exp) => (exp.adjustedScore || exp.rawScore || 0) >= 6.0
            );
          }

          console.log('🔍 High-rated experiences after filter:', filteredExperiences.length);
        } else if (FeedSystem.currentFilter === "recent") {
          console.log('🔍 Processing recent filter - showing only current user activities');
          const currentUser = DataLayer.load('currentUser');
          if (currentUser && getCurrentUser()) {
            // Filter for only the current authenticated user's activities
            filteredExperiences = filteredExperiences.filter(
              (exp) => exp.userId === getCurrentUser().uid || exp.userId === "user-main"
            );
          } else if (currentUser) {
            // Fallback for non-authenticated users
            filteredExperiences = filteredExperiences.filter(
              (exp) => exp.userId === currentUser.id || exp.userId === "user-main"
            );
          } else {
            // No user logged in, show empty
            filteredExperiences = [];
          }
          console.log('🔍 Recent experiences after filter:', filteredExperiences.length);
        } else if (FeedSystem.currentFilter === "nearby") {
          console.log('🔍 Processing nearby filter');
          // Get user's current location and filter by actual distance
          getUserLocationWithFallback()
            .then((position) => {
              const userLat = position.coords.latitude;
              const userLng = position.coords.longitude;
              console.log('🔍 User location:', userLat, userLng);

              // Filter experiences by actual distance (within 50km)
              const nearbyExperiences = filteredExperiences.filter((exp) => {
                if (!exp.coordinates) {
                  console.log('🔍 Experience missing coordinates:', exp.name);
                  return false;
                }

                const distance = calculateDistance(
                  userLat, userLng,
                  exp.coordinates.lat, exp.coordinates.lng
                );

                console.log(`🔍 Distance to ${exp.name}: ${distance.toFixed(1)}km`);
                return distance <= 50; // Within 50km
              });
              console.log('🔍 Nearby experiences after distance filter:', nearbyExperiences.length);

              // If no nearby experiences found, try to get more from the database
              if (nearbyExperiences.length === 0) {
                console.log('🔍 No nearby experiences found in current data, loading more from Firebase...');
                FeedSystem.loadNearbyExperiencesFromFirebase(userLat, userLng)
                  .then((firebaseNearby) => {
                    if (firebaseNearby.length > 0) {
                      console.log('🔍 Found', firebaseNearby.length, 'nearby experiences from Firebase');
                      FeedSystem.displayFilteredExperiences(firebaseNearby, "nearby");
                    } else {
                      // Show fallback message with action to add experiences
                      FeedSystem.displayEmptyNearbyState();
                    }
                  })
                  .catch(() => FeedSystem.displayEmptyNearbyState());
                return;
              }

              // Sort by distance
              nearbyExperiences.sort((a, b) => {
                const distanceA = calculateDistance(
                  userLat, userLng,
                  a.coordinates.lat, a.coordinates.lng
                );
                const distanceB = calculateDistance(
                  userLat, userLng,
                  b.coordinates.lat, b.coordinates.lng
                );
                return distanceA - distanceB;
              });

              // Update the feed with nearby experiences
              FeedSystem.displayFilteredExperiences(nearbyExperiences, "nearby");
            })
            .catch((error) => {
              console.error('Error getting location for nearby filter:', error);
              // Fallback: show experiences with location data or encourage adding location
              const locationExperiences = filteredExperiences.filter(
                (exp) => exp.coordinates || (exp.location && exp.location !== "Not specified")
              );
              console.log('🔍 Fallback location experiences:', locationExperiences.length);

              if (locationExperiences.length > 0) {
                FeedSystem.displayFilteredExperiences(locationExperiences, "nearby");
              } else {
                FeedSystem.displayLocationPermissionError();
              }
            });
          return; // Exit early since we're handling the display asynchronously
        }

        // Sort by timestamp (newest first)
        filteredExperiences.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
        console.log('🔍 Final filtered experiences after sorting:', filteredExperiences.length);

        const feedContent = document.getElementById("feed-content");
        console.log('🔍 Feed content element:', feedContent);

        if (filteredExperiences.length === 0) {
          console.log('🔍 No experiences to display, showing empty state');
          feedContent.innerHTML = `
        <div class="empty-state">
          <h3>No activities found</h3>
          <p>Try adjusting your search or filters to see more results.</p>
        </div>
      `;
          return;
        }

        console.log('🔍 Rendering', filteredExperiences.length, 'experiences to feed');
        feedContent.innerHTML = filteredExperiences
          .map((exp) => {
            console.log('🔍 Rendering experience:', exp.name, 'by user:', exp.userId);

            // Improved user lookup with proactive loading
            let user = null;
            if (exp.userId === "user-main") {
              user = DataLayer.load("currentUser");
            } else {
              // Check current user for match (covers Firebase authenticated users)
              const currentUser = DataLayer.load("currentUser");
              if (currentUser && currentUser.id === exp.userId) {
                user = currentUser;
                // Demo users removed - Firebase only
              } else if (typeof FriendsDiscoverySystem !== 'undefined' && Array.isArray(FriendsDiscoverySystem.allUsers)) {
                // Look up in real Firebase users
                user = FriendsDiscoverySystem.allUsers.find(u => u.id === exp.userId);
              }
            }

            // If still no user found, try to load immediately from Firebase
            if (!user && exp.userId !== "user-main" && typeof getAuthManager() !== 'undefined') {
              // Try to fetch user data synchronously from cache or queue for async load
              const cachedUser = CacheSystem.get(`USER_${exp.userId}`, CacheSystem.CACHE_DURATIONS.USER_PROFILES);
              if (cachedUser) {
                user = cachedUser;
                console.log('🔍 Found cached user:', user.displayName);
              } else {
                // Queue this user for async loading and trigger display refresh
                if (typeof FriendsDiscoverySystem !== 'undefined' && FriendsDiscoverySystem.queueUserForLoading) {
                  FriendsDiscoverySystem.queueUserForLoading(exp.userId);
                  // Set a delayed refresh to update the display when user data loads
                  setTimeout(() => {
                    if (FeedSystem.displayFeed) FeedSystem.displayFeed();
                  }, 2000);
                }
              }
            }

            // If still no user found, create a fallback user object but with more info
            if (!user) {
              console.log('🔍 No user found for experience:', exp.userId, '- creating fallback user');
              user = {
                id: exp.userId,
                displayName: 'Loading User...',
                username: 'loading',
                avatar: '...',
                adjustmentFactor: 0,
                personalityType: 'Loading...',
                isPremium: false
              };
            }

            // Check if user has been to this place
            const hasBeenThere = userExperienceNames.includes(
              exp.name.toLowerCase()
            );
            const isFriend = FriendsSystem.isFriend(exp.userId);

            // Calculate prediction for current user
            let predictionHtml = "";
            if (personalityData && exp.userId !== "user-main" && exp.userId !== getCurrentUser()?.uid) {
              const prediction = ActivitySystem.predictRating(
                personalityData.adjustmentFactor,
                exp,
                user.adjustmentFactor,
                exp.rawScore
              );

              predictionHtml = `
          <div class="prediction-card">
            <div class="prediction-score">Predicted for you: ${prediction.prediction.toFixed(
                1
              )}/10</div>
            <div class="prediction-confidence">Confidence: ${(
                  prediction.confidence * 100
                ).toFixed(0)}%</div>
          </div>
        `;
            }

            // Distance display whenever coordinates are present
            let distanceInfo = "";
            if (exp.coordinates && exp.coordinates.lat && exp.coordinates.lng) {
              distanceInfo = `<div id="distance-${exp.id}" style="font-size: 0.8rem; color: var(--secondary-color); margin-top: 0.3rem;">Calculating distance...</div>`;
              getUserLocationWithFallback()
                .then((position) => {
                  const distance = calculateDistance(
                    position.coords.latitude, position.coords.longitude,
                    exp.coordinates.lat, exp.coordinates.lng
                  );
                  const distanceElement = document.getElementById(`distance-${exp.id}`);
                  if (distanceElement) {
                    distanceElement.textContent = `${distance.toFixed(1)}km away`;
                  }
                })
                .catch(() => {
                  const distanceElement = document.getElementById(`distance-${exp.id}`);
                  if (distanceElement) {
                    distanceElement.remove();
                  }
                });
            }

            // Add friend status and rate/edit buttons
            let actionButtons = "";
            if (exp.userId !== "user-main" && exp.userId !== getCurrentUser()?.uid) {
              // Check pending status first
              const hasPendingRequest = typeof FriendsDiscoverySystem !== 'undefined' &&
                Array.isArray(FriendsDiscoverySystem.pendingRequests) &&
                FriendsDiscoverySystem.pendingRequests.some(r => r.toUserId === exp.userId);

              if (hasPendingRequest) {
                actionButtons += `
            <button class="btn" data-pending-for="${exp.userId}" style="font-size: 0.8rem; padding: 6px 12px; margin-right: 0.5rem; background: #fbbf24; color: #1f2937; border: 1px solid #f59e0b;" onclick="FriendsDiscoverySystem.cancelPendingRequest('${exp.userId}')">
              <i class="fas fa-clock"></i> Pending
            </button>
          `;
              } else if (!isFriend) {
                actionButtons += `
            <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 12px; margin-right: 0.5rem;" onclick="FriendsSystem.addFriend('${exp.userId}')">
              <i class="fas fa-user-plus"></i> Add Friend
            </button>
          `;
              } else {
                actionButtons += `
                  <span style="background: rgba(74, 144, 226, 0.1); color: var(--primary-color); font-size: 0.8rem; font-weight: bold; padding: 4px 8px; border-radius: 12px; border: 1px solid var(--primary-color); display: inline-block; margin-right: 0.5rem;">✓ Friend</span>
                `;
              }

              // Use Near Me style: show Rate This Place for places user hasn't rated
              if (!hasBeenThere) {
                const safeDesc = (exp.description || '').replace(/'/g, "\\'");
                actionButtons += `
                  <button class="btn" style="font-size: 0.8rem; padding: 6px 12px;" onclick="ratePlace('${exp.name.replace(/'/g, "\\'")}', '${exp.category.replace(/'/g, "\\'")}', '${exp.location.replace(/'/g, "\\'")}', '${safeDesc}')">
                    <i class="fas fa-star"></i> Rate This Place
                  </button>
                `;
              }
            } else {
              // For current user's experiences, show edit button
              actionButtons += `
            <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 12px;"
                    onclick="editUserExperience('${exp.id || exp.name}')">
              <i class="fas fa-edit"></i> Edit
            </button>
          `;
            }

            // Resolve live presence if available
            let presenceOnline = false;
            let presenceActive = false;
            if (typeof FriendsDiscoverySystem !== 'undefined' && Array.isArray(FriendsDiscoverySystem.allUsers)) {
              const live = FriendsDiscoverySystem.allUsers.find(u => u.id === exp.userId);
              if (live) {
                presenceOnline = !!live.isOnline;
                presenceActive = !!live.isActive;
              }
            }
            if (!presenceOnline && user && typeof user.isOnline === 'boolean') {
              presenceOnline = user.isOnline;
            }

            // Use the unified Experience Card style across all tabs
            return `
              <div class="experience-card" style="
                border: 1px solid #eee; 
                border-radius: 12px; 
                padding: 1.5rem; 
                background: white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                transition: all 0.2s ease;
                margin-bottom: 1rem;
              " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                  <div style="flex: 1;">
                    <h4 style="margin-bottom: 0.5rem;">${addCrownToPremiumUser(user.displayName, exp.userId)}</h4>
                    <div style="display: flex; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.9rem;">
                      <span style="background: var(--secondary-color); color: white; padding: 0.2rem 0.6rem; border-radius: 5px 0px 5px 5px; font-size: 0.8rem;">
                        ${exp.category}
                      </span>
                      <span style="color: #666;">
                        <i class="fas fa-map-marker-alt"></i> ${exp.location}
                      </span>
                    </div>
                    <h3 style="margin: 0 0 0.5rem 0; color: var(--primary-color); font-size: 1.2rem;">
                      ${exp.name} ${hasBeenThere ? '<span style="color: var(--primary-color);">✓ Visited</span>' : ''}
                    </h3>
                    ${exp.description ? `<p style=\"margin: 0; color: #555; line-height: 1.5; font-size: 0.95rem;\">${exp.description}</p>` : ''}
                    ${distanceInfo}
                  </div>
                  <div style="text-align: right; min-width: 80px;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary-color);">
                      ${exp.rawScore.toFixed(1)}
                    </div>
                    <div style="font-size: 0.8rem; color: #666;">Rating</div>
                  </div>
                </div>
                ${predictionHtml}
                <div class="user-actions" style="gap: 0.5rem; margin-top: 1rem;">
                  ${actionButtons}
                </div>
              </div>
            `;
          })
          .join("");

        // Load more control
        console.log('🔍 Checking for load more button. Store hasMore:', FeedSystem.store?.hasMore);
        if (FeedSystem.store && FeedSystem.store.hasMore) {
          console.log('🔍 Adding load more button');
          feedContent.innerHTML += `
            <div style="display:flex; justify-content:center; margin:16px 0;">
              <button class="btn btn-secondary" onclick="FeedSystem.loadNextPage(false)">Load More</button>
            </div>
          `;
        } else {
          console.log('🔍 No load more button needed');
        }
      },

      // Load nearby experiences from Firebase when none found locally
      loadNearbyExperiencesFromFirebase: async (userLat, userLng) => {
        try {
          if (!getAuthManager()) return [];

          const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
          const experiencesCollection = collection(getAuthManager().db, 'experiences');
          const snapshot = await wrapRead(getDocs(experiencesCollection), 'getDocs', 'experiences', { source: 'nearby' });

          const nearbyExperiences = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.coordinates) {
              const distance = calculateDistance(
                userLat, userLng,
                data.coordinates.lat, data.coordinates.lng
              );

              if (distance <= 50) { // Within 50km
                nearbyExperiences.push({
                  id: data.id || doc.id, // Preserve original ID if it exists, otherwise use Firebase doc ID
                  firebaseId: doc.id, // Store Firebase document ID separately
                  ...data,
                  distance,
                  timestamp: data.createdAt?.toDate?.() || new Date()
                });
              }
            }
          });

          // Sort by distance
          nearbyExperiences.sort((a, b) => a.distance - b.distance);

          // Cache the results for future use
          const currentUser = DataLayer.load('currentUser');
          if (currentUser) {
            CacheSystem.set(`NEARBY_${currentUser.id}`, nearbyExperiences);
          }

          return nearbyExperiences.slice(0, 20); // Limit to 20 results
        } catch (error) {
          console.error('Error loading nearby experiences from Firebase:', error);
          return [];
        }
      },

      // Display empty state for nearby when no experiences found
      displayEmptyNearbyState: () => {
        const feedContent = document.getElementById("feed-content");
        feedContent.innerHTML = `
          <div class="empty-state">
            <h3><i class="fas fa-map-marker-alt"></i> No Nearby Experiences</h3>
            <p>No activities have been shared within 50km of your location yet.</p>
            <div style="margin-top: 1.5rem;">
              <button class="btn" onclick="showPage('activities')">
                <i class="fas fa-plus-circle"></i> Be the First to Share!
              </button>
              <button class="btn btn-secondary" onclick="FeedSystem.setFilter('all')" style="margin-left: 0.5rem;">
                <i class="fas fa-globe"></i> View All Activities
              </button>
            </div>
          </div>
        `;
      },

      // Display location permission error state
      displayLocationPermissionError: () => {
        const feedContent = document.getElementById("feed-content");
        feedContent.innerHTML = `
          <div class="empty-state">
            <h3><i class="fas fa-location-slash"></i> Location Access Needed</h3>
            <p>To see nearby activities, please enable location access in your browser settings.</p>
            <div style="margin-top: 1.5rem;">
              <button class="btn" onclick="navigator.geolocation.getCurrentPosition(() => { FeedSystem.setFilter('nearby'); }, () => { NotificationSystem.show('Location access denied', 'warning'); })">
                <i class="fas fa-location-arrow"></i> Try Again
              </button>
              <button class="btn btn-secondary" onclick="FeedSystem.setFilter('all')" style="margin-left: 0.5rem;">
                <i class="fas fa-globe"></i> View All Activities
              </button>
            </div>
          </div>
        `;
      },
    };