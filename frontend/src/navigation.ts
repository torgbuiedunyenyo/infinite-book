export interface Location {
  seed: string;
  page: number;
}

const history: Location[] = [];
let currentLocation: Location | null = null;

export function getCurrentLocation(): Location | null {
  return currentLocation;
}

export function setCurrentLocation(location: Location): void {
  if (currentLocation) {
    history.push({ ...currentLocation });
  }
  currentLocation = location;
  updateURL(location);
}

export function goBack(): Location | null {
  if (history.length === 0) {
    return null;
  }
  currentLocation = history.pop()!;
  updateURL(currentLocation);
  return currentLocation;
}

export function canGoBack(): boolean {
  return history.length > 0;
}

function updateURL(location: Location): void {
  const encodedSeed = encodeURIComponent(location.seed);
  const path = `/${encodedSeed}/${location.page}`;
  window.history.pushState({ seed: location.seed, page: location.page }, '', path);
}

export function parseURL(): Location | null {
  const path = window.location.pathname;
  
  if (path === '/' || path === '') {
    return null;
  }
  
  const match = path.match(/^\/(.+?)(?:\/(\d+))?$/);
  if (!match) {
    return null;
  }
  
  const seed = decodeURIComponent(match[1]);
  const page = match[2] ? parseInt(match[2], 10) : 1;
  
  return { seed, page };
}

export function setupPopStateHandler(onNavigate: (location: Location) => void): void {
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.seed) {
      currentLocation = { seed: event.state.seed, page: event.state.page };
      onNavigate(currentLocation);
    }
  });
}

