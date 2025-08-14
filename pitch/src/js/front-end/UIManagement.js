import { getCurrentUser } from '../back-end/firebase/firebase-config';
import DataLayer from '../back-end/Data/DataLayer';
import RecommendationSystem  from '../back-end/System/RecommendationSystem.js';

import SimilarUsersSystem from '../back-end/System/SimilarUsersSystem';
import ActivitySystem from '../back-end/System/ActivitySystem';
import { updateOnPageVisit } from '../back-end/Data/CacheSystem';
import {initializeLocationAutocomplete, autoFillCurrentLocation} from '../back-end/System/Location';
import GroupsSystem from '../back-end/System/GroupsSystem';
import CacheSystem from '../back-end/Data/CacheSystem';

export function showPage(pageId) {
  console.log('📱 showPage() called with pageId:', pageId);
  // Check authentication for protected pages
  const protectedPages = ['dashboard', 'assessment', 'activities', 'feed', 'groups', 'friends', 'profile'];
  if (protectedPages.includes(pageId) && !getCurrentUser()) {
    // Don't redirect if we're already on an auth page
    const currentPage = document.querySelector('.page:not(.hidden)');
    if (currentPage && ['login', 'register'].includes(currentPage.id)) {
      return;
    }
    showPage('login');
    return;
  }

  // Hide all pages
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.add("hidden");
  });

  // Update active navigation
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.classList.remove("active");
  });
  const navElement = document.getElementById(`nav-${pageId}`);
  if (navElement) {
    navElement.classList.add("active");
  }

  // Show selected page
  document.getElementById(pageId).classList.remove("hidden");

  // Update navigation visibility
  updateNavigationVisibility();

  // Page-specific initialization
  switch (pageId) {
    case "login":
      // Reset forms (check if they exist first)
      const loginForm = document.getElementById('login-form');
      const registerForm = document.getElementById('register-form');

      if (loginForm) loginForm.reset();
      if (registerForm) registerForm.reset();

      showLoginForm();
      break;
    case "dashboard":
      updateOnPageVisit('dashboard');
      break;
    case "assessment":
      PersonalityAssessment.init();
      break;
    case "activities":
      if (!DataLayer.exists("personalityScore")) {
        NotificationSystem.show(
          "Please complete the personality assessment first!",
          "warning"
        );
        showPage("assessment");
        return;
      }
      // Initialize location functionality immediately
      setTimeout(() => {
        initializeLocationAutocomplete();
        // Auto-get current location when page opens
        autoFillCurrentLocation();
      }, 500);
      break;
    case "feed":
      console.log('📱 Feed page selected, calling updateOnPageVisit');
      updateOnPageVisit('feed');
      break;
    case "groups":
      updateOnPageVisit('groups');
      // Also update usage display immediately
      setTimeout(() => {
        const usage = GroupsSystem.getGroupUsage();
        const usageText = document.getElementById("group-usage-text");
        const premiumStatusText = document.getElementById("premium-status-text");

        if (usageText) {
          usageText.textContent = `${usage.current}/${usage.limit}`;
          if (usage.isPremium) {
            usageText.style.background = "var(--primary-color)";
            usageText.style.color = "white";
          } else {
            usageText.style.background = "var(--primary-color)";
            usageText.style.color = "white";
          }
        }

        if (premiumStatusText) {
          if (usage.isPremium) {
            premiumStatusText.innerHTML = "Premium - Unlimited Groups";
          } else {
            premiumStatusText.innerHTML = '<a href="#" onclick="showPremiumUpgradeModal()" style="color: var(--secondary-color); text-decoration: none;">Upgrade to Premium for unlimited groups</a>';
          }
        }
      }, 50);
      break;

    case "friends":
      updateOnPageVisit('friends');
      // Initialize friends system only when tab is clicked (optimized loading)
      if (typeof FriendsDiscoverySystem !== 'undefined') {
        FriendsDiscoverySystem.init();
      }
      break;

    case "profile":
      updateOnPageVisit('profile');
      break;
  }
}

export function nextQuestion() {
  PersonalityAssessment.currentQuestion++;

  if (
    PersonalityAssessment.currentQuestion >=
    PersonalityAssessment.questions.length
  ) {
    PersonalityAssessment.showResults();
  } else {
    PersonalityAssessment.displayQuestion();
    document.getElementById("next-btn").disabled = true;
  }
}

