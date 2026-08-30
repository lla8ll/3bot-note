// state.js — إدارة الحالة والتخزين المحلي، مع نظام سلة المحذوفات
// يوفر مصدر حقيقة واحد للتطبيق ولا يعتمد على DOM.

export const STORAGE_KEY = '3bot-note.v2';
const LEGACY_STORAGE_KEY = ['not', 'book.v2'].join('');
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 يوم
const FOLDER_LIMIT = 502;
const NOTE_LIMIT = 5000;
const TRASH_LIMIT = 500;

export const state = defaultState();
let cloudSyncTimer;
const changeListeners = new Set();

export function defaultState() {
  return {
    folders: [
      { id: 'all', name: 'كل الملاحظات', system: true },
      { id: 'default', name: 'ملاحظاتي', system: true }
    ],
    notes: [],
    trash: [],
    activeFolderId: 'all',
    activeNoteId: null,
    dark: false,
    lastBackupAt: null,
    filters: { pinnedOnly: false, tag: '' }
  };
}

export function makeId(prefix) {
  const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function validDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeNote(note, folderIds, seenIds) {
  if (!note || typeof note !== 'object') return null;
  const folderId = typeof note.folderId === 'string' && folderIds.has(note.folderId) && note.folderId !== 'all'
    ? note.folderId
    : 'default';
  const tags = Array.isArray(note.tags)
    ? note.tags.filter(tag => typeof tag === 'string').map(tag => tag.trim().slice(0, 40)).filter(Boolean).slice(0, 30)
    : [];
  let id = typeof note.id === 'string' && /^[\w:.-]{1,160}$/u.test(note.id) && !seenIds.has(note.id)
    ? note.id
    : makeId('n');
  while (seenIds.has(id)) id = makeId('n');
  seenIds.add(id);
  const now = new Date().toISOString();
  return {
    id,
    title: typeof note.title === 'string' ? note.title.slice(0, 500) : '',
    body: typeof note.body === 'string' ? note.body.slice(0, 200000) : '',
    folderId,
    tags,
    pinned: note.pinned === true,
    createdAt: validDate(note.createdAt, now),
    updatedAt: validDate(note.updatedAt, now)
  };
}

export function normalizeState(value) {
  const base = defaultState();
  if (!value || typeof value !== 'object') return base;

  const folders = base.folders.slice();
  const folderIds = new Set(folders.map(folder => folder.id));
  const sourceFolders = Array.isArray(value.folders) ? value.folders : [];

  sourceFolders.slice(0, FOLDER_LIMIT).forEach(folder => {
    if (!folder || typeof folder !== 'object') return;
    const name = typeof folder.name === 'string' ? folder.name.trim().slice(0, 80) : '';
    if (!name) return;
    let id = typeof folder.id === 'string' && /^[\w:.-]{1,120}$/u.test(folder.id)
      ? folder.id
      : makeId('f');
    if (id === 'all' || id === 'default' || folderIds.has(id)) return;
    folderIds.add(id);
    folders.push({ id, name, system: false });
  });

  const sourceNotes = Array.isArray(value.notes) ? value.notes : [];
  const noteIds = new Set();
  const notes = sourceNotes.slice(0, NOTE_LIMIT)
    .map(note => normalizeNote(note, folderIds, noteIds))
    .filter(Boolean);

  const sourceTrash = Array.isArray(value.trash) ? value.trash : [];
  const trashIds = new Set();
  const now = Date.now();
  const trash = sourceTrash.slice(0, TRASH_LIMIT)
    .map(item => {
      const note = normalizeNote(item?.note, folderIds, trashIds);
      if (!note) return null;
      const deletedAt = validDate(item?.deletedAt, new Date().toISOString());
      // نتخلص من العناصر منتهية الصلاحية
      if (now - new Date(deletedAt).getTime() > TRASH_RETENTION_MS) return null;
      return { note, deletedAt, originalFolderId: item?.originalFolderId || note.folderId };
    })
    .filter(Boolean);

  const activeFolderId = typeof value.activeFolderId === 'string' && folderIds.has(value.activeFolderId)
    ? value.activeFolderId
    : 'all';
  const activeNoteId = notes.some(note => note.id === value.activeNoteId) ? value.activeNoteId : null;

  const lastBackupAt = typeof value.lastBackupAt === 'string' && !Number.isNaN(new Date(value.lastBackupAt).getTime())
    ? value.lastBackupAt
    : null;

  const filters = value.filters && typeof value.filters === 'object'
    ? {
        pinnedOnly: value.filters.pinnedOnly === true,
        tag: typeof value.filters.tag === 'string' ? value.filters.tag.slice(0, 40) : ''
      }
    : { pinnedOnly: false, tag: '' };

  return {
    folders,
    notes,
    trash,
    activeFolderId,
    activeNoteId,
    dark: value.dark === true,
    lastBackupAt,
    filters
  };
}

export function loadState() {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    const saved = localStorage.getItem(key);
    if (!saved) continue;
    try {
      const normalized = normalizeState(JSON.parse(saved));
      if (key === LEGACY_STORAGE_KEY) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      return normalized;
    } catch (error) {
      console.warn('تعذر قراءة بيانات محلية تالفة.', error);
    }
  }
  return defaultState();
}

