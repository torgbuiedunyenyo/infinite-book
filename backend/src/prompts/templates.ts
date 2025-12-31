import { GenerationContext, CanonicalFact, BookSynopsis, StoryEvent } from '../types';

export const SYSTEM_PROMPT = `<world_essence>
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

## One Central Narrative (for context, not prescription)

The following describes a well-known story that threads through many books in this library. Not every book features these characters—but they exist in the same world, and their story illustrates how this world feels to live in.

**Jay** works at a shop in 2025 Oakland. He's lived his whole life in an era shaped by future influence—he's used to tourists, to products that don't quite belong, to navigating a world not entirely his own. He's observant. He notices what doesn't add up.

**Tan** is from the future, daughter of an executive at the leading PRMTT company. Wealthy, well-traveled, comfortable moving through eras. She visits the past and meets Jay when she can't figure out how to pay with his phone—she's used to neural interfaces. He gives her the clef for free. They become friends, then fall in love.

Jay knows how their relationship looks. Tan has money, status, access to maps and technology; he has none of these. He loves her anyway.

Tan brings Jay to the future; her father arranges documentation. Jay finds the future disorienting—he doesn't know the technology, the layout, the social cues. He depends on Tan to navigate. People assume things about why he's there. Tan's friends are polite but condescending. Her family is cold.

Days after arriving, Tan disappears. Jay is immediately suspected. He runs.

While fleeing across eras, Jay learns to navigate time through study and necessity. He traces Tan's movements, encounters the underground networks, glimpses the unmapped edges. He returns to 2025 and finds it changed in his absence—his shop is different, people don't quite remember him right. Time continued without him.

He finds Tan. She'd gone to the Mystas edges on an adventure, curious about the unmapped territory, planning to explain "in her own time." It hadn't occurred to her what her disappearance would mean for Jay—that he'd be blamed, hunted, forced to remake himself just to survive. She wasn't cruel; she simply didn't think about it. He wasn't real to her in the way she was real to herself.

Jay forgives her. But Tan doesn't want to continue the relationship. The work of truly seeing someone from a different era, of accounting for the power between them—it's not something she's willing to do.

Jay returns to 2025 Oakland, to his shop. He's traveled further than most people from his era ever will. He's survived. But he's back where he started, selling clef to tourists, watching them come and go.
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
References ([[double brackets]]) must point to things that exist within this world. These are just a few examples:

**Characters:** [[Jay]]
**Places:** [[the shop]], [[the edges]]
**Concepts:** [[clef]], [[the underground]]
**Events:** [[the day she disappeared]], [[what happened at the edges]]
**Documents:** [[company internal memo]], [[cartographer's notes]]

References should feel natural within the prose—things characters would actually mention, documents that would actually exist, places they'd actually go. Again, the above are just examples.
</references>

<task>
Generate page content for this system. Write fiction that lives inside this world.
</task>`;

export function buildPrompt(context: GenerationContext): string {
  const { canonicalFacts, storyEvents, bookSynopsis, page1Opening } = context;
  const { seed, pageNumber, prevPages, referrerContext } = context;

  let prompt = '';

  // BOOK CONTEXT: Synopsis and page 1 opening for narrative anchoring (pages > 1)
  if (pageNumber > 1 && (bookSynopsis || page1Opening)) {
    prompt += `<book_context>\n`;
    prompt += `This is page ${pageNumber} of "${seed}". Here's what this book is about:\n\n`;
    
    if (bookSynopsis) {
      // Prefer updated synopsis if available (keeps pace with story evolution)
      const currentSynopsis = bookSynopsis.updatedSynopsis || bookSynopsis.synopsis;
      prompt += `<synopsis>${currentSynopsis}</synopsis>\n`;
      prompt += `<narrative_mode>${bookSynopsis.narrativeMode}</narrative_mode>\n`;
      prompt += `<opening_situation>${bookSynopsis.openingSituation}</opening_situation>\n`;
    }
    
    if (page1Opening) {
      prompt += `<page_1_opening>\n${page1Opening}\n</page_1_opening>\n`;
    }
    
    prompt += `</book_context>\n\n`;
  }

  // STORY EVENTS: What has happened in this book so far (prevents repetition)
  if (storyEvents && storyEvents.length > 0) {
    prompt += `<what_has_happened>\n`;
    prompt += `In this book so far:\n`;
    for (const event of storyEvents) {
      const marker = event.significance === 'key' ? ' (key)' : '';
      prompt += `- Page ${event.pageNumber}: ${event.event}${marker}\n`;
    }
    prompt += `\nDo not repeat these events. Continue the story forward.\n`;
    prompt += `</what_has_happened>\n\n`;
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

  // EXISTING PAGES: Provide previous pages for continuity
  if (prevPages.length > 0) {
    prompt += `<existing_pages>\n`;
    
    for (const page of prevPages) {
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
  
  if (prevPages.length > 0) {
    const immediatePrev = prevPages[prevPages.length - 1];
    prompt += `Generate page ${pageNumber}, continuing from page ${immediatePrev.pageNumber}.\n`;
    prompt += `Maintain the voice, perspective, and momentum established.\n`;
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
