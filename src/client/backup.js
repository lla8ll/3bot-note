// backup.js — تذكير بالنسخ الاحتياطي عند مرور فترة طويلة
// يظهر شريط علوي إذا لم يتم تصدير نسخة منذ 7 أيام أو أكثر.

import { state } from './state.js';
import { exportJSON } from './io.js';

const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldRemindBackup() {
  if (state.notes.length === 0) return false;
  if (!state.lastBackupAt) return true;
  const last = new Date(state.lastBackupAt).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last > REMIND_AFTER_MS;
}

export function renderBackupBanner(container) {
  container.innerHTML = '';
  if (!shouldRemindBackup()) return;

  const banner = document.createElement('div');
  banner.className = 'backup-banner';

  const icon = document.createElement('span');
  icon.textContent = '⚠️';
  banner.appendChild(icon);

  const text = document.createElement('span');
  const daysAgo = state.lastBackupAt
    ? Math.floor((Date.now() - new Date(state.lastBackupAt).getTime()) / (24 * 60 * 60 * 1000))
    : null;
  text.textContent = daysAgo !== null
    ? `لم يتم أخذ نسخة احتياطية منذ ${daysAgo} يوم. ملاحظاتك محفوظة محليًا فقط.`
    : 'لم يتم أخذ نسخة احتياطية بعد. ملاحظاتك محفوظة محليًا فقط.';
  text.style.flex = '1';
  banner.appendChild(text);

  const btn = document.createElement('button');
  btn.textContent = '📥 نزّل نسخة';
  btn.onclick = () => {
    exportJSON();
    renderBackupBanner(container);
  };
  banner.appendChild(btn);

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'إغلاق');
  close.onclick = () => banner.remove();
  banner.appendChild(close);

  container.appendChild(banner);
}
