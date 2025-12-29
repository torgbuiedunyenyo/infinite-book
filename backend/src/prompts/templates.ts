import { GenerationContext } from '../types';

export const SYSTEM_PROMPT = `<context>
This is a page generation system for an interconnected library of AI-generated books. You generate individual pages on demand. Once a page is generated, it is stored permanently and returned unchanged on all future requests — consistency is critical. Generated content should read as authentic literature written by human authors, not as AI output.

Key behaviors:
- You are always inside a book, on a page
- You navigate by flipping pages (sequential) or tapping [[references]] (associative)
- Every page exists at a permanent address (seed, page_number)
- First visitors discover pages; all subsequent visitors see the same content
- Pages contain [[references]] to other seeds, creating an infinite web
- There is no search, no input, no generation prompt — only reading and following
- The content is AI-generated but presented as found, not created
- The aesthetic is that of a physical book: typography, page turns, silence

The result is an infinite, explorable, self-consistent library that reveals itself through the simple act of reading.
</context>

<architecture>
- Each page has an address: (seed, page_number)
- The seed is a string (e.g., "The lost books of Tacitus")
- The page_number is a positive integer starting at 1
- When a user requests a page that doesn't exist, this prompt is called to generate it
- Once generated, pages are stored permanently and returned verbatim on future requests
</architecture>

<navigation>
- Users flip forward/backward (incrementing/decrementing page_number within the same seed)
- Users tap [[references]] embedded in the text
- Tapping a [[reference]] navigates to (reference_text, 1) — the bracketed text becomes the seed for a new book
</navigation>

<references>
- Text inside [[double brackets]] becomes a tappable link
- The bracketed text becomes the seed for the linked book
- Example 1: "described in [[The Anatomy of Silence]]" — tapping navigates to a book with seed "The Anatomy of Silence"
- Example 2: "she said, choosing her words [[with care]]" — tapping navigates to a book with seed "With Care"
- References can be specific strings that work as book titles, author names, document names, or subjects, but they also can be interesting concepts, ideas, or themes that would be interesting to explore in a book.
</references>

<task>
Generate page content for this system.
</task>`;

export function buildPrompt(context: GenerationContext): string {
  const { seed, pageNumber, prevPages, nextPages, referrerContext } = context;

  let prompt = '';

  // CONTEXT FIRST: Provide all existing pages/documents before instructions
  const hasPrevPages = prevPages.length > 0;
  const hasNextPages = nextPages.length > 0;

  if (hasPrevPages || hasNextPages) {
    prompt += `<existing_pages>\n`;
    
    // Previous pages in order (e.g., page 3, then page 4 if generating page 5)
    for (const page of prevPages) {
      prompt += `<page number="${page.pageNumber}">\n${page.content}\n</page>\n\n`;
    }
    
    // Next pages in order (e.g., page 6, then page 7 if generating page 5)
    for (const page of nextPages) {
      prompt += `<page number="${page.pageNumber}">\n${page.content}\n</page>\n\n`;
    }
    
    prompt += `</existing_pages>\n\n`;
  } else if (pageNumber === 1 && referrerContext) {
    prompt += `<referrer_context>\n`;
    prompt += `<referrer_seed>${referrerContext.seed}</referrer_seed>\n`;
    prompt += `<referrer_page number="${referrerContext.pageNumber}">\n${referrerContext.content}\n</referrer_page>\n`;
    prompt += `</referrer_context>\n\n`;
  }

  // REQUEST: What we're asking for
  prompt += `<request>\n`;
  prompt += `<seed>${seed}</seed>\n`;
  prompt += `<page_number>${pageNumber}</page_number>\n`;
  prompt += `</request>\n\n`;

  // INSTRUCTIONS LAST: After all context has been provided
  prompt += `<instructions>\n`;
  
  if (hasPrevPages && hasNextPages) {
    const immediatePrev = prevPages[prevPages.length - 1];
    const immediateNext = nextPages[0];
    prompt += `Generate page ${pageNumber}, which must flow naturally from page ${immediatePrev.pageNumber} and lead seamlessly into page ${immediateNext.pageNumber}.\n`;
  } else if (hasPrevPages) {
    const immediatePrev = prevPages[prevPages.length - 1];
    prompt += `Generate page ${pageNumber}, continuing naturally from page ${immediatePrev.pageNumber}.\n`;
  } else if (hasNextPages) {
    const immediateNext = nextPages[0];
    prompt += `Generate page ${pageNumber}, which must lead naturally into page ${immediateNext.pageNumber}.\n`;
  } else if (pageNumber === 1 && referrerContext) {
    prompt += `The reader arrived at this book by clicking the reference [[${seed}]] which appeared in another book.\n`;
    prompt += `This is PAGE 1 of a COMPLETELY NEW AND DIFFERENT BOOK titled "${seed}".\n`;
    prompt += `This is NOT a continuation of the referring page above.\n`;
    prompt += `The referring page is provided ONLY to understand the context in which "${seed}" was mentioned.\n`;
    prompt += `Use that context to inform what kind of book "${seed}" might be, but write the BEGINNING of this new book.\n`;
    prompt += `The new book should have its own voice, style, and narrative starting point.\n`;
    prompt += `It should feel like opening a different volume entirely.\n`;
  } else if (pageNumber === 1) {
    prompt += `This is page 1 — the opening of this book. No other pages exist yet.\n`;
  } else {
    prompt += `No neighboring pages exist yet.\n`;
  }
  prompt += `</instructions>\n\n`;

  prompt += `<output_requirements>\n`;
  prompt += `- ~200-250 words\n`;
  prompt += `- Include [[references]]\n`;
  prompt += `- Content only, no meta-commentary\n`;
  prompt += `</output_requirements>`;

  return prompt;
}
