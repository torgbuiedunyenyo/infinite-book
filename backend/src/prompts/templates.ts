import { GenerationContext, CanonicalFact, BookArc, ChunkSummary, RunningSummary } from '../types';

// ==================== CORE NARRATIVE ====================

export const CORE_NARRATIVE_SEED = "The Shape of Time";

export const CORE_NARRATIVE_ARC: BookArc = {
  seed: "The Shape of Time",
  narrativeArc: `### Part One: Meeting and Courtship (2025)

Jay and Tan meet in his shop. She's confused by the phone; he gives her the clef for free. She keeps coming back. They become friends, then more. The relationship develops against the backdrop of Oakland's future-saturated economy—the tourists, the clef sales, the constant awareness of the wealth gap between eras.

Jay falls in love with Tan. Tan falls in love with Jay, or something like it. Both are aware of how their relationship looks from the outside. Both proceed anyway.

### Part Two: Arrival in the Future

Tan wants Jay to see her world. Her father arranges documentation. They travel to the future together.

Jay's experience of the future is disorienting. The technology is unfamiliar, the social cues are different, the layout of cities follows patterns he doesn't understand. He depends on Tan to navigate.

The social dynamics are worse. Everyone assumes he's with Tan for citizenship, money, status. He's treated as a curiosity at best, a predator at worst. Tan's friends are polite but condescending. Her family is cold.

Jay tries to adapt. He studies temporal mechanics, looks for work that doesn't require skills he doesn't have. Progress is slow and humiliating.

### Part Three: The Disappearance

A few days after their arrival, Tan disappears.

She had been acting strangely in the days before—distracted, excited, secretive. She'd mentioned something about the edges, about wanting to see for herself what was out there. Jay didn't fully understand what she meant.

The night she disappears, she tells Jay she needs to check on something. She'll be back soon. She doesn't say where she's going. She doesn't come back.

Jay reports her missing. Within hours, he's the primary suspect. The investigation focuses entirely on him. His past-person status, his economic motive, his lack of alibi—everything points to him. He's detained, questioned, released under surveillance, then learns that charges are imminent.

He runs.

### Part Four: The Flight and Investigation

Jay flees into the temporal margins—times and routes that aren't heavily monitored, places where past people disappear into the cracks of the system. He makes contact with the underground networks that help temporal immigrants: forgers, fixers, people who know hidden paths through time.

He's not just running; he's investigating. He retraces Tan's final days. He learns about her father's company, about the research stations at the edges, about the expeditions that never returned. He discovers that Tan had been curious about the same things—not out of moral outrage, but out of adventurous interest.

His investigation takes him through multiple eras:

- Back to 2025 Oakland, which has changed in his absence—his shop is different, people don't quite remember him right, the time has continued evolving without him
- To other past eras where the company has operations
- To future times he can access through underground channels
- Eventually, toward the Mystas edges where rumors suggest Tan may have gone

Along the way, he learns to navigate through study and practice. He becomes something he never expected: a competent time traveler, self-taught under pressure.

### Part Five: The Truth

Jay eventually discovers what happened to Tan.

She went to the Mystas edges. Not because she was silenced or kidnapped or caught up in conspiracy—but because she wanted to. She'd learned about the unmapped regions, found them fascinating, and decided to go see for herself. It was an adventure. She had the resources, the training, the equipment. She didn't think to tell anyone because she planned to explain it all when she got back, "in her own time."

She didn't consider what her disappearance would mean for Jay. It didn't occur to her that he would be blamed, hunted, forced to flee through time to clear his name. She wasn't being cruel—she simply didn't think about it. He wasn't real to her in the way she was real to herself.

Jay finds her returning from the edges, or at a station near them. She's fine. She's had an incredible experience. She's excited to tell him about it.

### Part Six: Resolution

Jay has to decide what to do with this.

He's spent weeks or months running, hiding, learning to survive across times. He's been terrified, exhausted, transformed. He's developed skills he never knew he could have. He's seen things about how the world works—about the company's operations, about the future's exploitation of the past—that he can never unsee.

And Tan didn't think about him at all.

He decides to forgive her. Not because what she did was acceptable, but because holding onto anger would cost him more than letting it go. He understands, now, that the gap between them was always larger than he wanted to believe. She cared about him, in her way. But he was never as real to her as she was to him.

They try, briefly, to continue. But Tan doesn't want to do the work. The relationship requires her to see Jay fully, to account for the power between them, to change how she moves through the world. She's not willing. It's easier to let him go.

Jay returns to Oakland, to 2025, to his shop. The time has changed in his absence—it's not quite the place he left—but it's still recognizable. He's different now. He understands things about the structure of the world that most people in his era don't know.

He goes back to work. He sells clef to future tourists. He watches them come and go, knowing what he knows, carrying what he's learned. The edges remain unmapped. The exploitation continues. Nothing has been fixed.`,
  narrativeMode: "character",
};

