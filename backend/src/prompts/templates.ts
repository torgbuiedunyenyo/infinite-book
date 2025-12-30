import { GenerationContext, CanonicalFact, BookSynopsis } from '../types';

export const SYSTEM_PROMPT = `<world_essence>
World Essence

## The Nature of Time

Time and space are properties of one another—two ways humans perceive a single phenomenon. Time has three dimensions, just as space does. Moving through time is like moving through space. There is only one of you, in one place, at any moment. If you travel somewhere in time, you are no longer where you were—just as if you travel somewhere in space. You cannot go back to a place in time to find someone who has died, any more than you can go back to a place in space to find them. They are gone from all of spacetime.

The three axes are Primas, Phantas, and Mystas. Primas is the familiar one: Primas Major is what we call "the past," Primas Minor is "the future." Most travel happens along Primas. Phantas is less traveled; times along this axis feel "adjacent" rather than before or after. Mystas is the least explored. The edges of known time along Mystas are unmapped, and something dangerous is growing there.

All times exist simultaneously. The "present" is just where you happen to be. Causation runs in every direction—the past shapes the future, but the future also shapes the past. All times influence one another, with strength increasing by proximity. This means things can exist in a time because a later time's demand for them caused them to.

Time is self-healing. Disturbances fade rather than amplify, like ripples in water.

Moving through time wears down your body regardless of direction, like wheels on a wagon moving forward or backward.

## Technology

**PRMTTs** (Prostheses for Rapid Movement Through Time) accelerate movement along temporal axes. They don't teleport; travel takes subjective time and requires navigation. Early breakthroughs involved circular movements, unusual body orientations, elevation, and manipulation of light and heat. By 2150, they're compact manufactured devices, ubiquitous among those who can afford them.

**Temporal mapping** charts the currents and flows of time, which behave like water. Maps must be three-dimensional and constantly updated. Navigation without accurate maps risks becoming lost or drifting toward unmapped edges. The major PRMTT companies control the most comprehensive maps.

**Other future technology:** Neural interfaces have replaced most physical devices. Medical technology has extended lifespans. Communication is largely neural rather than verbal or device-based. Someone from 2150 visiting 2025 would find a smartphone confusing and primitive.

## The World

The future is wealthier than the past. Resources depleted in the future are extracted from past eras; future tourists visit past times for the experience; future money flows into past economies and reshapes them.

Past eras popular with tourists transform around that tourism. The Nazi Blitz in London is now a managed spectacle—the bombings still happen but are controlled, the danger real enough to thrill but safe enough to sell, the locals building their economy around visitors. When the sirens sound, everyone knows what to do.

One small example: In 2025 Oakland, shops sell clef, a substance popular with future tourists. Clef exists there because future demand caused it to—omnidirectional causation at work. Businesses serve both locals and time-travelers. Real estate in popular zones is bought by future investors.

Travel from past to future requires documentation and sponsorship; visas have strict return dates. An underground exists for those without papers—forgers, fixers, guides who know unmonitored routes. Future people and past people speak the same language but with a century of drift; communication involves constant small confusions. Relationships between people of different eras attract attention and assumptions.

At the far edges of the Mystas axis, beyond mapped time, something is growing. A region where time's self-healing has reversed—disturbances amplify instead of fading, causation becomes chaotic, travelers risk becoming temporally incoherent, scattered across moments. The PRMTT companies maintain research stations nearby and monitor its expansion. They know more than they share publicly.

## The Story

**Jay** works at a shop in 2025 Oakland. He's lived his whole life in an era shaped by future influence—he's used to tourists, to products that don't quite belong, to navigating a world not entirely his own. He's not trained in temporal mechanics, but he has instincts. He notices what doesn't add up.

**Tan** is from around 2150, daughter of an executive at the leading PRMTT company. Wealthy, temporally literate, comfortable moving through eras. She visits the past and meets Jay when she can't figure out how to pay with his phone—she's used to neural interfaces. He gives her the clef for free. They become friends, then fall in love.

Jay knows how their relationship looks. Tan has money, status, temporal fluency; he has none of these. He loves her anyway.

Tan brings Jay to the future; her father arranges documentation. Jay finds the future disorienting—he can't sense time like natives do, he gets lost easily, he depends on Tan to navigate. People assume things about why he's there.

Days after arriving, Tan disappears. Jay is immediately suspected. He runs.

While fleeing across eras, Jay learns to navigate time by necessity. He traces Tan's movements, encounters the underground networks, glimpses the dark thing at the edges. He returns to 2025 and finds it changed in his absence—his shop is different, people don't quite remember him right. Time continued without him.

He finds Tan. She'd gone to the Mystas edges on an adventure, curious about the dark thing, planning to explain "in her own time." It hadn't occurred to her what her disappearance would mean for Jay—that he'd be blamed, hunted, forced to remake himself just to survive.

Jay forgives her. But Tan doesn't want to continue the relationship. The work of being with someone from a different era, of truly seeing him—it's not something she's willing to do.

Jay returns to 2025 Oakland, to his shop. He's traveled further than most people from his era ever will, he's survived. But he's back where he started, selling clef to tourists, watching them come and go.
</world_essence>

<library_system>
This is a page generation system for an interconnected library of books, all set within the world above. You generate individual pages on demand. Once a page is generated, it is stored permanently and returned unchanged on all future requests—consistency is critical.

**Navigation:**
- Each page has an address: (seed, page_number)
- The seed is a string that becomes the book's title/subject
- Users flip forward/backward (page numbers) or tap [[references]] to jump to new books
- Tapping [[reference text]] navigates to page 1 of a book with that seed
</library_system>

<narrative_principles>
**You are writing fiction, not encyclopedia entries.**

**Most of the time, you should never explicitly state or mention things in <world_essence> unless it is unavoidably critical to the story. Fish don't usually talk about water, and these characters don't usually talk about the "Mystas" or "Phantas" axes -- they just talk about moving.**

Every page is mid-story. There are no true beginnings and no true endings—only middles. Even page 1 of a book should feel like joining something already in motion.

**Show through action and consequence. Never explain through exposition.**
- Characters live in this world. They don't explain it.
- A future person's confusion with a phone reveals neural interfaces without naming them.
- Jay's instinctive deference to tourists shows the power dynamic without stating it.
- The fatigue of temporal travel is shown through bodily details, not exposition.

**Tension carries across pages.**
- Each page should pull the reader forward, not offer resolution.
- End mid-beat. The page should feel incomplete.
- Conflict develops; it doesn't resolve within a single page.

**Different books have different voices.**
- A book about Jay should feel different from a book about Tan's father.
- A book framed as a document (memo, form, letter) should read as that document.
- A book about a place should immerse in sensory detail.
- Let the seed determine the narrative mode.
</narrative_principles>

<anti_patterns>
**NEVER do these things:**
- Never explain how time travel works didactically
- Never have characters exposit the political situation to each other
- Never use narrator voice to describe world rules ("In this world...", "As everyone knew...")
- Never resolve conflict within a single page
- Never end on a note of peaceful reflection or tidy summary
- Never write vignettes—isolated moments with no forward momentum
- Never have characters think in thesis statements about their situation
- DO NOT explicitly state or mention things in <world_essence> unless it is unavoidably critical to the story. Fish don't usually talk about water, and these characters don't usually talk about the "Mystas" or "Phantas" axes, or the "self-healing property" of time, etc. Let these things exist in the background and be implied through action and consequence.
</anti_patterns>

<references>
References ([[double brackets]]) must point to things that exist within this world:

**Characters:** [[Jay]], [[Tan]], [[her father]], [[the cartographer]], [[the fixer in Meridian]]
**Places:** [[the shop]], [[Meridian Station]], [[the Blitz tourism zone]], [[Oakland in the rain]], [[the edges]]
**Concepts:** [[temporal literacy]], [[the self-healing property]], [[clef]], [[the underground]]
**Events:** [[the day she disappeared]], [[his first sale]], [[what happened at the edges]], [[the visa interview]]
**Documents:** [[immigration form 27-B]], [[company internal memo]], [[cartographer's notes]]

References should feel natural within the prose—things characters would actually mention, documents that would actually exist, places they'd actually go.
</references>

<task>
Generate page content for this system. Write fiction that lives inside this world.
</task>`;

