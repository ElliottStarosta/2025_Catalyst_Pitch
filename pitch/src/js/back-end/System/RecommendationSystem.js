import DataLayer from "../Data/DataLayer.js";
import ActivitySystem from "./ActivitySystem.js";
import NotificationSystem from "./NotificationSystem.js";
import { getUserLocationWithFallback } from "./Location.js";

import {calculateDistance} from "../MathUtils/LocationMath.js";
import { setLocationFound, getLocationFound } from "./Location.js";

const RecommendationSystem = {
    displayRecommendations: () => {
      const personalityData = DataLayer.load("personalityScore");
      if (!personalityData) return "";

      const recommendations = ActivitySystem.getRecommendations(
        personalityData.adjustmentFactor
      );
      const friends = []; // Fallback to empty array for now

      if (recommendations.length === 0) {
        if (friends.length === 0) {
          return `
        <div style="margin-bottom: 2rem;">
          <h3>No Recommendations Yet</h3>
          <p style="color: #666;">Add friends to get personalized recommendations based on places they've visited!</p>

        </div>
      `;
        } else {
          return `
        <div style="margin-bottom: 2rem;">
          <h3>No New Recommendations</h3>
          <p style="color: #666;">Your friends haven't shared new places recently. Check the community feed for more experiences!</p>
        </div>
      `;
        }
      }

      return `
    <div style="margin-bottom: 2rem;">
      <h3>Recommended For You (From Friends)</h3>
      <p style="color: #666; margin-bottom: 1rem;">Based on places your friends have visited and enjoyed</p>
      <div class="activity-grid">
        ${recommendations
          .slice(0, 4)
          .map(
            (rec) => `
          <div class="activity-card" style="border: 2px solid var(--secondary-color);">
                            <div style="background: var(--secondary-gradient); color: white; padding: 0.5rem; margin: -1.5rem -1.5rem 1rem -1.5rem; border-radius: 15px 15px 0 0;">
              <div style="font-weight: bold;">Recommended: ${rec.predictedScore.toFixed(
              1
            )}/10</div>
              <div style="font-size: 0.8rem; opacity: 0.9;">Confidence: ${(
                rec.confidence * 100
              ).toFixed(0)}%</div>
            </div>
            <div class="activity-title">${rec.experience.name}</div>
            <div class="activity-category">${rec.experience.category} • ${rec.experience.location
              }</div>
            <div class="activity-details">
              ${rec.experience.description
                ? `<p style="margin: 0.5rem 0; color: #666;">"${rec.experience.description}"</p>`
                : ""
              }
              <div style="font-size: 0.9rem; color: #888; margin-top: 0.5rem;">
                Social Intensity: ${rec.experience.socialIntensity.toFixed(
                1
              )}/10 |
                Noise Level: ${rec.experience.noiseLevel.toFixed(1)}/10 |
                Crowd Size: ${rec.experience.crowdSize.toFixed(1)}/10
              </div>
            </div>
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
              <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                Recommended by friends:
              </div>
              ${rec.predictions
                .slice(0, 2)
                .map(
                  (p) => `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; margin-bottom: 0.3rem;">
                  <span>${addCrownToPremiumUser(p.user.displayName, p.user.id)} (${p.user.personalityType})</span>
                  <span style="font-weight: bold;">${p.experience.adjustedScore}/10</span>
                </div>
              `
                )
                .join("")}
              <div style="text-align: center; margin-top: 1rem;">
                <button class="btn" style="font-size: 0.9rem; padding: 8px 16px;"
                        onclick="fillActivityForm('${rec.experience.name.replace(/'/g, "\\'")}', '${rec.experience.category.replace(/'/g, "\\'")}', '${rec.experience.location.replace(/'/g, "\\'")}', '${rec.experience.description ? rec.experience.description.replace(/'/g, "\\'") : ""}')">
                  Rate This Place
                </button>
              </div>
            </div>  
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
    },
  };

