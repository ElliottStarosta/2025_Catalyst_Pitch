// js/app.js
import { AuthManager } from './auth/auth.js';
import { UserManager } from './user/userManager.js';
import { FriendsManager } from './friends/friendsManager.js';
import { UIManager } from './ui/uiManager.js';

class SocialMediaApp {
    constructor() {
        this.authManager = new AuthManager();
        this.userManager = new UserManager();
        this.friendsManager = new FriendsManager();
        this.uiManager = new UIManager();
        
        this.currentUser = null;
        this.currentUserProfile = null;
        
        this.init();
    }

    init() {
        // Set up auth state change handlers
        this.authManager.onUserLogin = (user) => this.handleUserLogin(user);
        this.authManager.onUserLogout = () => this.handleUserLogout();

        // Set up form event listeners
        this.setupFormListeners();
        this.setupUIEventListeners();

        // Check for geolocation support
        this.checkGeolocationSupport();
    }

    // Handle user login
    async handleUserLogin(user) {
        try {
            this.currentUser = user;
            
            // Load user profile
            this.currentUserProfile = await this.userManager.getUserProfile(user.uid);
            
            // Show main app
            this.uiManager.showScreen('main-screen');
            this.uiManager.showMainTab('profile');
            
            // Load initial data
            await this.loadUserData();
            
            console.log('User logged in successfully:', user.uid);
        } catch (error) {
            console.error('Error handling user login:', error);
            this.uiManager.showToast('Error loading user data', 'error');
        }
    }

    // Handle user logout
    handleUserLogout() {
        this.currentUser = null;
        this.currentUserProfile = null;
        
        this.uiManager.showScreen('auth-screen');
        this.uiManager.showAuthTab('login');
        
        console.log('User logged out');
    }

