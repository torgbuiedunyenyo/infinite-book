import { appLogger } from './logger';

const log = appLogger;

const TOUR_STORAGE_KEY = 'infinite-book-tour-completed';

interface TourStep {
  target: string;           // CSS selector
  content: string;          // The guidance text
  position: 'top' | 'bottom' | 'left' | 'right';
  marginNote?: boolean;     // Style as margin note vs centered overlay
  waitForTarget?: boolean;  // Wait for target to exist before showing
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '#content',
    content: 'Welcome to the world of the Shape of Time.',
    position: 'bottom',
    marginNote: false,
  },
  {
    target: '.reference',
    content: 'Text with a subtle underline are doorways to other books. Tap one to follow where it leads.',
    position: 'bottom',
    marginNote: true,
    waitForTarget: true,
  },
  {
    target: '#nav-right',
    content: 'Turn the page forward. Each page you visit is discovered and fixed forever.',
    position: 'left',
    marginNote: true,
  },
  {
    target: '#nav-left',
    content: 'Turn back. But you cannot skip ahead—pages must be read in order.',
    position: 'right',
    marginNote: true,
  },
  {
    target: '.sidebar-trigger',
    content: 'Your library. Every book anyone has touched can be returned to here.',
    position: 'right',
    marginNote: true,
  },
];

let currentStep = 0;
let tourActive = false;
let overlayEl: HTMLElement | null = null;
let spotlightEl: HTMLElement | null = null;
let tooltipEl: HTMLElement | null = null;

export function shouldShowTour(): boolean {
  return !localStorage.getItem(TOUR_STORAGE_KEY);
}

export function startTour(): void {
  if (!shouldShowTour()) return;
  
  log.info('Starting first-time tour');
  tourActive = true;
  currentStep = 0;
  
  createTourElements();
  showStep(0);
}

function createTourElements(): void {
  // Overlay (dims everything except spotlight)
  overlayEl = document.createElement('div');
  overlayEl.className = 'tour-overlay';
  document.body.appendChild(overlayEl);
  
  // Spotlight ring with animated border
  spotlightEl = document.createElement('div');
  spotlightEl.className = 'tour-spotlight';
  document.body.appendChild(spotlightEl);
  
  // Tooltip / margin note
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tour-tooltip';
  tooltipEl.innerHTML = `
    <div class="tour-tooltip-content"></div>
    <div class="tour-tooltip-actions">
      <button class="tour-skip">Skip</button>
      <button class="tour-next">Continue</button>
    </div>
    <div class="tour-progress"></div>
  `;
  document.body.appendChild(tooltipEl);
  
  // Event listeners
  tooltipEl.querySelector('.tour-next')!.addEventListener('click', nextStep);
  tooltipEl.querySelector('.tour-skip')!.addEventListener('click', endTour);
  
  // Click overlay to advance (but not on first step - let them read)
  overlayEl.addEventListener('click', () => {
    if (currentStep > 0) {
      nextStep();
    }
  });
  
  // Keyboard: Enter/Space to advance, Escape to skip
  document.addEventListener('keydown', handleTourKeydown);
}

function handleTourKeydown(e: KeyboardEvent): void {
  if (!tourActive) return;
  
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    nextStep();
  } else if (e.key === 'Escape') {
    endTour();
  }
}