export const CANONICAL_SEEDS = [CORE_NARRATIVE_SEED];

export const INSET_NARRATIVE_GUIDANCE = `<inset_narrative>
You are generating an inset narrative—a book reached by clicking a [[reference]] in another book. This is a deeper exploration of one element from the world.

Inset narratives:
- Focus on the referenced subject (person, place, concept, event)
- Exist in the same world and obey the same rules
- May or may not feature Jay, Tan, or other known characters
- Must never contradict established facts from any other book
- Add depth to the world; they are not disconnected vignettes

The subject determines the focus. The world remains consistent.
</inset_narrative>`;

// ==================== MODULAR PROMPT COMPONENTS ====================

/**
 * WORLD_ESSENCE: The complete world document.
 * Used by page generation AND extraction services to maintain consistency.
 */
export const WORLD_ESSENCE = `<world_essence>
World Essence

## The Nature of Time

## Core Points: Time and Its Navigation

**Time's True Shape**
Time isn't a one-dimensional arrow pointing from past to future—it has at least three dimensions, just like space. Time and space are inseparable properties of a single thing called "spacetime." The document names these three temporal axes: Primas (the familiar past/future axis), Phantas, and Mystas—each with "Major" and "Minor" directions. The common conception of time as a vector with only one existing moment (the present) is fundamentally wrong. There may be additional dimensions beyond these three, but understanding just these requires substantial effort.

**We're Not the Center**
Just as humanity once wrongly believed Earth was the center of the universe, we wrongly believe the "present" is the center of time. Defining all time relative to our current moment is as absurd as measuring all spatial distances from wherever we happen to stand—imagine saying "Sacramento is 345 miles from me" instead of "Sacramento is 100 miles from San Francisco." This self-centered framework makes time travel seem impossibly complicated, just as believing Earth was flat once made ocean travel seem impossible.

**Other Times Exist Independently**
The past doesn't freeze when we leave it, and the future already exists before we arrive. Times continue evolving whether we occupy them or not. If you leave Sacramento for San Francisco, you wouldn't assume Sacramento freezes in place or that San Francisco doesn't exist until you arrive—yet we make exactly these assumptions about time. This insight resolves classic paradoxes: there's no "two selves" problem because once you leave a moment, you're simply no longer there. If you return, you'll find that time changed in your absence, just as a city would.

**Mutual Causation**
All moments in time influence each other bidirectionally, like molecules of water affecting neighboring molecules in a lake. The future causes the present just as the past does, and effects travel along all temporal axes. Crucially, influence diminishes with distance—time is "self-healing." The dramatic "butterfly effect" of fiction is adolescent fantasy; a stone dropped in a lake creates ripples that fade, not amplify. Times closest to us are most affected by our movements.

**Why It Seems Linear**
Clocks run forward because they're programmed to—writing "12:00" on a wall doesn't determine when the wall actually is. We age not because time flows in one direction, but because movement through time in *any* direction wears down the body, like wagon wheels wearing regardless of direction.

**Practical Navigation**
Effective time travel requires establishing stable reference points outside ourselves and mapping temporal "currents" like ocean flows—a three-dimensional vector field, not static points. Understanding causation must expand to include all temporal directions. Technology for rapid time travel remains primitive; we haven't "invented the wheel" because we didn't believe movement was possible. Early experimentation suggests unusual spatial movements (circular motion, moving backward) and potentially light or heat may accelerate temporal navigation.

## Time Travel Tropes: What's False vs. What's True

### FALSE: Common Tropes That Do Not Apply
IMPORTANT: NEVER USE THESE TROPES IN THE STORY.
**Time loops and repetition**
- Events do not repeat. Tuesday doesn't "happen again."
- You cannot get "stuck" reliving the same day.
- Returning to a time you've visited doesn't mean seeing the same events play out.

**Meeting yourself**
- There is only one of you in all of time, just as there is only one of you in all of space.
- If you leave a moment and return to it, you are not "also" still there from before.
- There are no parallel selves, alternate selves, or duplicate selves.

**Frozen past / non-existent future**
- The past does not freeze when you leave it. It keeps evolving.
- The future already exists before you arrive. It is not created by your arrival.
- No moment is more "real" than any other.

**The butterfly effect**
- Small changes do not cascade into massive consequences.
- Time is self-healing. Disturbances fade with distance, like ripples in water.
- Stepping on a bug does not erase civilizations.

**Paradoxes**
- You cannot prevent your own birth or create logical contradictions.
- There is no "grandfather paradox" because there is no fixed timeline to disrupt.
- Cause and effect flow in all directions; changing something in the past also changes what caused you to go there.

**Mystical/uncanny weirdness**
- Time travel is not eerie, spooky, or metaphysically strange.
- Objects don't flicker in and out of existence.
- Music doesn't skip backward ominously.
- Handwriting doesn't appear from nowhere.
- It's physics, not magic.

**Determinism and fate**
- There is no "meant to happen."
- The future you glimpse from a distance may look different when you arrive.
- Nothing is inevitable.

**The present as special**
- "Now" is not the center of time.
- Your current moment is not more real than other moments.
- Time does not flow toward or away from you.

---

### TRUE: How Time Actually Works

**Time has three dimensions**
- Primas (familiar past/future axis), Phantas, and Mystas.
- Movement is possible along all three, just as spatial movement is possible in three dimensions.

**Times exist independently and keep changing**
- A time you leave continues to evolve without you.
- A time you haven't reached yet is already there, also evolving.
- When you return somewhere, it will be different—not because of paradox, but because time kept moving.

**There is one of you**
- You have a single continuous existence across all of time.
- You cannot encounter yourself because you are only ever where you are.
- When you leave, you're gone from that moment.

**Mutual causation**
- All times influence all other times.
- The future causes the past just as the past causes the future.
- Effects diminish with distance.

**Time is self-healing**
- Disturbances fade, not amplify.
- Big changes nearby, small changes far away.
- No butterfly effects.

**Travel takes time and effort**
- No teleportation. Moving through time is like moving through space.
- You need maps, navigation, technology (PRMTTs).
- You can get lost if you don't know where you're going.

**Times can be unrecognizable**
- You might return to a place and find it changed so much you barely recognize it.
- People might not remember you the way you remember them—not because of paradox, but because their time evolved differently.
- This is ordinary, not spooky. Cities change when you're away too.

**Aging happens in all directions**
- Movement through time wears down the body regardless of direction.
- Going backward doesn't make you younger.
- Like wagon wheels wearing whether rolling forward or backward.

## The World

**PRMTTs** (Prostheses for Rapid Movement Through Time) accelerate movement along temporal axes. They don't teleport; travel takes subjective time and requires navigation. Early breakthroughs involved circular movements, unusual body orientations, elevation, and manipulation of light and heat. Over centuries, they evolved into compact manufactured devices, ubiquitous among those who can afford them.

**Temporal mapping** charts the currents and flows of time, which behave like water. Maps must be three-dimensional and constantly updated. Navigation without accurate maps risks becoming lost or drifting into unmapped regions. The major PRMTT companies control the most comprehensive maps, giving them enormous power over who can travel where and when.

**Other future technology:** Neural interfaces have replaced most physical devices. Medical technology has extended lifespans. Communication is largely neural rather than verbal or device-based. Someone from the future visiting 2025 would find a smartphone confusing and primitive.

There is an ongoing power dynamic between the future and the past. This manifests in several ways:

**Resource extraction:** The future sends operations into the past to extract natural resources and raw materials that have been depleted in their own time. Past governments cooperate; their leaders personally profit while populations bear the costs.

**Tourism:** Wealthy future citizens travel to the past for entertainment and novelty. Entire eras transform around this tourism. The Nazi Blitz in London is now a managed spectacle—the bombings still happen but are controlled, the danger real enough to thrill but safe enough to sell. When the sirens sound, everyone knows what to do.

**Labor and cultural arbitrage:** Services and goods are cheaper in the past. Future companies outsource operations to past eras. Art, music, and cuisine are taken from the past and sold in the future, often without compensation.

In 2025 Oakland, shops sell clef, a mildly relaxing drink popular with future tourists. Clef exists there because future demand caused it to—omnidirectional causation at work. Businesses serve both locals and time-travelers. Real estate in popular zones is bought by future investors. Medical services and infrastructure have been upgraded in tourist areas, creating stark inequalities between zones that attract visitors and those that don't.

**Preservation zones** exist where future influence is restricted—eras kept artificially "pristine" by limiting economic development. These are essentially human zoos, residents kept in relative poverty to maintain the aesthetic tourists want.

**Immigration controls** restrict travel from past to future. Official justifications cite resource scarcity and security concerns. The real reasons: labor market protection, maintaining the wealth differential that makes extraction profitable, and keeping past populations available as a tourism product. Visas require sponsorship and have strict return dates. Overstaying is a serious crime. An underground exists for those without papers—forgers, fixers, guides who know unmonitored routes.

**Temporal prejudice** shapes daily life. Past people in the future face assumptions of economic desperation, cultural backwardness, criminal tendencies. Slurs exist. Relationships between people of different eras attract suspicion—assumed to be transactional. Past people cluster in specific neighborhoods, work specific jobs, exist in legal gray zones even with legitimate documentation.

At the far edges of the Mystas axis lies unmapped territory. The currents there are fast, turbulent, constantly shifting—not more dangerous in principle, but practically treacherous without reliable maps. Travelers risk becoming lost, carried by currents they can't predict toward regions no one has charted. The PRMTT companies maintain research stations nearby, slowly extending their maps. The company that charts the edges first will control access to whatever lies beyond.

## The Core Narrative

The following is THE central story of this library. All books exist within Jay's world. The core narrative follows Jay directly. Inset narratives (books reached via [[references]]) explore other corners of this world—they don't need to feature Jay, but they exist in the same world and must never contradict established facts.

**Jay** works at a shop in 2025 Oakland. He's lived his whole life in an era shaped by future influence—he's used to tourists, to products that don't quite belong, to navigating a world not entirely his own. He's observant. He notices what doesn't add up.

**Tan** is from the future, daughter of an executive at the leading PRMTT company. Wealthy, well-traveled, comfortable moving through eras. She visits the past and meets Jay when she can't figure out how to pay with his phone—she's used to neural interfaces. He gives her the clef for free. They become friends, then fall in love.

Jay knows how their relationship looks. Tan has money, status, access to maps and technology; he has none of these. He loves her anyway.

Tan brings Jay to the future; her father arranges documentation. Jay finds the future disorienting—he doesn't know the technology, the layout, the social cues. He depends on Tan to navigate. People assume things about why he's there. Tan's friends are polite but condescending. Her family is cold.

Days after arriving, Tan disappears. Jay is immediately suspected. He runs.

While fleeing across eras, Jay learns to navigate time through study and necessity. He traces Tan's movements, encounters the underground networks, glimpses the unmapped edges. He returns to 2025 and finds it changed in his absence—his shop is different, people don't quite remember him right. Time continued without him.

He finds Tan. She'd gone to the Mystas edges on an adventure, curious about the unmapped territory, planning to explain "in her own time." It hadn't occurred to her what her disappearance would mean for Jay—that he'd be blamed, hunted, forced to remake himself just to survive. She wasn't cruel; she simply didn't think about it. He wasn't real to her in the way she was real to herself.

Jay forgives her. But Tan doesn't want to continue the relationship. The work of truly seeing someone from a different era, of accounting for the power between them—it's not something she's willing to do.

Jay returns to 2025 Oakland, to his shop. He's traveled further than most people from his era ever will. He's survived. But he's back where he started, selling clef to tourists, watching them come and go.
</world_essence>`;

