CREATE TABLE pages (
    id SERIAL PRIMARY KEY,
    seed TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    opening TEXT NOT NULL,
    closing TEXT NOT NULL,
    "references" JSONB DEFAULT '[]'::jsonb,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_seed_page UNIQUE (seed, page_number)
);

CREATE INDEX idx_pages_seed ON pages(seed);
CREATE INDEX idx_pages_seed_page ON pages(seed, page_number);
