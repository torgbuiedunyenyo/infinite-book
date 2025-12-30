export interface Reference {
  text: string;
  seed: string;
}

export interface PageData {
  seed: string;
  pageNumber: number;
  content: string;
  references: Reference[];
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

