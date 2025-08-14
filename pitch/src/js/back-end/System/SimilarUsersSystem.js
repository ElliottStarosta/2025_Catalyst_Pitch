import DataLayer from "../Data/DataLayer";
import ActivitySystem from "./ActivitySystem";
import FriendsSystem from "./Friends/FriendsSystem";
import { addCrownToPremiumUser } from "../../front-end/UserIcons";


const SimilarUsersSystem = {
    displaySimilarUsers: async () => {
      console.log('SimilarUsersSystem.displaySimilarUsers() called');
      const personalityData = DataLayer.load("personalityScore");
      if (!personalityData) {
        console.log('No personality data found, returning empty string');
        return "";
      }

      try {
        console.log('Finding similar users for adjustment factor:', personalityData.adjustmentFactor);
        const similarUsers = await ActivitySystem.findSimilarUsers(
          personalityData.adjustmentFactor
        );
        console.log('Found similar users:', similarUsers.length, similarUsers);

        // Get current friends
        console.log('Getting current friends...');
        const friends = await FriendsSystem.getFriends();
        const friendIds = friends.map(friend => friend.id);
        console.log('Current friends:', friends.length, friendIds);

        // Filter out users who are already friends
        const nonFriendUsers = similarUsers.filter(
          (user) => !friendIds.includes(user.id)
        );
        console.log('Non-friend users:', nonFriendUsers.length, nonFriendUsers);

        return `
    <div style="margin-bottom: 2rem;">
      <h3>Users Similar to You</h3>
      <p style="color: #666; margin-bottom: 1rem;">Connect with people who have similar social energy preferences</p>



      <div class="similar-users-grid">
        ${nonFriendUsers.length > 0
            ? nonFriendUsers
              .slice(0, 6)
              .map((user) => {
                return `
            <div class="similar-user-card">
              <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.8rem;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--secondary-gradient); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${user.avatar || user.displayName.charAt(0)}
                </div>
                <div style="text-align: left;">
                    <div style="font-weight: bold;">${addCrownToPremiumUser(user.displayName, user.id)}</div>
                    <div style="font-size: 0.8rem; color: var(--highlight);">${user.personalityType || 'Unknown'}</div>
                </div>
              </div>
              <div class="similarity-score">
                  ${(user.similarityScore * 100).toFixed(0)}% Similar
              </div>    
              <div style="font-size: 0.8rem; color: #666; margin: 0.8rem 0;">
                  AF: ${user.adjustmentFactor.toFixed(2)}
              </div>
                ${user.bio ? `<div style="font-size: 0.9rem; color: #666; margin-bottom: 0.8rem;">"${user.bio}"</div>` : ''}
                <div style="text-align: center;">
                  ${(() => {
                    // Check pending status first
                    const hasPendingRequest = typeof FriendsDiscoverySystem !== 'undefined' &&
                      Array.isArray(FriendsDiscoverySystem.pendingRequests) &&
                      FriendsDiscoverySystem.pendingRequests.some(r => r.toUserId === user.id);

                    if (hasPendingRequest) {
                      return `<button class=\"btn\" data-pending-for=\"${user.id}\" style=\"font-size: 0.8rem; padding: 6px 12px; background: #fbbf24; color: #1f2937; border: 1px solid #f59e0b;\" onclick=\"FriendsDiscoverySystem.cancelPendingRequest('${user.id}')\"><i class=\"fas fa-clock\"></i> Pending</button>`;
                    } else {
                      return `<button class="btn" style="font-size: 0.8rem; padding: 6px 12px;" onclick="FriendsSystem.addFriend('${user.id}')">Add Friend</button>`;
                    }
                  })()}
              </div>
              </div>
            `;
              }).join("")
            : '<div style="grid-column: 1 / -1; color: #666; text-align: center; padding: 2rem;">No similar users found. Try expanding your search or check back later!</div>'
          }
              </div>
            </div>
          `;
      } catch (error) {
        console.error('Error displaying similar users:', error);
        return `
    <div style="margin-bottom: 2rem;">
      <h3>Users Similar to You</h3>
      <p style="color: #666; text-align: center; padding: 2rem;">Unable to load similar users at this time.</p>
    </div>
  `;
      }
    },
};
  
export default SimilarUsersSystem;