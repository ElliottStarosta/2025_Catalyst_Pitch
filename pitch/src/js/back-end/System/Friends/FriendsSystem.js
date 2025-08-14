import NotificationSystem from '../NotificationSystem';
import FriendsDiscoverySystem from './FriendsDiscoverySystem';
import { wrapWrite, wrapRead } from '../../Logging';
import { getCurrentUser } from '../../firebase/firebase-config';
import { getAuthManager } from '../../firebase/initFirebase';
import CacheSystem from '../../Data/CacheSystem';
import DataLayer from '../../Data/DataLayer';

const FriendsSystem = {
    async addFriend(userId) {
      if (!getCurrentUser()) {
        NotificationSystem.show('Please sign in to add friends.', 'warning');
        return false;
      }

      try {
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Create friend request
        const requestData = {
          fromUserId: getCurrentUser().uid,
          toUserId: userId,
          status: 'pending',
          createdAt: serverTimestamp()
        };

        await wrapWrite(
          addDoc(collection(getAuthManager().db, 'friendRequests'), requestData),
          'addDoc',
          'friendRequests',
          { toUserId: userId }
        );

        NotificationSystem.show('Friend request sent!', 'success');

        // Update all buttons for this user to show "Pending" state
        const buttons = document.querySelectorAll(`[onclick*="FriendsSystem.addFriend(${userId})"]`);
        buttons.forEach(button => {
          button.innerHTML = '<i class="fas fa-clock"></i> Pending';
          button.style.background = '#fbbf24'; // Yellow background
          button.style.color = '#1f2937'; // Dark text for contrast
          button.style.border = '1px solid #f59e0b';
          button.disabled = true;
          button.onclick = null; // Remove the onclick to prevent multiple clicks
        });

        return true;
      } catch (error) {
        console.error('Error adding friend:', error);
        NotificationSystem.show('Failed to send friend request.', 'error');
        return false;
      }
    },

    updateFriendButton: (userId, isFriend) => {
      console.log(`Updating friend button for user ${userId}, isFriend: ${isFriend}`);

      // Find all buttons for this user with comprehensive selectors
      const buttonSelectors = [
        `[onclick*="FriendsSystem.addFriend(${userId})"]`,
        `[onclick*="FriendsSystem.addFriend('${userId}')"]`,
        `[onclick*="FriendsDiscoverySystem.sendFriendRequest('${userId}')"]`,
        `[onclick*="addFriend(${userId})"]`,
        `button[data-user-id="${userId}"]`,
        `[data-user-id="${userId}"]`
      ];

      // Also look for pending buttons that might need updating
      const pendingSelectors = [
        `[data-pending-for="${userId}"]`,
        `[style*="fbbf24"]`, // Yellow background (pending)
        `[style*="f59e0b"]`  // Yellow border (pending)
      ];

      let buttons = [];

      // Find buttons with specific user ID
      buttonSelectors.forEach(selector => {
        const foundButtons = document.querySelectorAll(selector);
        buttons = buttons.concat(Array.from(foundButtons));
      });

      // Enhanced search: look in user cards for any related buttons
      const userCards = document.querySelectorAll('.user-card, .similar-user-card, [data-user-id]');
      userCards.forEach(card => {
        if (card.getAttribute('data-user-id') === userId ||
          card.textContent.includes(userId) ||
          card.querySelector(`[onclick*="${userId}"]`)) {
          const cardButtons = card.querySelectorAll('button');
          cardButtons.forEach(btn => {
            if (btn.textContent.includes('Add Friend') ||
              btn.textContent.includes('Pending') ||
              btn.textContent.includes('Friend') ||
              (btn.onclick && btn.onclick.toString().includes(userId))) {
              buttons.push(btn);
            }
          });
        }
      });

      // If still no buttons, look for pending buttons
      if (buttons.length === 0) {
        console.log(`No specific buttons found for user ${userId}, looking for pending buttons`);
        pendingSelectors.forEach(selector => {
          try {
            const foundButtons = document.querySelectorAll(selector);
            buttons = buttons.concat(Array.from(foundButtons));
          } catch (e) {
            console.log(`Selector ${selector} not supported, skipping`);
          }
        });
      }

      // Remove duplicates
      buttons = [...new Set(buttons)];

      console.log(`Found ${buttons.length} buttons to update for user ${userId}`);

      buttons.forEach(button => {
        console.log(`Updating button:`, button);

        if (isFriend) {
          // Animate the button change
          button.style.transition = 'all 0.3s ease';
          button.style.transform = 'scale(1.1)';
          button.style.color = 'white';

          // Reset transform after animation and update content
          setTimeout(() => {
            button.style.transform = 'scale(1)';
            // Clear button styling to avoid double styling
            button.style.background = 'transparent';
            button.style.border = 'none';
            button.style.padding = '0';
            button.style.margin = '0';
            button.style.boxShadow = 'none';
            button.style.cursor = 'default';
            button.onclick = null; // Remove click handler
            button.innerHTML = '<span style="background: rgba(74, 144, 226, 0.1); color: var(--primary-color); font-size: 0.8rem; font-weight: bold; padding: 4px 8px; border-radius: 12px; border: 1px solid var(--primary-color); display: inline-block;">✓ Friend</span>';
            console.log(`Button updated to "Friend" for user ${userId}`);
          }, 300);
        } else {
          // Reset to original button styling
          button.innerHTML = 'Add Friend';
          button.style.background = '';
          button.style.color = '';
          button.style.border = '';
          button.style.padding = '';
          button.style.margin = '';
          button.style.boxShadow = '';
          button.style.transform = '';
          button.style.cursor = 'pointer';
          console.log(`Button reset to "Add Friend" for user ${userId}`);
          // Restore click handler - this will be handled by the page refresh
        }
      });

      // Force refresh of the friends display to ensure all UI is updated
      setTimeout(() => {
        if (typeof FriendsDiscoverySystem !== 'undefined') {
          console.log(`Refreshing FriendsDiscoverySystem display for user ${userId}`);
          FriendsDiscoverySystem.displayUsers();

          // Also update any specific user cards that might be cached
          const userCards = document.querySelectorAll(`[data-user-id="${userId}"]`);
          userCards.forEach(card => {
            // Force re-render of this specific card
            card.style.opacity = '0.8';
            setTimeout(() => {
              card.style.opacity = '1';
            }, 100);
          });
        }
      }, 500);
    },

    async getFriends() {
      if (!getCurrentUser()) return [];

      const cache = CacheSystem.get("FRIENDS",CacheSystem.CACHE_DURATIONS.FRIENDS);

      if (cache) return cache;

      try {
        const { collection, query, where, getDocs, getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const friendsCollection = collection(getAuthManager().db, 'friends');
        const queries = [
          query(friendsCollection, where('user1Id', '==', getCurrentUser().uid)),
          query(friendsCollection, where('user2Id', '==', getCurrentUser().uid))
        ];

        const friends = [];
        const friendIds = new Set();

        for (const q of queries) {
          const querySnapshot = await getDocs(q);

          for (const docSnap of querySnapshot.docs) {
            const friendshipData = docSnap.data();
            const friendId = friendshipData.user1Id === getCurrentUser().uid
              ? friendshipData.user2Id
              : friendshipData.user1Id;

            if (!friendIds.has(friendId)) {
              friendIds.add(friendId);

              const friendDoc = await getDoc(doc(getAuthManager().db, 'users', friendId));
              if (friendDoc.exists()) {
                friends.push({
                  id: friendDoc.id,
                  ...friendDoc.data()
                });
              }
            }
          }
        }

        DataLayer.save('friends',friends);
        CacheSystem.set("FRIENDS", friends, CacheSystem.CACHE_DURATIONS.FRIENDS);
        return friends;
      } catch (error) {
        console.error('Error getting friends:', error);
        return [];
      }
    },

    getFriendIds: async () => {
      const friends = await FriendsSystem.getFriends();
      return friends.map((friend) => friend.id);
    },

    async isFriend(userId) {
      if (!getCurrentUser()) return false;

      try {
        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const friendsCollection = collection(getAuthManager().db, 'friends');
        const queries = [
          query(friendsCollection, where('user1Id', '==', getCurrentUser().uid), where('user2Id', '==', userId)),
          query(friendsCollection, where('user1Id', '==', userId), where('user2Id', '==', getCurrentUser().uid))
        ];

        for (const q of queries) {
          const querySnapshot = await wrapRead(getDocs(q), 'getDocs', 'friends', {});
          if (!querySnapshot.empty) {
            return true;
          }
        }

        return false;
      } catch (error) {
        console.error('Error checking friendship:', error);
        return false;
      }
    },

    async removeFriend(userId) {
      if (!getCurrentUser()) {
        NotificationSystem.show('Please sign in to remove friends.', 'warning');
        return false;
      }

      try {
        const { collection, query, where, getDocs, deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const friendsCollection = collection(getAuthManager().db, 'friends');
        const queries = [
          query(friendsCollection, where('user1Id', '==', getCurrentUser().uid), where('user2Id', '==', userId)),
          query(friendsCollection, where('user1Id', '==', userId), where('user2Id', '==', getCurrentUser().uid))
        ];

        for (const q of queries) {
          const querySnapshot = await wrapRead(getDocs(q), 'getDocs', 'friends', {});
          if (!querySnapshot.empty) {
            const friendshipDoc = querySnapshot.docs[0];
            await wrapWrite(
              deleteDoc(doc(getAuthManager().db, 'friends', friendshipDoc.id)),
              'deleteDoc',
              `friends/${friendshipDoc.id}`,
              { reason: 'removeFriend' }
            );

            NotificationSystem.show('Friend removed successfully!', 'success');
            return true;
          }
        }

        NotificationSystem.show('Friend not found!', 'error');
        return false;
      } catch (error) {
        console.error('Error removing friend:', error);
        NotificationSystem.show('Failed to remove friend.', 'error');
        return false;
      }
    },

    // Enhanced friend request functions with real-time updates
    async acceptFriendRequest(requestId) {
      if (!getCurrentUser()) {
        NotificationSystem.show('Please sign in to accept friend requests.', 'warning');
        return false;
      }

      try {
        const { doc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Get the friend request
        const requestDoc = doc(getAuthManager().db, 'friendRequests', requestId);
        const requestSnapshot = await wrapRead(getDoc(requestDoc), 'getDoc', `friendRequests/${requestId}`, {});

        if (!requestSnapshot.exists()) {
          NotificationSystem.show('Friend request not found.', 'error');
          return false;
        }

        const requestData = requestSnapshot.data();

        // Update request status to accepted
        await wrapWrite(
          updateDoc(requestDoc, {
            status: 'accepted',
            acceptedAt: serverTimestamp()
          }),
          'updateDoc',
          `friendRequests/${requestId}`,
          { status: 'accepted' }
        );

        // Create friendship record
        const friendshipData = {
          user1Id: requestData.fromUserId,
          user2Id: requestData.toUserId,
          createdAt: serverTimestamp()
        };

        await wrapWrite(
          addDoc(collection(getAuthManager().db, 'friends'), friendshipData),
          'addDoc',
          'friends',
          { user1Id: requestData.fromUserId, user2Id: requestData.toUserId }
        );

        NotificationSystem.show('Friend request accepted!', 'success');

        // Real-time listeners will automatically update the UI
        return true;
      } catch (error) {
        console.error('Error accepting friend request:', error);
        NotificationSystem.show('Failed to accept friend request.', 'error');
        return false;
      }
    },

    async rejectFriendRequest(requestId) {
      if (!getCurrentUser()) {
        NotificationSystem.show('Please sign in to reject friend requests.', 'warning');
        return false;
      }

      try {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Update request status to rejected
        await wrapWrite(
          updateDoc(doc(getAuthManager().db, 'friendRequests', requestId), {
            status: 'rejected',
            rejectedAt: serverTimestamp()
          }),
          'updateDoc',
          `friendRequests/${requestId}`,
          { status: 'rejected' }
        );

        NotificationSystem.show('Friend request rejected.', 'info');

        // Real-time listeners will automatically update the UI
        return true;
      } catch (error) {
        console.error('Error rejecting friend request:', error);
        NotificationSystem.show('Failed to reject friend request.', 'error');
        return false;
      }
    },
  };


export default FriendsSystem