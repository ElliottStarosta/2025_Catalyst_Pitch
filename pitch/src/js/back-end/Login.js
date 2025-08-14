//  // Handle user login
//     async function handleLogin(event) {
//       event.preventDefault();

//       const email = document.getElementById('login-email').value.trim();
//       const password = document.getElementById('login-password').value;

//       if (!email) {
//         NotificationSystem.show('Please enter your email address.', 'warning');
//         return;
//       }

//       if (!isValidEmail(email)) {
//         NotificationSystem.show('Please enter a valid email address.', 'warning');
//         return;
//       }

//       if (!password) {
//         NotificationSystem.show('Please enter your password.', 'warning');
//         return;
//       }

//       try {
//         // Wait for Firebase to be initialized
//         if (!getAuthManager()) {
//           const initialized = await initializeFirebaseAuth();
//           if (!initialized) {
//             return;
//           }
//         }

//         const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
//         await signInWithEmailAndPassword(getAuthManager().auth, email, password);
//         NotificationSystem.show('Successfully signed in!', 'success');
//       } catch (error) {
//         console.error('Login error:', error);
//         let message = 'Login failed. ';
//         switch (error.code) {
//           case 'auth/user-not-found':
//             message += 'No account found with this email.';
//             break;
//           case 'auth/wrong-password':
//             message += 'Incorrect password.';
//             break;
//           case 'auth/invalid-email':
//             message += 'Invalid email address.';
//             break;
//           case 'auth/too-many-requests':
//             message += 'Too many failed attempts. Please try again later.';
//             break;
//           case 'auth/user-disabled':
//             message += 'This account has been disabled.';
//             break;
//           default:
//             message += error.message;
//         }
//         NotificationSystem.show(message, 'error');
//       }
//     }
