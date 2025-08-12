import {getCurrentUser} from './firebase-config';
import DataLayer from './DataLayer';

const GroupsSystem = {
    // Group limits for non-premium users
    AI_PREMIUM_ENABLED: DataLayer.load("currentUser").isPremium,
    FREE_GROUP_LIMIT: import.meta.env.FREE_GROUP_LIMIT,

    pageSize: import.meta.env.PAGINATION,
    store: { items: [], hasMore: true, isLoading: false, cacheKey: 'GROUPS_PAGINATED' },

    init: async () => {
      if (GroupsSystem._initInFlight) return;
      GroupsSystem._initInFlight = true;
      setTimeout(async () => {
        try {
          await GroupsSystem.resetAndLoad();
          GroupsSystem.displayGroups();
        } finally {
          GroupsSystem._initInFlight = false;
        }
      }, 150);
    },

    resetAndLoad: async () => {
      GroupsSystem.store = { items: [], hasMore: true, isLoading: false, cacheKey: 'GROUPS_PAGINATED'};
      GroupsSystem._lastGroupDocSnap = null;
      const cached = CacheSystem.get(GroupsSystem.store.cacheKey, CacheSystem.CACHE_DURATIONS.GROUPS);
      if (cached) {
        GroupsSystem.store = { ...GroupsSystem.store, ...cached };
        DataLayer.save('groups', GroupsSystem.store.items);
      } else {
        await GroupsSystem.loadNextPage();
      }
    },

    loadNextPage: async () => {
      if (GroupsSystem.store.isLoading || !GroupsSystem.store.hasMore) return;
      if (!getCurrentUser() || !authManager) return;
      GroupsSystem.store.isLoading = true;
      try {
        const { collection, query, where, limit, startAfter, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        let q = query(
          collection(authManager.db, 'groups'),
          where('members', 'array-contains', getCurrentUser().uid),
          limit(GroupsSystem.pageSize)
        );

        if (GroupsSystem._lastGroupDocSnap) {
          q = query(q, startAfter(GroupsSystem._lastGroupDocSnap));
        }

        const snapshot = await wrapRead(getDocs(q), 'getDocs', 'groups', { paginated: true });
        const page = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          // Prefer embedded memberDetails if present to avoid extra reads
          let members = Array.isArray(data.memberDetails) && data.memberDetails.length > 0 ? data.memberDetails : null;
          if (!members) {
            // Fallback minimal members list (IDs only) to keep UI functional without extra reads
            members = (data.members || []).map(id => ({ userId: id, displayName: 'Member', personalityType: '', adjustmentFactor: 0, avatar: '?' }));
          }
          page.push({
            id: docSnap.id,
            ...data,
            members,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            updatedAt: data.updatedAt?.toDate?.() || new Date()
          });
        }

        GroupsSystem.store.items = [...GroupsSystem.store.items, ...page];
        GroupsSystem._lastGroupDocSnap = snapshot.docs[snapshot.docs.length - 1] || GroupsSystem._lastGroupDocSnap;
        GroupsSystem.store.hasMore = snapshot.size === GroupsSystem.pageSize;

        // Persist and cache
        DataLayer.save('groups', GroupsSystem.store.items);
        CacheSystem.set(GroupsSystem.store.cacheKey, {
          items: GroupsSystem.store.items,
          hasMore: GroupsSystem.store.hasMore
        });
      } catch (error) {
        console.error('Paginated groups load failed:', error);
      } finally {
        GroupsSystem.store.isLoading = false;
      }
    },

    // Load groups (compat). Loads first page if none loaded
    loadGroupsFromFirebase: async () => {
      if (GroupsSystem.store.items.length === 0) {
        await GroupsSystem.resetAndLoad();
      }
    },

    // Check if user can create more groups
    canCreateGroup: () => {
      if (AI_PREMIUM_ENABLED) return true; // Premium users have unlimited groups

      const groups = DataLayer.load("groups", []);
      const currentMonth = new Date().getFullYear() + "-" + (new Date().getMonth() + 1);

      // Count groups created this month
      const groupsThisMonth = groups.filter(group => {
        const groupDate = new Date(group.createdAt);
        const groupMonth = groupDate.getFullYear() + "-" + (groupDate.getMonth() + 1);
        return groupMonth === currentMonth;
      });

      return groupsThisMonth.length < GroupsSystem.FREE_GROUP_LIMIT;
    },

    // Get group usage info
    getGroupUsage: () => {
      const groups = DataLayer.load("groups", []);
      const currentMonth = new Date().getFullYear() + "-" + (new Date().getMonth() + 1);

      // Count groups created this month
      const groupsThisMonth = groups.filter(group => {
        const groupDate = new Date(group.createdAt);
        const groupMonth = groupDate.getFullYear() + "-" + (groupDate.getMonth() + 1);
        return groupMonth === currentMonth;
      });

      return {
        current: groupsThisMonth.length,
        limit: AI_PREMIUM_ENABLED ? "∞" : GroupsSystem.FREE_GROUP_LIMIT,
        isPremium: AI_PREMIUM_ENABLED,
        canCreate: GroupsSystem.canCreateGroup()
      };
    },

    // Check if current user is admin of a group
    isGroupAdmin: (groupId) => {
      const groups = DataLayer.load('groups', []);
      const group = groups.find(g => g.id === groupId);
      return group && group.admin === getCurrentUser().uid;
    },

    // Check if current user is member of a group
    isGroupMember: (groupId) => {
      const groups = DataLayer.load('groups', []);
      const group = groups.find(g => g.id === groupId);
      return group && group.members.includes(getCurrentUser().uid);
    },

    // Transfer admin role to another member
    transferAdmin: async (groupId, newAdminId) => {
      if (!GroupsSystem.isGroupAdmin(groupId)) {
        NotificationSystem.show('Only the admin can transfer admin role.', 'error');
        return false;
      }

      try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Update admin in Firebase
        await wrapWrite(
          updateDoc(doc(authManager.db, 'groups', groupId), {
            admin: newAdminId,
            updatedAt: new Date()
          }),
          'updateDoc',
          `groups/${groupId}`,
          { adminChanged: true }
        );

        // Update local data
        const groups = DataLayer.load('groups', []);
        const groupIndex = groups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
          groups[groupIndex].admin = newAdminId;
          groups[groupIndex].updatedAt = new Date();

          // Update member roles
          groups[groupIndex].memberDetails.forEach(member => {
            if (member.userId === getCurrentUser().uid) {
              member.role = 'member';
            } else if (member.userId === newAdminId) {
              member.role = 'admin';
            }
          });

          DataLayer.save('groups', groups);
        }

        // Invalidate cache
        CacheSystem.invalidateGroupsCache();

        NotificationSystem.show('Admin role transferred successfully!', 'success');
        return true;
      } catch (error) {
        console.error('Error transferring admin:', error);
        NotificationSystem.show('Failed to transfer admin role.', 'error');
        return false;
      }
    },

    // Remove member from group (admin only)
    removeMember: async (groupId, memberId) => {
      if (!GroupsSystem.isGroupAdmin(groupId)) {
        NotificationSystem.show('Only the admin can remove members.', 'error');
        return false;
      }

      if (memberId === getCurrentUser().uid) {
        NotificationSystem.show('Admin cannot remove themselves. Transfer admin role first.', 'error');
        return false;
      }

      try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Get current group data
        const groups = DataLayer.load('groups', []);
        const group = groups.find(g => g.id === groupId);

        if (!group) {
          NotificationSystem.show('Group not found.', 'error');
          return false;
        }

        // Remove member from arrays
        const updatedMembers = group.members.filter(id => id !== memberId);
        const updatedMemberDetails = group.memberDetails.filter(member => member.userId !== memberId);

        // Update Firebase
        await wrapWrite(
          updateDoc(doc(authManager.db, 'groups', groupId), {
            members: updatedMembers,
            memberDetails: updatedMemberDetails,
            updatedAt: new Date()
          }),
          'updateDoc',
          `groups/${groupId}`,
          { memberListUpdated: true }
        );

        // Update local data
        const groupIndex = groups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
          groups[groupIndex].members = updatedMembers;
          groups[groupIndex].memberDetails = updatedMemberDetails;
          groups[groupIndex].updatedAt = new Date();
          DataLayer.save('groups', groups);
        }

        // Invalidate cache
        CacheSystem.invalidateGroupsCache();

        NotificationSystem.show('Member removed successfully!', 'success');
        return true;
      } catch (error) {
        console.error('Error removing member:', error);
        NotificationSystem.show('Failed to remove member.', 'error');
        return false;
      }
    },

    createGroup: async (name, description, members) => {
      const currentUser = DataLayer.load("currentUser");
      const personalityData = DataLayer.load("personalityScore");

      if (!personalityData) {
        NotificationSystem.show(
          "Please complete the personality assessment first!",
          "warning"
        );
        return;
      }

      // Check group creation limit for non-premium users
      if (!GroupsSystem.canCreateGroup()) {
        const usage = GroupsSystem.getGroupUsage();
        NotificationSystem.show(
          `You've reached your monthly limit of ${usage.current}/${usage.limit} groups. Upgrade to Premium for unlimited groups!`,
          "warning"
        );
        return;
      }

      // Ensure current user has location data
      if (!currentUser.location) {
        console.log(`🌤️ Current user has no location, attempting to get it...`);
        // Try to get user's location if not already set
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              currentUser.location = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
              };
              DataLayer.save("currentUser", currentUser);
              console.log(`🌤️ Updated current user location:`, currentUser.location);
            },
            (error) => {
              console.log(`🌤️ Could not get user location:`, error.message);
              // Keep default location
            }
          );
        }
      }

      const groupData = {
        name: name.trim(),
        description: description.trim(),
        createdBy: getCurrentUser().uid,
        admin: getCurrentUser().uid, // Creator is the admin
        members: [getCurrentUser().uid, ...members.map(member => member.userId)],
        memberDetails: [
          {
            userId: getCurrentUser().uid,
            displayName: currentUser.displayName,
            personalityType: currentUser.personalityType,
            adjustmentFactor: personalityData.adjustmentFactor,
            avatar: currentUser.avatar,
            importance: 1.0,
            role: 'admin', // Creator has admin role
            location: currentUser.location || { lat: 43.4643, lng: -80.5204 }, // Waterloo default
          },
          ...members.map(member => ({
            ...member,
            role: 'member', // Other members have member role
            location: { lat: 43.4643, lng: -80.5204 } // Default location - Firebase only
          })),
        ],
        votes: {},
        itineraries: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      try {
        // Save to Firebase
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const docRef = await wrapWrite(
          addDoc(collection(authManager.db, 'groups'), {
            ...groupData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }),
          'addDoc',
          'groups',
          { name: groupData.name }
        );

        // Add to local storage for immediate UI update
        const localGroup = {
          id: docRef.id,
          ...groupData,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        DataLayer.push("groups", localGroup);

        // Invalidate groups cache
        CacheSystem.invalidateGroupsCache();

        NotificationSystem.show("Group created successfully!", "success");
        GroupsSystem.displayGroups();
        closeModal();

        console.log('Group saved to Firebase with ID:', docRef.id);
      } catch (error) {
        console.error('Error creating group:', error);
        NotificationSystem.show("Failed to create group. Please try again.", "error");
      }
    },

    deleteGroup: async (groupId) => {
      // Only admin can delete the group
      if (!GroupsSystem.isGroupAdmin(groupId)) {
        NotificationSystem.show('Only the admin can delete the group.', 'error');
        return;
      }

      if (confirm("Are you sure you want to delete this group? This action cannot be undone.")) {
        DataLayer.remove("groups", (group) => group.id === groupId);

        // Delete from Firebase
        try {
          const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
          await wrapWrite(
            deleteDoc(doc(authManager.db, 'groups', groupId)),
            'deleteDoc',
            `groups/${groupId}`,
            { reason: 'deleteGroup' }
          );

          // Invalidate cache
          CacheSystem.invalidateGroupsCache();

          NotificationSystem.show('Group deleted successfully!', 'success');
          console.log('Group deleted from Firebase');
        } catch (error) {
          console.error('Error deleting group from Firebase:', error);
          NotificationSystem.show('Failed to delete group. Please try again.', 'error');
        }

        GroupsSystem.displayGroups();
      }
    },

    // Save itinerary to Firebase
    saveItineraryToFirebase: async (groupId) => {
      const groups = DataLayer.load("groups", []);
      const group = groups.find(g => g.id === groupId);

      if (!group || !group.aiItinerary) {
        NotificationSystem.show("No itinerary to save.", "warning");
        return;
      }

      try {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await wrapWrite(
          updateDoc(doc(authManager.db, 'groups', groupId), {
            aiItinerary: {
              ...group.aiItinerary,
              savedAt: serverTimestamp()
            },
            updatedAt: serverTimestamp()
          }),
          'updateDoc',
          `groups/${groupId}`,
          { saveItinerary: true }
        );

        NotificationSystem.show("Itinerary saved to cloud!", "success");
        console.log('Itinerary saved to Firebase');
      } catch (error) {
        console.error('Error saving itinerary to Firebase:', error);
        NotificationSystem.show("Failed to save itinerary. Please try again.", "error");
      }
    },

    getGroupRecommendations: (group) => {
      const allExperiences = ActivitySystem.getAllExperiences();
      const userExperiences = DataLayer.load("userExperiences", []);
      const userExperienceNames = userExperiences.map((exp) =>
        exp.name.toLowerCase()
      );

      // Calculate group center for location-based scoring
      const groupCenter = calculateGroupCenter(group);

      const recommendations = [];

      // Group experiences by name to avoid duplicates
      const experienceGroups = {};
      allExperiences.forEach((exp) => {
        const key = exp.name.toLowerCase();
        if (!experienceGroups[key]) {
          experienceGroups[key] = [];
        }
        experienceGroups[key].push(exp);
      });

      Object.entries(experienceGroups).forEach(([name, experiences]) => {
        let groupScore = 0;
        let individualScores = [];
        let totalWeight = 0;
        let hasValidPredictions = false;

        group.members.forEach((member) => {
          let memberScore = 0;
          let memberPredictions = 0;

          experiences.forEach((exp) => {
            // Skip demo user lookups - no longer using demo data
            const ratingUser = null; // Only use Firebase user data going forward
            if (false) { // Disabled demo prediction logic
              const prediction = ActivitySystem.predictRating(
                member.adjustmentFactor,
                exp,
                ratingUser.adjustmentFactor,
                exp.rawScore
              );
              memberScore += prediction.prediction * prediction.confidence;
              memberPredictions++;
              hasValidPredictions = true;
            }
          });

          if (memberPredictions > 0) {
            const avgMemberScore = memberScore / memberPredictions;
            individualScores.push({
              member: member,
              score: avgMemberScore,
            });
            groupScore += avgMemberScore * member.importance;
            totalWeight += member.importance;
          }
        });

        if (hasValidPredictions && totalWeight > 0) {
          const finalGroupScore = groupScore / totalWeight;
          const scoreVariance = GroupsSystem.calculateVariance(
            individualScores.map((s) => s.score)
          );
          const confidence = Math.max(0.1, 1 - scoreVariance / 10);

          // Calculate location score
          let locationScore = 1.0; // Default score for experiences without coordinates
          if (experiences[0].coordinates) {
            const distance = calculateDistance(
              groupCenter.lat, groupCenter.lng,
              experiences[0].coordinates.lat, experiences[0].coordinates.lng
            );
            // Score based on distance: closer = higher score
            // 0km = 1.0, 25km = 0.5, 50km+ = 0.1
            locationScore = Math.max(0.1, 1 - (distance / 50));
          }

          // Combine personality score with location score (70% personality, 30% location)
          const combinedScore = (finalGroupScore * 0.7) + (locationScore * 0.3);

          recommendations.push({
            experience: experiences[0],
            groupScore: combinedScore,
            confidence: confidence,
            individualScores: individualScores,
            variance: scoreVariance,
            locationScore: locationScore,
            distanceFromGroup: experiences[0].coordinates ?
              calculateDistance(groupCenter.lat, groupCenter.lng,
                experiences[0].coordinates.lat, experiences[0].coordinates.lng) : null
          });
        }
      });

      return recommendations.sort(
        (a, b) => b.groupScore * b.confidence - a.groupScore * a.confidence
      );
    },

    calculateVariance: (scores) => {
      if (scores.length === 0) return 0;
      const mean =
        scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const variance =
        scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
        scores.length;
      return Math.sqrt(variance);
    },

    displayGroups: () => {
      const groups = DataLayer.load("groups", []);
      const groupsContent = document.getElementById("groups-content");

      // Store which groups are currently expanded
      const expandedGroups = new Set();
      groups.forEach(group => {
        const groupContent = document.getElementById(`group-content-${group.id}`);
        if (groupContent && groupContent.style.maxHeight !== "0px" && groupContent.style.maxHeight !== "") {
          expandedGroups.add(group.id);
        }
      });

      // Update group usage display
      const usage = GroupsSystem.getGroupUsage();
      const usageText = document.getElementById("group-usage-text");
      console.log("Usage text element found:", !!usageText, "Usage:", usage);
      if (usageText) {
        usageText.textContent = `${usage.current}/${usage.limit}`;
        console.log("Updated usage text to:", `${usage.current}/${usage.limit}`);

        // Change color based on usage
        if (usage.isPremium) {
          usageText.style.background = "var(--primary-color)";
          usageText.style.color = "white";
        } else if (usage.current >= usage.limit) {
          usageText.style.background = "#f44336";
        } else if (usage.current >= usage.limit * 0.8) {
          usageText.style.background = "#FF9800";
        } else {
          usageText.style.background = "var(--primary-color)";
        }
      } else {
        console.log("Usage text element not found!");
      }

      // Update premium status display
      const premiumStatusText = document.getElementById("premium-status-text");
      if (premiumStatusText) {
        if (usage.isPremium) {
          premiumStatusText.innerHTML = "Premium - Unlimited Groups";
        } else {
          premiumStatusText.innerHTML = '<a href="#" onclick="showPremiumUpgradeModal()" style="color: var(--secondary-color); text-decoration: none;">Upgrade to Premium for unlimited groups</a>';
        }
      }

      // Update create button state
      const createBtn = document.getElementById("create-group-btn");
      if (createBtn) {
        if (!usage.canCreate) {
          createBtn.style.background = "#f44336";
          createBtn.style.cursor = "not-allowed";
          createBtn.onclick = () => {
            NotificationSystem.show(
              `You've reached your monthly limit of ${usage.current}/${usage.limit} groups. Upgrade to Premium for unlimited groups!`,
              "warning"
            );
          };
        } else {
          createBtn.style.background = "";
          createBtn.style.cursor = "pointer";
          createBtn.onclick = () => showCreateGroupModal().catch(error => {
            console.error('Error showing create group modal:', error);
            NotificationSystem.show('Error loading friends. Please try again.', 'error');
          });
        }
      }

      if (groups.length === 0) {
        groupsContent.innerHTML = `
    <div class="empty-state">
      <h3>No groups yet</h3>
      <p>Create your first group to start planning activities with friends!</p>
    </div>
  `;
        return;
      }

      // Render groups loaded so far (server-side pagination via Load More)
      groupsContent.innerHTML = groups
        .map((group) => {
          const currentUser = DataLayer.load("currentUser");
          const recommendations =
            GroupsSystem.getGroupRecommendations(group);
          const topRecommendations = recommendations.slice(0, 3);

          // Initialize votes if not exists
          if (!group.votes) group.votes = {};

          // Find most voted activity
          let mostVoted = null;
          let maxVotes = 0;
          Object.entries(group.votes).forEach(([activityName, votes]) => {
            if (votes.length > maxVotes) {
              maxVotes = votes.length;
              mostVoted = activityName;
            }
          });

          return `
      <div class="group-card" data-group-id="${group.id}" style="
        border: 1px solid #eee; 
        border-radius: 16px; 
        margin-bottom: 1.5rem; 
        background: white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        overflow: hidden;
        transition: all 0.2s ease;
      " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
         onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
        
        <!-- Collapsible Header -->
        <div class="group-header" onclick="GroupsSystem.toggleGroupExpansion('${group.id}')" style="
          padding: 1.5rem; 
          cursor: pointer; 
          display: flex; 
          justify-content: space-between; 
          align-items: center;
          background: var(--secondary-gradient);
          color: white;
          border-radius: 15px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        ">
          <div style="flex: 1;">
            <h3 style="margin: 0; font-size: 1.4rem; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.1);">${group.name}</h3>
            <p style="margin: 0.5rem 0 0 0; opacity: 0.95; font-size: 1rem; line-height: 1.4;">${group.description}</p>
            <div style="display: flex; gap: 1.5rem; margin-top: 0.8rem; font-size: 0.9rem; opacity: 0.9;">
              <span style="display: flex; align-items: center; gap: 0.3rem;"><i class="fas fa-users"></i> ${group.members.length} members</span>
              <span style="display: flex; align-items: center; gap: 0.3rem; cursor: help;" 
                    title="${formatFullDate(group.createdAt)}">
                <i class="fas fa-calendar"></i> ${new Date(group.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <i class="fas fa-chevron-down" id="expand-icon-${group.id}" style="
              transition: transform 0.2s ease; 
              font-size: 1.2rem; 
              opacity: 0.9;
              padding: 0.5rem;
              border-radius: 50%;
              background: rgba(255,255,255,0.5);
            "></i>
          </div>
        </div>

        <!-- Expandable Content -->
        <div class="group-content" id="group-content-${group.id}" style="
          max-height: 0; 
          overflow: hidden; 
          transition: max-height 0.3s ease;
          background: white;
        ">
          <div style="padding: 1.5rem;">
            
            <!-- Action Buttons -->
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
              ${(() => {
              // Check if all group members have premium access
              const allMembersHavePremium = group.members.every(member => {
                if (member.userId === currentUser.id) {
                  return currentUser.isPremium;
                } else {
                  // Demo users removed - Firebase only
                  return false;
                }
              });

              // Check if any members have premium access
              const anyMembersHavePremium = group.members.some(member => {
                if (member.userId === currentUser.id) {
                  return currentUser.isPremium;
                } else {
                  // Demo users removed - Firebase only
                  return false;
                }
              });

              if (!anyMembersHavePremium) {
                return `<button class="btn btn-secondary" onclick="showPremiumUpgradeModal()" style="background: var(--warning-color); color: var(--inverted-text-color);">
                    <i class="fas fa-crown"></i> Get Premium for AI Trip Planner
                  </button>`;
              } else if (!allMembersHavePremium) {
                return "";
              } else if (AI_PREMIUM_ENABLED) {
                return `<button class="btn" style="background: var(--primary-gradient); color: var(--inverted-text-color);" onclick="showAIPremiumModal('${group.id}')">
                    <i class="fa-solid fa-crown"></i> AI Trip Planner
                  </button>`;
              } else {
                return "";
              }
            })()}
              <button class="btn btn-info" onclick="showGroupLocationRecommendations('${group.id}')" style="background: var(--info-color);">
                <i class="fas fa-map-marker-alt"></i> Find Places Near Group
              </button>
              ${GroupsSystem.isGroupAdmin(group.id) ? `
                <button class="btn btn-secondary" onclick="GroupsSystem.editGroup('${group.id}')">
                <i class="fas fa-edit"></i> Edit Group
              </button>
                <button class="btn btn-danger" onclick="GroupsSystem.deleteGroup('${group.id}')">
                  <i class="fas fa-trash"></i> Delete Group
              </button>
              ` : ''}
            </div>

            <!-- Members Section -->
            <div style="margin-bottom: 1.5rem;">
              <h4 style="margin-bottom: 1rem; color: var(--primary-color);">
                <i class="fas fa-users"></i> Group Members
              </h4>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                ${group.members
              .map(
                (member) => `
                  <div style="
                    display: flex; 
                    align-items: center; 
                    gap: 0.5rem; 
                    padding: 0.5rem 0.8rem; 
                    background: #f8f9fa; 
                    border-radius: 20px; 
                    font-size: 0.9rem;
                    border: 1px solid #e9ecef;
                  ">
                    <div style="
                      width: 25px; 
                      height: 25px; 
                      border-radius: 50%; 
                      background: var(--secondary-color); 
                      color: white; 
                      display: flex; 
                      align-items: center; 
                      justify-content: center; 
                      font-size: 0.8rem;
                    ">${member.avatar}</div>
                    <span style="font-weight: 500;">${addCrownToPremiumUser(member.displayName, member.userId)}</span>
                    <span style="color: #666; font-size: 0.8rem;">(${member.personalityType})</span>
                  </div>
                `
              )
              .join("")}
              </div>
            </div>

            <!-- Group Scheduling Section -->
            ${(() => {
              // Check if any members have premium access
              const anyMembersHavePremium = group.members.some(member => {
                if (member.userId === currentUser.id) {
                  return currentUser.isPremium;
                } else {
                  // Demo users removed - Firebase only
                  return false;
                }
              });

              // Only show scheduling section if at least one member has premium
              if (anyMembersHavePremium) {
                return `<div id="scheduling-placeholder-${group.id}" style="margin-top: 2rem; padding: 1.5rem; background: linear-gradient(135deg, rgba(74, 144, 226, 0.05) 0%, rgba(160, 200, 240, 0.05) 100%); border-radius: 15px; border: 2px solid rgba(74, 144, 226, 0.2);">
                  <div style="text-align: center; color: #666;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
                    <p>Loading scheduling information...</p>
                  </div>
                </div>`;
              } else {
                return "";
              }
            })()}

            <!-- AI Itinerary Section -->
            ${renderAIItinerary(group)}

            <!-- Recommendations Section -->
            ${topRecommendations.length > 0 && !group.aiItinerary
              ? `
              <div style="margin-top: 1.5rem;">
                <h4 style="margin-bottom: 1rem; color: var(--primary-color);">
                  <i class="fas fa-star"></i> Top Recommendations
                </h4>
                <div class="activity-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                  ${topRecommendations
                .map((rec) => {
                  const activityName = rec.experience.name;
                  const votes = group.votes[activityName] || [];
                  const currentUserId = DataLayer.load("currentUser").id;
                  const hasVoted = votes.includes(currentUserId);
                  const isMostVoted =
                    mostVoted === activityName && maxVotes > 0;

                  return `
                      <div class="activity-card ${isMostVoted ? "most-voted" : ""
                    }" style="
                        border: 1px solid #eee; 
                        border-radius: 12px; 
                        padding: 1.5rem; 
                        background: white;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                        transition: all 0.2s ease;
                        ${isMostVoted ? 'border: 2px solid var(--secondary-color);' : ''}
                      " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
                         onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
                        
                        <div style="background: var(--secondary-gradient); color: white; padding: 0.8rem; margin: -1.5rem -1.5rem 1rem -1.5rem; border-radius: 12px 12px 0 0;">
                          <div style="font-weight: bold; font-size: 1.1rem;">Combined Score: ${rec.groupScore.toFixed(1)}/10</div>
                          <div style="font-size: 0.9rem; opacity: 0.9;">Confidence: ${(rec.confidence * 100).toFixed(0)}%</div>
                        </div>
                        
                        <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 0.5rem;">${rec.experience.name}</div>
                        <div style="color: #666; margin-bottom: 0.5rem;">
                          ${rec.experience.category} • ${rec.experience.location}
                          ${rec.distanceFromGroup ? ` • <i class="fas fa-map-marker-alt"></i> ${rec.distanceFromGroup.toFixed(1)}km away` : ''}
                        </div>
                        ${rec.experience.description
                      ? `<p style="font-size: 0.9rem; color: #666; margin: 0.5rem 0; line-height: 1.4;">${rec.experience.description}</p>`
                      : ""
                    }

                        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                          <strong style="font-size: 0.9rem;">Individual Predictions:</strong>
                          ${rec.individualScores
                      .map(
                        (score) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; margin-top: 0.3rem;">
                              <span>${addCrownToPremiumUser(score.member.displayName, score.member.userId)}</span>
                              <span style="font-weight: bold; color: ${score.score >= 7
                            ? "#4CAF50"
                            : score.score >= 5
                              ? "#FF9800"
                              : "#f44336"
                          }">${score.score.toFixed(1)}/10</span>
                            </div>
                          `
                      )
                      .join("")}
                          <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                            Group Compatibility: 
                            <span style="font-weight: bold; color: ${rec.variance <= 1.5
                      ? "#4CAF50"
                      : rec.variance <= 3
                        ? "#FF9800"
                        : "#f44336"
                    }">
                              ${rec.variance <= 1.5
                      ? "High"
                      : rec.variance <= 3
                        ? "Medium"
                        : "Low"
                    }
                            </span>
                          </div>
                          
                          <!-- Voting section -->
                          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                            <button class="vote-button ${hasVoted ? "voted" : ""
                    }" 
                                    onclick="GroupsSystem.voteForActivity(${group.id}, '${activityName.replace(/'/g, "\\'")}')" style="
                              background: ${hasVoted ? 'var(--success-color)' : 'var(--primary-color)'}; 
                              color: white; 
                              border: none; 
                              padding: 0.5rem 1rem; 
                              border-radius: 6px; 
                              cursor: pointer; 
                              font-size: 0.9rem;
                              transition: all 0.2s ease;
                            ">
                              ${hasVoted ? "✓ Voted" : "Vote for this"}
                            </button>
                            <div class="vote-count" style="margin-top: 0.5rem; font-size: 0.85rem; color: #666;">
                              ${votes.length} vote${votes.length !== 1 ? "s" : ""}
                              ${votes.length > 0
                      ? `(${votes
                        .map((userId) => {
                          const member = group.members.find(
                            (m) => m.userId === userId
                          );
                          return member ? addCrownToPremiumUser(member.displayName, member.userId) : "Unknown";
                        })
                        .join(", ")})`
                      : ""
                    }
                            </div>
                          </div>
                        </div>
                      </div>
                    `;
                })
                .join("")}
                </div>
              </div>
            `
              : '<p style="color: #666; text-align: center; padding: 2rem;">No recommendations available yet. More community data needed!</p>'
            }
          </div>
        </div>
      </div>
    `;
        })
        .join("");

      // Load more control for groups
      if (GroupsSystem.store && GroupsSystem.store.hasMore) {
        groupsContent.innerHTML += `
          <div style=\"display:flex; justify-content:center; margin:16px 0;\">
            <button class=\"btn btn-secondary\" onclick=\"(async()=>{await GroupsSystem.loadNextPage(); GroupsSystem.displayGroups();})()\">Load More Groups</button>
          </div>
        `;
      }

      // Load scheduling sections asynchronously after groups are rendered
      setTimeout(() => {
        groups.forEach(group => {
          const placeholder = document.getElementById(`scheduling-placeholder-${group.id}`);
          if (placeholder) {
            renderGroupScheduling(group).then(schedulingHtml => {
              placeholder.outerHTML = schedulingHtml;


            }).catch(error => {
              console.error('Error rendering group scheduling:', error);
              placeholder.innerHTML = '<p style="color: #666; text-align: center;">Unable to load scheduling information.</p>';
            });
          }
        });

        // Restore expanded state for groups that were expanded before
        setTimeout(() => {
          expandedGroups.forEach(groupId => {
            const groupContent = document.getElementById(`group-content-${groupId}`);
            const expandIcon = document.getElementById(`expand-icon-${groupId}`);
            if (groupContent && expandIcon) {
              groupContent.style.maxHeight = groupContent.scrollHeight + "px";
              expandIcon.style.transform = "rotate(180deg)";
            }
          });
        }, 200); // Wait a bit longer for scheduling to load
      }, 100);
    },
  };

  // Function to calculate group's central location
  function calculateGroupCenter(group) {
    const members = group.members;
    let totalLat = 0;
    let totalLng = 0;
    let validLocations = 0;

    members.forEach(member => {
      if (member.location) {
        totalLat += member.location.lat;
        totalLng += member.location.lng;
        validLocations++;
      } else {
        // No demo user fallback - Firebase only
        // Skip member without location data
      }
    });

    if (validLocations === 0) {
      // Default to Waterloo center if no locations available
      return { lat: 43.4643, lng: -80.5204 };
    }

    return {
      lat: totalLat / validLocations,
      lng: totalLng / validLocations
    };
  }

  // Function to get location-based group recommendations
  function getGroupLocationRecommendations(groupId) {
    const groups = DataLayer.load("groups", []);
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const groupCenter = calculateGroupCenter(group);
    const allExperiences = ActivitySystem.getAllExperiences();

    // Calculate distance from group center for each experience
    const experiencesWithDistance = allExperiences.map(exp => {
      if (exp.coordinates) {
        const distance = calculateDistance(
          groupCenter.lat, groupCenter.lng,
          exp.coordinates.lat, exp.coordinates.lng
        );
        return { ...exp, distanceFromGroup: distance };
      }
      return { ...exp, distanceFromGroup: Infinity };
    });

    // Get current user's experiences to exclude them
    const currentUser = DataLayer.load("currentUser");
    const userExperiences = DataLayer.load("userExperiences", []);
    const userExperienceNames = userExperiences.map(exp => exp.name.toLowerCase());

    // Filter experiences within 25km of group center, exclude user's own experiences, and sort by distance
    const nearbyExperiences = experiencesWithDistance
      .filter(exp => exp.distanceFromGroup <= 25 && !userExperienceNames.includes(exp.name.toLowerCase()))
      .sort((a, b) => a.distanceFromGroup - b.distanceFromGroup)
      .slice(0, 10);

    return {
      groupCenter,
      recommendations: nearbyExperiences
    };
  }

  function showGroupLocationRecommendations(groupId) {
    const recommendations = getGroupLocationRecommendations(groupId);
    if (!recommendations || recommendations.recommendations.length === 0) {
      NotificationSystem.show("No nearby places found for this group.", "warning");
      return;
    }

    const modalHtml = `
      <div id="group-location-modal" class="modal">
        <div class="modal-content" style="max-width: 700px;">
          <button class="modal-close" onclick="closeGroupLocationModal()">&times;</button>
          <div class="modal-header">
            <h2 style="color: var(--secondary-color); display: flex; align-items: center; gap: 0.5rem;">
              <i class="fas fa-map-marker-alt"></i> Places Near Your Group
            </h2>
          </div>
          <div class="modal-body">
            <div style="background: rgba(74, 144, 226, 0.1); padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem;">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--secondary-color);">📍 Group Center</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #666;">
                Based on the average location of all group members in Waterloo, Ontario
              </p>
            </div>

            <div style="display: grid; gap: 1rem;">
              ${recommendations.recommendations.map((place, index) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border: 1px solid #eee; border-radius: 8px; background: white;">
                  <div style="flex: 1;">
                    <div style="font-weight: bold; margin-bottom: 0.3rem; color: var(--primary-color);">${place.name}</div>
                    <div style="font-size: 0.8rem; color: #666; margin-bottom: 0.3rem;">${place.category} • ${place.location}</div>
                    <div style="font-size: 0.8rem; color: #888;">
                      <i class="fas fa-map-marker-alt"></i> ${place.distanceFromGroup.toFixed(1)} km from group center
                    </div>
                  </div>
                  <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <div style="text-align: center; margin-right: 1rem;">
                      <div style="font-size: 0.9rem; font-weight: bold; color: var(--secondary-color);">${place.adjustedScore.toFixed(1)}</div>
                      <div style="font-size: 0.7rem; color: #666;">Rating</div>
                    </div>
                    <button class="btn" style="font-size: 0.8rem; padding: 6px 12px;" 
                            onclick="fillActivityForm('${place.name}', '${place.category}', '${place.location}', '${place.description}')">
                      Rate This Place
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>

            <div style="text-align: center; margin-top: 2rem;">
              <button type="button" class="btn btn-secondary" onclick="closeGroupLocationModal()">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Add ESC and click-outside functionality
    addModalListeners("group-location-modal", closeGroupLocationModal);
  }



  //GroupsSystem object
  GroupsSystem.voteForActivity = async function (groupId, activityName) {
    console.log('Voting for activity:', activityName, 'in group:', groupId);
    const groups = DataLayer.load("groups", []);
    const group = groups.find((g) => g.id === groupId);
    if (!group) {
      console.error('Group not found:', groupId);
      return;
    }

    // Initialize votes if not exists
    if (!group.votes) group.votes = {};

    const currentUserId = DataLayer.load("currentUser").id;

    // Remove user's vote from all other activities first
    Object.entries(group.votes).forEach(([activity, votes]) => {
      if (activity !== activityName) { // Only remove from other activities, not the current one
        const voteIndex = votes.indexOf(currentUserId);
        if (voteIndex > -1) {
          votes.splice(voteIndex, 1);
        }
      }
    });

    // Initialize the current activity's votes array if it doesn't exist
    if (!group.votes[activityName]) group.votes[activityName] = [];

    // Toggle vote for the current activity (add if not voted, remove if already voted)
    const currentVoteIndex = group.votes[activityName].indexOf(currentUserId);
    if (currentVoteIndex > -1) {
      // Remove vote if already voted
      group.votes[activityName].splice(currentVoteIndex, 1);
    } else {
      // Add vote if not voted
      group.votes[activityName].push(currentUserId);
    }

    // Update groups data
    DataLayer.save("groups", groups);

    // Save to Firebase
    try {
      const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      await wrapWrite(
        updateDoc(doc(authManager.db, 'groups', groupId), {
          votes: group.votes,
          updatedAt: serverTimestamp()
        }),
        'updateDoc',
        `groups/${groupId}`,
        { votesUpdated: true }
      );
      console.log('Votes saved to Firebase');
    } catch (error) {
      console.error('Error saving votes to Firebase:', error);
    }

    // Update only the specific group's content instead of refreshing everything
    console.log('Updating group content for:', groupId);
    GroupsSystem.updateGroupContent(groupId);
  };

  GroupsSystem.updateGroupContent = async function (groupId) {
    const groups = DataLayer.load("groups", []);
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    // Get the current group content element
    const groupContent = document.getElementById(`group-content-${groupId}`);
    if (!groupContent) return;

    // Check if the group is currently expanded
    const isExpanded = groupContent.style.maxHeight !== "0px" && groupContent.style.maxHeight !== "";

    // Generate the new content for this specific group
    const recommendations = GroupsSystem.getGroupRecommendations(group);
    const recommendationsHtml = recommendations
      .slice(0, 3)
      .map((rec) => {
        const activityName = rec.experience.name;
        const votes = group.votes && group.votes[activityName] ? group.votes[activityName] : [];
        const hasVoted = votes.includes(DataLayer.load("currentUser").id);
        const maxVotes = Math.max(...Object.values(group.votes || {}).map(v => v.length));
        const mostVoted = Object.entries(group.votes || {}).find(([name, votes]) => votes.length === maxVotes)?.[0];
        const isMostVoted = mostVoted === activityName && maxVotes > 0;

        return `
          <div class="activity-card ${isMostVoted ? "most-voted" : ""}" style="
            border: 1px solid #eee; 
            border-radius: 12px; 
            padding: 1.5rem; 
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            transition: all 0.2s ease;
            ${isMostVoted ? 'border: 2px solid var(--secondary-color);' : ''}
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
            
            <div style="background: var(--secondary-gradient); color: white; padding: 0.8rem; margin: -1.5rem -1.5rem 1rem -1.5rem; border-radius: 12px 12px 0 0;">
              <div style="font-weight: bold; font-size: 1.1rem;">Combined Score: ${rec.groupScore.toFixed(1)}/10</div>
              <div style="font-size: 0.9rem; opacity: 0.9;">Confidence: ${(rec.confidence * 100).toFixed(0)}%</div>
            </div>
            
            <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 0.5rem;">${rec.experience.name}</div>
            <div style="color: #666; margin-bottom: 0.5rem;">
              ${rec.experience.category} • ${rec.experience.location}
              ${rec.distanceFromGroup ? ` • <i class="fas fa-map-marker-alt"></i> ${rec.distanceFromGroup.toFixed(1)}km away` : ''}
            </div>
            ${rec.experience.description
            ? `<p style="font-size: 0.9rem; color: #666; margin: 0.5rem 0; line-height: 1.4;">${rec.experience.description}</p>`
            : ""
          }

            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
              <strong style="font-size: 0.9rem;">Individual Predictions:</strong>
              ${rec.individualScores
            .map(
              (score) => `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; margin-top: 0.3rem;">
                                                  <span>${addCrownToPremiumUser(score.member.displayName, score.member.userId)}</span>
                  <span style="font-weight: bold; color: ${score.score >= 7
                  ? "#4CAF50"
                  : score.score >= 5
                    ? "#FF9800"
                    : "#f44336"
                }">${score.score.toFixed(1)}/10</span>
                </div>
              `
            )
            .join("")}
              <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                Group Compatibility: 
                <span style="font-weight: bold; color: ${rec.variance <= 1.5
            ? "#4CAF50"
            : rec.variance <= 3
              ? "#FF9800"
              : "#f44336"
          }">
                  ${rec.variance <= 1.5
            ? "High"
            : rec.variance <= 3
              ? "Medium"
              : "Low"
          }
                </span>
              </div>
              
              <!-- Voting section -->
              <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                <button class="vote-button ${hasVoted ? "voted" : ""}" 
                        onclick="GroupsSystem.voteForActivity(${group.id}, '${activityName.replace(/'/g, "\\'")}')" style="
                  background: ${hasVoted ? 'var(--success-color)' : 'var(--primary-color)'}; 
                  color: white; 
                  border: none; 
                  padding: 0.5rem 1rem; 
                  border-radius: 6px; 
                  cursor: pointer; 
                  font-size: 0.9rem;
                  transition: all 0.2s ease;
                ">
                  ${hasVoted ? "✓ Voted" : "Vote for this"}
                </button>
                <div class="vote-count" style="margin-top: 0.5rem; font-size: 0.85rem; color: #666;">
                  ${votes.length} vote${votes.length !== 1 ? "s" : ""}
                  ${votes.length > 0
            ? `(${votes
              .map((userId) => {
                const member = group.members.find(
                  (m) => m.userId === userId
                );
                return member ? addCrownToPremiumUser(member.displayName, member.userId) : "Unknown";
              })
              .join(", ")})`
            : ""
          }
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    // Find the recommendations container within this group
    const recommendationsContainer = groupContent.querySelector('.activity-grid');
    if (recommendationsContainer) {
      recommendationsContainer.innerHTML = recommendationsHtml;
    }

    // Update AI itinerary section if it exists
    const aiItinerarySection = groupContent.querySelector('.ai-itinerary-section');
    if (aiItinerarySection && group.aiItinerary) {
      aiItinerarySection.innerHTML = renderAIItinerary(group);
    }

    // Update group scheduling section if it exists
    const groupSchedulingSection = groupContent.querySelector('.group-scheduling-section');
    if (groupSchedulingSection) {
      // Render the scheduling section asynchronously
      renderGroupScheduling(group).then(schedulingHtml => {
        groupSchedulingSection.innerHTML = schedulingHtml;

        // After updating the scheduling section, recalculate the height if expanded
        if (isExpanded) {
          // Use requestAnimationFrame to ensure DOM updates are complete
          requestAnimationFrame(() => {
            groupContent.style.maxHeight = groupContent.scrollHeight + "px";
          });
        }
      }).catch(error => {
        console.error('Error rendering group scheduling:', error);
        groupSchedulingSection.innerHTML = '<p style="color: #666;">Unable to load scheduling information.</p>';

        // Even if there's an error, still recalculate height if expanded
        if (isExpanded) {
          requestAnimationFrame(() => {
            groupContent.style.maxHeight = groupContent.scrollHeight + "px";
          });
        }
      });
    } else {
      // If no scheduling section to update, still recalculate height if expanded
      if (isExpanded) {
        requestAnimationFrame(() => {
          groupContent.style.maxHeight = groupContent.scrollHeight + "px";
        });
      }
    }
  };

  GroupsSystem.toggleGroupExpansion = function (groupId) {
    const content = document.getElementById(`group-content-${groupId}`);
    const icon = document.getElementById(`expand-icon-${groupId}`);

    if (content.style.maxHeight === "0px" || content.style.maxHeight === "") {
      // Expand
      content.style.maxHeight = content.scrollHeight + "px";
      icon.style.transform = "rotate(180deg)";
    } else {
      // Collapse
      content.style.maxHeight = "0px";
      icon.style.transform = "rotate(0deg)";
    }
  };

  GroupsSystem.editGroup = async function (groupId) {
    const groups = DataLayer.load("groups", []);
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    const friends = await FriendsSystem.getFriends();
    const currentMembers = group.members.filter(
      (m) => m.userId !== DataLayer.load("currentUser").id
    );

    const modalHtml = `
  <div id="edit-group-modal" class="modal" onclick="handleEditModalBackdropClick(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="closeEditModal()">&times;</button>
      <div class="modal-header">
        <h2>Edit Group</h2>
      </div>
      <div class="modal-body">
        <form id="edit-group-form" onsubmit="handleEditGroup(event, ${groupId})">
          <div class="form-group">
            <label for="edit-group-name">Group Name *</label>
            <input type="text" id="edit-group-name" class="form-control" value="${group.name
      }" required>
          </div>
          <div class="form-group">
            <label for="edit-group-description">Description</label>
            <textarea id="edit-group-description" class="form-control">${group.description
      }</textarea>
          </div>
          <div class="form-group">
            <label>Current Members</label>
            <div style="margin-bottom: 1rem;">
              ${currentMembers
        .map(
          (member) => `
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid #eee; border-radius: 8px;">
                  <input type="checkbox" id="keep-member-${member.userId}" checked>
                  <div class="feed-avatar" style="width: 30px; height: 30px; font-size: 0.8rem;">${member.avatar}</div>
                  <span>${addCrownToPremiumUser(member.displayName, member.userId)} (${member.personalityType})</span>
                </div>
              `
        )
        .join("")}
            </div>
            <label>Add New Members</label>
            ${friends
        .filter(
          (friend) => !group.members.some((m) => m.userId === friend.id)
        )
        .map(
          (friend) => `
              <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid #eee; border-radius: 8px;">
                <input type="checkbox" id="add-member-${friend.id}">
                <div class="feed-avatar" style="width: 30px; height: 30px; font-size: 0.8rem;">${friend.avatar}</div>
                <span>${addCrownToPremiumUser(friend.displayName, friend.id)} (${friend.personalityType})</span>
              </div>
            `
        )
        .join("")}
          </div>
          <div style="text-align: center; margin-top: 2rem;">
            <button type="submit" class="btn">Save Changes</button>
            <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </div>
`;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
    // Prevent body scrolling when modal is open
    document.body.classList.add('modal-open');
  };

export default GroupsSystem;
