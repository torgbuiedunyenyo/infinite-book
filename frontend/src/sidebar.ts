import { DiscoveredBook, BooksResponse } from './types';
import {
  hasVisitedBook,
  bookHasFavorites,
  getFavorites,
  getHighestVisitedPage,
} from './readingHistory';

// Sidebar state
let isOpen = false;
let books: DiscoveredBook[] = [];
let filteredBooks: DiscoveredBook[] = [];
let searchQuery = '';
let isLoading = false;
let bookSelectHandler: ((seed: string) => void) | null = null;
let currentTab: 'all' | 'favorites' = 'all';

// DOM elements (created dynamically)
let sidebarOverlay: HTMLElement | null = null;
let sidebarPanel: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let booksList: HTMLElement | null = null;
let triggerButton: HTMLElement | null = null;
let tabsContainer: HTMLElement | null = null;

/**
 * Initialize the sidebar by creating DOM elements and attaching handlers
 */
export function initSidebar(): void {
  createSidebarElements();
  createTriggerButton();
  attachEventListeners();
}

/**
 * Register a handler for when a book is selected
 */
export function onBookSelect(handler: (seed: string) => void): void {
  bookSelectHandler = handler;
}

/**
 * Open the sidebar
 */
export async function openSidebar(): Promise<void> {
  if (isOpen) return;
  
  isOpen = true;
  
  // Show the sidebar
  if (sidebarOverlay) {
    sidebarOverlay.classList.add('visible');
  }
  if (sidebarPanel) {
    sidebarPanel.classList.add('open');
  }
  
  // Focus search input
  setTimeout(() => {
    searchInput?.focus();
  }, 300);
  
  // Always fetch fresh books when opening the sidebar
  await fetchBooks();
}

/**
 * Close the sidebar
 */
export function closeSidebar(): void {
  if (!isOpen) return;
  
  isOpen = false;
  
  if (sidebarOverlay) {
    sidebarOverlay.classList.remove('visible');
  }
  if (sidebarPanel) {
    sidebarPanel.classList.remove('open');
  }
}

/**
 * Toggle the sidebar open/closed
 */
