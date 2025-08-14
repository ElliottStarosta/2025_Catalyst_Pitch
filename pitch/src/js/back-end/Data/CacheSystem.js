import DataLayer from './DataLayer';
import { getCurrentUser } from '../firebase/firebase-config';
import { getAuthManager } from '../firebase/initFirebase';
import FriendsSystem from '../System/Friends/FriendsSystem';
import { wrapRead } from '../Logging';
import { updateDashboard } from '../../front-end/UIManagement';
import { updateProfile } from '../../front-end/UIManagement';
import FriendsDiscoverySystem from '../System/Friends/FriendsDiscoverySystem';
import { FirebaseWriteLogger } from '../Logging';

const CacheSystem = {
    // Change CACHE_DURATION to CACHE_DURATIONS to match usage throughout the codebase
    CACHE_DURATIONS: {  // Changed from CACHE_DURATION to CACHE_DURATIONS
        EXPERIENCES: 5 * 60 * 1000,     // 5 minutes for experiences
        FRIENDS: 5 * 60 * 1000,         // 5 minutes for friends list
        USERS: 15 * 60 * 1000,         // 15 minutes for user profiles
        GROUPS: 5 * 60 * 1000,         // 5 minutes for groups
        ACTIVITIES: 5 * 60 * 1000,     // 5 minutes for feed activities
        USER_PROFILES: 30 * 60 * 1000  // 30 minutes for individual user profiles
    },
    getAllCacheKeys: () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith('cache_')) {
            keys.push(fullKey.replace('cache_', '')); // Remove the prefix
        }
    }
    return keys;
},

    isInvalidating: false,

    // Get cached data with timestamp validation
    get: (key, duration = 300000) => {
        const cache = localStorage.getItem(`cache_${key}`);
        if (!cache) return null;

        try {
            const parsed = JSON.parse(cache);
            const now = Date.now();

            if (parsed.timestamp && (now - parsed.timestamp) < duration) {
                console.log(`Using cached data for: ${key}`);
                return parsed.data;
            }
        } catch (e) {
            console.error('Cache parse error:', e);
        }

        console.log(`Cache miss for: ${key}`);
        return null;
    },

    // Set cached data with timestamp
    set: (key, data) => {
        try {
            localStorage.setItem(`cache_${key}`, JSON.stringify({
                timestamp: Date.now(),
                data: data
            }));
            console.log(`Cached data for: ${key}`);
        } catch (e) {
            console.error('Cache set error:', e);
        }
    },

    // Clear specific cache
    clear: (key) => {
        localStorage.removeItem(`cache_${key}`);
        console.log(`Cleared cache for: ${key}`);
    },

    // Clear all caches
    clearAll: () => {
        Object.keys(CacheSystem.CACHE_DURATIONS).forEach(key => {
            CacheSystem.clear(key);
        });
        console.log('Cleared all caches');
    },
    invalidateCache: (key) => {
        if (!CacheSystem.isInvalidating) {
            CacheSystem.isInvalidating = true;
            CacheSystem.clear(key);
            CacheSystem.isInvalidating = false;
            console.log(`Cache invalidated for: ${key}`);
        }
    },

    // Invalidate specific caches when data changes
    invalidateFriendsCache: () => {
        if (!CacheSystem.isInvalidating) {
            CacheSystem.isInvalidating = true;
            CacheSystem.invalidateCache('FRIENDS');
            CacheSystem.invalidateCache('SIMILAR_USERS');
            CacheSystem.invalidateCache('FRIEND_REQUESTS');
            CacheSystem.invalidateCache('ALL_USERS_BASIC');
            // Reset friends system initialization flag
            if (typeof FriendsDiscoverySystem !== 'undefined') {
                FriendsDiscoverySystem.isInitialized = false;
            }
            CacheSystem.isInvalidating = false;
        }
    },
    invalidateExperienceCache: () => {
        console.log("INVALIDATING EXPERIENCES");
        CacheSystem.invalidateCache('EXPERIENCES');
    },

    invalidateGroupsCache: () => {
        CacheSystem.invalidateCache('GROUPS');
    },

    invalidateUserCache: () => {
        if (!CacheSystem.isInvalidating) {
            CacheSystem.isInvalidating = true;
            CacheSystem.invalidateCache('SIMILAR_USERS');
            CacheSystem.invalidateCache('USER_PROFILES');
            CacheSystem.isInvalidating = false;
        }
    },

    // Batch operations to reduce Firebase calls
    batchUpdate: async (operations) => {
        try {
            const { writeBatch } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const batch = writeBatch(getAuthManager().db);
            // Log batch start (without awaiting a promise)
            FirebaseWriteLogger.log('writeBatch', 'batch', { operations: operations.length }, null, null);

            operations.forEach(op => {
                if (op.type === 'set') {
                    batch.set(op.ref, op.data);
                } else if (op.type === 'update') {
                    batch.update(op.ref, op.data);
                } else if (op.type === 'delete') {
                    batch.delete(op.ref);
                }
            });

            await batch.commit();
            console.log(`Batch operation completed: ${operations.length} operations`);
        } catch (error) {
            console.error('Batch operation failed:', error);
        }
    },

    // Pagination for large datasets
    getPaginatedData: async (collectionName, pageSize = 20, lastDoc = null) => {
        try {
            const { collection, query, orderBy, limit, startAfter, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            let q = query(collection(getAuthManager().db, collectionName), orderBy('createdAt'), limit(pageSize));

            if (lastDoc) {
                q = query(q, startAfter(lastDoc));
            }

            const snapshot = await wrapRead(getDocs(q), 'getDocs', collectionName, { pageSize, lastDoc: !!lastDoc });
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            return {
                data,
                lastDoc: snapshot.docs[snapshot.docs.length - 1],
                hasMore: snapshot.docs.length === pageSize
            };
        } catch (error) {
            console.error('Pagination error:', error);
            return { data: [], lastDoc: null, hasMore: false };
        }
    }
};
window.CacheSystem = CacheSystem; 

