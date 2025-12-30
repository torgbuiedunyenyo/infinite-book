export interface Reference {
  text: string;
  seed: string;
}

export interface Citation {
  id: number;
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  author?: string;
}

export interface PageData {
  seed: string;
  pageNumber: number;
  content: string;
  references: Reference[];
  citations: Citation[];  // Kept for backwards compatibility with existing database records
  discoveredAt: string;
  isNewDiscovery: boolean;
}

export interface DiscoveredBook {
  seed: string;
  pageCount: number;
  firstDiscoveredAt: string;
  lastDiscoveredAt: string;
}

export interface BooksResponse {
  books: DiscoveredBook[];
  totalBooks: number;
  totalPages: number;
}
