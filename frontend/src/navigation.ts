import { navLogger } from './logger';

const log = navLogger;

export interface Location {
  seed: string;
  page: number;
}

const history: Location[] = [];
let currentLocation: Location | null = null;

// Stats
let totalSetLocations = 0;
let totalGoBackCalls = 0;
let totalURLParses = 0;
let totalPopStateEvents = 0;

export function getCurrentLocation(): Location | null {
  log.debug('getCurrentLocation called', {
    hasLocation: !!currentLocation,
    seed: currentLocation?.seed,
    page: currentLocation?.page,
  });
  return currentLocation;
}

export function setCurrentLocation(location: Location): void {
  totalSetLocations++;
  
  log.info('setCurrentLocation called', {
    newSeed: location.seed,
    newPage: location.page,
    previousSeed: currentLocation?.seed,
    previousPage: currentLocation?.page,
    historyLength: history.length,
    totalSetLocations,
  });
  
  if (currentLocation) {
    history.push({ ...currentLocation });
    log.debug('Previous location pushed to history', {
      pushedSeed: currentLocation.seed,
      pushedPage: currentLocation.page,
      newHistoryLength: history.length,
    });
  }
  
  currentLocation = location;
  updateURL(location);
  
  log.debug('Location updated', {
    currentSeed: currentLocation.seed,
    currentPage: currentLocation.page,
    historyLength: history.length,
    historyPreview: history.slice(-3).map(h => `"${h.seed}" p.${h.page}`),
  });
}

export function goBack(): Location | null {
  totalGoBackCalls++;
  
  log.info('goBack called', {
    historyLength: history.length,
    canGoBack: history.length > 0,
    totalGoBackCalls,
  });
  
  if (history.length === 0) {
    log.debug('Cannot go back - history is empty');
    return null;
  }
  
  const previousLocation = currentLocation;
  currentLocation = history.pop()!;
  
  log.info('Navigating back in history', {
    fromSeed: previousLocation?.seed,
    fromPage: previousLocation?.page,
    toSeed: currentLocation.seed,
    toPage: currentLocation.page,
    remainingHistoryLength: history.length,
  });
  
  updateURL(currentLocation);
  return currentLocation;
}

export function canGoBack(): boolean {
  const result = history.length > 0;
  log.debug('canGoBack check', {
    result,
    historyLength: history.length,
  });
  return result;
}

function updateURL(location: Location): void {
  const encodedSeed = encodeURIComponent(location.seed);
  const path = `/${encodedSeed}/${location.page}`;
  
  log.debug('Updating browser URL', {
    seed: location.seed,
    page: location.page,
    encodedSeed,
    path,
    fullURL: window.location.origin + path,
  });
  
  window.history.pushState({ seed: location.seed, page: location.page }, '', path);
  
  log.debug('URL updated via pushState', {
    newPath: window.location.pathname,
  });
}

export function parseURL(): Location | null {
  totalURLParses++;
  
  const path = window.location.pathname;
  const fullURL = window.location.href;
  
  log.info('parseURL called', {
    path,
    fullURL,
    totalURLParses,
  });
  
  if (path === '/' || path === '') {
    log.debug('Root path detected - no location to parse');
    return null;
  }
  
  const match = path.match(/^\/(.+?)(?:\/(\d+))?$/);
  
  if (!match) {
    log.warn('URL path did not match expected pattern', {
      path,
      pattern: '/^\/(.+?)(?:\/(\d+))?$/',
    });
    return null;
  }
  
  const rawSeed = match[1];
  const seed = decodeURIComponent(rawSeed);
  const page = match[2] ? parseInt(match[2], 10) : 1;
  
  log.info('URL parsed successfully', {
    rawSeed,
    decodedSeed: seed,
    rawPage: match[2] || 'not specified (defaulting to 1)',
    page,
  });
  
  return { seed, page };
}

export function setupPopStateHandler(onNavigate: (location: Location) => void): void {
  log.info('Setting up popstate handler for browser back/forward');
  
  window.addEventListener('popstate', (event) => {
    totalPopStateEvents++;
    
    log.info('Popstate event received (browser back/forward)', {
      hasState: !!event.state,
      stateSeed: event.state?.seed,
      statePage: event.state?.page,
      totalPopStateEvents,
    });
    
    if (event.state && event.state.seed) {
      currentLocation = { seed: event.state.seed, page: event.state.page };
      
      log.info('Processing popstate navigation', {
        seed: currentLocation.seed,
        page: currentLocation.page,
      });
      
      onNavigate(currentLocation);
    } else {
      log.warn('Popstate event without valid state', {
        state: event.state,
      });
    }
  });
  
  log.debug('Popstate handler registered');
}

// Export navigation stats
export function getNavigationStats() {
  return {
    historyLength: history.length,
    hasCurrentLocation: !!currentLocation,
    currentSeed: currentLocation?.seed,
    currentPage: currentLocation?.page,
    totalSetLocations,
    totalGoBackCalls,
    totalURLParses,
    totalPopStateEvents,
  };
}
