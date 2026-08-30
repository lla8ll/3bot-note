// app.js — نقطة الدخول: تربط بين الواجهة (DOM) والوحدات الأخرى.
// كل الأزرار تُوَصَّل هنا فقط.

import { initState, state, onStateChange, save } from './state.js';
import { render, renderNotes, initRender, setViewMode } from './render.js';
import {
  addFolder,
  newNote,
  togglePin,
  deleteActiveNote,
  toggleDark,
  setFilter
} from './actions.js';
import { exportJSON, exportMarkdown, importJSON, importMarkdown } from './io.js';
import { initSummarize, summarizeNote } from './summarize.js';
import { showToast } from './toast.js';
import { alertDialog } from './modal.js';

// ==== تجميع عناصر DOM ====
const els = {
  app: document.getElementById('app'),
  folderList: document.getElementById('folderList'),
  noteList: document.getElementById('noteList'),
  editorBody: document.getElementById('editorBody'),
  searchInput: document.getElementById('searchInput'),
  aiSummary: document.getElementById('aiSummary'),
  summarizeBtn: document.getElementById('summarizeBtn'),
  pinBtn: document.getElementById('pinBtn'),
  trashBtn: document.getElementById('trashBtn'),
  tagFilter: document.getElementById('tagFilter'),
  pinnedFilter: document.getElementById('pinnedFilter'),
  backupBanner: document.getElementById('backupBanner')
};

// ==== تهيئة ====
initState();
initRender(els);
initSummarize(els.summarizeBtn, els.aiSummary);

// إعادة العرض مع كل تغير في الحالة
onStateChange(() => render());

// ==== ربط الأزرار ====

document.getElementById('newNoteBtn').onclick = () => {
  newNote();
  els.app.dataset.mobileView = 'editor';
  setTimeout(() => document.getElementById('titleInput')?.focus(), 50);
};

document.getElementById('addFolderBtn').onclick = async () => {
  const input = document.getElementById('newFolderName');
  const name = input.value.trim();
  if (!name) return;
  await addFolder(name);
  input.value = '';
};

document.getElementById('newFolderName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('addFolderBtn').click();
});

document.getElementById('deleteBtn').onclick = () => deleteActiveNote();
document.getElementById('pinBtn').onclick = () => togglePin();
document.getElementById('summarizeBtn').onclick = () => summarizeNote();
document.getElementById('themeBtn').onclick = () => toggleDark();

document.getElementById('exportJsonBtn').onclick = () => {
  exportJSON();
  showToast('تم تنزيل النسخة الاحتياطية.', { type: 'success', duration: 2500 });
};
document.getElementById('exportMdBtn').onclick = () => {
  exportMarkdown();
  showToast('تم تنزيل الملاحظات بصيغة Markdown.', { type: 'success', duration: 2500 });
};

document.getElementById('importJsonInput').onchange = async e => {
  try {
    await importJSON(e.target.files[0]);
    showToast('تم استيراد الملفات بنجاح.', { type: 'success', duration: 2500 });
  } catch (err) {
    await alertDialog(err.message);
  } finally {
    e.target.value = '';
  }
};

document.getElementById('importMdInput').onchange = async e => {
  try {
    await importMarkdown(e.target.files[0]);
    showToast('تم استيراد الملفات بنجاح.', { type: 'success', duration: 2500 });
  } catch (err) {
    await alertDialog(err.message);
  } finally {
    e.target.value = '';
  }
};

// البحث
els.searchInput.oninput = () => renderNotes();

// فلتر التصنيف
if (els.tagFilter) {
  els.tagFilter.onchange = () => setFilter({ tag: els.tagFilter.value });
}

// فلتر المثبتة فقط
if (els.pinnedFilter) {
  els.pinnedFilter.onclick = () => setFilter({ pinnedOnly: !state.filters?.pinnedOnly });
}

// زر السلة
if (els.trashBtn) {
  let showingTrash = false;
  els.trashBtn.onclick = () => {
    showingTrash = !showingTrash;
    setViewMode(showingTrash ? 'trash' : 'notes');
    els.trashBtn.classList.toggle('active', showingTrash);
  };
}

// أزرار الجوال (data-go)
document.querySelectorAll('[data-go]').forEach(btn => {
  btn.onclick = () => { els.app.dataset.mobileView = btn.dataset.go; };
});

// ==== Service Worker ====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('تعذر تسجيل Service Worker.', error);
    });
  });
}

// ==== تشغيل ====
render();