// Batch load all essential data with caching strategy
export async function batchLoadEssentialData() {

    try {
        // const { collection, query, where, getDocs, getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Parallel loading of user data
        const loadPromises = [
            loadUserFriendsWithCache(),
            loadUserGroupsWithCache(),
            loadUserExperiencesWithCache(),
            loadFriendRequestsWithCache()
        ];

        await Promise.all(loadPromises);
        console.log('✅ Batch loading completed');
    } catch (error) {
        console.error('❌ Error in batch loading:', error);
    }
}

async function loadUserFriendsWithCache() {
    const cached = CacheSystem.get('FRIENDS', CacheSystem.CACHE_DURATIONS.FRIENDS);
    if (cached) {
        DataLayer.save('friends', cached);
        return cached;
    }

    try {
        const friends = await FriendsSystem.getFriends();
        CacheSystem.set('FRIENDS', friends);
        DataLayer.save('friends', friends);
        return friends;
    } catch (error) {
        console.error('Error loading friends:', error);
        return [];
    }
}
// Load groups with intelligent caching
async function loadUserGroupsWithCache() {
    const cached = CacheSystem.get('GROUPS', CacheSystem.CACHE_DURATIONS.GROUPS);
    if (cached) {
        DataLayer.save('groups', cached);
        return cached;
    }

    try {
        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const groupsQuery = query(
            collection(getAuthManager().db, 'groups'),
            where('members', 'array-contains', getCurrentUser().uid)
        );

        const snapshot = await getDocs(groupsQuery);
        const groups = [];
        snapshot.forEach((doc) => {
            groups.push({ id: doc.id, ...doc.data() });
        });

        CacheSystem.set('GROUPS', groups);
        DataLayer.save('groups', groups);
        return groups;
    } catch (error) {
        console.error('Error loading groups:', error);
        return [];
    }
}

// Load experiences with caching
export async function loadUserExperiencesWithCache() {
    const cached = CacheSystem.get('EXPERIENCES', CacheSystem.CACHE_DURATIONS.EXPERIENCES);
    console.log("CACHED EXPERIENCES", cached);

    if (cached) {
        DataLayer.save('userExperiences', cached);
        return cached;
    }

    try {
        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const experiencesQuery = query(
            collection(getAuthManager().db, 'experiences'),
            where('userId', '==', getCurrentUser().uid)
        );

        const snapshot = await getDocs(experiencesQuery);
        const experiences = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            experiences.push({
                id: data.id || doc.id, // Preserve original ID if it exists, otherwise use Firebase doc ID
                firebaseId: doc.id, // Store Firebase document ID separately
                ...data,
                timestamp: data.createdAt?.toDate?.() || new Date()
            });
        });

        CacheSystem.set('EXPERIENCES', experiences);
        DataLayer.save('userExperiences', experiences);
        return experiences;
    } catch (error) {
        console.error('Error loading experiences:', error);
        return [];
    }
}

