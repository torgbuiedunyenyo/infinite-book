/**
 * Reading History - localStorage-based tracking of visited pages and favorites
 * 
 * Allows readers to:
 * - See which books they've visited
 * - Mark pages as favorites
 * - View recent reading history
 * - Export/import their history
 */

export interface VisitedPage {
  seed: string;
  page: number;
  timestamp: number;
  favorite?: boolean;
}

const STORAGE_KEY = 'babel-reading-history';
const MAX_HISTORY = 500; // Cap to prevent localStorage bloat

/**
 * Get full reading history from localStorage
 */
export function getHistory(): VisitedPage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Save history to localStorage
 */
function saveHistory(history: VisitedPage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    // localStorage might be full or disabled
    console.warn('Failed to save reading history:', e);
  }
}

/**
 * Create a unique key for a page
 */
function pageKey(seed: string, page: number): string {
  return `${seed}::${page}`;
}

/**
 * Record a page visit
 */
export function recordVisit(seed: string, page: number): void {
  const history = getHistory();
  const key = pageKey(seed, page);
  
  // Find existing entry
  const existingIndex = history.findIndex(v => pageKey(v.seed, v.page) === key);
  
  if (existingIndex !== -1) {
    // Update timestamp, preserve favorite status
    const existing = history[existingIndex];
    existing.timestamp = Date.now();
    // Move to front of array (most recent first)
    history.splice(existingIndex, 1);
    history.unshift(existing);
  } else {
    // Add new entry at front
    history.unshift({
      seed,
      page,
      timestamp: Date.now(),
    });
    
    // Trim if over limit
    if (history.length > MAX_HISTORY) {
      // Remove oldest non-favorite entries first
      const toRemove = history.length - MAX_HISTORY;
      let removed = 0;
      for (let i = history.length - 1; i >= 0 && removed < toRemove; i--) {
        if (!history[i].favorite) {
          history.splice(i, 1);
          removed++;
        }
      }
      // If still over limit (all favorites?), trim anyway
      while (history.length > MAX_HISTORY) {
        history.pop();
      }
    }
  }
  
  saveHistory(history);
}

/**
 * Check if user has visited a specific page
 */
export function hasVisitedPage(seed: string, page: number): boolean {
  const history = getHistory();
  return history.some(v => v.seed === seed && v.page === page);
}

/**
 * Check if user has visited any page of a book
 */
export function hasVisitedBook(seed: string): boolean {
  const history = getHistory();
  return history.some(v => v.seed === seed);
}

/**
 * Get the highest page number visited for a book
 */
export function getHighestVisitedPage(seed: string): number {
  const history = getHistory();
  const bookPages = history.filter(v => v.seed === seed);
  if (bookPages.length === 0) return 0;
  return Math.max(...bookPages.map(v => v.page));
}

/**
 * Check if a page is favorited
 */
export function isFavorite(seed: string, page: number): boolean {
  const history = getHistory();
  const entry = history.find(v => v.seed === seed && v.page === page);
  return entry?.favorite ?? false;
}

/**
 * Toggle favorite status for a page
 * Returns the new favorite status
 */
export function toggleFavorite(seed: string, page: number): boolean {
  const history = getHistory();
  const key = pageKey(seed, page);
  const entry = history.find(v => pageKey(v.seed, v.page) === key);
  
  if (entry) {
    entry.favorite = !entry.favorite;
    saveHistory(history);
    return entry.favorite;
  }
  
  // Page not in history yet - add it as favorite
  history.unshift({
    seed,
    page,
    timestamp: Date.now(),
    favorite: true,
  });
  saveHistory(history);
  return true;
}

/**
 * Get all favorited pages
 */
export function getFavorites(): VisitedPage[] {
  return getHistory()
    .filter(v => v.favorite)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Check if a book has any favorited pages
 */
export function bookHasFavorites(seed: string): boolean {
  const history = getHistory();
  return history.some(v => v.seed === seed && v.favorite);
}

/**
 * Get recent reading history
 */
export function getRecentHistory(limit = 50): VisitedPage[] {
  return getHistory()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Get visited books (unique seeds) with their visit info
 */
export function getVisitedBooks(): Array<{
  seed: string;
  pagesVisited: number;
  lastVisited: number;
  hasFavorites: boolean;
}> {
  const history = getHistory();
  const bookMap = new Map<string, {
    pagesVisited: Set<number>;
    lastVisited: number;
    hasFavorites: boolean;
  }>();
  
  for (const entry of history) {
    const existing = bookMap.get(entry.seed);
    if (existing) {
      existing.pagesVisited.add(entry.page);
      existing.lastVisited = Math.max(existing.lastVisited, entry.timestamp);
      if (entry.favorite) existing.hasFavorites = true;
    } else {
      bookMap.set(entry.seed, {
        pagesVisited: new Set([entry.page]),
        lastVisited: entry.timestamp,
        hasFavorites: entry.favorite ?? false,
      });
    }
  }
  
  return Array.from(bookMap.entries())
    .map(([seed, data]) => ({
      seed,
      pagesVisited: data.pagesVisited.size,
      lastVisited: data.lastVisited,
      hasFavorites: data.hasFavorites,
    }))
    .sort((a, b) => b.lastVisited - a.lastVisited);
}

/**
 * Export history as JSON string (for backup)
 */
export function exportHistory(): string {
  return JSON.stringify(getHistory(), null, 2);
}

/**
 * Import history from JSON string (from backup)
 * Merges with existing history, preserving favorites
 */
export function importHistory(json: string): { success: boolean; imported: number; error?: string } {
  try {
    const imported = JSON.parse(json);
    
    if (!Array.isArray(imported)) {
      return { success: false, imported: 0, error: 'Invalid format: expected array' };
    }
    
    const currentHistory = getHistory();
    const currentKeys = new Set(currentHistory.map(v => pageKey(v.seed, v.page)));
    
    let importedCount = 0;
    
    for (const entry of imported) {
      if (typeof entry.seed !== 'string' || typeof entry.page !== 'number') {
        continue; // Skip invalid entries
      }
      
      const key = pageKey(entry.seed, entry.page);
      
      if (currentKeys.has(key)) {
        // Merge: preserve favorite if either has it
        const existing = currentHistory.find(v => pageKey(v.seed, v.page) === key)!;
        if (entry.favorite && !existing.favorite) {
          existing.favorite = true;
        }
        // Keep the most recent timestamp
        if (entry.timestamp > existing.timestamp) {
          existing.timestamp = entry.timestamp;
        }
      } else {
        // Add new entry
        currentHistory.push({
          seed: entry.seed,
          page: entry.page,
          timestamp: entry.timestamp || Date.now(),
          favorite: entry.favorite ?? false,
        });
        currentKeys.add(key);
        importedCount++;
      }
    }
    
    // Sort by timestamp and save
    currentHistory.sort((a, b) => b.timestamp - a.timestamp);
    saveHistory(currentHistory);
    
    return { success: true, imported: importedCount };
  } catch (e) {
    return { 
      success: false, 
      imported: 0, 
      error: e instanceof Error ? e.message : 'Parse error' 
    };
  }
}

/**
 * Clear all reading history
 */
export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

