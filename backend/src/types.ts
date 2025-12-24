export interface Page {
  id?: number;
  seed: string;
  pageNumber: number;
  content: string;
  opening: string;
  closing: string;
  references: Reference[];
  discoveredAt?: Date;
}

export interface Reference {
  text: string;
  seed: string;
}

export interface GenerationContext {
  seed: string;
  pageNumber: number;
  prevPages: Page[];
  nextPages: Page[];
  referrerContext?: {
    seed: string;
    pageNumber: number;
    content: string;
  };
}

export interface NeighborPages {
  prev: Page[];
  next: Page[];
}

export interface GetOrGenerateResult {
  page: Page;
  isNewDiscovery: boolean;
}