async function showStep(index: number): Promise<void> {
  const step = TOUR_STEPS[index];
  if (!step || !tooltipEl || !spotlightEl) return;
  
  let targetEl = document.querySelector(step.target) as HTMLElement;
  
  // If we need to wait for target (e.g., references that appear after streaming)
  if (!targetEl && step.waitForTarget) {
    log.debug('Waiting for tour target to appear', { target: step.target });
    
    // Poll for up to 5 seconds
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      targetEl = document.querySelector(step.target) as HTMLElement;
      if (targetEl) break;
    }
  }
  
  if (!targetEl) {
    log.warn('Tour target not found, skipping', { target: step.target });
    nextStep();
    return;
  }
  
  // Position spotlight around target
  const rect = targetEl.getBoundingClientRect();
  const isMobile = window.innerWidth <= 768;
  const padding = isMobile ? 8 : 12;
  
  spotlightEl.style.top = `${rect.top - padding + window.scrollY}px`;
  spotlightEl.style.left = `${rect.left - padding}px`;
  spotlightEl.style.width = `${rect.width + padding * 2}px`;
  spotlightEl.style.height = `${rect.height + padding * 2}px`;
  
  // Update tooltip content
  const contentEl = tooltipEl.querySelector('.tour-tooltip-content')!;
  contentEl.textContent = step.content;
  
  // Update progress
  const progressEl = tooltipEl.querySelector('.tour-progress')!;
  progressEl.textContent = `${index + 1} of ${TOUR_STEPS.length}`;
  
  // Update button text for last step
  const nextBtn = tooltipEl.querySelector('.tour-next') as HTMLButtonElement;
  nextBtn.textContent = index === TOUR_STEPS.length - 1 ? 'Begin Reading' : 'Continue';
  
  // Toggle margin note style
  tooltipEl.classList.toggle('margin-note', !!step.marginNote);
  
  // Position tooltip (needs to happen after margin-note class is set for correct sizing)
  requestAnimationFrame(() => {
    positionTooltip(rect, step.position);
    
    // Animate in
    requestAnimationFrame(() => {
      spotlightEl!.classList.add('visible');
      tooltipEl!.classList.add('visible');
    });
  });
}

function positionTooltip(
  targetRect: DOMRect, 
  position: TourStep['position']
): void {
  if (!tooltipEl) return;
  
  const isMobile = window.innerWidth <= 768;
  const isVerySmall = window.innerWidth <= 400;
  
  // On very small screens, use fixed bottom positioning (handled by CSS)
  if (isVerySmall) {
    tooltipEl.style.top = '';
    tooltipEl.style.left = '';
    tooltipEl.classList.add('tour-tooltip-fixed');
    return;
  }
  
  tooltipEl.classList.remove('tour-tooltip-fixed');
  
  // On mobile, convert left/right positions to bottom to avoid clipping
  let effectivePosition = position;
  if (isMobile && (position === 'left' || position === 'right')) {
    effectivePosition = 'bottom';
  }
  
  // Reset position to measure true size
  tooltipEl.style.top = '0';
  tooltipEl.style.left = '0';
  
  const gap = isMobile ? 16 : 24;
  const tooltipRect = tooltipEl.getBoundingClientRect();
  const viewportPadding = isMobile ? 12 : 20;
  
  let top = 0;
  let left = 0;
  
  switch (effectivePosition) {
    case 'top':
      top = targetRect.top - tooltipRect.height - gap + window.scrollY;
      left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      break;
    case 'bottom':
      top = targetRect.bottom + gap + window.scrollY;
      left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
      break;
    case 'left':
      top = targetRect.top + (targetRect.height - tooltipRect.height) / 2 + window.scrollY;
      left = targetRect.left - tooltipRect.width - gap;
      break;
    case 'right':
      top = targetRect.top + (targetRect.height - tooltipRect.height) / 2 + window.scrollY;
      left = targetRect.right + gap;
      break;
  }
  
  // Keep within viewport horizontally
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));
  
  // Keep within viewport vertically
  top = Math.max(viewportPadding + window.scrollY, top);
  const maxTop = window.scrollY + window.innerHeight - tooltipRect.height - viewportPadding;
  top = Math.min(top, maxTop);
  
  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.left = `${left}px`;
}

function nextStep(): void {
  currentStep++;
  
  if (currentStep >= TOUR_STEPS.length) {
    endTour();
  } else {
    // Brief fade out before next step
    spotlightEl?.classList.remove('visible');
    tooltipEl?.classList.remove('visible');
    
    setTimeout(() => showStep(currentStep), 250);
  }
}

function endTour(): void {
  log.info('Tour completed');
  tourActive = false;
  
  // Mark as completed
  localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  
  // Clean up
  document.removeEventListener('keydown', handleTourKeydown);
  
  overlayEl?.classList.add('fade-out');
  spotlightEl?.classList.add('fade-out');
  tooltipEl?.classList.add('fade-out');
  
  setTimeout(() => {
    overlayEl?.remove();
    spotlightEl?.remove();
    tooltipEl?.remove();
    overlayEl = null;
    spotlightEl = null;
    tooltipEl = null;
  }, 400);
}

// Allow resetting for testing (call from browser console: window.resetTour())
export function resetTour(): void {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  log.info('Tour reset - will show on next page load');
}

// Expose reset function globally for testing
if (typeof window !== 'undefined') {
  (window as any).resetTour = resetTour;
}

