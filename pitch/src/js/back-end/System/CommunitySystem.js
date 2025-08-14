 // Community System
    const CommunitySystem = {
      currentSection: 'activities',

      showSection: (section) => {
        console.log('🏗️ CommunitySystem.showSection() called with section:', section);
        CommunitySystem.currentSection = section;

        // Update tab styling
        document.querySelectorAll('#activities-tab, #friendship-tab').forEach(tab => {
          tab.classList.remove('active');
          tab.classList.remove('btn');
          tab.classList.remove('btn-secondary');
          tab.classList.add('filter-tab');
        });

        const activeTab = document.getElementById(`${section}-tab`);
        if (activeTab) {
          activeTab.classList.remove('filter-tab');
          activeTab.classList.add('btn');
          if (section === 'friendship') {
            activeTab.classList.add('btn-secondary');
          }
          activeTab.classList.add('active');
        }

        // Show/hide sections
        const activitiesSection = document.getElementById('activities-section');
        const friendshipSection = document.getElementById('friendship-section');

        if (activitiesSection) {
          activitiesSection.style.display = section === 'activities' ? 'block' : 'none';
        }
        if (friendshipSection) {
          friendshipSection.style.display = section === 'friendship' ? 'block' : 'none';
        }

        // Initialize the appropriate system
        if (section === 'activities') {
          console.log('🏗️ Initializing FeedSystem for activities section');
          if (typeof FeedSystem !== 'undefined') {
            FeedSystem.init();
          } else {
            console.error('🏗️ FeedSystem not found!');
          }
        } else if (section === 'friendship') {
          console.log('🏗️ Initializing FriendsDiscoverySystem for friendship section');
          if (typeof FriendsDiscoverySystem !== 'undefined') {
            FriendsDiscoverySystem.init();
          } else {
            console.error('🏗️ FriendsDiscoverySystem not found!');
          }
        }
      },

      init: () => {
        // Set up initial button styling
        const activitiesTab = document.getElementById('activities-tab');
        const friendshipTab = document.getElementById('friendship-tab');

        if (activitiesTab && friendshipTab) {
          activitiesTab.classList.remove('filter-tab');
          activitiesTab.classList.add('btn');
          friendshipTab.classList.remove('filter-tab');
          friendshipTab.classList.add('btn', 'btn-secondary');
        }

        // Check friend requests immediately when community tab is opened
        if (getCurrentUser() && FriendsDiscoverySystem) {
          setTimeout(async () => {
            await FriendsDiscoverySystem.loadFriendRequests();
            FriendsDiscoverySystem.updateFriendRequestBadge();
          }, 500);
        }

        CommunitySystem.showSection('activities');
      }
    };
export default CommunitySystem;