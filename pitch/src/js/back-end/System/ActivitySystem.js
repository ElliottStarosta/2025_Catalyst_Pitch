import DataLayer from "../Data/DataLayer.js";
import { getCurrentUser } from "../firebase/firebase-config.js";
import { getAuthManager } from "../firebase/initFirebase.js";
import CacheSystem from "../Data/CacheSystem.js";
import FriendsDiscoverySystem from "./Friends/FriendsDiscoverySystem.js";
import NotificationSystem from "./NotificationSystem.js";
import { wrapWrite } from "../Logging.js";
import { getUserLocationWithFallback } from "./Location.js";
import { showPage } from "../../front-end/UIManagement.js";

const ActivitySystem = {
  // Predefined activity categories
  categories: [
    {
      id: "restaurant",
      name: "Restaurant/Café",
      description: "Dining establishments, cafes, food courts",
    },
    {
      id: "nightlife",
      name: "Nightlife",
      description: "Bars, clubs, lounges",
    },
    {
      id: "outdoor",
      name: "Park/Outdoor",
      description: "Parks, gardens, hiking trails",
    },
    {
      id: "entertainment",
      name: "Entertainment",
      description: "Movies, theaters, concerts",
    },
    {
      id: "shopping",
      name: "Shopping",
      description: "Malls, markets, retail stores",
    },
    {
      id: "sports",
      name: "Sports/Recreation",
      description: "Gyms, sports venues, recreational facilities",
    },
    {
      id: "cultural",
      name: "Cultural",
      description: "Museums, galleries, historical sites",
    },
    {
      id: "social",
      name: "Social Venue",
      description: "Community centers, meet-up spaces",
    },
    {
      id: "wellness",
      name: "Wellness/Relaxation",
      description: "Spas, yoga studios, meditation centers",
    },
  ],

  // Rating questions for activity experiences
  ratingQuestions: [
    { id: "energy", text: "How energized did you feel?", weight: 0.4 },
    {
      id: "social",
      text: "How satisfied were you with the social interaction?",
      weight: 0.25,
    },
    {
      id: "comfort",
      text: "How comfortable did you feel in this environment?",
      weight: 0.2,
    },
    {
      id: "overwhelm",
      text: "How overwhelming was the environment?",
      weight: 0.1,
      reverse: true,
    },
    { id: "return", text: "How likely are you to return?", weight: 0.05 },
  ],

  submitNewExperience: async (event) => {
    event.preventDefault();

    const personalityData = DataLayer.load("personalityScore");
    if (!personalityData) {
      NotificationSystem.show(
        "Please complete the personality assessment first!",
        "warning"
      );
      showPage("assessment");
      return;
    }

    // Get form data
    const name = document.getElementById("activity-name").value.trim();
    const category = document.getElementById("activity-category").value;
    const location = document.getElementById("activity-location").value.trim();
    const description = document
      .getElementById("activity-description")
      .value.trim();

    if (!name || !category || !location) {
      NotificationSystem.show(
        "Please fill in all required fields including location.",
        "warning"
      );
      return;
    }

    // Get ratings
    const responses = {};
    let rawScore = 0;

    ActivitySystem.ratingQuestions.forEach((question) => {
      let value = parseInt(
        document.getElementById(`rating-${question.id}`).value
      );

      if (question.reverse) {
        value = 11 - value; // Reverse score for overwhelming
      }

      responses[question.id] = value;
      rawScore += value * question.weight;
    });


    // Estimate social characteristics based on category and user ratings
    const socialIntensity = ActivitySystem.estimateSocialIntensity(
      category,
      responses
    );
    const noiseLevel = ActivitySystem.estimateNoiseLevel(category, responses);
    const crowdSize = ActivitySystem.estimateCrowdSize(category, responses);

    // Try to get coordinates first, then save the experience
    const saveExperience = (coordinates = null) => {
      const experience = {
        id: Date.now(),
        userId: "user-main",
        name,
        category,
        location: location || "Not specified",
        description: description || "",
        responses,
        rawScore: parseFloat(rawScore.toFixed(1)),
        timestamp: new Date().toISOString(),
        socialIntensity,
        noiseLevel,
        crowdSize,
        coordinates,
      };

      // Save experience locally
      DataLayer.push("userExperiences", experience);
      CacheSystem.set('EXPERIENCES', DataLayer.load("userExperiences"));
      console.log("Experience saved locally:", DataLayer.load("userExperiences"));
        // Invalidate experience cache, reload, and update dashboard
        CacheSystem.invalidateExperienceCache();
        if (typeof loadUserExperiencesWithCache === 'function') {
          loadUserExperiencesWithCache().then(() => {
            if (typeof updateDashboard === 'function') updateDashboard();
          });
        } else {
          if (typeof updateDashboard === 'function') updateDashboard();
        }

      // Save to Firebase if user is authenticated
      if (getCurrentUser() && getAuthManager()) {
        const saveToFirebase = async () => {
          try {
            const { collection, addDoc, serverTimestamp } = await import(
              "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
            );

            const experienceData = {
              ...experience,
              userId: getCurrentUser().uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };

            await wrapWrite(
              addDoc(
                collection(getAuthManager().db, "experiences"),
                experienceData
              ),
              "addDoc",
              "experiences",
              { name: experienceData.name, hasCoordinates: !!coordinates }
            );
            console.log(
              "Experience saved to Firebase with coordinates:",
              !!coordinates
            );
          } catch (error) {
            console.error("Error saving experience to Firebase:", error);
          }
        };
        saveToFirebase();
      }

      // Show success message
      NotificationSystem.show("Experience added successfully!", "success");

      // Reset form
      resetActivityForm();
      
      showPage("dashboard");
    };

    // Try to get coordinates for the location
    const getCoordinatesAndSave = async () => {
      let coordinates = null;

      // First, check if user used the "Use Current Location" button (locationFound flag)
      if (typeof locationFound !== "undefined" && locationFound) {
        try {
          const position = await getUserLocationWithFallback();
          coordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          console.log("Got coordinates from current location:", coordinates);
        } catch (error) {
          console.log(
            "Could not get current location coordinates:",
            error.message
          );
        }
      }

      // If no coordinates from current location, try geocoding the entered location
      if (!coordinates && location && location.trim() !== "") {
        try {
          // Try to geocode the entered location using Google Maps API
          if (
            typeof google !== "undefined" &&
            google.maps &&
            google.maps.Geocoder
          ) {
            const geocoder = new google.maps.Geocoder();
            const result = await new Promise((resolve, reject) => {
              geocoder.geocode({ address: location }, (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results[0]) {
                  resolve(results[0]);
                } else {
                  reject(new Error("Geocoding failed: " + status));
                }
              });
            });

            coordinates = {
              lat: result.geometry.location.lat(),
              lng: result.geometry.location.lng(),
            };
            console.log("Got coordinates from geocoding:", coordinates);
          }
        } catch (error) {
          console.log("Could not geocode location:", error.message);
        }
      }

      // Fallback: if still no coordinates, try current location one more time
      if (!coordinates && navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 300000,
            });
          });

          coordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          console.log("Got fallback coordinates:", coordinates);
        } catch (error) {
          console.log("Fallback geolocation failed:", error.message);
        }
      }

      saveExperience(coordinates);
    };

    getCoordinatesAndSave();

    // Success message, form reset, and page navigation are now handled in saveExperience()
  },

  estimateSocialIntensity: (category, responses) => {
    const baseValues = {
      Nightclub: 9.5,
      "Bar/Pub": 7.0,
      Restaurant: 5.5,
      "Event/Party": 8.5,
      "Sports/Fitness": 6.0,
      Cafe: 3.5,
      Shopping: 5.0,
      Entertainment: 7.5,
      "Museum/Gallery": 2.0,
      "Library/Study": 1.0,
      "Park/Outdoor": 2.5,
      Other: 5.0,
    };

    const base = baseValues[category] || 5.0;
    const socialFactor = (responses.social - 5) * 0.5;
    return Math.max(1, Math.min(10, base + socialFactor));
  },

  estimateNoiseLevel: (category, responses) => {
    const baseValues = {
      Nightclub: 9.0,
      "Bar/Pub": 7.5,
      Restaurant: 4.0,
      "Event/Party": 8.0,
      "Sports/Fitness": 6.5,
      Cafe: 2.5,
      Shopping: 6.0,
      Entertainment: 8.5,
      "Museum/Gallery": 1.5,
      "Library/Study": 1.0,
      "Park/Outdoor": 2.0,
      Other: 5.0,
    };

    const base = baseValues[category] || 5.0;
    const overwhelmFactor = (responses.overwhelm - 5) * 0.3;
    return Math.max(1, Math.min(10, base + overwhelmFactor));
  },

  estimateCrowdSize: (category, responses) => {
    const baseValues = {
      Nightclub: 9.0,
      "Bar/Pub": 7.0,
      Restaurant: 6.0,
      "Event/Party": 8.5,
      "Sports/Fitness": 6.5,
      Cafe: 4.0,
      Shopping: 7.5,
      Entertainment: 8.0,
      "Museum/Gallery": 3.0,
      "Library/Study": 2.0,
      "Park/Outdoor": 4.5,
      Other: 5.0,
    };

    const base = baseValues[category] || 5.0;
    const overwhelmFactor = (responses.overwhelm - 5) * 0.2;
    const comfortFactor = (5 - responses.comfort) * 0.1; // Lower comfort might mean more crowded
    return Math.max(1, Math.min(10, base + overwhelmFactor + comfortFactor));
  },

  // Prediction Algorithm - Exact implementation from plan
  predictRating: (
    userAdjustmentFactor,
    experience,
    ratingUserAdjustmentFactor,
    ratingScore
  ) => {
    const basePrediction = parseFloat(ratingScore);
    const personalityDifference = Math.abs(
      ratingUserAdjustmentFactor - userAdjustmentFactor
    );
    const confidenceFactor = Math.max(0.1, 1 - personalityDifference / 2);

    let prediction;
    if (ratingUserAdjustmentFactor < userAdjustmentFactor) {
      // Rating user is more introverted than current user
      prediction =
        basePrediction +
        personalityDifference * experience.socialIntensity * 0.2;
    } else {
      // Rating user is more extroverted than current user
      prediction =
        basePrediction -
        personalityDifference * experience.socialIntensity * 0.2;
    }

    const finalPrediction = Math.max(1, Math.min(10, prediction));
    return {
      prediction: finalPrediction,
      confidence: confidenceFactor,
    };
  },

  // Get all experiences for community feed (fallback to user's own)
  getAllExperiences: () => {
    const all = DataLayer.load("allExperiences", null);
    if (Array.isArray(all)) return all;
    const userExperiences = DataLayer.load("userExperiences", []);
    return userExperiences;
  },

  // Activity Recommendation Engine
  getRecommendations: (userAdjustmentFactor) => {
    const allExperiences = ActivitySystem.getAllExperiences();
    console.log("ALL EXPERIENCES", allExperiences);
    const userExperiences = DataLayer.load("userExperiences", []);
    const userExperienceNames = userExperiences.map((exp) =>
      exp.name.toLowerCase()
    );
    const friendIds = []; // Fallback to empty array for now

    // Only include experiences from friends
    const friendExperiences = allExperiences.filter((exp) =>
      friendIds.includes(exp.userId)
    );

    const recommendations = [];

    // Group experiences by name to avoid duplicates
    const experienceGroups = {};
    friendExperiences.forEach((exp) => {
      const key = exp.name.toLowerCase();
      if (!experienceGroups[key]) {
        experienceGroups[key] = [];
      }
      experienceGroups[key].push(exp);
    });

    Object.entries(experienceGroups).forEach(([name, experiences]) => {
      // Skip if user has already been to this place
      if (userExperienceNames.includes(name)) return;

      const predictions = [];
      let totalScore = 0;
      let ratingCount = 0;

      experiences.forEach((exp) => {
        // Skip demo user lookups - no longer using demo data
        const ratingUser = null; // Only use Firebase user data going forward
        if (false) {
          // Disabled demo prediction logic
          const prediction = ActivitySystem.predictRating(
            userAdjustmentFactor,
            exp,
            ratingUser.adjustmentFactor,
            exp.rawScore
          );

          predictions.push({
            user: ratingUser,
            experience: exp,
            prediction: prediction,
          });

          totalScore += prediction.prediction * prediction.confidence;
          ratingCount++;
        }
      });

      if (ratingCount > 0) {
        const averageScore = totalScore / ratingCount;
        const avgConfidence =
          predictions.reduce((sum, p) => sum + p.prediction.confidence, 0) /
          ratingCount;

        recommendations.push({
          experience: experiences[0], // Use first experience as representative
          predictedScore: averageScore,
          confidence: avgConfidence,
          ratingCount: ratingCount,
          predictions: predictions,
        });
      }
    });

    // Sort by predicted score * confidence
    return recommendations.sort(
      (a, b) =>
        b.predictedScore * b.confidence - a.predictedScore * a.confidence
    );
  },

  // Find Similar Users (pulls from Firebase with caching)
  findSimilarUsers: async (userAdjustmentFactor) => {
    console.log(
      "ActivitySystem.findSimilarUsers() called with:",
      userAdjustmentFactor
    );
    if (!getCurrentUser() || !getAuthManager()) {
      console.log("No Firebase user or auth manager, returning empty array");
      return [];
    }

    // Check cache first
    const cachedUsers = CacheSystem.get(
      "SIMILAR_USERS",
      CacheSystem.CACHE_DURATIONS.SIMILAR_USERS
    );
    if (cachedUsers) {
      return cachedUsers;
    }

    try {
      // Reuse cached list to avoid duplicate 'users' reads
      if (typeof FriendsDiscoverySystem?.loadAllUsersOptimized === "function") {
        await FriendsDiscoverySystem.loadAllUsersOptimized();
      }
      const allUsers = (FriendsDiscoverySystem?.allUsers || []).filter(
        (u) =>
          u &&
          u.id !== getCurrentUser().uid &&
          typeof u.adjustmentFactor !== "undefined"
      );

      console.log(
        "Filtered users with adjustment factor (cached):",
        allUsers.length
      );

      if (allUsers.length === 0) {
        console.log("No users found for similarity matching");
        return [];
      }

      // Calculate similarity scores
      const usersWithScores = allUsers.map((user) => {
        const similarityScore =
          1 - Math.abs(userAdjustmentFactor - user.adjustmentFactor);
        return {
          ...user,
          similarityScore,
        };
      });

      // Filter users with reasonable similarity (0.3 or higher) and sort by score
      const similarUsers = usersWithScores
        .filter((user) => user.similarityScore >= 0.1)
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 6); // Top 6 most similar users

      console.log(
        "Similar users found:",
        similarUsers.length,
        "with scores:",
        similarUsers.map((u) => ({
          name: u.displayName,
          score: u.similarityScore.toFixed(2),
        }))
      );

      // If no similar users found, return random users from the same area
      if (similarUsers.length === 0) {
        const currentUser = DataLayer.load("currentUser");
        if (currentUser && currentUser.location) {
          const nearbyUsers = usersWithScores
            .filter((user) => user.location)
            .map((user) => {
              const distance = calculateDistance(
                currentUser.location.lat,
                currentUser.location.lng,
                user.location.lat,
                user.location.lng
              );
              return { ...user, distance };
            })
            .filter((user) => user.distance <= 50000) // Within 50km
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 6);

          console.log(
            "No similar users found, showing nearby users:",
            nearbyUsers.length
          );
          return nearbyUsers;
        }
      }

      // Cache the results
      CacheSystem.set("SIMILAR_USERS", similarUsers);
      return similarUsers;
    } catch (error) {
      console.error("Error finding similar users:", error);
      return [];
    }
  },
};
function resetActivityForm() {
      document.getElementById("activity-form").reset();

      // Reset all sliders to 5
      ActivitySystem.ratingQuestions.forEach((question) => {
        const slider = document.getElementById(`rating-${question.id}`);
        const display = document.getElementById(`slider-${question.id}`);
        if (slider && display) {
          slider.value = 5;
          display.textContent = "5";
        }
      });
}