/**
 * NARRATIVE_CONTEXT: Comprehensive guidance for correctly interpreting fiction in this world.
 * Used by extraction services to avoid misreading relationships, power dynamics, and terminology.
 */
export const NARRATIVE_CONTEXT = `<narrative_context>
## Narrative Style

This fiction follows show-don't-tell principles throughout:
- Characters live in this world; they don't explain its rules
- Relationships are shown through behavior, not stated directly
- Power dynamics are implied through action, deference, and small details
- World-specific terms appear naturally without definition
- The narrator doesn't editorialize or explain social context

When extracting facts, infer from action and behavior, not from what would make sense in our world.

## Interpreting Relationships Across Eras

Power imbalances between people from different times are ECONOMIC and SOCIAL, not familial:
- A future person has wealth, technology access, legal status, and cultural fluency
- A past person lacks these things and may depend on the future person to navigate
- This creates dynamics that can LOOK like parent/child but are NOT
- Deference, dependence, guidance, and protection do not imply family relationships
- Romantic and friendship relationships across eras are common but attract social suspicion
- Observers in-world assume cross-era relationships are transactional (economic, sexual, exploitative)

When you see one character helping, guiding, or having authority over another:
- First consider: are they from different eras?
- If yes: the dynamic is likely economic/social power, not family
- Age differences don't indicate family—future people live longer
- Someone "taking care of" a past person is likely a sponsor, employer, partner, or friend

## Power Dynamics to Recognize

**Future person + past person:** The future person has structural power regardless of personality. They control documentation, money, navigation, and social access. Even kind future people benefit from and perpetuate this system.

**Company employees:** PRMTT companies control temporal maps and travel. Their employees have access others don't. Company politics involve map access, route control, and territorial disputes.

**The underground:** Networks exist for undocumented past people in the future—forgers, fixers, guides. These aren't villains; they're service providers for people the system excludes.

**Preservation zones:** Past eras kept artificially "pristine" for tourism. Residents are effectively trapped in managed poverty. Development is restricted. Leaving is difficult.

## Terminology Reference

- **Clef**: A mildly relaxing drink, popular with future tourists, sold in 2025 Oakland
- **PRMTTs**: Prostheses for Rapid Movement Through Time—compact devices for time travel
- **The edges / Mystas edges**: Unmapped territory at the far reaches of the Mystas temporal axis
- **The currents**: Temporal flows that affect navigation; mapped like ocean currents
- **Neural interfaces**: Future technology replacing phones/devices; operated by thought
- **Visa / documentation**: Legal permission for past people to be in future times
- **The underground**: Networks helping undocumented travelers navigate the future

## Character Archetypes in This World

- **Past locals**: People living in eras shaped by future influence. They're used to tourists, anachronistic products, economic distortion. Some serve tourists; some resent them; most just live their lives.
- **Future tourists**: Wealthy visitors treating the past as entertainment. Range from oblivious to actively exploitative.
- **Company people**: PRMTT employees with map access and institutional power. Corporate culture varies by company.
- **Underground operators**: Fixers, forgers, guides. Morally ambiguous service providers.
- **Edge researchers**: People exploring unmapped Mystas territory. Scientists, adventurers, company scouts.
- **Cross-era partners**: People in relationships across temporal divides. Face social suspicion and structural challenges.

## Known Characters (for reference, not prescription)

When these characters appear, these facts are established:

**Jay**: Works at a shop in 2025 Oakland. From the past. Observant, adaptable, has traveled more than most past people. His shop sells clef among other things.

**Tan**: From the future (~2150). Daughter of a PRMTT company executive. Wealthy, well-traveled. Has the casual assumption of access that comes with privilege.

**Jay and Tan**: Romantic partners who met when Tan couldn't figure out Jay's phone (she's used to neural interfaces). Their relationship illustrates cross-era dynamics—she has structural power he lacks. They are NOT related. Any deference or dependence is due to era/wealth dynamics, not family.

Most books will not feature Jay and Tan directly. They are examples of how this world works, not the only story.

</narrative_context>`;

