export class UIManager {
    constructor() {
        this.currentScreen = 'auth';
        this.currentTab = 'login';
    }

    // Show specific screen
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
        }
    }

    // Show auth tab (login/register)
    showAuthTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.auth-tab-content').forEach(content => {
            content.style.display = 'none';
        });
        document.getElementById(`${tabName}-tab`).style.display = 'block';

        this.currentTab = tabName;
    }

    // Show main app tab
    showMainTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.main-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.main-tab-content').forEach(content => {
            content.style.display = 'none';
        });
        document.getElementById(`${tabName}-content`).style.display = 'block';

        this.currentTab = tabName;
    }

    // Display user profile
    displayUserProfile(user, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const personalityColors = {
            'Strong Extrovert': '#ff6b6b',
            'Mild Extrovert': '#4ecdc4',
            'Balanced': '#45b7d1',
            'Mild Introvert': '#96ceb4',
            'Strong Introvert': '#feca57'
        };

        const personalityColor = personalityColors[user.personalityType] || '#6c757d';

        container.innerHTML = `
            <div class="user-profile-card">
                <div class="user-header">
                    <div class="user-avatar" style="background-color: ${personalityColor}">
                        ${user.avatar || user.displayName.substring(0, 2).toUpperCase()}
                    </div>
                    <div class="user-info">
                        <h3>${user.displayName}</h3>
                        <p class="username">@${user.username}</p>
                        <div class="user-badges">
                            <span class="personality-badge" style="background-color: ${personalityColor}">
                                ${user.personalityType}
                            </span>
                            ${user.isPremium ? '<span class="premium-badge">Premium</span>' : ''}
                            <span class="online-status ${user.isOnline ? 'online' : 'offline'}">
                                ${user.isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="user-details">
                    <p class="user-bio">${user.bio || 'No bio available'}</p>
                    ${user.location && user.location.lat ? 
                        `<p class="user-location">📍 ${user.location.lat.toFixed(2)}, ${user.location.lng.toFixed(2)}</p>` : ''
                    }
                    <p class="adjustment-factor">Adjustment Factor: ${user.adjustmentFactor}</p>
                </div>
            </div>
        `;
    }

    // Display search results
    displaySearchResults(users, containerId, currentUserId, friendshipStatuses = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = '<div class="no-results">No users found. Try a different search term.</div>';
            return;
        }

        container.innerHTML = users.map(user => {
            const status = friendshipStatuses[user.id] || { status: 'not_friends' };
            let actionButton = '';

            switch (status.status) {
                case 'friends':
                    actionButton = `<button class="btn btn-secondary" onclick="window.app.removeFriend('${user.id}')">Remove Friend</button>`;
                    break;
                case 'request_sent':
                    actionButton = `<button class="btn btn-outline" onclick="window.app.cancelFriendRequest('${status.request.id}')">Cancel Request</button>`;
                    break;
                case 'request_received':
                    actionButton = `
                        <button class="btn btn-success" onclick="window.app.acceptFriendRequest('${status.request.id}')">Accept</button>
                        <button class="btn btn-danger" onclick="window.app.rejectFriendRequest('${status.request.id}')">Decline</button>
                    `;
                    break;
                default:
                    actionButton = `<button class="btn btn-primary" onclick="window.app.sendFriendRequest('${user.id}')">Add Friend</button>`;
            }

            return `
                <div class="user-search-card">
                    <div class="user-avatar">${user.avatar || user.displayName.substring(0, 2).toUpperCase()}</div>
                    <div class="user-info">
                        <h4>${user.displayName}</h4>
                        <p class="username">@${user.username}</p>
                        <p class="bio">${user.bio || 'No bio'}</p>
                        <div class="user-meta">
                            <span class="personality">${user.personalityType}</span>
                            ${user.isPremium ? '<span class="premium">Premium</span>' : ''}
                            ${user.distance ? `<span class="distance">${user.distance}km away</span>` : ''}
                        </div>
                    </div>
                    <div class="user-actions">
                        ${actionButton}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Display friend requests
    displayFriendRequests(requests, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (requests.length === 0) {
            container.innerHTML = '<div class="no-requests">No pending friend requests.</div>';
            return;
        }

        container.innerHTML = requests.map(request => `
            <div class="friend-request-card">
                <div class="user-avatar">${request.fromUser.avatar || request.fromUser.displayName.substring(0, 2).toUpperCase()}</div>
                <div class="user-info">
                    <h4>${request.fromUser.displayName}</h4>
                    <p class="username">@${request.fromUser.username}</p>
                    <p class="bio">${request.fromUser.bio || 'No bio'}</p>
                    <p class="request-time">Sent ${this.formatTimeAgo(request.createdAt)}</p>
                </div>
                <div class="request-actions">
                    <button class="btn btn-success" onclick="window.app.acceptFriendRequest('${request.id}')">Accept</button>
                    <button class="btn btn-danger" onclick="window.app.rejectFriendRequest('${request.id}')">Decline</button>
                </div>
            </div>
        `).join('');
    }

    // Display friends list
    displayFriendsList(friends, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (friends.length === 0) {
            container.innerHTML = '<div class="no-friends">No friends yet. Start by searching for people to connect with!</div>';
            return;
        }

        container.innerHTML = friends.map(friend => `
            <div class="friend-card">
                <div class="user-avatar">${friend.avatar || friend.displayName.substring(0, 2).toUpperCase()}</div>
                <div class="user-info">
                    <h4>${friend.displayName} ${friend.isOnline ? '<span class="online-indicator">●</span>' : ''}</h4>
                    <p class="username">@${friend.username}</p>
                    <p class="bio">${friend.bio || 'No bio'}</p>
                    <p class="friendship-time">Friends since ${this.formatDate(friend.friendsSince)}</p>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-outline" onclick="window.app.viewProfile('${friend.id}')">View Profile</button>
                    <button class="btn btn-danger" onclick="window.app.removeFriend('${friend.id}')">Remove</button>
                </div>
            </div>
        `).join('');
    }

    // Show loading state
    showLoading(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    // Show error message
    showError(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="error-message">
                <p>❌ ${message}</p>
            </div>
        `;
    }

    // Show success message
    showSuccess(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="success-message">
                <p>✅ ${message}</p>
            </div>
        `;
    }

    // Show toast notification
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;

        document.body.appendChild(toast);

        // Auto remove after duration
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, duration);
    }

    // Format date for display
    formatDate(timestamp) {
        if (!timestamp) return 'Unknown';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString();
    }

    // Format time ago
    formatTimeAgo(timestamp) {
        if (!timestamp) return 'Unknown';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));

        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) return `${diffInDays}d ago`;
        
        return date.toLocaleDateString();
    }

    // Clear form inputs
    clearForm(formId) {
        const form = document.getElementById(formId);
        if (form) {
            form.reset();
        }
    }

    // Validate form inputs
    validateForm(formId) {
        const form = document.getElementById(formId);
        if (!form) return false;

        const inputs = form.querySelectorAll('input[required], textarea[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.classList.add('error');
                isValid = false;
            } else {
                input.classList.remove('error');
            }
        });

        return isValid;
    }

    // Update user stats display
    updateUserStats(stats, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="user-stats">
                <div class="stat">
                    <span class="stat-number">${stats.friendsCount}</span>
                    <span class="stat-label">Friends</span>
                </div>
                <div class="stat">
                    <span class="stat-number">${stats.pendingRequestsCount}</span>
                    <span class="stat-label">Pending Requests</span>
                </div>
                <div class="stat">
                    <span class="stat-number">${stats.sentRequestsCount}</span>
                    <span class="stat-label">Sent Requests</span>
                </div>
            </div>
        `;
    }
}