// modal.js — نوافذ حوار مخصصة تستبدل confirm() و prompt() الأصليتين
// لأنهما محجوبتان في بعض المتصفحات كتطبيق PWA.

function createBackdrop() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  return backdrop;
}

function createButton(label, className = 'secondary') {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = label;
  return btn;
}

/**
 * نافذة تأكيد بديلة لـ confirm()
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, options = {}) {
  const {
    title = 'تأكيد',
    okLabel = 'موافق',
    cancelLabel = 'إلغاء',
    danger = false
  } = options;

  return new Promise(resolve => {
    const backdrop = createBackdrop();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const h = document.createElement('h3');
    h.textContent = title;
    modal.appendChild(h);

    const p = document.createElement('p');
    p.textContent = message;
    modal.appendChild(p);

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';

    const okBtn = createButton(okLabel, danger ? 'danger' : '');
    const cancelBtn = createButton(cancelLabel, 'secondary');

    const close = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    okBtn.onclick = () => close(true);
    cancelBtn.onclick = () => close(false);
    backdrop.onclick = e => { if (e.target === backdrop) close(false); };

    const onKey = e => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);

    buttons.appendChild(okBtn);
    buttons.appendChild(cancelBtn);
    modal.appendChild(buttons);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    okBtn.focus();
  });
}

/**
 * نافذة إدخال بديلة لـ prompt()
 * @returns {Promise<string|null>} النص أو null عند الإلغاء
 */
export function promptDialog(message, options = {}) {
  const {
    title = 'إدخال',
    defaultValue = '',
    placeholder = '',
    okLabel = 'حفظ',
    cancelLabel = 'إلغاء',
    maxLength = 200
  } = options;

  return new Promise(resolve => {
    const backdrop = createBackdrop();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const h = document.createElement('h3');
    h.textContent = title;
    modal.appendChild(h);

    if (message) {
      const p = document.createElement('p');
      p.textContent = message;
      modal.appendChild(p);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    modal.appendChild(input);

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';

    const okBtn = createButton(okLabel);
    const cancelBtn = createButton(cancelLabel, 'secondary');

    const close = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    okBtn.onclick = () => {
      const value = input.value.trim();
      close(value || null);
    };
    cancelBtn.onclick = () => close(null);
    backdrop.onclick = e => { if (e.target === backdrop) close(null); };

    const onKey = e => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.trim();
        close(value || null);
      }
    };
    document.addEventListener('keydown', onKey);

    buttons.appendChild(okBtn);
    buttons.appendChild(cancelBtn);
    modal.appendChild(buttons);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

/**
 * نافذة إشعار بسيطة بديلة لـ alert()
 */
export function alertDialog(message, options = {}) {
  const { title = 'تنبيه', okLabel = 'موافق' } = options;
  return new Promise(resolve => {
    const backdrop = createBackdrop();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');

    const h = document.createElement('h3');
    h.textContent = title;
    modal.appendChild(h);

    const p = document.createElement('p');
    p.textContent = message;
    modal.appendChild(p);

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const okBtn = createButton(okLabel);

    const close = () => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve();
    };

    okBtn.onclick = close;
    backdrop.onclick = e => { if (e.target === backdrop) close(); };
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    document.addEventListener('keydown', onKey);

    buttons.appendChild(okBtn);
    modal.appendChild(buttons);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    okBtn.focus();
  });
}
