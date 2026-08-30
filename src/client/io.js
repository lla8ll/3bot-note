// io.js — استيراد/تصدير JSON وMarkdown
// نفس المنطق الأصلي مع تنظيف وفصل الاهتمامات.

import { state, replaceState, save, makeId } from './state.js';

function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

function validDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function exportJSON() {
  download('3bot-note-backup.json', JSON.stringify(state, null, 2), 'application/json');
  state.lastBackupAt = new Date().toISOString();
  save();
}

export function exportMarkdown() {
  const exportData = {
    version: 1,
    folders: state.folders.filter(folder => !folder.system).map(folder => ({ key: folder.id, name: folder.name })),
    notes: state.notes.map(n => ({
      title: n.title,
      body: n.body,
      folderKey: n.folderId,
      folder: state.folders.find(folder => folder.id === n.folderId)?.name || 'ملاحظاتي',
      tags: n.tags,
      pinned: n.pinned,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt
    }))
  };
  const embeddedData = JSON.stringify(exportData).replace(/</g, '\\u003c');
  const readableNotes = state.notes.map(n => {
    const folder = state.folders.find(f => f.id === n.folderId)?.name || 'بدون مجلد';
    const title = (n.title || 'ملاحظة بدون عنوان').replace(/[\r\n]+/g, ' ');
    return `# ${title}\n\n- المجلد: ${folder}\n- مثبتة: ${n.pinned ? 'نعم' : 'لا'}\n- التصنيفات: ${(n.tags || []).join(', ')}\n- آخر تحديث: ${n.updatedAt}\n\n${n.body || ''}\n`;
  }).join('\n---\n\n');
  const closingScriptTag = '<' + '/script>';
  const md = `<!-- 3bot Note Markdown Export v1 -->\n<script type="application/json" id="3bot-note-export-data">\n${embeddedData}\n${closingScriptTag}\n\n${readableNotes}`;
  download('3bot-note-notes.md', md, 'text/markdown');
  state.lastBackupAt = new Date().toISOString();
  save();
}

export async function importJSON(file) {
  if (!file || file.size > 5_000_000) throw new Error('ملف JSON مفقود أو أكبر من 5MB.');
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data?.notes) || !Array.isArray(data?.folders)) {
    throw new Error('ملف JSON غير صالح.');
  }
  replaceState(data);
}

export async function importMarkdown(file) {
  if (!file || file.size > 5_000_000) throw new Error('ملف Markdown مفقود أو أكبر من 5MB.');
  const text = (await file.text()).replace(/^\uFEFF/, '');
  const now = new Date().toISOString();
  const embeddedMatch = text.match(/^<!-- 3bot Note Markdown Export v1 -->\r?\n<script type="application\/json" id="3bot-note-export-data">\r?\n([\s\S]*?)\r?\n<\/script>/);
  let records;
  let exportedFolders = [];

  if (embeddedMatch) {
    const parsed = JSON.parse(embeddedMatch[1]);
    if (parsed?.version !== 1 || !Array.isArray(parsed.notes)) {
      throw new Error('بيانات 3bot Note المضمنة غير صالحة.');
    }
    records = parsed.notes;
    exportedFolders = Array.isArray(parsed.folders) ? parsed.folders : [];
  } else {
    const normalizedText = text.replace(/\r\n?/g, '\n');
    const parts = normalizedText.split(/\n{2,}---\n{2,}(?=#\s)/g).filter(part => part.trim());
    records = parts.map(part => {
      const title = (part.match(/^#\s+(.+)$/m) || [, 'ملاحظة مستوردة'])[1];
      const metadataMatch = part.match(/<!-- 3bot-note-meta:([^\s]+) -->/);
      let metadata = {};
      if (metadataMatch) {
        try { metadata = JSON.parse(decodeURIComponent(metadataMatch[1])); }
        catch { metadata = {}; }
      }
      const legacyFolder = (part.match(/^- المجلد:\s*(.+)$/m) || [, ''])[1].trim();
      const legacyTags = (part.match(/^- التصنيفات:\s*(.*)$/m) || [, ''])[1]
        .split(',').map(tag => tag.trim()).filter(Boolean);
      const body = part
        .replace(/^#\s+.+\n?/, '')
        .replace(/<!-- 3bot-note-meta:[^\s]+ -->\n?/m, '')
        .replace(/^(?:- (?:المجلد|مثبتة|التصنيفات|آخر تحديث):.*\n?){1,4}/m, '')
        .trim();
      return {
        title,
        body,
        folder: typeof metadata.folder === 'string' ? metadata.folder : legacyFolder,
        tags: Array.isArray(metadata.tags) ? metadata.tags : legacyTags,
        pinned: metadata.pinned === true || /^- مثبتة:\s*نعم$/m.test(part),
        updatedAt: metadata.updatedAt
      };
    });
  }

  if (records.length > 5000 || records.length + state.notes.length > 5000) {
    throw new Error('يتجاوز الاستيراد الحد الإجمالي البالغ 5000 ملاحظة.');
  }

  const folderLimit = 502;
  const importedFolderIds = new Map([['default', 'default']]);

  function createExportedFolder(folder) {
    const key = typeof folder?.key === 'string' ? folder.key : '';
    const name = typeof folder?.name === 'string' ? folder.name.trim().slice(0, 80) : '';
    if (!key || !name || importedFolderIds.has(key)) return;
    if (state.folders.length >= folderLimit) return;
    const importedFolder = { id: makeId('f'), name, system: false };
    state.folders.push(importedFolder);
    importedFolderIds.set(key, importedFolder.id);
  }

  function resolveFolderId(folderName, folderKey) {
    if (typeof folderKey === 'string' && importedFolderIds.has(folderKey)) {
      return importedFolderIds.get(folderKey);
    }
    const name = typeof folderName === 'string' ? folderName.trim().slice(0, 80) : '';
    if (!name) return 'default';
    const existing = state.folders.find(folder => folder.name === name && folder.id !== 'all');
    if (existing) return existing.id;
    if (state.folders.length >= folderLimit) return 'default';
    const folder = { id: makeId('f'), name, system: false };
    state.folders.push(folder);
    return folder.id;
  }

  exportedFolders.slice(0, 500).forEach(createExportedFolder);
  const importedNotes = records.flatMap(record => {
    if (!record || typeof record !== 'object') return [];
    const tags = Array.isArray(record.tags) ? record.tags : [];
    return [{
      id: makeId('md'),
      title: typeof record.title === 'string' ? record.title.slice(0, 500) : 'ملاحظة مستوردة',
      body: typeof record.body === 'string' ? record.body.slice(0, 200000) : '',
      folderId: resolveFolderId(record.folder, record.folderKey),
      tags: tags.filter(tag => typeof tag === 'string').map(tag => tag.slice(0, 40)).slice(0, 30),
      pinned: record.pinned === true,
      createdAt: validDate(record.createdAt, now),
      updatedAt: validDate(record.updatedAt, now)
    }];
  });

  state.notes = [...importedNotes, ...state.notes];
  replaceState(state);
}