    // Load user data after login
    async loadUserData() {
        if (!this.currentUser) return;

        try {
            // Display user profile
            if (this.currentUserProfile) {
                this.uiManager.displayUserProfile(this.currentUserProfile, 'profile-display');
            }

            // Load friend stats
            const stats = await this.friendsManager.getFriendStats(this.currentUser.uid);
            this.uiManager.updateUserStats(stats, 'user-stats');

            // Load pending friend requests
            const pendingRequests = await this.friendsManager.getPendingFriendRequests(this.currentUser.uid);
            this.uiManager.displayFriendRequests(pendingRequests, 'friend-requests-list');

            // Load friends list
            const friends = await this.friendsManager.getFriends(this.currentUser.uid);
            this.uiManager.displayFriendsList(friends, 'friends-list');

        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // Set up form event listeners
    setupFormListeners() {
        // Login form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Register form
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        }

        // Edit profile form
        const editProfileForm = document.getElementById('edit-profile-form');
        if (editProfileForm) {
            editProfileForm.addEventListener('submit', (e) => this.handleEditProfile(e));
        }

        // Search form
        const searchForm = document.getElementById('search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => this.handleSearch(e));
        }
    }

    // Set up UI event listeners
    setupUIEventListeners() {
        // Tab switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('auth-tab')) {
                const tab = e.target.getAttribute('data-tab');
                this.uiManager.showAuthTab(tab);
            }
            
            if (e.target.classList.contains('main-tab')) {
                const tab = e.target.getAttribute('data-tab');
                this.uiManager.showMainTab(tab);
                
                // Load tab-specific data
                this.loadTabData(tab);
            }
        });

        // Get location button
        const getLocationBtn = document.getElementById('get-location-btn');
        if (getLocationBtn) {
            getLocationBtn.addEventListener('click', () => this.getCurrentLocation());
        }
    }

    // Handle login form submission
    async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            this.uiManager.showToast('Please fill in all fields', 'error');
            return;
        }

        try {
            this.uiManager.showLoading('auth-message', 'Logging in...');
            await this.authManager.login(email, password);
            this.uiManager.showSuccess('auth-message', 'Login successful!');
        } catch (error) {
            this.uiManager.showError('auth-message', error.message);
        }
    }

    // Handle register form submission
    async handleRegister(event) {
        event.preventDefault();
        
        const formData = {
            email: document.getElementById('register-email').value,
            password: document.getElementById('register-password').value,
            username: document.getElementById('register-username').value,
            displayName: document.getElementById('register-display-name').value,
            bio: document.getElementById('register-bio').value,
            personalityType: document.getElementById('register-personality').value,
            location: this.getUserLocation()
        };

        // Basic validation
        if (!formData.email || !formData.password || !formData.username || !formData.displayName) {
            this.uiManager.showToast('Please fill in all required fields', 'error');
            return;
        }

        if (formData.password.length < 6) {
            this.uiManager.showToast('Password must be at least 6 characters', 'error');
            return;
        }

        try {
            this.uiManager.showLoading('auth-message', 'Creating account...');
            await this.authManager.register(formData);
            this.uiManager.showSuccess('auth-message', 'Account created successfully!');
        } catch (error) {
            this.uiManager.showError('auth-message', error.message);
        }
    }

    // Handle edit profile form submission
    async handleEditProfile(event) {
        event.preventDefault();
        
        if (!this.currentUser) return;

        const updates = {
            displayName: document.getElementById('edit-display-name').value,
            bio: document.getElementById('edit-bio').value,
            personalityType: document.getElementById('edit-personality').value
        };

        try {
            this.uiManager.showLoading('profile-message', 'Updating profile...');
            
            await this.userManager.updateUserProfile(this.currentUser.uid, updates);
            
            // Reload user profile
            this.currentUserProfile = await this.userManager.getUserProfile(this.currentUser.uid);
            this.uiManager.displayUserProfile(this.currentUserProfile, 'profile-display');
            
            this.uiManager.showToast('Profile updated successfully!', 'success');
            
            // Hide edit form
            document.getElementById('edit-profile-section').style.display = 'none';
        } catch (error) {
            this.uiManager.showError('profile-message', error.message);
        }
    }

    // Handle search
    async handleSearch(event) {
        event.preventDefault();
        
        const searchTerm = document.getElementById('search-input').value.trim();
        
        if (!searchTerm || searchTerm.length < 2) {
            this.uiManager.showToast('Please enter at least 2 characters to search', 'error');
            return;
        }

        try {
            this.uiManager.showLoading('search-results', 'Searching users...');
            
            const users = await this.userManager.searchUsers(searchTerm, this.currentUser.uid);
            
            // Get friendship status for each user
            const friendshipStatuses = {};
            for (const user of users) {
                const status = await this.friendsManager.getFriendshipStatus(this.currentUser.uid, user.id);
                friendshipStatuses[user.id] = status;
            }
            
            this.uiManager.displaySearchResults(users, 'search-results', this.currentUser.uid, friendshipStatuses);
        } catch (error) {
            this.uiManager.showError('search-results', error.message);
        }
    }

    // Send friend request
    async sendFriendRequest(toUserId) {
        if (!this.currentUser) return;

        try {
            await this.friendsManager.sendFriendRequest(this.currentUser.uid, toUserId);
            this.uiManager.showToast('Friend request sent!', 'success');
            
            // Refresh search results or current view
            this.refreshCurrentView();
        } catch (error) {
            this.uiManager.showToast(error.message, 'error');
        }
    }

    // Accept friend request
    async acceptFriendRequest(requestId) {
        if (!this.currentUser) return;

        try {
            await this.friendsManager.acceptFriendRequest(requestId, this.currentUser.uid);
            this.uiManager.showToast('Friend request accepted!', 'success');
            
            // Refresh friends data
            this.loadUserData();
        } catch (error) {
            this.uiManager.showToast(error.message, 'error');
        }
    }

    // Reject friend request
    async rejectFriendRequest(requestId) {
        if (!this.currentUser) return;

        try {
            await this.friendsManager.rejectFriendRequest(requestId, this.currentUser.uid);
            this.uiManager.showToast('Friend request declined', 'info');
            
            // Refresh requests list
            const pendingRequests = await this.friendsManager.getPendingFriendRequests(this.currentUser.uid);
            this.uiManager.displayFriendRequests(pendingRequests, 'friend-requests-list');
        } catch (error) {
            this.uiManager.showToast(error.message, 'error');
        }
    }

    // Cancel sent friend request
    async cancelFriendRequest(requestId) {
        if (!this.currentUser) return;

        try {
            await this.friendsManager.cancelFriendRequest(requestId, this.currentUser.uid);
            this.uiManager.showToast('Friend request cancelled', 'info');
            
            this.refreshCurrentView();
        } catch (error) {
            this.uiManager.showToast(error.message, 'error');
        }
    }

    // Remove friend
    async removeFriend(friendId) {
        if (!this.currentUser) return;

        if (!confirm('Are you sure you want to remove this friend?')) return;

        try {
            await this.friendsManager.removeFriend(this.currentUser.uid, friendId);
            this.uiManager.showToast('Friend removed', 'info');
            
            // Refresh friends list
            this.loadUserData();
        } catch (error) {
            this.uiManager.showToast(error.message, 'error');
        }
    }

    // Get current location
    getCurrentLocation() {
        if (!navigator.geolocation) {
            this.uiManager.showToast('Geolocation is not supported by this browser', 'error');
            return;
        }

        this.uiManager.showToast('Getting your location...', 'info');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                
                try {
                    await this.userManager.updateUserLocation(this.currentUser.uid, latitude, longitude);
                    this.uiManager.showToast('Location updated successfully!', 'success');
                    
                    // Update current user profile
                    this.currentUserProfile = await this.userManager.getUserProfile(this.currentUser.uid);
                    this.uiManager.displayUserProfile(this.currentUserProfile, 'profile-display');
                } catch (error) {
                    this.uiManager.showToast('Error updating location: ' + error.message, 'error');
                }
            },
            (error) => {
                let message = 'Unable to get location: ';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        message += 'Permission denied';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message += 'Position unavailable';
                        break;
                    case error.TIMEOUT:
                        message += 'Request timeout';
                        break;
                    default:
                        message += 'Unknown error';
                }
                this.uiManager.showToast(message, 'error');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    }

    // Check geolocation support
    checkGeolocationSupport() {
        const locationBtn = document.getElementById('get-location-btn');
        if (locationBtn) {
            locationBtn.style.display = navigator.geolocation ? 'inline-block' : 'none';
        }
    }

    // Get user location from form (if manually entered)
    getUserLocation() {
        const latInput = document.getElementById('register-lat');
        const lngInput = document.getElementById('register-lng');
        
        if (latInput && lngInput && latInput.value && lngInput.value) {
            return {
                lat: parseFloat(latInput.value),
                lng: parseFloat(lngInput.value)
            };
        }
        
        return { lat: null, lng: null };
    }

    // Load tab-specific data
    async loadTabData(tabName) {
        if (!this.currentUser) return;

        switch (tabName) {
            case 'friends':
                await this.loadFriendsData();
                break;
            case 'search':
                // Clear previous search results
                document.getElementById('search-input').value = '';
                document.getElementById('search-results').innerHTML = '';
                break;
            case 'profile':
                await this.loadProfileData();
                break;
        }
    }

    // Load friends tab data
    async loadFriendsData() {
        try {
            // Load pending requests
            const pendingRequests = await this.friendsManager.getPendingFriendRequests(this.currentUser.uid);
            this.uiManager.displayFriendRequests(pendingRequests, 'friend-requests-list');

            // Load friends list
            const friends = await this.friendsManager.getFriends(this.currentUser.uid);
            this.uiManager.displayFriendsList(friends, 'friends-list');

            // Update stats
            const stats = await this.friendsManager.getFriendStats(this.currentUser.uid);
            this.uiManager.updateUserStats(stats, 'user-stats');
        } catch (error) {
            console.error('Error loading friends data:', error);
        }
    }

    // Load profile tab data
    async loadProfileData() {
        try {
            if (this.currentUserProfile) {
                this.uiManager.displayUserProfile(this.currentUserProfile, 'profile-display');
            }
        } catch (error) {
            console.error('Error loading profile data:', error);
        }
    }

    // Refresh current view
    refreshCurrentView() {
        const currentTab = document.querySelector('.main-tab.active')?.getAttribute('data-tab');
        if (currentTab) {
            this.loadTabData(currentTab);
        }
    }

    // Show edit profile form
    showEditProfile() {
        const editSection = document.getElementById('edit-profile-section');
        if (editSection) {
            editSection.style.display = 'block';
            
            // Pre-fill form with current data
            if (this.currentUserProfile) {
                document.getElementById('edit-display-name').value = this.currentUserProfile.displayName || '';
                document.getElementById('edit-bio').value = this.currentUserProfile.bio || '';
                document.getElementById('edit-personality').value = this.currentUserProfile.personalityType || 'Balanced';
            }
        }
    }

    // Hide edit profile form
    hideEditProfile() {
        const editSection = document.getElementById('edit-profile-section');
        if (editSection) {
            editSection.style.display = 'none';
        }
    }

    // Search nearby users
    async searchNearbyUsers() {
        if (!this.currentUser || !this.currentUserProfile?.location?.lat) {
            this.uiManager.showToast('Location not available. Please update your location first.', 'error');
            return;
        }

        try {
            this.uiManager.showLoading('search-results', 'Finding nearby users...');
            
            const nearbyUsers = await this.userManager.getNearbyUsers(
                this.currentUser.uid,
                this.currentUserProfile.location.lat,
                this.currentUserProfile.location.lng,
                50 // 50km radius
            );
            
            // Get friendship status for each user
            const friendshipStatuses = {};
            for (const user of nearbyUsers) {
                const status = await this.friendsManager.getFriendshipStatus(this.currentUser.uid, user.id);
                friendshipStatuses[user.id] = status;
            }
            
            this.uiManager.displaySearchResults(nearbyUsers, 'search-results', this.currentUser.uid, friendshipStatuses);
        } catch (error) {
            this.uiManager.showError('search-results', error.message);
        }
    }

    // Get recommended users
    async getRecommendedUsers() {
        if (!this.currentUser || !this.currentUserProfile) return;

        try {
            this.uiManager.showLoading('search-results', 'Getting recommendations...');
            
            const recommended = await this.userManager.getRecommendedUsers(
                this.currentUser.uid,
                this.currentUserProfile.personalityType
            );
            
            // Get friendship status for each user
            const friendshipStatuses = {};
            for (const user of recommended) {
                const status = await this.friendsManager.getFriendshipStatus(this.currentUser.uid, user.id);
                friendshipStatuses[user.id] = status;
            }
            
            this.uiManager.displaySearchResults(recommended, 'search-results', this.currentUser.uid, friendshipStatuses);
        } catch (error) {
            this.uiManager.showError('search-results', error.message);
        }
    }

    // View user profile (placeholder for future feature)
    async viewProfile(userId) {
        try {
            const userProfile = await this.userManager.getUserProfile(userId);
            if (userProfile) {
                // For now, just show a toast with user info
                this.uiManager.showToast(`Viewing ${userProfile.displayName}'s profile`, 'info');
                // TODO: Implement profile modal or separate profile page
            }
        } catch (error) {
            this.uiManager.showToast('Error loading profile', 'error');
        }
    }

    // Logout
    async logout() {
        try {
            await this.authManager.logout();
            this.uiManager.showToast('Logged out successfully', 'success');
        } catch (error) {
            this.uiManager.showToast('Error logging out: ' + error.message, 'error');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create global app instance
    window.app = new SocialMediaApp();
    
    // Make some methods globally available for onclick handlers
    window.showEditProfile = () => window.app.showEditProfile();
    window.hideEditProfile = () => window.app.hideEditProfile();
    window.searchNearbyUsers = () => window.app.searchNearbyUsers();
    window.getRecommendedUsers = () => window.app.getRecommendedUsers();
    window.logout = () => window.app.logout();
});

export default SocialMediaApp;