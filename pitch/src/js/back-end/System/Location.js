import DataLayer from "../Data/DataLayer";
import NotificationSystem from "./NotificationSystem";

// Global variable to track if location was successfully found
let locationFound = false;
export const setLocationFound = (value) => {locationFound = value}
export const getLocationFound = () => locationFound;

// Location autocomplete functionality
export function initializeLocationAutocomplete() {
  // Function to get user's current location
  function getCurrentLocation() {
    locationFound = false; // Reset flag at start
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          locationFound = true; // Set flag when location is found
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          // Add 1 second delay before rejecting
          setTimeout(() => {
            // Only show error if location wasn't found
            if (!locationFound) {
              let message = "Unable to retrieve location: ";
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  message += "User denied the request for Geolocation.";
                  break;
                case error.POSITION_UNAVAILABLE:
                  message += "Location information is unavailable.";
                  break;
                case error.TIMEOUT:
                  message += "The request to get user location timed out.";
                  break;
                default:
                  message += "An unknown error occurred.";
                  break;
              }
              reject(new Error(message));
            }
          }, 1000);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        }
      );
    });
  }

  // Function to reverse geocode coordinates to address
  function reverseGeocode(lat, lng) {
    if (typeof google !== "undefined" && google.maps && google.maps.Geocoder) {
      const geocoder = new google.maps.Geocoder();
      return new Promise((resolve, reject) => {
        geocoder.geocode(
          { location: { lat: lat, lng: lng } },
          (results, status) => {
            if (status === "OK" && results[0]) {
              resolve(results[0].formatted_address);
            } else {
              reject(new Error("Geocoder failed: " + status));
            }
          }
        );
      });
    } else {
      // Fallback using a free geocoding service (OpenStreetMap Nominatim)
      return fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      )
        .then((response) => response.json())
        .then((data) => {
          if (data.display_name) {
            return data.display_name;
          } else {
            throw new Error("Unable to reverse geocode location");
          }
        });
    }
  }

  // Check if Google Maps API is available
  if (typeof google !== "undefined" && google.maps && google.maps.places) {
    const locationInput = document.getElementById("activity-location");
    if (locationInput) {
      // Set up autocomplete with bias towards user's location
      getCurrentLocation()
        .then((userLocation) => {
          const autocomplete = new google.maps.places.Autocomplete(
            locationInput,
            {
              types: ["establishment", "geocode"],
              fields: ["name", "formatted_address", "place_id"],
            }
          );

          // Bias results towards user's current location
          const circle = new google.maps.Circle({
            center: userLocation,
            radius: 50000, // 50km radius
          });
          autocomplete.setBounds(circle.getBounds());

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) {
              locationInput.value = place.formatted_address;
            }
          });

          // Add a button or option to use current location
          const useCurrentLocationBtn = document.createElement("button");
          useCurrentLocationBtn.type = "button";
          useCurrentLocationBtn.textContent = "Use Current Location";
          useCurrentLocationBtn.style.cssText = `
          margin-left: 8px;
          padding: 8px 12px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        `;

          useCurrentLocationBtn.addEventListener("click", async () => {
            try {
              useCurrentLocationBtn.textContent = "Getting location...";
              useCurrentLocationBtn.disabled = true;

              const location = await getCurrentLocation();
              const address = await reverseGeocode(location.lat, location.lng);
              locationInput.value = address;

              useCurrentLocationBtn.textContent = "Use Current Location";
              useCurrentLocationBtn.disabled = false;
            } catch (error) {
              console.error("Error getting current location:", error);
              alert(error.message);
              useCurrentLocationBtn.textContent = "Use Current Location";
              useCurrentLocationBtn.disabled = false;
            }
          });

          // Insert button after the input field
          locationInput.parentNode.insertBefore(
            useCurrentLocationBtn,
            locationInput.nextSibling
          );
        })
        .catch((error) => {
          console.warn(
            "Could not get user location for autocomplete bias:",
            error
          );

          // Set up autocomplete without location bias
          const autocomplete = new google.maps.places.Autocomplete(
            locationInput,
            {
              types: ["establishment", "geocode"],
              fields: ["name", "formatted_address", "place_id"],
            }
          );

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            if (place.formatted_address) {
              locationInput.value = place.formatted_address;
            }
          });
        });
    }
  } else {
    // Fallback: Simple location suggestions with current location option
    const locationInput = document.getElementById("activity-location");
    if (locationInput) {
      const commonLocations = [
        "Use Current Location",
        "Downtown",
        "City Center",
        "University District",
        "Arts District",
        "Entertainment District",
        "Shopping District",
        "Financial District",
        "Old Town",
        "Midtown",
        "Uptown",
        "Suburbs",
        "Waterfront",
        "North Side",
        "South Side",
        "East Side",
        "West Side",
      ];

      locationInput.addEventListener("input", (e) => {
        const value = e.target.value.toLowerCase();
        if (value.length > 0) {
          const matches = commonLocations.filter((loc) =>
            loc.toLowerCase().includes(value)
          );

          // Create simple dropdown (basic implementation)
          let dropdown = document.getElementById("location-dropdown");
          if (dropdown) dropdown.remove();

          if (matches.length > 0 && matches.length < commonLocations.length) {
            dropdown = document.createElement("div");
            dropdown.id = "location-dropdown";
            dropdown.style.cssText = `
              position: absolute;
              top: 100%;
              left: 0;
              right: 0;
              background: white;
              border: 1px solid #ddd;
              border-top: none;
              border-radius: 0 0 8px 8px;
              max-height: 200px;
              overflow-y: auto;
              z-index: 1000;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            `;

            matches.slice(0, 5).forEach((match) => {
              const option = document.createElement("div");
              option.style.cssText = `
                padding: 12px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
              `;
              option.textContent = match;
              option.addEventListener("mouseenter", () => {
                option.style.background = "#f5f5f5";
              });
              option.addEventListener("mouseleave", () => {
                option.style.background = "white";
              });
              option.addEventListener("click", async () => {
                if (match === "Use Current Location") {
                  try {
                    option.textContent = "Getting location...";
                    const location = await getCurrentLocation();
                    const address = await reverseGeocode(
                      location.lat,
                      location.lng
                    );
                    locationInput.value = address;
                  } catch (error) {
                    console.error("Error getting current location:", error);
                    alert(error.message);
                    locationInput.value = "";
                  }
                } else {
                  locationInput.value = match;
                }
                dropdown.remove();
              });
              dropdown.appendChild(option);
            });

            locationInput.parentNode.style.position = "relative";
            locationInput.parentNode.appendChild(dropdown);
          }
        }
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", (e) => {
        const dropdown = document.getElementById("location-dropdown");
        if (
          dropdown &&
          !locationInput.contains(e.target) &&
          !dropdown.contains(e.target)
        ) {
          dropdown.remove();
        }
      });
    }
  }
}