export function replaceState(newState) {
  const normalized = normalizeState(newState);
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, normalized);
  save();
}

export function initState() {
  const loaded = loadState();
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, loaded);
  purgeExpiredTrash();
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('تعذر حفظ الملاحظات محليًا.', error);
  }

  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    try {
      await window.BotNoteCloudSync?.push?.(state);
    } catch (error) {
      console.warn('تعذرت المزامنة السحابية.', error);
    }
  }, 500);

  changeListeners.forEach(listener => {
    try { listener(state); } catch (error) { console.error(error); }
  });
}

export function onStateChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

// ==== سلة المحذوفات ====

export function moveToTrash(noteId) {
  const index = state.notes.findIndex(n => n.id === noteId);
  if (index === -1) return null;
  const [note] = state.notes.splice(index, 1);
  const trashEntry = {
    note,
    deletedAt: new Date().toISOString(),
    originalFolderId: note.folderId
  };
  state.trash.unshift(trashEntry);
  // نقص السعة الزائدة
  if (state.trash.length > TRASH_LIMIT) state.trash.length = TRASH_LIMIT;
  return trashEntry;
}

export function restoreFromTrash(noteId) {
  const index = state.trash.findIndex(t => t.note.id === noteId);
  if (index === -1) return null;
  const [entry] = state.trash.splice(index, 1);
  // إذا المجلد الأصلي محذوف، رجع للافتراضي
  const folderExists = state.folders.some(f => f.id === entry.originalFolderId && f.id !== 'all');
  entry.note.folderId = folderExists ? entry.originalFolderId : 'default';
  state.notes.unshift(entry.note);
  return entry.note;
}

export function deleteFromTrashPermanently(noteId) {
  const index = state.trash.findIndex(t => t.note.id === noteId);
  if (index === -1) return false;
  state.trash.splice(index, 1);
  return true;
}

export function emptyTrash() {
  const count = state.trash.length;
  state.trash = [];
  return count;
}

export function purgeExpiredTrash() {
  const now = Date.now();
  const before = state.trash.length;
  state.trash = state.trash.filter(entry => {
    const deletedTime = new Date(entry.deletedAt).getTime();
    return now - deletedTime < TRASH_RETENTION_MS;
  });
  return before - state.trash.length;
}

export function getTrashRetentionDays() {
  return Math.round(TRASH_RETENTION_MS / (24 * 60 * 60 * 1000));
}

// ==== مساعدات ====

export function activeNote() {
  return state.notes.find(n => n.id === state.activeNoteId);
}

export function findFolder(id) {
  return state.folders.find(f => f.id === id);
}
