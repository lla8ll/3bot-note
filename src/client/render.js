// render.js — كل دوال العرض
// تقرأ من state وتبني DOM. لا تحفظ الحالة بنفسها.

import {
  state,
  activeNote,
  restoreFromTrash,
  deleteFromTrashPermanently,
  emptyTrash,
  getTrashRetentionDays,
  save
} from './state.js';
import { filterNotes, allTags } from './search.js';
import {
  renameFolder,
  deleteFolder,
  setActiveFolder,
  setActiveNote,
  updateActive
} from './actions.js';
import { confirmDialog } from './modal.js';
import { showToast } from './toast.js';
import { hideSummary } from './summarize.js';
import { renderBackupBanner } from './backup.js';

// عناصر DOM (تُعيَّن من app.js)
let els = {};
let searchInput;
let viewMode = 'notes'; // 'notes' | 'trash'

export function initRender(elements) {
  els = elements;
  searchInput = elements.searchInput;
}

export function setViewMode(mode) {
  viewMode = mode;
  render();
}

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function fmt(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
}

function go(view) {
  els.app.dataset.mobileView = view;
}

export function renderFolders() {
  els.folderList.innerHTML = '';
  state.folders.forEach(f => {
    const count = f.id === 'all'
      ? state.notes.length
      : state.notes.filter(n => n.folderId === f.id).length;

    const el = document.createElement('div');
    el.className = 'folder-item' + (state.activeFolderId === f.id ? ' active' : '') + (f.system ? ' system' : '');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;

    const icon = document.createElement('span');
    icon.textContent = '📁';
    el.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = f.name;
    el.appendChild(name);

    const countEl = document.createElement('span');
    countEl.className = 'folder-count';
    countEl.textContent = count;
    el.appendChild(countEl);

    // أزرار التحكم (تظهر فقط للمجلدات غير النظام)
    if (!f.system) {
      const controls = document.createElement('span');
      controls.className = 'folder-controls';

      const renameBtn = document.createElement('button');
      renameBtn.className = 'icon-btn';
      renameBtn.title = 'إعادة تسمية';
      renameBtn.setAttribute('aria-label', `إعادة تسمية مجلد ${f.name}`);
      renameBtn.textContent = '✏️';
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        renameFolder(f.id);
      };
      controls.appendChild(renameBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn';
      deleteBtn.title = 'حذف';
      deleteBtn.setAttribute('aria-label', `حذف مجلد ${f.name}`);
      deleteBtn.textContent = '🗑️';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteFolder(f.id);
      };
      controls.appendChild(deleteBtn);

      el.appendChild(controls);
    }

    el.onclick = () => {
      setActiveFolder(f.id);
      viewMode = 'notes';
      go('notes');
    };
    el.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.click();
      }
    };
    els.folderList.appendChild(el);
  });
}

function renderTagFilter() {
  if (!els.tagFilter) return;
  const tags = allTags(state);
  const current = state.filters?.tag || '';
  els.tagFilter.innerHTML = '<option value="">كل التصنيفات</option>' +
    tags.map(t => `<option value="${esc(t)}" ${t === current ? 'selected' : ''}>#${esc(t)}</option>`).join('');
}

export function renderNotes() {
  els.noteList.innerHTML = '';
  renderTagFilter();

  // تحديث حالة زر "المثبتة فقط"
  if (els.pinnedFilter) {
    els.pinnedFilter.classList.toggle('active', state.filters?.pinnedOnly === true);
  }

  if (viewMode === 'trash') {
    renderTrashList();
    return;
  }

  const query = searchInput ? searchInput.value : '';
  const list = filterNotes(state, query);

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.notes.length === 0
      ? 'لا توجد ملاحظات. اضغط ＋ لإنشاء واحدة.'
      : 'لا توجد نتائج مطابقة.';
    els.noteList.appendChild(empty);
    return;
  }

  list.forEach(n => {
    const first = (n.body || '').split('\n')[0] || 'لا يوجد نص';
    const el = document.createElement('div');
    el.className = 'note-card' + (state.activeNoteId === n.id ? ' active' : '');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.innerHTML = `
      ${n.pinned ? '<span class="pin">⭐</span>' : ''}
      <h3>${esc(n.title || first || 'ملاحظة جديدة')}</h3>
      <p>${esc(first)}</p>
      <small>${esc((n.tags || []).map(t => '#' + t).join(' '))} · ${fmt(n.updatedAt)}</small>
    `;
    el.onclick = () => {
      setActiveNote(n.id);
      hideSummary();
      go('editor');
    };
    el.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.click();
      }
    };
    els.noteList.appendChild(el);
  });
}