export function fillActivityForm(name, category, location, description = "") {
  console.log("fillActivityForm called with:", name, category, location);

  // Close nearby modal if it's open
  const nearbyModal = document.getElementById("nearby-modal");
  if (nearbyModal) {
    nearbyModal.remove();
  }

  // Close any other modals
  const allModals = document.querySelectorAll(".modal");
  allModals.forEach((modal) => {
    modal.remove();
  });

  // Navigate to activities page
  showPage("activities");

  // Fill the form after a short delay to ensure the page is loaded
  setTimeout(() => {
    const nameInput = document.getElementById("activity-name");
    const categoryInput = document.getElementById("activity-category");
    const locationInput = document.getElementById("activity-location");
    const descriptionInput = document.getElementById("activity-description");

    if (nameInput) nameInput.value = name;
    if (categoryInput) categoryInput.value = category;
    if (locationInput) locationInput.value = location;
    if (descriptionInput) descriptionInput.value = description;

    // Scroll to form
    const form = document.getElementById("activity-form");
    if (form) {
      form.scrollIntoView({ behavior: "smooth" });
    }

    NotificationSystem.show(
      "Form pre-filled! Add your ratings below.",
      "success"
    );
  }, 300);
}

export function updateSliderValue(slider, targetId) {
      document.getElementById(targetId).textContent = slider.value;
}

export default ActivitySystem;