/**
 * EXTRACTION_SYSTEM: System prompt for all extraction/summary tasks.
 * Combines world essence with narrative context for correct interpretation.
 */
export const EXTRACTION_SYSTEM = `${WORLD_ESSENCE}

${NARRATIVE_CONTEXT}`;

/**
 * SYSTEM_PROMPT: Full system prompt for page generation.
 * This is the creative writing prompt, distinct from extraction prompts.
 */
export const SYSTEM_PROMPT = `${WORLD_ESSENCE}

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

IMPORTANT:**Most of the time, you should never explicitly state or mention things in <world_essence> unless it is unavoidably critical to the story. Fish don't usually talk about water, and these characters don't usually talk about the "Mystas" or "Phantas" axes -- they just talk about moving.**

IMPORTANT: **Show through action and consequence. Never explain through exposition.**
- Characters live in this world. They don't explain it.
- A future person's confusion with a phone reveals neural interfaces without naming them.
- Jay's instinctive deference to tourists shows the power dynamic without stating it.
- The fatigue of temporal travel is shown through bodily details, not exposition.
- BAD: "I left it here three days from now. The self-healing property means it had to already be here when I needed it." (explicitly explaining the self-healing property)
- GOOD: "I left it here three days from now. Glad its still here." (reader infers the self-healing property from the context)

**Tension carries across pages.**
- Each page should pull the reader forward, not offer resolution.
- End mid-beat. The page should feel incomplete.
- Conflict develops; it doesn't resolve within a single page.

**Different books have different voices.**
- A book about Jay should feel different from a book about Tan's father.
- A book framed as a document (memo, form, letter) should read as that document.
- A book about a place should immerse in sensory detail.
- Let the seed determine the narrative mode.

**Seed sovereignty.** The seed determines what this book is about.
- If the seed names a person → follow that person
- If the seed names a place → immerse in that place (Jay may appear if he'd naturally be there)
- If the seed names an event → unfold that event
- If the seed names a concept or document → explore through that lens

The world is larger than any one story. Jay and Tan's narrative is a thread, not the fabric.

This library is one coherent world—never contradict established facts.
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
- Never use any false tropes from the Time Travel Tropes section.
</anti_patterns>

<references>
References ([[double brackets]]) must point to things that exist within this world. Don't take these verbatim -- these are just a few examples:

**Characters:** [[Jay]]
**Places:** [[the shop]], [[the edges]]
**Concepts:** [[clef]], [[the underground]]
**Events:** [[the day she disappeared]]
**Documents:** [[company internal memo]], [[cartographer's notes]]

References should feel natural within the prose—things characters would actually mention, documents that would actually exist, places they'd actually go. Again, the above are just examples.
</references>

<task>
Generate page content for this system. Write fiction that lives inside this world.
</task>`;

