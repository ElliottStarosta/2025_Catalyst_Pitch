import {toggleAIPremium,setAIPremium,testFirebaseEmail,getAIPremiumStatus} from './front-end/console.js'
import  {showPage,nextQuestion,updateNavigationVisibility} from './front-end/UIManagement.js';
import { initializeFirebaseAuth } from './back-end/firebase/initFirebase.js';
const firebaseModule = await import('./back-end/firebase-config.js');


// Global
window.toggleAIPremium = toggleAIPremium;
window.setAIPremium = setAIPremium;
window.testFirebaseEmail = testFirebaseEmail;
window.getAIPremiumStatus  = getAIPremiumStatus;
window.AI_PREMIUM_ENABLED = import.meta.env.AI_PREMIUM_ENABLED;

// Start up
initializeFirebaseAuth().then(() => {
  if (!firebaseModule.getCurrentUser()) {
    showPage('login');
  }
});

// Add keyboard event listeners for  login flow
document.addEventListener('DOMContentLoaded', function () {
    // Email input Enter key
    const emailInput = document.getElementById('login-email');
    if (emailInput) {
      emailInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          handleEmailContinue();
        }
      });
    }

    // Password input Enter key
    const passwordInput = document.getElementById('login-password');
    if (passwordInput) {
      passwordInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          handlePasswordContinue();
        }
      });
    }
  });
