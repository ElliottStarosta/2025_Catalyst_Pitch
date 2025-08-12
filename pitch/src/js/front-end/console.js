
function toggleAIPremium() {
    AI_PREMIUM_ENABLED = !import.meta.env.AI_PREMIUM_ENABLED;
    console.log(`🎭 AI Premium features ${AI_PREMIUM_ENABLED ? 'ENABLED' : 'DISABLED'}`);

    // Update current user premium status
    const currentUser = DataLayer.load("currentUser");
    if (currentUser) {
      currentUser.isPremium = AI_PREMIUM_ENABLED;
      DataLayer.save("currentUser", currentUser);
    }

    // Refresh the current page to reflect changes
    const currentPage = document.querySelector(".page:not(.hidden)").id;
    if (currentPage) {
      showPage(currentPage);
    }

    return AI_PREMIUM_ENABLED;
  };

  // Console command to set AI Premium features to specific value
  function setAIPremium(enabled) {
    if (typeof enabled !== 'boolean') {
      console.error('❌ Please provide a boolean value (true or false)');
      return false;
    }

    AI_PREMIUM_ENABLED = enabled;
    console.log(`🎭 AI Premium features ${AI_PREMIUM_ENABLED ? 'ENABLED' : 'DISABLED'}`);

    // Update current user premium status
    const currentUser = DataLayer.load("currentUser");
    if (currentUser) {
      currentUser.isPremium = AI_PREMIUM_ENABLED;
      DataLayer.save("currentUser", currentUser);
    }

    // Refresh the current page to reflect changes
    const currentPage = document.querySelector(".page:not(.hidden)").id;
    if (currentPage) {
      showPage(currentPage);
    }

    return AI_PREMIUM_ENABLED;
  };

  // Console command to test Firebase email functionality
  async function testFirebaseEmail(email = 'test@example.com') {
    try {
      console.log('🧪 Testing Firebase email functionality...');

      if (!authManager) {
        console.log('❌ Firebase not initialized');
        return false;
      }

      console.log('✅ Firebase initialized');
      console.log('📧 Testing password reset email...');

      const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

      const actionCodeSettings = {
        url: window.location.origin + '/pitch/index.html',
        handleCodeInApp: false
      };

      await sendPasswordResetEmail(authManager.auth, email, actionCodeSettings);
      console.log('✅ Password reset email sent successfully!');
      console.log('📬 Check your email inbox and spam folder');

      return true;
    } catch (error) {
      console.error('❌ Email test failed:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      return false;
    }
  };

  // Console command to check current AI Premium status
  function getAIPremiumStatus() {
    console.log(`🎭 AI Premium features are currently ${AI_PREMIUM_ENABLED ? 'ENABLED' : 'DISABLED'}`);
    return AI_PREMIUM_ENABLED;
  };


export {toggleAIPremium,setAIPremium,testFirebaseEmail,getAIPremiumStatus};