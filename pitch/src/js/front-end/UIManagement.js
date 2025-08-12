import {getCurrentUser} from '../back-end/firebase-config';
function showPage(pageId) {
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

  function nextQuestion() {
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
  function updateNavigationVisibility() {
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

export {showPage,nextQuestion,updateNavigationVisibility};