export function autoFillCurrentLocation() {
  locationFound = false; // Reset flag at start
  const locationInput = document.getElementById("activity-location");

  if (!locationInput) return;

  // Only auto-fill if the input is empty (don't override user input)
  if (locationInput.value.trim() !== "") return;

  console.log("Auto-filling current location...");

  getUserLocationWithFallback()
    .then((position) => {
      locationFound = true; // Set flag when location is found
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      console.log("Auto-filled location coordinates:", lat, lng);

      // Use the reverse geocoding function to fill the location
      reverseGeocodeAndFillLocation(lat, lng);

      // Show a subtle notification
      NotificationSystem.show("Location auto-detected!", "success");
    })
    .catch((error) => {
      console.log("Could not auto-detect location:", error.message);
      // Silently fail for auto-fill (don't show error notification)
    });
}

// Helper function to get user location (with demo user fallback)
export async function getUserLocationWithFallback() {
  const currentUser = DataLayer.load("currentUser");
  console.log("📍 Current user for location:", currentUser);

  // Demo users removed - Firebase only

  // If current user has a saved location, use that
  if (currentUser && currentUser.location) {
    console.log(
      `📍 Using saved location for ${currentUser.displayName}:`,
      currentUser.location
    );
    return {
      coords: {
        latitude: currentUser.location.lat,
        longitude: currentUser.location.lng,
      },
    };
  }

  // Check if we're in a demo environment (no real user)
  if (!currentUser || !currentUser.id) {
    console.log(`📍 No current user found, using default Waterloo location`);
    return {
      coords: {
        latitude: 43.4643, // Waterloo University District
        longitude: -80.5204,
      },
    };
  }

  // Otherwise, try to get real location
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    // Check if location permission is denied
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          if (permission.state === "denied") {
            reject(
              new Error(
                "Location permission denied. Please enable location access in your browser settings."
              )
            );
            return;
          }

          // Permission is granted or prompt, proceed with location request
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000, // 5 minutes
          });
        })
        .catch(() => {
          // Fallback if permissions API is not available
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000, // 5 minutes
          });
        });
    } else {
      // Fallback if permissions API is not available
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      });
    }
  });
}

