import { DiscoveredBook, BooksResponse } from './types';

// Sidebar state
let isOpen = false;
let books: DiscoveredBook[] = [];
let filteredBooks: DiscoveredBook[] = [];
let searchQuery = '';
let isLoading = false;
let bookSelectHandler: ((seed: string) => void) | null = null;

// DOM elements (created dynamically)
let sidebarOverlay: HTMLElement | null = null;
let sidebarPanel: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let booksList: HTMLElement | null = null;
let triggerButton: HTMLElement | null = null;

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
  
  // Fetch books if we haven't already
  if (books.length === 0) {
    await fetchBooks();
  }
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
  renderBooksList();
  
  try {
    const response = await fetch('/api/books');
    const data: BooksResponse = await response.json();
    
    books = data.books;
    filteredBooks = books;
  } catch (error) {
    console.error('Failed to fetch books:', error);
  } finally {
    isLoading = false;
    renderBooksList();
  }
}

/**
 * Filter books based on search query
 */
function filterBooks(): void {
  const query = searchQuery.toLowerCase().trim();
  
  if (!query) {
    filteredBooks = books;
  } else {
    filteredBooks = books.filter(book => 
      book.seed.toLowerCase().includes(query)
    );
  }
  
  renderBooksList();
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
 * Render the books list
 */
function renderBooksList(): void {
  if (!booksList) return;
  
  if (isLoading) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">📚</div>
        <p>Loading the library...</p>
      </div>
    `;
    return;
  }
  
  if (books.length === 0) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">📖</div>
        <p>The library awaits...</p>
        <p class="sidebar-empty-hint">No books have been discovered yet. Begin reading to explore.</p>
      </div>
    `;
    return;
  }
  
  if (filteredBooks.length === 0) {
    booksList.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">🔍</div>
        <p>No books found</p>
        <p class="sidebar-empty-hint">Try a different search term</p>
      </div>
    `;
    return;
  }
  
  const booksHtml = filteredBooks.map(book => `
    <button class="sidebar-book" data-seed="${escapeAttr(book.seed)}">
      <div class="sidebar-book-title">${escapeHtml(book.seed)}</div>
      <div class="sidebar-book-meta">
        ${book.pageCount} page${book.pageCount === 1 ? '' : 's'} · discovered ${formatRelativeTime(book.firstDiscoveredAt)}
      </div>
    </button>
  `).join('');
  
  booksList.innerHTML = booksHtml;
  
  // Attach click handlers
  const bookButtons = booksList.querySelectorAll('.sidebar-book');
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
    <div class="sidebar-footer">
      <span id="sidebar-stats"></span>
    </div>
  `;
  
  // Add to DOM
  document.body.appendChild(sidebarOverlay);
  document.body.appendChild(sidebarPanel);
  
  // Get references to created elements
  searchInput = document.getElementById('sidebar-search-input') as HTMLInputElement;
  booksList = document.getElementById('sidebar-books-list');
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

/**
 * Refresh the books list (call after navigating to a new book)
 */
export async function refreshBooks(): Promise<void> {
  if (isOpen) {
    books = [];
    await fetchBooks();
  } else {
    // Clear cache so next open will refetch
    books = [];
  }
}

