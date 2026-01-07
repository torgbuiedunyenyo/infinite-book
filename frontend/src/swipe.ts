import { appLogger } from './logger';

const log = appLogger;

interface SwipeConfig {
  minDistance: number;      // Minimum horizontal distance to trigger swipe
  maxVerticalRatio: number; // Max vertical/horizontal ratio (to distinguish from scrolling)
  element: HTMLElement;     // Element to attach listeners to
  onSwipeLeft: () => void;  // Callback for swipe left (next page)
  onSwipeRight: () => void; // Callback for swipe right (previous page)
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
}

let touchState: TouchState | null = null;
let swipeCount = 0;

export function initSwipeNavigation(config: SwipeConfig): void {
  const { element, minDistance, maxVerticalRatio, onSwipeLeft, onSwipeRight } = config;
  
  log.info('Initializing swipe navigation', {
    minDistance,
    maxVerticalRatio,
    elementId: element.id,
  });

  element.addEventListener('touchstart', (e: TouchEvent) => {
    // Only track single-finger touches
    if (e.touches.length !== 1) {
      touchState = null;
      return;
    }

    const touch = e.touches[0];
    touchState = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
    };

    log.debug('Touch start', {
      x: touchState.startX,
      y: touchState.startY,
    });
  }, { passive: true });

  element.addEventListener('touchmove', (_e: TouchEvent) => {
    // We use passive: true so we can't preventDefault here
    // This allows natural scrolling to work
  }, { passive: true });

  element.addEventListener('touchend', (e: TouchEvent) => {
    if (!touchState) return;

    // If there are still touches active, ignore
    if (e.touches.length > 0) {
      touchState = null;
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchState.startX;
    const deltaY = touch.clientY - touchState.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    log.debug('Touch end', {
      deltaX,
      deltaY,
      absDeltaX,
      absDeltaY,
      duration: Date.now() - touchState.startTime,
    });

    // Reset state
    touchState = null;

    // Check if this qualifies as a horizontal swipe:
    // 1. Horizontal distance must exceed minimum
    // 2. Must be more horizontal than vertical (ratio check)
    if (absDeltaX < minDistance) {
      log.debug('Swipe ignored: below minimum distance', {
        absDeltaX,
        minDistance,
      });
      return;
    }

    if (absDeltaY > 0 && absDeltaY / absDeltaX > maxVerticalRatio) {
      log.debug('Swipe ignored: too vertical', {
        ratio: absDeltaY / absDeltaX,
        maxVerticalRatio,
      });
      return;
    }

    swipeCount++;

    if (deltaX < 0) {
      // Swipe left = next page (finger moved right to left)
      log.info('Swipe left detected - navigating to next page', {
        deltaX,
        swipeCount,
      });
      onSwipeLeft();
    } else {
      // Swipe right = previous page (finger moved left to right)
      log.info('Swipe right detected - navigating to previous page', {
        deltaX,
        swipeCount,
      });
      onSwipeRight();
    }
  }, { passive: true });

  element.addEventListener('touchcancel', () => {
    log.debug('Touch cancelled');
    touchState = null;
  }, { passive: true });

  log.info('Swipe navigation initialized');
}






