const LANDING_INTRO_STORAGE_KEY = 'railstar_landing_intro_seen_v1';
let seenInThisSession = false;

export function markLandingIntroSeen() {
  seenInThisSession = true;
  try {
    window.localStorage.setItem(LANDING_INTRO_STORAGE_KEY, '1');
  } catch {
    // Continue into the app when the browser does not allow persistent storage.
  }
}

export function hasSeenLandingIntro() {
  if (seenInThisSession) return true;
  try {
    return window.localStorage.getItem(LANDING_INTRO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
