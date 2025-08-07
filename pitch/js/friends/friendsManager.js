// js/friends/friendsManager.js
import { 
    collection, 
    doc, 
    addDoc, 
    deleteDoc, 
    getDocs, 
    getDoc,
    query, 
    where, 
    serverTimestamp,
    updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from '../config/firebase.js';

export class FriendsManager {
    constructor() {
        this.friendRequestsCollection = collection(db, 'friendRequests');
        this.friendsCollection = collection(db, 'friends');
    }

    // Send friend request
    async sendFriendRequest(fromUserId, toUserId) {
        try {
            // Check if users are the same
            if (fromUserId === toUserId) {
                throw new Error('Cannot send friend request to yourself');
            }

            // Check if request already exists (either direction)
            const existingRequest = await this.getFriendRequest(fromUserId, toUserId);
            if (existingRequest) {
                throw new Error('Friend request already exists');
            }

            // Check if they're already friends
            const existingFriendship = await this.getFriendship(fromUserId, toUserId);
            if (existingFriendship) {
                throw new Error('You are already friends');
            }

            // Create friend request
            const requestData = {
                fromUserId: fromUserId,
                toUserId: toUserId,
                status: 'pending',
                createdAt: serverTimestamp()
            };

            const docRef = await addDoc(this.friendRequestsCollection, requestData);
            
            return { success: true, requestId: docRef.id };
        } catch (error) {
            console.error('Error sending friend request:', error);
            throw error;
        }
    }

    // Get friend request between two users
    async getFriendRequest(user1Id, user2Id) {
        try {
            // Check both directions
            const queries = [
                query(this.friendRequestsCollection, 
                    where('fromUserId', '==', user1Id), 
                    where('toUserId', '==', user2Id)
                ),
                query(this.friendRequestsCollection, 
                    where('fromUserId', '==', user2Id), 
                    where('toUserId', '==', user1Id)
                )
            ];

            for (const q of queries) {
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
            }

            return null;
        } catch (error) {
            console.error('Error getting friend request:', error);
            return null;
        }
    }

    // Get all pending friend requests for a user
    async getPendingFriendRequests(userId) {
        try {
            const q = query(
                this.friendRequestsCollection,
                where('toUserId', '==', userId),
                where('status', '==', 'pending')
            );

            const querySnapshot = await getDocs(q);
            const requests = [];

            for (const docSnap of querySnapshot.docs) {
                const requestData = docSnap.data();
                
                // Get sender's profile
                const senderDoc = await getDoc(doc(db, 'users', requestData.fromUserId));
                if (senderDoc.exists()) {
                    requests.push({
                        id: docSnap.id,
                        ...requestData,
                        fromUser: { id: senderDoc.id, ...senderDoc.data() }
                    });
                }
            }

            return requests;
        } catch (error) {
            console.error('Error getting pending friend requests:', error);
            throw error;
        }
    }

    // Get sent friend requests
    async getSentFriendRequests(userId) {
        try {
            const q = query(
                this.friendRequestsCollection,
                where('fromUserId', '==', userId),
                where('status', '==', 'pending')
            );

            const querySnapshot = await getDocs(q);
            const requests = [];

            for (const docSnap of querySnapshot.docs) {
                const requestData = docSnap.data();
                
                // Get recipient's profile
                const recipientDoc = await getDoc(doc(db, 'users', requestData.toUserId));
                if (recipientDoc.exists()) {
                    requests.push({
                        id: docSnap.id,
                        ...requestData,
                        toUser: { id: recipientDoc.id, ...recipientDoc.data() }
                    });
                }
            }

            return requests;
        } catch (error) {
            console.error('Error getting sent friend requests:', error);
            throw error;
        }
    }

    // Accept friend request
    async acceptFriendRequest(requestId, userId) {
        try {
            // Get the friend request
            const requestDoc = await getDoc(doc(this.friendRequestsCollection, requestId));
            if (!requestDoc.exists()) {
                throw new Error('Friend request not found');
            }

            const requestData = requestDoc.data();
            
            // Verify the user is the recipient
            if (requestData.toUserId !== userId) {
                throw new Error('Unauthorized to accept this friend request');
            }

            // Create friendship
            const friendshipData = {
                user1Id: requestData.fromUserId,
                user2Id: requestData.toUserId,
                createdAt: serverTimestamp()
            };

            await addDoc(this.friendsCollection, friendshipData);

            // Delete the friend request
            await deleteDoc(doc(this.friendRequestsCollection, requestId));

            return { success: true };
        } catch (error) {
            console.error('Error accepting friend request:', error);
            throw error;
        }
    }

    // Reject friend request
    async rejectFriendRequest(requestId, userId) {
        try {
            // Get the friend request
            const requestDoc = await getDoc(doc(this.friendRequestsCollection, requestId));
            if (!requestDoc.exists()) {
                throw new Error('Friend request not found');
            }

            const requestData = requestDoc.data();
            
            // Verify the user is the recipient
            if (requestData.toUserId !== userId) {
                throw new Error('Unauthorized to reject this friend request');
            }

            // Update status to rejected (or delete entirely)
            await deleteDoc(doc(this.friendRequestsCollection, requestId));

            return { success: true };
        } catch (error) {
            console.error('Error rejecting friend request:', error);
            throw error;
        }
    }

    // Cancel sent friend request
    async cancelFriendRequest(requestId, userId) {
        try {
            const requestDoc = await getDoc(doc(this.friendRequestsCollection, requestId));
            if (!requestDoc.exists()) {
                throw new Error('Friend request not found');
            }

            const requestData = requestDoc.data();
            
            // Verify the user is the sender
            if (requestData.fromUserId !== userId) {
                throw new Error('Unauthorized to cancel this friend request');
            }

            await deleteDoc(doc(this.friendRequestsCollection, requestId));

            return { success: true };
        } catch (error) {
            console.error('Error canceling friend request:', error);
            throw error;
        }
    }

    // Get friendship between two users
    async getFriendship(user1Id, user2Id) {
        try {
            // Check both directions
            const queries = [
                query(this.friendsCollection, 
                    where('user1Id', '==', user1Id), 
                    where('user2Id', '==', user2Id)
                ),
                query(this.friendsCollection, 
                    where('user1Id', '==', user2Id), 
                    where('user2Id', '==', user1Id)
                )
            ];

            for (const q of queries) {
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const doc = querySnapshot.docs[0];
                    return { id: doc.id, ...doc.data() };
                }
            }

            return null;
        } catch (error) {
            console.error('Error getting friendship:', error);
            return null;
        }
    }

    // Get all friends for a user
    async getFriends(userId) {
        try {
            // Get friendships where user is either user1 or user2
            const queries = [
                query(this.friendsCollection, where('user1Id', '==', userId)),
                query(this.friendsCollection, where('user2Id', '==', userId))
            ];

            const friends = [];
            const friendIds = new Set();

            for (const q of queries) {
                const querySnapshot = await getDocs(q);
                
                for (const docSnap of querySnapshot.docs) {
                    const friendshipData = docSnap.data();
                    
                    // Get the friend's ID (the other user in the friendship)
                    const friendId = friendshipData.user1Id === userId 
                        ? friendshipData.user2Id 
                        : friendshipData.user1Id;
                    
                    // Avoid duplicates
                    if (!friendIds.has(friendId)) {
                        friendIds.add(friendId);
                        
                        // Get friend's profile
                        const friendDoc = await getDoc(doc(db, 'users', friendId));
                        if (friendDoc.exists()) {
                            friends.push({
                                id: friendDoc.id,
                                ...friendDoc.data(),
                                friendshipId: docSnap.id,
                                friendsSince: friendshipData.createdAt
                            });
                        }
                    }
                }
            }

            // Sort friends by display name
            friends.sort((a, b) => a.displayName.localeCompare(b.displayName));

            return friends;
        } catch (error) {
            console.error('Error getting friends:', error);
            throw error;
        }
    }

    // Remove friend (unfriend)
    async removeFriend(userId, friendId) {
        try {
            const friendship = await this.getFriendship(userId, friendId);
            if (!friendship) {
                throw new Error('Friendship not found');
            }

            await deleteDoc(doc(this.friendsCollection, friendship.id));
            return { success: true };
        } catch (error) {
            console.error('Error removing friend:', error);
            throw error;
        }
    }

    // Get friendship status between two users
    async getFriendshipStatus(currentUserId, otherUserId) {
        try {
            // Check if they're friends
            const friendship = await this.getFriendship(currentUserId, otherUserId);
            if (friendship) {
                return { status: 'friends', friendship };
            }

            // Check for pending friend request
            const friendRequest = await this.getFriendRequest(currentUserId, otherUserId);
            if (friendRequest) {
                if (friendRequest.fromUserId === currentUserId) {
                    return { status: 'request_sent', request: friendRequest };
                } else {
                    return { status: 'request_received', request: friendRequest };
                }
            }

            return { status: 'not_friends' };
        } catch (error) {
            console.error('Error getting friendship status:', error);
            return { status: 'error', error };
        }
    }

    // Get friend statistics
    async getFriendStats(userId) {
        try {
            const [friends, pendingRequests, sentRequests] = await Promise.all([
                this.getFriends(userId),
                this.getPendingFriendRequests(userId),
                this.getSentFriendRequests(userId)
            ]);

            return {
                friendsCount: friends.length,
                pendingRequestsCount: pendingRequests.length,
                sentRequestsCount: sentRequests.length
            };
        } catch (error) {
            console.error('Error getting friend stats:', error);
            throw error;
        }
    }
}