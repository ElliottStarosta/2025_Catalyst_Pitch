const appData = {
  personalityScore: null,
  personalityType: null,
  userExperiences: [],
  groups: [],
  friends: [],
  currentUser: {
    id: "user-main",
    username: "you",
    displayName: "You",
    avatar: "Y",
    isPremium: import.meta.env.AI_PREMIUM_ENABLED,
  },
  gotoPage(page) {
    GroupsSystem.currentPage = page;
    GroupsSystem.displayGroups();
  },
};

const DataLayer = {
  save(key, data) {
    appData[key] = JSON.parse(JSON.stringify(data));
  },

  load(key, defaultValue = null) {
    return appData[key] !== undefined
      ? JSON.parse(JSON.stringify(appData[key]))
      : defaultValue;
  },

  exists(key) {
    return appData[key] !== undefined && appData[key] !== null;
  },

  push(key, item) {
    if (!appData[key]) appData[key] = [];
    appData[key].push(JSON.parse(JSON.stringify(item)));
  },

  remove(key, predicate) {
    if (appData[key] && Array.isArray(appData[key])) {
      appData[key] = appData[key].filter((item) => !predicate(item));
    }
  },
};

// Expose a global helper if in browser
if (typeof window !== "undefined") {
  window.loadData = (key, data) => {
    try {
      const parsedData = typeof data === "string" ? JSON.parse(data) : data;
      DataLayer.save(key, parsedData);
      console.log(`Loaded ${key}:`, parsedData);
      return parsedData;
    } catch (error) {
      console.error(`Failed to load ${key}:`, error.message);
      return null;
    }
  };
}

export default DataLayer;