// Function to get location-based recommendations
export function getLocationBasedRecommendations() {
      setLocationFound(false); // Reset flag at start

      NotificationSystem.show("Getting your location for nearby recommendations...", "info");

      getUserLocationWithFallback()
        .then((position) => {
          setLocationFound(true); // Set flag when location is found
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          // Get all experiences from the community
          const allExperiences = ActivitySystem.getAllExperiences();
          const userExperiences = DataLayer.load("userExperiences", []);
          const friends = []; // Fallback to empty array for now
          const friendIds = []; // Fallback to empty array for now

          // Get user's experience names to exclude them
          const userExperienceNames = userExperiences.map(exp => exp.name.toLowerCase());

          // Filter experiences that are within 50km of user's location and exclude user's own experiences
          const nearbyExperiences = allExperiences.filter(exp => {
            if (!exp.coordinates) return false;

            const distance = calculateDistance(lat, lng, exp.coordinates.lat, exp.coordinates.lng);
            const isUserExperience = userExperienceNames.includes(exp.name.toLowerCase());

            return distance <= 50 && !isUserExperience; // Within 50km and not user's own experience
          });

          // Sort by distance and rating
          nearbyExperiences.sort((a, b) => {
            const distanceA = calculateDistance(lat, lng, a.coordinates.lat, a.coordinates.lng);
            const distanceB = calculateDistance(lat, lng, b.coordinates.lat, b.coordinates.lng);

            // Prioritize by rating first, then distance
            if (Math.abs(a.adjustedScore - b.adjustedScore) > 1) {
              return b.adjustedScore - a.adjustedScore; // Higher rating first
            }
            return distanceA - distanceB; // Closer distance first
          });

          // Get top 10 nearby experiences
          const topNearbyExperiences = nearbyExperiences.slice(0, 10);

          if (topNearbyExperiences.length === 0) {
            // No nearby experiences found
            const modalHtml = `
              <div id="nearby-modal" class="modal">
                <div class="modal-content" style="max-width: 600px;">
                  <button class="modal-close" onclick="closeNearbyModal()">&times;</button>
                  <div class="modal-header">
                    <h2><i class="fas fa-map-marker-alt"></i> Places Near You</h2>
                    <p style="margin: 0; color: #666;">Based on your current location</p>
                  </div>
                  <div class="modal-body">
                    <div style="text-align: center; padding: 3rem 1rem;">
                      <div style="font-size: 3rem; color: #ddd; margin-bottom: 1rem;">📍</div>
                      <h3 style="color: #666; margin-bottom: 0.5rem;">No Nearby Experiences Yet</h3>
                      <p style="color: #888; margin-bottom: 2rem;">
                        No places have been rated by the community within 50km of your location. 
                        Be the first to share experiences in your area!
                      </p>
                      <button class="btn" onclick="closeNearbyModal(); showPage('activities');">
                        <i class="fas fa-plus-circle"></i> Add Your First Experience
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;

            document.body.insertAdjacentHTML("beforeend", modalHtml);
            addModalListeners("nearby-modal", closeNearbyModal);
            NotificationSystem.show("No nearby experiences found. Be the first to share!", "info");
            return;
          }

          // Create a modal to show nearby recommendations
          const modalHtml = `
            <div id="nearby-modal" class="modal">
              <div class="modal-content" style="max-width: 600px;">
                <button class="modal-close" onclick="closeNearbyModal()">&times;</button>
                <div class="modal-header">
                  <h2><i class="fas fa-map-marker-alt"></i> Places Near You</h2>
                  <p style="margin: 0; color: #666;">Rated by friends and community within 50km</p>
                </div>
                <div class="modal-body">
                  <div style="background: rgba(74, 144, 226, 0.1); padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem;">
                    <p style="margin: 0; font-size: 0.9rem; color: #666;">
                      <i class="fas fa-info-circle"></i> 
                      Showing ${topNearbyExperiences.length} places rated by the community near your location.
                    </p>
                  </div>
                  
                  <div style="display: grid; gap: 1rem;">
                    ${topNearbyExperiences.map((exp, index) => {
            const distance = calculateDistance(lat, lng, exp.coordinates.lat, exp.coordinates.lng);
            const user = null; // Demo users removed - Firebase only
            const isFriend = friendIds.includes(exp.userId);
            const hasVisited = userExperiences.some(userExp =>
              userExp.name.toLowerCase() === exp.name.toLowerCase()
            );

            return `
                        <div style="border: 1px solid #eee; border-radius: 8px; padding: 1rem; background: white;">
                          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <div style="flex: 1;">
                              <div style="font-weight: bold; margin-bottom: 0.3rem; font-size: 1.1rem;">
                                ${exp.name} ${hasVisited ? '<span style="color: var(--primary-color);">✓ Visited</span>' : ''}
                              </div>
                              <div style="font-size: 0.8rem; color: #666; margin-bottom: 0.5rem;">
                                ${exp.category} • ${exp.location} • ${distance.toFixed(1)}km away
                              </div>
                              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.8rem;">
                                <div style="width: 20px; height: 20px; border-radius: 50%; background: var(--secondary-gradient); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: bold;">
                                  ${user ? user.avatar : '?'}
                                </div>
                                <span>${addCrownToPremiumUser(user ? user.displayName : 'Unknown', exp.userId)}</span>
                                ${isFriend ? '<span style="color: var(--primary-color);">★</span>' : ''}
                                <span style="color: #888;">• Rated ${exp.adjustedScore}/10</span>
                              </div>
                              ${exp.description ? `<p style="font-size: 0.9rem; color: #666; margin: 0.5rem 0; font-style: italic;">"${exp.description}"</p>` : ''}
                            </div>
                            <div style="text-align: right;">
                              <div style="font-weight: bold; color: ${exp.adjustedScore >= 7 ? '#4CAF50' : exp.adjustedScore >= 5 ? '#FF9800' : '#f44336'}; font-size: 1.2rem;">
                                ${exp.adjustedScore}/10
                              </div>
                            </div>
                          </div>
                          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                            ${hasVisited ?
                `<span style="background: #e8f5e8; color: #2e7d32; font-size: 0.8rem; font-weight: bold; padding: 6px 12px; border-radius: 12px; border: 1px solid #4caf50; flex: 1; text-align: center;">
                                ✓ Already Rated
                              </span>` :
                `<button class="btn" style="font-size: 0.8rem; padding: 6px 12px; flex: 1;" 
                                      onclick="closeNearbyModal(); fillActivityForm('${exp.name}', '${exp.category}', '${exp.location}', 'Found through location-based search')">
                                Rate This Place
                              </button>`
              }
                            <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 12px;" 
                                    data-user-id="${exp.userId}" data-experience-name="${exp.name}" onclick="closeNearbyModal(); showExperienceDetailsFromButton(this);">
                              View Details
                            </button>
                          </div>
                        </div>
                      `;
          }).join('')}
                  </div>
                  
                  <div style="text-align: center; margin-top: 2rem;">
                    <button class="btn" onclick="closeNearbyModal(); showPage('activities');">
                      <i class="fas fa-plus-circle"></i> Add Your Own Experience
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;

          document.body.insertAdjacentHTML("beforeend", modalHtml);

          // Add ESC and click-outside functionality
          addModalListeners("nearby-modal", closeNearbyModal);

          NotificationSystem.show(`Found ${topNearbyExperiences.length} nearby places rated by the community!`, "success");
        })
        .catch((error) => {
          console.error('Location error:', error);
          // Add 1 second delay before showing error
          setTimeout(() => {
            // Only show error if location wasn't found
            if (!getLocationFound()) {
              let message = 'Unable to get your location: ';
              if (error.code) {
                switch (error.code) {
                  case error.PERMISSION_DENIED:
                    message += 'Please allow location access to find nearby places.';
                    break;
                  case error.POSITION_UNAVAILABLE:
                    message += 'Location information is unavailable.';
                    break;
                  case error.TIMEOUT:
                    message += 'Location request timed out.';
                    break;
                  default:
                    message += 'An unknown error occurred.';
                    break;
                }
              } else {
                message += error.message || 'An unknown error occurred.';
              }
              NotificationSystem.show(message, "error");
            }
          }, 1000);
        });
}

  
export default RecommendationSystem;