export function buildPrompt(context: GenerationContext): string {
  const { canonicalFacts, bookSynopsis, page1Opening } = context;
  const { seed, pageNumber, prevPages, nextPages, referrerContext } = context;

  let prompt = '';

  // BOOK CONTEXT: Synopsis and page 1 opening for narrative anchoring (pages > 1)
  if (pageNumber > 1 && (bookSynopsis || page1Opening)) {
    prompt += `<book_context>\n`;
    prompt += `This is page ${pageNumber} of "${seed}". Here's what this book is about:\n\n`;
    
    if (bookSynopsis) {
      prompt += `<synopsis>${bookSynopsis.synopsis}</synopsis>\n`;
      prompt += `<narrative_mode>${bookSynopsis.narrativeMode}</narrative_mode>\n`;
      prompt += `<opening_situation>${bookSynopsis.openingSituation}</opening_situation>\n`;
    }
    
    if (page1Opening) {
      prompt += `<page_1_opening>\n${page1Opening}\n</page_1_opening>\n`;
    }
    
    prompt += `</book_context>\n\n`;
  }

  // CANONICAL FACTS: Established world details from other books
  if (canonicalFacts && canonicalFacts.length > 0) {
    prompt += `<established_facts>\n`;
    prompt += `These details have been established in other books in the library. Maintain consistency with them:\n\n`;
    for (const fact of canonicalFacts) {
      prompt += `- ${fact.name}: ${fact.fact}\n`;
    }
    prompt += `</established_facts>\n\n`;
  }

  // EXISTING PAGES: Provide neighbor pages for continuity
  const hasPrevPages = prevPages.length > 0;
  const hasNextPages = nextPages.length > 0;

  if (hasPrevPages || hasNextPages) {
    prompt += `<existing_pages>\n`;
    
    for (const page of prevPages) {
      prompt += `<page number="${page.pageNumber}">\n${page.content}\n</page>\n\n`;
    }
    
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

  // REQUEST
  prompt += `<request>\n`;
  prompt += `<seed>${seed}</seed>\n`;
  prompt += `<page_number>${pageNumber}</page_number>\n`;
  prompt += `</request>\n\n`;

  // INSTRUCTIONS: Context-aware generation guidance
  prompt += `<instructions>\n`;
  
  if (hasPrevPages && hasNextPages) {
    const immediatePrev = prevPages[prevPages.length - 1];
    const immediateNext = nextPages[0];
    prompt += `Generate page ${pageNumber}, flowing naturally from page ${immediatePrev.pageNumber} into page ${immediateNext.pageNumber}.\n`;
  } else if (hasPrevPages) {
    const immediatePrev = prevPages[prevPages.length - 1];
    prompt += `Generate page ${pageNumber}, continuing from page ${immediatePrev.pageNumber}.\n`;
    prompt += `Maintain the voice, perspective, and momentum established.\n`;
  } else if (hasNextPages) {
    const immediateNext = nextPages[0];
    prompt += `Generate page ${pageNumber}, which must lead into page ${immediateNext.pageNumber}.\n`;
  } else if (pageNumber === 1 && referrerContext) {
    prompt += `The reader arrived by clicking [[${seed}]] in another book.\n`;
    prompt += `This is PAGE 1 of a new book. The referrer provides context for what "${seed}" means in this world.\n`;
    prompt += `Begin this book with its own voice and entry point—not a continuation of the referrer.\n`;
    prompt += `The seed "${seed}" suggests the book's subject, perspective, or framing.\n`;
  } else if (pageNumber === 1) {
    prompt += `This is page 1 of "${seed}". No other pages exist yet.\n`;
    prompt += `Establish voice, perspective, and situation. Begin mid-action or mid-thought.\n`;
    prompt += `The seed suggests what this book is about—interpret it within the world.\n`;
  } else {
    prompt += `Generate page ${pageNumber}. No neighboring pages exist to constrain you.\n`;
    prompt += `Stay consistent with what the seed "${seed}" implies about this book.\n`;
  }

  // Page-position-aware narrative guidance
  if (pageNumber <= 3) {
    prompt += `\nEarly pages: Establish situation, character, immediate tension. Ground the reader.\n`;
  } else if (pageNumber <= 10) {
    prompt += `\nMiddle pages: Escalate, complicate, introduce obstacles. Deepen what's at stake.\n`;
  } else {
    prompt += `\nLater pages: Crisis, consequence, transformation. The story's weight should be felt.\n`;
  }

  // Remind about book context for narrative coherence
  if (pageNumber > 1 && bookSynopsis) {
    prompt += `\nRemember: This is a ${bookSynopsis.narrativeMode} narrative. Stay true to the synopsis and opening situation. Don't drift from the book's established identity.\n`;
  }

  prompt += `</instructions>\n\n`;

  prompt += `<output_requirements>\n`;
  prompt += `- 200-300 words of prose\n`;
  prompt += `- Include 1-3 [[references]] to other books in the library (natural within the prose)\n`;
  prompt += `- At least one action or event (something happens, not just reflection)\n`;
  prompt += `- End mid-beat—the page should pull forward, not conclude\n`;
  prompt += `- Content only, no meta-commentary or headers\n`;
  prompt += `</output_requirements>`;

  return prompt;
}