function renderTrashList() {
  const container = document.createElement('div');
  container.className = 'trash-list';

  if (state.trash.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'سلة المحذوفات فارغة.';
    container.appendChild(empty);
  } else {
    const info = document.createElement('div');
    info.style.cssText = 'padding: 8px 12px; font-size: 12px; color: var(--muted); text-align: center;';
    info.textContent = `تُحذف الملاحظات تلقائيًا بعد ${getTrashRetentionDays()} يوم.`;
    container.appendChild(info);

    state.trash.forEach(entry => {
      const n = entry.note;
      const first = (n.body || '').split('\n')[0] || 'لا يوجد نص';
      const card = document.createElement('div');
      card.className = 'note-card';
      card.innerHTML = `
        <h3>${esc(n.title || first || 'ملاحظة')}</h3>
        <p>${esc(first)}</p>
        <small>حُذفت: ${fmt(entry.deletedAt)}</small>
      `;

      const controls = document.createElement('div');
      controls.className = 'trash-controls';

      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = '↩️ استرجاع';
      restoreBtn.onclick = () => {
        const restored = restoreFromTrash(n.id);
        if (restored) {
          save();
          showToast('تم استرجاع الملاحظة.', { type: 'success', duration: 2000 });
        }
      };
      controls.appendChild(restoreBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = '🗑️ حذف نهائي';
      delBtn.onclick = async () => {
        const ok = await confirmDialog('سيتم حذف هذه الملاحظة نهائيًا بدون رجعة.', {
          title: 'حذف نهائي',
          okLabel: 'حذف نهائي',
          danger: true
        });
        if (ok) {
          deleteFromTrashPermanently(n.id);
          save();
        }
      };
      controls.appendChild(delBtn);

      card.appendChild(controls);
      container.appendChild(card);
    });

    // زر إفراغ السلة
    const emptyBtn = document.createElement('button');
    emptyBtn.className = 'danger';
    emptyBtn.style.cssText = 'width: calc(100% - 20px); margin: 10px; justify-content: center;';
    emptyBtn.textContent = '🗑️ إفراغ السلة';
    emptyBtn.onclick = async () => {
      const ok = await confirmDialog(`سيتم حذف ${state.trash.length} ملاحظة نهائيًا.`, {
        title: 'إفراغ السلة',
        okLabel: 'إفراغ',
        danger: true
      });
      if (ok) {
        emptyTrash();
        save();
        showToast('تم إفراغ السلة.', { type: 'success', duration: 2000 });
      }
    };
    container.appendChild(emptyBtn);
  }

  els.noteList.appendChild(container);
}

export function renderEditor() {
  const n = activeNote();
  if (!n) {
    els.editorBody.innerHTML = '<div class="empty">حدد ملاحظة أو أنشئ ملاحظة جديدة.</div>';
    els.pinBtn.textContent = '⭐ تثبيت';
    hideSummary();
    return;
  }
  els.pinBtn.textContent = n.pinned ? '⭐ إلغاء التثبيت' : '⭐ تثبيت';
  els.editorBody.innerHTML = `
    <div class="editor-body">
      <input class="note-title" id="titleInput" placeholder="عنوان الملاحظة" value="${esc(n.title || '')}">
      <div class="note-meta">
        <select class="folder-select" id="folderSelect">
          ${state.folders.filter(f => f.id !== 'all').map(f =>
            `<option value="${esc(f.id)}" ${f.id === n.folderId ? 'selected' : ''}>${esc(f.name)}</option>`
          ).join('')}
        </select>
        <input class="tag-input" id="tagInput" placeholder="تصنيفات: عمل، أفكار" value="${esc((n.tags || []).join(', '))}">
      </div>
      <textarea class="note-body" id="bodyInput" placeholder="اكتب ملاحظتك هنا...">${esc(n.body || '')}</textarea>
    </div>
  `;
  document.getElementById('titleInput').oninput = e => { updateActive({ title: e.target.value }); hideSummary(); };
  document.getElementById('bodyInput').oninput = e => { updateActive({ body: e.target.value }); hideSummary(); };
  document.getElementById('folderSelect').onchange = e => updateActive({ folderId: e.target.value });
  document.getElementById('tagInput').oninput = e =>
    updateActive({ tags: e.target.value.split(',').map(x => x.trim()).filter(Boolean) });
}

export function updateTrashCountBadge() {
  if (!els.trashBtn) return;
  const count = state.trash.length;
  els.trashBtn.innerHTML = count > 0
    ? `🗑️ السلة <span class="count">(${count})</span>`
    : '🗑️ السلة';
}

export function render() {
  document.body.classList.toggle('dark', state.dark);
  renderFolders();
  renderNotes();
  renderEditor();
  updateTrashCountBadge();
  if (els.backupBanner) renderBackupBanner(els.backupBanner);
}
