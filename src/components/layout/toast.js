/* ============================================================
   toast.js — Toast notification system
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';

let container = null;

export function initToast() {
  container = document.getElementById('toast-container');
  bus.on(EVENTS.TOAST, ({ message, type = 'info', duration = 3000 }) => {
    showToast(message, type, duration);
  });
}

export function showToast(message, type = 'info', duration = 3000) {
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  setTimeout(() => {
    el.classList.remove('toast--visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, duration);
}

export function toast(message, type = 'info', duration = 3000) {
  bus.emit(EVENTS.TOAST, { message, type, duration });
}