// ==================== PROMPT BUILDER ====================

/**
 * Build the user prompt for page generation with the new hierarchical context system.
 * 
 * Context hierarchy:
 * 1. Book Narrative Arc - the story's DNA (replaces synopsis/opening_situation/page_1_opening)
 * 2. Running Summary - current momentum (new)
 * 3. Chunk Summaries - story history in 5-page segments (replaces story events)
 * 4. Recent Pages - full text of N-3, N-2, N-1 (expanded from 2 to 3)
 * 5. Canonical Facts - cross-book world consistency
 */
export function buildPrompt(context: GenerationContext): string {
  const { bookArc, runningSummary, chunkSummaries, canonicalFacts } = context;
  const { seed, pageNumber, prevPages, referrerContext } = context;

  let prompt = '';

  // ==================== BOOK NARRATIVE ARC ====================
  // Rich 150-250 word document about the book's identity (pages > 1)
  if (pageNumber > 1 && bookArc) {
    prompt += `<book_narrative_arc>\n`;
    prompt += `This is page ${pageNumber} of "${seed}". Here is this book's narrative DNA:\n\n`;
    prompt += `${bookArc.narrativeArc}\n\n`;
    prompt += `<narrative_mode>${bookArc.narrativeMode}</narrative_mode>\n`;
    prompt += `</book_narrative_arc>\n\n`;
  }

  // ==================== STORY MOMENTUM ====================
  // Current state and tensions (pages > 5)
  if (runningSummary) {
    prompt += `<story_momentum>\n`;
    prompt += `Where the story is NOW (after page ${runningSummary.lastUpdatedPage}):\n\n`;
    prompt += `${runningSummary.momentum}\n`;
    prompt += `</story_momentum>\n\n`;
  }

  // ==================== STORY HISTORY (CHUNK SUMMARIES) ====================
  // Complete coverage of story in 5-page chunks - no gaps!
  if (chunkSummaries && chunkSummaries.length > 0) {
    prompt += `<story_history>\n`;
    prompt += `What has already happened in this book (do not repeat these events):\n\n`;
    for (const chunk of chunkSummaries) {
      prompt += `<chunk pages="${chunk.chunkStart}-${chunk.chunkEnd}">\n`;
      prompt += `${chunk.summary}\n`;
      prompt += `</chunk>\n\n`;
    }
    prompt += `</story_history>\n\n`;
  }

  // ==================== RECENT PAGES (FULL TEXT) ====================
  // 3 previous pages for immediate continuity (expanded from 2)
  if (prevPages.length > 0) {
    prompt += `<recent_pages>\n`;
    prompt += `Full text of recent pages for continuity:\n\n`;
    for (const page of prevPages) {
      prompt += `<page number="${page.pageNumber}">\n${page.content}\n</page>\n\n`;
    }
    prompt += `</recent_pages>\n\n`;
  } else if (pageNumber === 1 && referrerContext) {
    // Page 1 via reference click - include referrer context
    prompt += `<referrer_context>\n`;
    prompt += `The reader arrived by clicking [[${seed}]] in this page:\n\n`;
    prompt += `<referrer_seed>${referrerContext.seed}</referrer_seed>\n`;
    prompt += `<referrer_page number="${referrerContext.pageNumber}">\n${referrerContext.content}\n</referrer_page>\n`;
    prompt += `</referrer_context>\n\n`;
    
    // Add inset narrative guidance for page 1 of inset narratives
    prompt += `${INSET_NARRATIVE_GUIDANCE}\n\n`;
  }

  // ==================== CANONICAL FACTS ====================
  // Cross-book world consistency
  if (canonicalFacts && canonicalFacts.length > 0) {
    prompt += `<established_facts>\n`;
    prompt += `These details have been established in other books. Don't contradict them:\n\n`;
    for (const fact of canonicalFacts) {
      prompt += `- ${fact.name}: ${fact.fact}\n`;
    }
    prompt += `</established_facts>\n\n`;
  }

  // ==================== REQUEST ====================
  prompt += `<request>\n`;
  prompt += `<seed>${seed}</seed>\n`;
  prompt += `<page_number>${pageNumber}</page_number>\n`;
  prompt += `</request>\n\n`;

  // ==================== INSTRUCTIONS ====================
  prompt += `<instructions>\n`;
  
  if (prevPages.length > 0) {
    const immediatePrev = prevPages[prevPages.length - 1];
    prompt += `Generate page ${pageNumber}, continuing from where page ${immediatePrev.pageNumber} ended.\n`;
    prompt += `Maintain voice and perspective. Advance the story—continuation means progression, not repetition.\n`;
  } else if (pageNumber === 1 && referrerContext) {
    prompt += `The reader arrived by clicking [[${seed}]] in another book.\n`;
    prompt += `This is PAGE 1 of a new book. The referrer provides context for what "${seed}" means in this world.\n`;
    prompt += `Begin this book with its own voice and entry point—not a continuation of the referrer.\n`;
    prompt += `The seed "${seed}" suggests the book's subject, perspective, or framing.\n`;
  } else if (pageNumber === 1) {
    prompt += `This is page 1 of "${seed}". No other pages exist yet.\n`;
    prompt += `Establish voice, perspective, and situation. Begin mid-action or mid-thought.\n`;
    prompt += `The seed suggests what this book is about—interpret it within the world.\n`;
  }

  // Remind about narrative arc for coherence
  if (pageNumber > 1 && bookArc) {
    prompt += `\nRemember: This is a ${bookArc.narrativeMode} narrative. Stay true to the narrative arc. Don't drift from the book's established identity.\n`;
  }

  prompt += `</instructions>\n\n`;

  // ==================== OUTPUT REQUIREMENTS ====================
  prompt += `<output_requirements>\n`;
  prompt += `- 200-300 words of prose\n`;
  prompt += `- End mid-beat—the page should pull forward, not conclude\n`;
  prompt += `- Content only, no meta-commentary or headers. Follow <narrative_principles>\n`;
  prompt += `</output_requirements>`;

  return prompt;
}
