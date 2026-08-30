// toast.js — إشعارات منبثقة مع دعم زر تراجع
// بديل لـ alert() لتجربة أفضل.

let container;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

/**
 * عرض إشعار
 * @param {string} message - نص الإشعار
 * @param {object} options
 * @param {number} [options.duration=4000] - المدة بالمللي ثانية (0 = دائم)
 * @param {'info'|'success'|'error'} [options.type='info']
 * @param {{label: string, onClick: () => void}} [options.action] - زر إجراء (مثل تراجع)
 */
export function showToast(message, options = {}) {
  const { duration = 4000, type = 'info', action } = options;
  const root = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const text = document.createElement('span');
  text.textContent = message;
  text.style.flex = '1';
  toast.appendChild(text);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 200);
  };

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.onclick = () => {
      try { action.onClick(); } catch (error) { console.error(error); }
      dismiss();
    };
    toast.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.setAttribute('aria-label', 'إغلاق');
  closeBtn.style.cssText = 'background: transparent; color: inherit; border: 0; padding: 0 4px; font-size: 18px; cursor: pointer;';
  closeBtn.textContent = '×';
  closeBtn.onclick = dismiss;
  toast.appendChild(closeBtn);

  root.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return { dismiss };
}
