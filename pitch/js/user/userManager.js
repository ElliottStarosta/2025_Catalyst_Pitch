import { 
    doc, 
    getDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    serverTimestamp,
    limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from '../config/firebase.js';

export class UserManager {
    constructor() {
        this.usersCollection = collection(db, 'users');
    }

    // Check if username is already taken
    async isUsernameTaken(username) {
        try {
            const q = query(this.usersCollection, where('username', '==', username));
            const querySnapshot = await getDocs(q);
            return !querySnapshot.empty;
        } catch (error) {
            console.error('Error checking username:', error);
            throw error;
        }
    }

    // Get user profile by ID
    async getUserProfile(userId) {
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                return { id: userDoc.id, ...userDoc.data() };
            }
            return null;
        } catch (error) {
            console.error('Error getting user profile:', error);
            throw error;
        }
    }

    // Update user profile
    async updateUserProfile(userId, updates) {
        try {
            const updateData = {
                ...updates,
                updatedAt: serverTimestamp()
            };
            
            await updateDoc(doc(db, 'users', userId), updateData);
            return { success: true };
        } catch (error) {
            console.error('Error updating user profile:', error);
            throw error;
        }
    }

    // Search users by username or display name
    async searchUsers(searchTerm, currentUserId, maxResults = 10) {
        try {
            if (!searchTerm || searchTerm.trim().length < 2) {
                return [];
            }

            const searchLower = searchTerm.toLowerCase();
            const results = [];

            // Get all users (in a real app, you'd use a proper search service like Algolia)
            const querySnapshot = await getDocs(this.usersCollection);
            
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                
                // Skip current user
                if (doc.id === currentUserId) return;
                
                // Check if username or display name contains search term
                const username = userData.username.toLowerCase();
                const displayName = userData.displayName.toLowerCase();
                
                if (username.includes(searchLower) || displayName.includes(searchLower)) {
                    results.push({
                        id: doc.id,
                        ...userData
                    });
                }
            });

            // Sort by relevance (exact matches first, then partial)
            results.sort((a, b) => {
                const aUsernameExact = a.username.toLowerCase() === searchLower;
                const bUsernameExact = b.username.toLowerCase() === searchLower;
                const aDisplayExact = a.displayName.toLowerCase() === searchLower;
                const bDisplayExact = b.displayName.toLowerCase() === searchLower;
                
                if ((aUsernameExact || aDisplayExact) && !(bUsernameExact || bDisplayExact)) return -1;
                if (!(aUsernameExact || aDisplayExact) && (bUsernameExact || bDisplayExact)) return 1;
                
                return a.displayName.localeCompare(b.displayName);
            });

            return results.slice(0, maxResults);
        } catch (error) {
            console.error('Error searching users:', error);
            throw error;
        }
    }

    // Get users by location (nearby users)
    async getNearbyUsers(currentUserId, centerLat, centerLng, radiusKm = 50) {
        try {
            // This is a simplified distance calculation
            // In production, use geohashing or a service like Firebase Extensions
            const results = [];
            const querySnapshot = await getDocs(this.usersCollection);
            
            querySnapshot.forEach((doc) => {
                if (doc.id === currentUserId) return;
                
                const userData = doc.data();
                if (userData.location && userData.location.lat && userData.location.lng) {
                    const distance = this.calculateDistance(
                        centerLat, centerLng,
                        userData.location.lat, userData.location.lng
                    );
                    
                    if (distance <= radiusKm) {
                        results.push({
                            id: doc.id,
                            ...userData,
                            distance: Math.round(distance * 10) / 10 // Round to 1 decimal
                        });
                    }
                }
            });

            // Sort by distance
            results.sort((a, b) => a.distance - b.distance);
            
            return results;
        } catch (error) {
            console.error('Error getting nearby users:', error);
            throw error;
        }
    }

    // Calculate distance between two coordinates (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        return distance;
    }

    deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    // Get recommended users based on personality type
    async getRecommendedUsers(currentUserId, personalityType, maxResults = 5) {
        try {
            // Simple recommendation based on personality type
            const q = query(
                this.usersCollection,
                where('personalityType', '==', personalityType),
                limit(maxResults + 1) // +1 to account for current user
            );
            
            const querySnapshot = await getDocs(q);
            const results = [];
            
            querySnapshot.forEach((doc) => {
                if (doc.id !== currentUserId) {
                    results.push({
                        id: doc.id,
                        ...doc.data()
                    });
                }
            });
            
            return results.slice(0, maxResults);
        } catch (error) {
            console.error('Error getting recommended users:', error);
            throw error;
        }
    }

    // Update user's location
    async updateUserLocation(userId, latitude, longitude) {
        try {
            await updateDoc(doc(db, 'users', userId), {
                location: { lat: latitude, lng: longitude },
                updatedAt: serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Error updating location:', error);
            throw error;
        }
    }

    // Toggle premium status (for admin use)
    async togglePremiumStatus(userId) {
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const currentStatus = userDoc.data().isPremium || false;
                await updateDoc(doc(db, 'users', userId), {
                    isPremium: !currentStatus,
                    updatedAt: serverTimestamp()
                });
                return { success: true, isPremium: !currentStatus };
            }
            throw new Error('User not found');
        } catch (error) {
            console.error('Error toggling premium status:', error);
            throw error;
        }
    }
}