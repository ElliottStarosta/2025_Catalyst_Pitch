import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} 

from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth, db } from '../config/firebase.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { UserManager } from '../user/userManager.js';

export class AuthManager {
    constructor() {
        this.currentUser = null;
        this.userManager = new UserManager();
        this.setupAuthListener();
    }

    // Set up authentication state listener
    setupAuthListener() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.currentUser = user;
                // Update user's online status
                await this.updateOnlineStatus(true);
                // Trigger user login event
                this.onUserLogin(user);
            } else {
                if (this.currentUser) {
                    // Update user's offline status before logout
                    await this.updateOnlineStatus(false);
                }
                this.currentUser = null;
                this.onUserLogout();
            }
        });
    }

    // Register new user
    async register(userData) {
        try {
            const { email, password, username, displayName, bio, location, personalityType } = userData;
            
            // Check if username is taken
            const isUsernameTaken = await this.userManager.isUsernameTaken(username);
            if (isUsernameTaken) {
                throw new Error('Username is already taken');
            }

            // Create Firebase auth user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Update Firebase auth profile
            await updateProfile(user, {
                displayName: displayName
            });

            // Create user document in Firestore
            const userProfile = {
                id: user.uid,
                username: username,
                displayName: displayName,
                email: email,
                bio: bio || '',
                avatar: displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
                location: location || { lat: null, lng: null },
                adjustmentFactor: 1.0, // Default adjustment factor
                personalityType: personalityType || 'Balanced',
                isPremium: false, // Default to free user
                isOnline: true,
                lastSeen: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await setDoc(doc(db, 'users', user.uid), userProfile);

            return { success: true, user: userProfile };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    // Login user
    async login(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    // Logout user
    async logout() {
        try {
            await signOut(auth);
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    // Update user's online status
    async updateOnlineStatus(isOnline) {
        if (this.currentUser) {
            try {
                await updateDoc(doc(db, 'users', this.currentUser.uid), {
                    isOnline: isOnline,
                    lastSeen: serverTimestamp()
                });
            } catch (error) {
                console.error('Error updating online status:', error);
            }
        }
    }

    // Get current authenticated user
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.currentUser !== null;
    }

    // Event handlers (to be overridden by the main app)
    onUserLogin(user) {
        // Override this in main app
        console.log('User logged in:', user.uid);
    }

    onUserLogout() {
        // Override this in main app
        console.log('User logged out');
    }
}