export function toggleSidebar(): void {
  if (isOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

/**
 * Check if sidebar is currently open
 */
export function isSidebarOpen(): boolean {
  return isOpen;
}

/**
 * Fetch all discovered books from the API
 */
async function fetchBooks(): Promise<void> {
  if (isLoading) return;
  
  isLoading = true;
  renderCurrentTab();
  
  try {
    const response = await fetch('/api/books');
    const data: BooksResponse = await response.json();
    
    books = data.books;
    filteredBooks = sortBooksWithCoreFirst(books);
  } catch (error) {
    console.error('Failed to fetch books:', error);
  } finally {
    isLoading = false;
    renderCurrentTab();
  }
}

// The core narrative that should always appear at the top
const CORE_NARRATIVE_SEED = 'The Shape of Time';

/**
 * Sort books with "The Shape of Time" always at the top
 */
function sortBooksWithCoreFirst(bookList: DiscoveredBook[]): DiscoveredBook[] {
  return [...bookList].sort((a, b) => {
    const aIsCore = a.seed === CORE_NARRATIVE_SEED;
    const bIsCore = b.seed === CORE_NARRATIVE_SEED;
    
    if (aIsCore && !bIsCore) return -1;
    if (!aIsCore && bIsCore) return 1;
    return 0; // Keep original order for non-core books
  });
}

/**
 * Filter books based on search query
 */
function filterBooks(): void {
  const query = searchQuery.toLowerCase().trim();
  
  if (!query) {
    filteredBooks = sortBooksWithCoreFirst(books);
  } else {
    const filtered = books.filter(book => 
      book.seed.toLowerCase().includes(query)
    );
    filteredBooks = sortBooksWithCoreFirst(filtered);
  }
  
  renderCurrentTab();
}

/**
 * Format a relative time string
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
}

/**
 * Render content based on current tab
 */
function renderCurrentTab(): void {
  if (currentTab === 'favorites') {
    renderFavoritesList();
  } else {
    renderBooksList();
  }
}

/**
 * Render the books list
 */
function renderBooksList(): void {
  if (!booksList) return;
  
  if (isLoading) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">${BOOKMARK_OUTLINE_SVG}</div>
        <p>Loading the library...</p>
      </div>
    `;
    return;
  }
  
  if (books.length === 0) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">${BOOKMARK_OUTLINE_SVG}</div>
        <p>The library awaits...</p>
        <p class="sidebar-empty-hint">No books have been discovered yet. Begin reading to explore.</p>
      </div>
    `;
    return;
  }
  
  if (filteredBooks.length === 0) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">${BOOKMARK_OUTLINE_SVG}</div>
        <p>No books found</p>
        <p class="sidebar-empty-hint">Try a different search term</p>
      </div>
    `;
    return;
  }
  
  const booksHtml = filteredBooks.map(book => {
    const visited = hasVisitedBook(book.seed);
    const hasFavorites = bookHasFavorites(book.seed);
    const highestRead = visited ? getHighestVisitedPage(book.seed) : 0;
    
    const visitedClass = visited ? 'visited' : '';
    const bookmarkIcon = visited ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG;
    
    // Build meta text
    let metaText = `${book.pageCount} page${book.pageCount === 1 ? '' : 's'}`;
    if (visited && highestRead > 0) {
      metaText += ` · read to p.${highestRead}`;
    }
    if (hasFavorites) {
      metaText += ` ${STAR_SVG}`;
    }
    
    return `
      <button class="sidebar-book ${visitedClass}" data-seed="${escapeAttr(book.seed)}">
        <div class="sidebar-book-indicator">${bookmarkIcon}</div>
        <div class="sidebar-book-content">
          <div class="sidebar-book-title">${escapeHtml(book.seed)}</div>
          <div class="sidebar-book-meta">${metaText}</div>
        </div>
      </button>
    `;
  }).join('');
  
  booksList.innerHTML = booksHtml;
  
  // Attach click handlers
  attachBookClickHandlers();
}

/**
 * Render favorites list
 */
function renderFavoritesList(): void {
  if (!booksList) return;
  
  const favorites = getFavorites();
  
  // Apply search filter if there's a query
  const filteredFavorites = searchQuery
    ? favorites.filter(fav => fav.seed.toLowerCase().includes(searchQuery.toLowerCase()))
    : favorites;
  
  if (favorites.length === 0) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">${BOOKMARK_OUTLINE_SVG}</div>
        <p>No favorites yet</p>
        <p class="sidebar-empty-hint">Click the bookmark icon on any page to save it here.</p>
      </div>
    `;
    return;
  }
  
  if (filteredFavorites.length === 0) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">${BOOKMARK_OUTLINE_SVG}</div>
        <p>No favorites match</p>
        <p class="sidebar-empty-hint">Try a different search term</p>
      </div>
    `;
    return;
  }
  
  const favoritesHtml = filteredFavorites.map(fav => `
    <button class="sidebar-book sidebar-favorite" data-seed="${escapeAttr(fav.seed)}" data-page="${fav.page}">
      <div class="sidebar-book-indicator">${BOOKMARK_FILLED_SVG}</div>
      <div class="sidebar-book-content">
        <div class="sidebar-book-title">${escapeHtml(fav.seed)}</div>
        <div class="sidebar-book-meta">Page ${fav.page} · saved ${formatRelativeTime(new Date(fav.timestamp).toISOString())}</div>
      </div>
    </button>
  `).join('');
  
  booksList.innerHTML = favoritesHtml;
  
  // Attach click handlers for favorites (navigate to specific page)
  attachFavoriteClickHandlers();
}

/**
 * Attach click handlers to book buttons
 */
function attachBookClickHandlers(): void {
  if (!booksList) return;
  
  const bookButtons = booksList.querySelectorAll('.sidebar-book:not(.sidebar-favorite)');
  bookButtons.forEach(button => {
    button.addEventListener('click', () => {
      const seed = (button as HTMLElement).dataset.seed;
      if (seed && bookSelectHandler) {
        bookSelectHandler(seed);
        closeSidebar();
      }
    });
  });
}

/**
 * Attach click handlers to favorite buttons (navigates to specific page)
 */
function attachFavoriteClickHandlers(): void {
  if (!booksList) return;
  
  const favButtons = booksList.querySelectorAll('.sidebar-favorite');
  favButtons.forEach(button => {
    button.addEventListener('click', () => {
      const seed = (button as HTMLElement).dataset.seed;
      const page = parseInt((button as HTMLElement).dataset.page || '1', 10);
      if (seed && favoriteSelectHandler) {
        favoriteSelectHandler(seed, page);
        closeSidebar();
      } else if (seed && bookSelectHandler) {
        // Fallback to book handler (goes to page 1)
        bookSelectHandler(seed);
        closeSidebar();
      }
    });
  });
}

/**
 * Handler for when a favorite page is selected
 */
let favoriteSelectHandler: ((seed: string, page: number) => void) | null = null;

/**
 * Register a handler for when a favorited page is selected
 */
export function onFavoriteSelect(handler: (seed: string, page: number) => void): void {
  favoriteSelectHandler = handler;
}

/**
 * Switch to a different tab
 */
function switchTab(tab: 'all' | 'favorites'): void {
  if (currentTab === tab) return;
  
  currentTab = tab;
  
  // Update tab button states
  const tabs = tabsContainer?.querySelectorAll('.sidebar-tab');
  tabs?.forEach(tabEl => {
    const tabName = (tabEl as HTMLElement).dataset.tab;
    if (tabName === tab) {
      tabEl.classList.add('active');
    } else {
      tabEl.classList.remove('active');
    }
  });
  
  // Re-render the list
  renderCurrentTab();
}

/**
 * Create the sidebar DOM elements
 */
function createSidebarElements(): void {
  // Create overlay
  sidebarOverlay = document.createElement('div');
  sidebarOverlay.id = 'sidebar-overlay';
  sidebarOverlay.className = 'sidebar-overlay';
  
  // Create panel
  sidebarPanel = document.createElement('div');
  sidebarPanel.id = 'sidebar-panel';
  sidebarPanel.className = 'sidebar-panel';
  
  sidebarPanel.innerHTML = `
    <div class="sidebar-header">
      <h2 class="sidebar-title">The Library</h2>
      <button class="sidebar-close" aria-label="Close library">✕</button>
    </div>
    <div class="sidebar-tabs" id="sidebar-tabs">
      <button class="sidebar-tab active" data-tab="all">All Books</button>
      <button class="sidebar-tab" data-tab="favorites">
        ${BOOKMARK_FILLED_SVG}
        <span>Favorites</span>
      </button>
    </div>
    <div class="sidebar-search">
      <input 
        type="text" 
        id="sidebar-search-input"
        class="sidebar-search-input" 
        placeholder="Search the library..."
      />
      <button class="sidebar-search-clear" aria-label="Clear search">✕</button>
    </div>
    <div class="sidebar-divider"></div>
    <div id="sidebar-books-list" class="sidebar-books-list"></div>
  `;
  
  // Add to DOM
  document.body.appendChild(sidebarOverlay);
  document.body.appendChild(sidebarPanel);
  
  // Get references to created elements
  searchInput = document.getElementById('sidebar-search-input') as HTMLInputElement;
  booksList = document.getElementById('sidebar-books-list');
  tabsContainer = document.getElementById('sidebar-tabs');
}

/**
 * Create the trigger button
 */
function createTriggerButton(): void {
  triggerButton = document.createElement('button');
  triggerButton.id = 'sidebar-trigger';
  triggerButton.className = 'sidebar-trigger';
  triggerButton.setAttribute('aria-label', 'Open library');
  triggerButton.innerHTML = `
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
  `;
  
  document.body.appendChild(triggerButton);
}

/**
 * Attach event listeners
 */
function attachEventListeners(): void {
  // Trigger button click
  triggerButton?.addEventListener('click', () => {
    toggleSidebar();
  });
  
  // Overlay click to close
  sidebarOverlay?.addEventListener('click', () => {
    closeSidebar();
  });
  
  // Close button click
  const closeButton = sidebarPanel?.querySelector('.sidebar-close');
  closeButton?.addEventListener('click', () => {
    closeSidebar();
  });
  
  // Tab buttons
  const tabButtons = tabsContainer?.querySelectorAll('.sidebar-tab');
  tabButtons?.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab as 'all' | 'favorites';
      if (tabName) {
        switchTab(tabName);
      }
    });
  });
  
  // Search input
  searchInput?.addEventListener('input', (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    filterBooks();
    
    // Show/hide clear button
    const clearButton = sidebarPanel?.querySelector('.sidebar-search-clear') as HTMLElement;
    if (clearButton) {
      clearButton.style.display = searchQuery ? 'block' : 'none';
    }
  });
  
  // Search clear button
  const searchClearButton = sidebarPanel?.querySelector('.sidebar-search-clear');
  searchClearButton?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      searchQuery = '';
      filterBooks();
      searchInput.focus();
      
      // Hide clear button
      (searchClearButton as HTMLElement).style.display = 'none';
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape to close
    if (e.key === 'Escape' && isOpen) {
      closeSidebar();
      e.preventDefault();
    }
    
    // 'L' to toggle (when not typing in an input)
    if (e.key === 'l' && !isInputFocused()) {
      toggleSidebar();
      e.preventDefault();
    }
  });
}

/**
 * Check if an input element is currently focused
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLInputElement || 
         activeElement instanceof HTMLTextAreaElement;
}

/**
 * Bookmark SVG icon (filled) - for visited books
 */
const BOOKMARK_FILLED_SVG = `<svg class="bookmark-icon bookmark-filled" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 2a2 2 0 0 0-2 2v18l8-3 8 3V4a2 2 0 0 0-2-2H6z"/>
</svg>`;

/**
 * Bookmark SVG icon (outline) - for unvisited books
 */
const BOOKMARK_OUTLINE_SVG = `<svg class="bookmark-icon bookmark-outline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 2a2 2 0 0 0-2 2v18l8-3 8 3V4a2 2 0 0 0-2-2H6z"/>
</svg>`;

/**
 * Star SVG icon - for favorites indicator
 */
const STAR_SVG = `<svg class="star-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
</svg>`;

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape attribute value
 */
function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

