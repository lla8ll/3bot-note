// actions.js — عمليات المجلدات والملاحظات (بدون DOM)
// كل عملية تعدل الحالة ثم تحفظ، والعرض يستجيب عبر onStateChange.

import { state, save, makeId, moveToTrash, restoreFromTrash, activeNote } from './state.js';
import { confirmDialog, promptDialog } from './modal.js';
import { showToast } from './toast.js';

// ==== المجلدات ====

export async function addFolder(name) {
  const clean = (name || '').trim();
  if (!clean) return null;
  const folder = { id: makeId('f'), name: clean.slice(0, 80), system: false };
  state.folders.push(folder);
  save();
  return folder;
}

export async function renameFolder(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder || folder.system) return false;

  const newName = await promptDialog('اكتب الاسم الجديد للمجلد:', {
    title: 'إعادة تسمية المجلد',
    defaultValue: folder.name,
    placeholder: 'اسم المجلد',
    maxLength: 80,
    okLabel: 'حفظ'
  });

  if (!newName || newName === folder.name) return false;
  folder.name = newName.slice(0, 80);
  save();
  showToast('تم تغيير اسم المجلد.', { type: 'success', duration: 2000 });
  return true;
}

export async function deleteFolder(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder || folder.system) return false;

  const notesCount = state.notes.filter(n => n.folderId === folderId).length;
  const message = notesCount > 0
    ? `سيتم نقل ${notesCount} ملاحظة إلى مجلد "ملاحظاتي". هل أنت متأكد؟`
    : 'هل تريد حذف هذا المجلد؟';

  const confirmed = await confirmDialog(message, {
    title: `حذف "${folder.name}"`,
    okLabel: 'حذف',
    danger: true
  });

  if (!confirmed) return false;

  // نقل الملاحظات للمجلد الافتراضي
  state.notes.forEach(n => {
    if (n.folderId === folderId) n.folderId = 'default';
  });

  // إزالة المجلد
  state.folders = state.folders.filter(f => f.id !== folderId);

  // لو المجلد النشط هو المحذوف، رجع لـ all
  if (state.activeFolderId === folderId) state.activeFolderId = 'all';

  save();
  showToast(
    notesCount > 0 ? `تم حذف المجلد ونقل ${notesCount} ملاحظة.` : 'تم حذف المجلد.',
    { type: 'success', duration: 3000 }
  );
  return true;
}

// ==== الملاحظات ====

export function newNote() {
  const folderId = state.activeFolderId === 'all' ? 'default' : state.activeFolderId;
  const now = new Date().toISOString();
  const n = {
    id: makeId('n'),
    title: '',
    body: '',
    folderId,
    tags: [],
    pinned: false,
    createdAt: now,
    updatedAt: now
  };
  state.notes.unshift(n);
  state.activeNoteId = n.id;
  save();
  return n;
}

export function updateActive(patch) {
  const n = activeNote();
  if (!n) return;
  Object.assign(n, patch, { updatedAt: new Date().toISOString() });
  save();
}

export function togglePin() {
  const n = activeNote();
  if (!n) return;
  n.pinned = !n.pinned;
  n.updatedAt = new Date().toISOString();
  save();
}

/**
 * حذف الملاحظة (نقلها للسلة، مع toast تراجع)
 */
export function deleteActiveNote() {
  const n = activeNote();
  if (!n) return false;

  const entry = moveToTrash(n.id);
  if (!entry) return false;

  state.activeNoteId = null;
  save();

  const title = entry.note.title || 'ملاحظة بدون عنوان';
  showToast(`تم نقل "${title}" إلى السلة.`, {
    duration: 6000,
    action: {
      label: 'تراجع',
      onClick: () => {
        const restored = restoreFromTrash(entry.note.id);
        if (restored) {
          state.activeNoteId = restored.id;
          save();
          showToast('تم استرجاع الملاحظة.', { type: 'success', duration: 2000 });
        }
      }
    }
  });

  return true;
}

export function setActiveFolder(folderId) {
  state.activeFolderId = folderId;
  save();
}

export function setActiveNote(noteId) {
  state.activeNoteId = noteId;
  save();
}

export function toggleDark() {
  state.dark = !state.dark;
  save();
}

export function setFilter(patch) {
  state.filters = { ...state.filters, ...patch };
  save();
}