// Manage navigation visibility based on authentication
export function updateNavigationVisibility() {
  const nav = document.querySelector('nav');
  if (nav) {
    if (getCurrentUser()) {
      nav.style.display = 'flex';
    } else {
      nav.style.display = 'none';
    }
  }
}

window.showLoginForm = function () {
  // Hide register form
  document.getElementById('register-form-container').style.display = 'none';

  // Show login form container
  document.getElementById('login-form-container').style.display = 'block';

  // Show login step 1, hide step 2 and forgot password
  document.getElementById('login-step-1').style.display = 'block';
  document.getElementById('login-step-2').style.display = 'none';
  document.getElementById('forgot-password-container').style.display = 'none';
}

export function updateDashboard() {
  const personalityData = DataLayer.load("personalityScore");
  const personalityType = DataLayer.load("personalityType");
  const currentUser = DataLayer.load("currentUser");


  // Check if user has completed personality assessment
  const hasCompletedAssessment = personalityData &&
    personalityType &&
    personalityData.adjustmentFactor !== undefined &&
    personalityType.type !== 'Not Set';

  console.log('hasCompletedAssessment:', hasCompletedAssessment);

  if (hasCompletedAssessment && DataLayer.exists("currentUser")) {
    document.getElementById("user-avatar").textContent =
      currentUser.avatar;
    document.getElementById(
      "welcome-message"
    ).innerHTML = `Welcome back, <strong>${currentUser.displayName}</strong>! You're a ${personalityType.type}`;
    
    const userExperiences = DataLayer.load("userExperiences", []);
    const groups = DataLayer.load("groups", []);

    // Set initial dashboard content without similar users
    document.getElementById("dashboard-content").innerHTML = `
  <div style="margin-bottom: 2rem;">
    <h2>Your Social Energy Profile</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${personalityData?.adjustmentFactor?.toFixed(2) || '0.00'}</div>
        <div class="stat-label">Adjustment Factor</div>
      </div>
      <div class="stat-card" onclick="showExperiencesModal()" style="cursor: pointer;">
        <div class="stat-value">${userExperiences.length}</div>
        <div class="stat-label">Experiences</div>
      </div>
      <div class="stat-card" onclick="showPage('groups')" style="cursor: pointer;">
        <div class="stat-value">${groups.length}</div>
        <div class="stat-label">Groups</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${personalityType.type}</div>
        <div class="stat-label">Personality Type</div>
      </div>
    </div>
    <p style="font-style: italic; color: #666; margin: 1.5rem 0; text-align: center;">"${personalityType?.description || 'You have a balanced approach to social energy.'}"</p>
    <div class="action-buttons">
      <button class="btn" onclick="showPage('activities')"><i class="fas fa-plus-circle"></i> Add Experience</button>
      <button class="btn btn-secondary" onclick="showPage('feed')"><i class="fas fa-users"></i> Explore Community</button>
      <button class="btn btn-info" onclick="getLocationBasedRecommendations()" style="background: var(--info-color);">
        <i class="fas fa-map-marker-alt"></i> Find Places Near Me
      </button>
    </div>
  </div>

          ${RecommendationSystem.displayRecommendations()}
  
  <div id="similar-users-container">
    <div style="text-align: center; padding: 2rem;">
      <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid var(--primary-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 1rem; color: #666;">Loading similar users...</p>
    </div>
  </div>
`;

    // Load similar users asynchronously
    SimilarUsersSystem.displaySimilarUsers()
      .then(similarUsersHtml => {
        const container = document.getElementById('similar-users-container');
        if (container) {
          container.innerHTML = similarUsersHtml;
        }
      })
      .catch(error => {
        console.error('Error loading similar users:', error);
        const container = document.getElementById('similar-users-container');
        if (container) {
          container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
              <p>Unable to load similar users at this time.</p>
            </div>
          `;
        }
      });
  } else {
    // User hasn't completed assessment yet
    document.getElementById("user-avatar").textContent = currentUser?.avatar || "?";
    document.getElementById("welcome-message").innerHTML =
      `Welcome, <strong>${currentUser?.displayName || 'User'}</strong>! Complete the personality assessment to get started.`;

    document.getElementById("dashboard-content").innerHTML = `
      <div style="margin-bottom: 2rem;">
        <h2>Get Started with Senergy</h2>
        <p style="padding: 1.2rem; text-align: center;">
          Take the personality assessment to discover your social energy preferences and get personalized recommendations.
        </p>
        <div class="action-buttons">
          <button class="btn" onclick="showPage('assessment')">
            <i class="fas fa-play-circle"></i> Start Assessment
          </button>
        </div>
      </div>
    `;
  }
}

export function updateProfile() {
  const personalityData = DataLayer.load("personalityScore");
  const personalityType = DataLayer.load("personalityType");
  const userExperiences = DataLayer.load("userExperiences", []);
  const groups = DataLayer.load("groups", []);
  const currentUser = DataLayer.load("currentUser");

  const profileContent = document.getElementById("profile-content");

  // Use the same condition as updateDashboard for consistency
  const hasCompletedAssessment = personalityData &&
    personalityType &&
    personalityData.adjustmentFactor !== undefined &&
    personalityType.type !== 'Not Set';

  if (!hasCompletedAssessment) {
    profileContent.innerHTML = `
  <div class="centered">
    <p style="padding: 1.2rem;">Complete the personality assessment to see your profile.</p>
    <button class="btn" onclick="showPage('assessment')">Take Assessment</button>
  </div>
`;
    return;
  }

  const avgRating =
    userExperiences.length > 0
      ? userExperiences.reduce(
        (sum, exp) => sum + parseFloat(exp.adjustedScore),
        0
      ) / userExperiences.length
      : 0;

  // Get recommendations for profile (only from real users)
  const recommendations = ActivitySystem.getRecommendations(
    personalityData.adjustmentFactor
  );
  const unratedRecommendations = recommendations.filter(
    (rec) =>
      !userExperiences.some(
        (userExp) =>
          userExp.name.toLowerCase() === rec.experience.name.toLowerCase()
      )
  );

  // Get similar users (only real users) - handle async
  let similarUsers = [];
  ActivitySystem.findSimilarUsers(personalityData.adjustmentFactor)
    .then(users => {
      similarUsers = users;
      // Update the profile content with similar users if needed
      const profileContent = document.getElementById('profile-content');
      if (profileContent) {
        // Re-render the similar users section
        const similarUsersSection = profileContent.querySelector('.similar-users-section');
        if (similarUsersSection) {
          similarUsersSection.innerHTML = `
            <h3>Most Compatible Users</h3>
            <div class="similar-users-grid">
              ${similarUsers.length > 0
              ? similarUsers.slice(0, 6).map(user => `
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
                    <div style="text-align: center;">
                      <button class="btn" style="font-size: 0.8rem; padding: 6px 12px;" onclick="FriendsSystem.addFriend('${user.id}')">Add Friend</button>
                    </div>
                  </div>
                `).join("")
              : '<div style="grid-column: 1 / -1; color: #666; text-align: center; padding: 2rem;">No similar users found. Try expanding your search or check back later!</div>'
            }
            </div>
          `;
        }
      }
    })
    .catch(error => {
      console.error('Error loading similar users for profile:', error);
    });

  profileContent.innerHTML = `
<div class="user-info" style="margin-bottom: 2rem;">
  <div class="avatar" style="width: 80px; height: 80px; font-size: 2rem;">${currentUser.avatar
    }</div>
  <div>
    <h2 style="margin: 0;">${personalityType.type}</h2>
    <div style="color: var(--secondary-color); font-weight: bold; margin: 0.5rem 0;">Adjustment Factor: ${personalityData.adjustmentFactor.toFixed(
      2
    )}</div>
    <div style="color: #666; font-style: italic;">"${personalityType?.description || 'You have a balanced approach to social energy.'}"</div>
  </div>
</div>

<div class="location-info" style="margin-bottom: 2rem; padding: 1rem; background: rgba(74, 144, 226, 0.1); border-radius: 10px;">
  <h4 style="margin: 0 0 0.5rem 0; color: var(--primary-color);">
    <i class="fas fa-map-marker-alt"></i> Your Location
  </h4>
  <div style="display: flex; align-items: center; gap: 1rem;">
    <div style="flex: 1;">
      <div style="font-size: 0.9rem; color: #666;">
        ${currentUser.location ?
      `Latitude: ${currentUser.location.lat.toFixed(4)}, Longitude: ${currentUser.location.lng.toFixed(4)}` :
      'Location not set'
    }
      </div>
      <div style="font-size: 0.8rem; color: #888; margin-top: 0.2rem;">
        This location is used for weather-based activity recommendations
      </div>
    </div>
    <button class="btn btn-secondary" onclick="handleUpdateUserLocation()" style="font-size: 0.8rem; padding: 8px 16px;">
      <i class="fas fa-location-arrow"></i> Update Location
    </button>
  </div>
</div>

<div class="stats-grid" style="margin-bottom: 2rem;">
  <div class="stat-card" onclick="showExperiencesModal()" style="cursor: pointer;">
    <div class="stat-value">${userExperiences.length}</div>
    <div class="stat-label">Experiences</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${avgRating > 0 ? avgRating.toFixed(1) : "0.0"
    }</div>
    <div class="stat-label">Avg Rating</div>
  </div>
  <div class="stat-card" onclick="showPage('groups')" style="cursor: pointer;">
    <div class="stat-value">${groups.length}</div>
    <div class="stat-label">Groups</div>
  </div>
  <div class="stat-card" onclick="getLocationBasedRecommendations()" style="cursor: pointer;">
    <div class="stat-value">${unratedRecommendations.length}</div>
    <div class="stat-label">New Recommendations</div>
  </div>
</div>

${userExperiences.length > 0
      ? `
<div class="card" style="margin-bottom: 2rem;">
  <h3>Your Experiences</h3>
  <div style="max-height: 400px; overflow-y: auto;">
    ${userExperiences
        .map(
          (exp) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border: 1px solid #eee; border-radius: 10px; margin-bottom: 0.5rem;">
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 0.2rem;">${exp.name
            }</div>
            <div style="color: var(--secondary-color); font-size: 0.9rem; margin-bottom: 0.2rem;">${exp.category
            } • ${exp.location}</div>
            ${exp.description
              ? `<div style="color: #666; font-size: 0.8rem; margin-bottom: 0.2rem;">"${exp.description}"</div>`
              : ""
            }
            <div style="color: #888; font-size: 0.8rem;">
              <span title="${formatFullDate(exp.timestamp)}" style="cursor: help;">
                ${new Date(exp.timestamp).toLocaleDateString()}
              </span> •
              Social: ${exp.socialIntensity.toFixed(1)}/10 •
              Noise: ${exp.noiseLevel.toFixed(1)}/10 •
              Crowd: ${exp.crowdSize.toFixed(1)}/10
            </div>
          </div>
          <div style="text-align: right; margin-left: 1rem;">
            <div style="font-weight: bold; font-size: 1.3rem; color: var(--secondary-color);">${exp.rawScore.toFixed(1)
            }/10</div>

          </div>
        </div>
    `
        )
        .join("")}
  </div>
</div>`
      : `
<div class="card" style="margin-bottom: 2rem;">
  <h3>Your Experiences</h3>
  <div class="empty-state">
    <p>You haven't added any experiences yet.</p>
    <button class="btn" onclick="showPage('activities')">Add Your First Experience</button>
  </div>
</div>`
    }

<div class="card" style="margin-bottom: 2rem;">
  <h3>Personality Breakdown</h3>
  <div style="margin-bottom: 1rem;">
    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
      <span>Introversion</span>
      <span>Ambiversion</span>
      <span>Extroversion</span>
    </div>
    <div style="width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; position: relative;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 2px; height: 100%; background: #ccc;"></div>
      <div style="width: ${((personalityData.adjustmentFactor + 1) / 2) * 100
    }%; height: 100%; background: var(--primary-gradient); border-radius: 10px; position: relative;">
        <div style="position: absolute; right: -10px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; background: white; border: 3px solid var(--secondary-color); border-radius: 50%;"></div>
      </div>
    </div>
    <div style="text-align: center; margin-top: 0.5rem; font-weight: bold; color: var(--secondary-color);">
      ${personalityData.adjustmentFactor.toFixed(2)}
    </div>
  </div>
</div>

        <div class="card similar-users-section" style="margin-bottom: 2rem;">
      <h3>Most Compatible Users</h3>
      <div class="similar-users-grid">
        <p style="color: #666; text-align: center; padding: 2rem;">Loading similar users...</p>
      </div>
    </div>

<div class="action-buttons">
  <button class="btn" onclick="showPage('activities')"><i class="fas fa-plus-circle"></i> Add Experience</button>
  <button class="btn btn-secondary" onclick="showPage('dashboard')"><i class="fas fa-tachometer-alt"></i> Dashboard</button>
  <button class="btn btn-secondary" onclick="showPage('groups')"><i class="fas fa-users"></i> Groups</button>
  <button class="btn btn-info" onclick="showEditProfileModal()"><i class="fas fa-edit"></i> Edit Profile</button>
</div>
`;
}