// Load friend requests with short-term caching
async function loadFriendRequestsWithCache() {
    const cached = CacheSystem.get('FRIEND_REQUESTS', CacheSystem.CACHE_DURATIONS.FRIEND_REQUESTS);
    if (cached) {
        if (typeof FriendsDiscoverySystem !== 'undefined') {
            FriendsDiscoverySystem.friendRequests = cached;
        }
        return cached;
    }

    try {
        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const requestsQuery = query(
            collection(getAuthManager().db, 'friendRequests'),
            where('toUserId', '==', getCurrentUser().uid),
            where('status', '==', 'pending')
        );

        const snapshot = await getDocs(requestsQuery);
        const requests = [];
        snapshot.forEach((doc) => {
            requests.push({ id: doc.id, ...doc.data() });
        });

        CacheSystem.set('FRIEND_REQUESTS', requests);
        if (typeof FriendsDiscoverySystem !== 'undefined') {
            FriendsDiscoverySystem.friendRequests = requests;
        }
        return requests;
    } catch (error) {
        console.error('Error loading friend requests:', error);
        return [];
    }
}

export async function updateOnPageVisit(pageName) {
    if (!getCurrentUser() || !getAuthManager()) return;

    console.log(`📄 Page visit: ${pageName} - Loading relevant data...`);

    try {
        // const { collection, query, where, getDocs, getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        switch (pageName) {
            case 'dashboard':
                // Dashboard needs: user profile, experiences summary, groups summary
                // First invalidate cache
                await CacheSystem.invalidateExperienceCache();
                // Then load fresh data
                await Promise.all([
                    loadUserProfileIfNeeded(),
                    loadUserExperiencesWithCache(),
                    loadUserGroupsWithCache()
                ]);
                updateDashboard();
                break;

            case 'profile':
                // Profile needs: full user data, experiences, assessment data
                await Promise.all([
                    loadUserProfileIfNeeded(),
                    loadUserExperiencesWithCache()
                ]);
                updateProfile();
                break;

            case 'friends':
                // Friends page needs: friends list, friend requests, similar users
                await Promise.all([
                    loadUserFriendsWithCache(),
                    loadFriendRequestsWithCache(),
                    loadSimilarUsersWithCache()
                ]);
                break;

            case 'groups':
                // Groups page needs: user groups, friends for creating groups
                await Promise.all([
                    loadUserGroupsWithCache(),
                    loadUserFriendsWithCache()
                ]);
                break;

            case 'activities':
                // Activities page needs: user experiences for recommendations
                await loadUserExperiencesWithCache();
                break;
        }

        console.log(`✅ Page data loaded for: ${pageName}`);
    } catch (error) {
        console.error(`❌ Error loading page data for ${pageName}:`, error);
    }
}

// Load user profile only if not cached or expired
async function loadUserProfileIfNeeded() {
    const cached = CacheSystem.get('USER_PROFILE', CacheSystem.CACHE_DURATIONS.USER_PROFILES);
    if (cached) {
        const currentUser = DataLayer.load('currentUser') || {};
        DataLayer.save('currentUser', { ...currentUser, ...cached });
        return cached;
    }

    try {
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const userDoc = await wrapRead(getDoc(doc(getAuthManager().db, 'users', getCurrentUser().uid)), 'getDoc', `users/${getCurrentUser().uid}`, { source: 'dashboard' });

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const profileData = {
                id: getCurrentUser().uid,
                username: userData.username,
                displayName: userData.displayName,
                email: userData.email,
                bio: userData.bio,
                avatar: userData.avatar,
                adjustmentFactor: userData.adjustmentFactor,
                personalityType: userData.personalityType,
                isPremium: userData.isPremium,
                location: userData.location,
                isOnline: userData.isOnline
            };

            CacheSystem.set('USER_PROFILE', profileData);
            DataLayer.save('currentUser', profileData);
            return profileData;
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }

    return null;
}

// Load similar users with caching
async function loadSimilarUsersWithCache() {
    const cached = CacheSystem.get('SIMILAR_USERS', CacheSystem.CACHE_DURATIONS.SIMILAR_USERS);
    if (cached) {
        return cached;
    }

    try {
        // This would use the existing similar users logic
        const similarUsers = await SimilarUsersSystem.findSimilarUsers();
        CacheSystem.set('SIMILAR_USERS', similarUsers);
        return similarUsers;
    } catch (error) {
        console.error('Error loading similar users:', error);
        return [];
    }
}

export default CacheSystem;