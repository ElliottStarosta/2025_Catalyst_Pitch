# Senergy - Social Energy Platform

A modern web application for discovering and sharing social experiences based on personality types and energy preferences.

## Features

- **User Authentication**: Secure login/registration with Firebase Auth
  - Email/password authentication
  - Google sign-in integration
  - Automatic session management
  - Secure logout functionality
- **Personality Assessment**: 10-question assessment to determine social energy type
- **Experience Sharing**: Rate and share social experiences with detailed metrics
- **Friend System**: Add friends and see their experiences
- **Community Feed**: Browse experiences from the community
- **Group Planning**: Create groups and plan activities together
- **AI-Powered Recommendations**: Get personalized activity suggestions
- **Location-Based Features**: Find places near you and your friends
- **Premium Features**: AI trip planner and advanced analytics

## Setup Instructions

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Click on the gear icon (Project Settings)
4. Scroll down to "Your apps" section
5. Click "Add app" and choose Web
6. Register your app and copy the configuration values

### 2. Configure Firebase

1. Open `firebase-config.js`
2. Replace the placeholder values with your actual Firebase configuration:

```javascript
export const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-actual-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-actual-sender-id",
  appId: "your-actual-app-id"
};
```

### 3. Enable Firebase Services

#### Authentication
1. In Firebase Console, go to Authentication > Sign-in method
2. Enable Email/Password authentication
3. Optionally enable other providers (Google, Facebook, etc.)

#### Firestore Database
1. In Firebase Console, go to Firestore Database
2. Click "Create database"
3. Choose "Start in test mode" for development
4. Select a location for your database

### 4. Security Rules (Optional)

For production, update your Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can read other users' profiles
    match /users/{userId} {
      allow read: if request.auth != null;
    }
    
    // Experiences can be read by all authenticated users
    match /experiences/{experienceId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    
    // Friend requests and friendships
    match /friendRequests/{requestId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == resource.data.fromUserId || request.auth.uid == resource.data.toUserId);
    }
    
    match /friends/{friendshipId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == resource.data.user1Id || request.auth.uid == resource.data.user2Id);
    }
  }
}
```

### 5. Test Your Setup

1. Open `test-firebase.html` in a web browser to verify your Firebase configuration
2. Run through all the tests to ensure everything is working correctly
3. If any tests fail, check the setup instructions and try again

### 6. Run the Application

1. Open `index.html` in a web browser
2. Or serve it using a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```

## Database Structure

### Collections

#### users
- `id`: User ID (Firebase Auth UID)
- `username`: Unique username
- `displayName`: Full name
- `email`: Email address
- `bio`: User bio
- `avatar`: Avatar initials
- `adjustmentFactor`: Personality adjustment factor (-1 to 1)
- `personalityType`: Personality type (Introvert, Extrovert, etc.)
- `isPremium`: Premium status
- `location`: User location (lat, lng)
- `isOnline`: Online status
- `lastSeen`: Last seen timestamp
- `createdAt`: Account creation timestamp
- `updatedAt`: Last update timestamp

#### experiences
- `id`: Experience ID
- `userId`: User who created the experience
- `name`: Place/activity name
- `category`: Activity category
- `location`: Location name
- `description`: Experience description
- `responses`: Rating responses (energy, social, comfort, etc.)
- `rawScore`: Raw rating score
- `adjustedScore`: Personality-adjusted score
- `socialIntensity`: Estimated social intensity
- `noiseLevel`: Estimated noise level
- `crowdSize`: Estimated crowd size
- `coordinates`: GPS coordinates
- `timestamp`: When the experience was created
- `createdAt`: Firestore timestamp
- `updatedAt`: Firestore timestamp

#### friendRequests
- `id`: Request ID
- `fromUserId`: Sender's user ID
- `toUserId`: Recipient's user ID
- `status`: Request status (pending, accepted, rejected)
- `createdAt`: Request creation timestamp

#### friends
- `id`: Friendship ID
- `user1Id`: First user's ID
- `user2Id`: Second user's ID
- `createdAt`: Friendship creation timestamp

## Features Overview

### Authentication
- Email/password registration and login
- Secure user sessions
- Automatic profile loading

### Personality Assessment
- 10-question assessment
- Calculates adjustment factor (-1 to 1)
- Determines personality type
- Saves results to Firebase

### Experience Sharing
- Rate places on multiple dimensions
- Personality-adjusted scoring
- Location tracking
- Social metrics estimation

### Friend System
- Send friend requests
- Accept/reject requests
- View friends' experiences
- Friend-based recommendations

### Community Features
- Browse all experiences
- Filter by category, location, rating
- Search functionality
- Similar user recommendations

### Group Planning
- Create groups with friends
- Group activity recommendations
- Voting system for activities
- AI-powered trip planning (Premium)

### Location Features
- GPS location detection
- Nearby places recommendations
- Distance calculations
- Location-based filtering

## Development

### Adding New Features

1. **Frontend**: Add HTML/CSS/JavaScript in `index.html`
2. **Backend**: Use Firebase services (Auth, Firestore, etc.)
3. **Data**: Follow the established database structure

### Testing

1. Create test accounts with different personality types
2. Add sample experiences
3. Test friend system functionality
4. Verify location features work

### Deployment

1. Set up Firebase hosting
2. Configure production security rules
3. Update Firebase config for production
4. Test all features in production environment

## Troubleshooting

### Common Issues

1. **Firebase not initialized**: Check your config values
2. **Authentication errors**: Verify Email/Password is enabled
3. **Database errors**: Check Firestore security rules
4. **Location not working**: Ensure HTTPS or localhost

### Debug Mode

Open browser console and check for:
- Firebase initialization messages
- Authentication state changes
- Database operation logs
- Error messages

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify Firebase configuration
3. Test with different browsers
4. Check network connectivity

## License

This project is for educational and demonstration purposes. 