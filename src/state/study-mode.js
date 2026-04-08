/* ============================================================
   study-mode.js — Study Mode state
   ============================================================ */
import { bus, EVENTS } from './eventbus.js';

export const state = {
  book:        'JHN',
  chapter:     1,
  verse:       1,
  theme:       localStorage.getItem('berean-theme')    || 'dark-mode',
  lang:        localStorage.getItem('berean-lang')     || 'en',
  fontSize:    localStorage.getItem('berean-fontsize') || 'md',
  interlinear: false,
};

export function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('berean-theme', theme);
  document.documentElement.className = theme;
  bus.emit(EVENTS.THEME_CHANGE, theme);
}

export function toggleTheme() {
  setTheme(state.theme === 'dark-mode' ? 'light-mode' : 'dark-mode');
}

export function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('berean-lang', lang);
  document.documentElement.lang = lang === 'afr' ? 'af' : 'en';
  bus.emit(EVENTS.LANG_CHANGE, lang);
}

export function setFontSize(size) {
  state.fontSize = size;
  localStorage.setItem('berean-fontsize', size);
  const sizes = { sm: '1rem', md: '1.125rem', lg: '1.25rem', xl: '1.4375rem' };
  document.documentElement.style.setProperty('--font-scripture-size', sizes[size] || sizes.md);
  bus.emit(EVENTS.FONT_SIZE_CHANGE, size);
}

export function setPassage({ book, chapter, verse }) {
  state.book    = book;
  state.chapter = chapter;
  state.verse   = verse;
}

// Apply saved preferences on startup
export function applyStoredPreferences() {
  document.documentElement.className = state.theme;
  setFontSize(state.fontSize);
}
