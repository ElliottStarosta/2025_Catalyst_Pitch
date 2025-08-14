import {
  toggleAIPremium,
  setAIPremium,
  testFirebaseEmail,
  getAIPremiumStatus,
} from "./front-end/Console.js";
import {
  showPage
} from "./front-end/UIManagement.js";
import { initializeFirebaseAuth } from "./back-end/firebase/initFirebase.js";
const firebaseModule = await import("./back-end/firebase/firebase-config.js");
import CommunitySystem from "./back-end/System/CommunitySystem.js";
import { useCurrentLocation } from "./back-end/System/Location.js";
import ActivitySystem, {updateSliderValue} from "./back-end/System/ActivitySystem.js";

import { getLocationBasedRecommendations } from "./back-end/System/RecommendationSystem.js";
import FriendsSystem from "./back-end/System/Friends/FriendsSystem.js";

// Global
window.toggleAIPremium = toggleAIPremium;
window.setAIPremium = setAIPremium;
window.testFirebaseEmail = testFirebaseEmail;
window.getAIPremiumStatus = getAIPremiumStatus;
window.AI_PREMIUM_ENABLED = import.meta.env.VITE_AI_PREMIUM_ENABLED;
console.log("Is AI? ", AI_PREMIUM_ENABLED);
window.showPage = showPage;
window.CommunitySystem = CommunitySystem;
window.useCurrentLocation = useCurrentLocation;
window.ActivitySystem = ActivitySystem;
window.updateSliderValue = updateSliderValue;
window.getLocationBasedRecommendations = getLocationBasedRecommendations;
window.FriendsSystem = FriendsSystem;


// Start up
initializeFirebaseAuth().then(() => {
  if (!firebaseModule.getCurrentUser()) {
    showPage("login");
  }
});

// Add keyboard event listeners for  login flow
document.addEventListener("DOMContentLoaded", function () {
  // Email input Enter key
  const emailInput = document.getElementById("login-email");
  if (emailInput) {
    emailInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        handleEmailContinue();
      }
    });
  }

  // Password input Enter key
  const passwordInput = document.getElementById("login-password");
  if (passwordInput) {
    passwordInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        handlePasswordContinue();
      }
    });
  }
});

// Keyboard shortcuts for power users
document.addEventListener("keydown", (event) => {
  // Escape to close modals
  if (event.key === "Escape") {
    // Check for experiences modals first
    const experiencesModal = document.getElementById("experiences-modal");
    const editExperienceModal = document.getElementById(
      "edit-experience-modal"
    );

    if (editExperienceModal) {
      closeEditExperienceModal();
    } else if (experiencesModal) {
      closeExperiencesModal();
    } else {
      // Check for AI modals and close them using their specific functions
      const aiPremiumModal = document.getElementById("ai-premium-modal");
      const aiAssistantModal = document.getElementById("ai-assistant-modal");
      const aiEditModal = document.getElementById("ai-edit-modal");

      if (aiPremiumModal) {
        closeAIPremiumModal();
      } else if (aiAssistantModal) {
        closeAIAssistantModal();
      } else if (aiEditModal) {
        // If there's a closeAIEditModal function, call it
        if (typeof closeAIEditModal === "function") {
          closeAIEditModal();
        } else {
          aiEditModal.remove();
        }
      }

      // Also try the generic closeModal function as fallback
      if (typeof closeModal === "function") {
        closeModal();
      }
    }
  }

  // Enter key to click appropriate buttons based on current page
  if (event.key === "Enter") {
    // Check which page is currently visible
    const allPages = document.querySelectorAll(".page");
    let currentPage = null;

    allPages.forEach((page) => {
      if (!page.classList.contains("hidden")) {
        currentPage = page.id;
      }
    });

    // Handle different pages
    if (currentPage === "dashboard") {
      // Look for "Start Assessment" button on dashboard
      const startAssessmentBtn = document.querySelector(
        "button[onclick=\"showPage('assessment')\"]"
      );
      if (startAssessmentBtn && startAssessmentBtn.offsetParent !== null) {
        startAssessmentBtn.click();
      }
    } else if (currentPage === "profile") {
      // Look for "Take Assessment" button on profile
      const takeAssessmentBtn = document.querySelector(
        "button[onclick=\"showPage('assessment')\"]"
      );
      console.log("Profile page - Found assessment button:", takeAssessmentBtn);
      console.log(
        "Button visible:",
        takeAssessmentBtn && takeAssessmentBtn.offsetParent !== null
      );

      if (takeAssessmentBtn && takeAssessmentBtn.offsetParent !== null) {
        takeAssessmentBtn.click();
      } else {
        // Fallback: look for any button with "Take Assessment" text
        const allButtons = document.querySelectorAll("button");
        const assessmentBtn = Array.from(allButtons).find(
          (btn) =>
            btn.textContent.includes("Take Assessment") &&
            btn.offsetParent !== null
        );
        console.log("Fallback - Found assessment button:", assessmentBtn);
        if (assessmentBtn) {
          assessmentBtn.click();
        }
      }
    } else if (currentPage === "results") {
      // Look for "Continue to Dashboard" button on results page
      const continueBtn = document.querySelector(
        'button[onclick="completeAssessment()"]'
      );
      if (continueBtn && continueBtn.offsetParent !== null) {
        continueBtn.click();
      }
    }
  }
});
