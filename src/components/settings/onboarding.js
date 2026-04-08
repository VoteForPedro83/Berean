/* ============================================================
   onboarding.js — Driver.js 10-step onboarding tour
   ============================================================ */
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_KEY = 'berean-tour-done';

const STEPS = [
  {
    element: '#sidebar',
    popover: {
      title: 'Welcome to Berean',
      description: 'A free, scholar-grade Bible study platform for pastors. Let us show you around.',
      side: 'right', align: 'start',
    },
  },
  {
    element: '.sidebar__nav',
    popover: {
      title: 'The Sidebar',
      description: 'Five destinations: Study Mode, Sermon Builder, Search, Maps, and Settings.',
      side: 'right',
    },
  },
  {
    element: '#reading-header',
    popover: {
      title: 'The Bible Pane',
      description: 'Navigate chapters with Alt+← and Alt+→, or click the book name to jump anywhere.',
      side: 'bottom',
    },
  },
  {
    element: '#book-select',
    popover: {
      title: 'Book & Chapter Navigation',
      description: 'Click the book name to open the book picker. Click the chapter number for chapter picker.',
      side: 'bottom',
    },
  },
  {
    element: '.verse-number',
    popover: {
      title: 'Verse Actions',
      description: 'Click any verse number to bookmark, copy, or send it to your sermon clippings.',
      side: 'right',
    },
  },
  {
    element: '#toggle-interlinear',
    popover: {
      title: 'Interlinear (Coming in Stage 2)',
      description: 'Press Ctrl+I to toggle original Greek or Hebrew under every word, with Strong\'s numbers and morphology.',
      side: 'bottom',
    },
  },
  {
    element: '#command-palette',
    popover: {
      title: 'Command Palette',
      description: 'Press Ctrl+K to search passages, topics, people, places, and commands from anywhere.',
      side: 'bottom',
    },
  },
  {
    element: '.sidebar__item[data-dest="settings"]',
    popover: {
      title: 'Settings & AI Keys',
      description: 'Add your own AI API key to unlock commentary summaries, word studies, and passage analysis.',
      side: 'right',
    },
  },
  {
    element: '#bible-pane',
    popover: {
      title: 'Study Mode',
      description: 'Commentaries, cross-references, word studies, and maps are coming in Stages 2–4.',
      side: 'right',
    },
  },
  {
    popover: {
      title: "You're Ready",
      description: "Everything runs in your browser — no account, no server, no ads. Go study the Word.",
    },
  },
];

let _driver = null;

export function initOnboarding() {
  // Only show on first visit
  if (localStorage.getItem(TOUR_KEY)) return;

  // Wait for the reading pane to render a verse number before starting
  const startTour = () => {
    if (!document.querySelector('.verse-number')) {
      setTimeout(startTour, 500);
      return;
    }
    startOnboardingTour();
  };

  setTimeout(startTour, 1200);
}

export function startOnboardingTour() {
  _driver = driver({
    showProgress:     true,
    animate:          true,
    overlayColor:     'rgba(0,0,0,0.6)',
    stagePadding:     6,
    stageRadius:      6,
    allowClose:       true,
    onDestroyed:      () => localStorage.setItem(TOUR_KEY, '1'),
    steps: STEPS,
  });
  _driver.drive();
}

/** Let the user re-trigger the tour from Settings. */
export function resetTour() {
  localStorage.removeItem(TOUR_KEY);
}
