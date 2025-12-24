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