// Function to reverse geocode coordinates and fill location field
function reverseGeocodeAndFillLocation(lat, lng) {
  const locationInput = document.getElementById("activity-location");
  if (!locationInput) return;

  // Show loading state
  locationInput.value = "Getting your location...";
  locationInput.disabled = true;

  // Use OpenStreetMap Nominatim for reverse geocoding (free service)
  fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`
  )
    .then((response) => response.json())
    .then((data) => {
      if (data.display_name) {
        // Extract city/area name from the full address
        const addressParts = data.display_name.split(", ");
        let locationName = addressParts[0]; // Start with the most specific part

        // Try to find a more meaningful location name
        if (addressParts.length > 1) {
          // Look for city, town, or district
          for (let i = 1; i < Math.min(4, addressParts.length); i++) {
            const part = addressParts[i];
            if (
              part.includes("City") ||
              part.includes("Town") ||
              part.includes("District") ||
              part.includes("Neighborhood") ||
              part.includes("Area")
            ) {
              locationName = part;
              break;
            }
          }
        }

        locationInput.value = locationName;
        NotificationSystem.show(
          `Location detected: ${locationName}`,
          "success"
        );
      } else {
        locationInput.value = "Location detected (coordinates)";
      }
    })
    .catch((error) => {
      console.error("Error reverse geocoding:", error);
      // Add 1 second delay before showing any error notification
      setTimeout(() => {
        // Could show error notification here if needed
      }, 1000);
      locationInput.value = "Location detected (coordinates)";
    })
    .finally(() => {
      locationInput.disabled = false;
    });
}

export function useCurrentLocation() {
  locationFound = false; // Reset flag at start
  const locationInput = document.getElementById("activity-location");
  const useLocationBtn = document.getElementById("use-current-location-btn");

  if (!locationInput || !useLocationBtn) return;

  // Show loading state
  useLocationBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Getting Location...';
  useLocationBtn.disabled = true;

  getUserLocationWithFallback()
    .then((position) => {
      locationFound = true; // Set flag when location is found
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      // Use the reverse geocoding function
      reverseGeocodeAndFillLocation(lat, lng);

      // Reset button
      useLocationBtn.innerHTML =
        '<i class="fas fa-crosshairs"></i> Use Current Location';
      useLocationBtn.disabled = false;
    })
    .catch((error) => {
      console.error("Error getting location:", error);
      // Add 1 second delay before showing error
      setTimeout(() => {
        // Only show error if location wasn't found
        if (!locationFound) {
          let message = "Unable to get your location: ";
          if (error.code) {
            switch (error.code) {
              case error.PERMISSION_DENIED:
                message +=
                  "Please allow location access in your browser settings.";
                break;
              case error.POSITION_UNAVAILABLE:
                message += "Location information is unavailable.";
                break;
              case error.TIMEOUT:
                message += "Location request timed out.";
                break;
              default:
                message += "An unknown error occurred.";
                break;
            }
          } else {
            message += error.message || "An unknown error occurred.";
          }

          NotificationSystem.show(message, "error");
          locationInput.value = "";
        }
      }, 1000);

      // Reset button
      useLocationBtn.innerHTML =
        '<i class="fas fa-crosshairs"></i> Use Current Location';
      useLocationBtn.disabled = false;
    });
}
