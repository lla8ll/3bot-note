// search.js — البحث المتقدم والفلترة
// يدعم البحث النصي، الفلترة بالمجلد، بالتصنيف، وبالمثبتة فقط.

/**
 * تصفية الملاحظات حسب الحالة الحالية للتطبيق.
 * @param {object} state - الحالة الكاملة
 * @param {string} query - نص البحث
 * @returns {Array} الملاحظات المرشحة، مرتبة (المثبتة أولاً، ثم الأحدث)
 */
export function filterNotes(state, query = '') {
  const q = query.trim().toLowerCase();
  let list = state.notes.slice();

  // فلترة بالمجلد النشط
  if (state.activeFolderId !== 'all') {
    list = list.filter(n => n.folderId === state.activeFolderId);
  }

  // فلترة المثبتة فقط
  if (state.filters?.pinnedOnly) {
    list = list.filter(n => n.pinned);
  }

  // فلترة بالتصنيف
  const tagFilter = state.filters?.tag?.trim().toLowerCase();
  if (tagFilter) {
    list = list.filter(n => (n.tags || []).some(tag => tag.toLowerCase() === tagFilter));
  }

  // بحث نصي في العنوان/النص/التصنيفات
  if (q) {
    list = list.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.body || '').toLowerCase().includes(q) ||
      (n.tags || []).join(' ').toLowerCase().includes(q)
    );
  }

  return list.sort((a, b) => (b.pinned - a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * استخراج قائمة كل التصنيفات المستخدمة (للاقتراحات في فلتر التصنيفات).
 */
export function allTags(state) {
  const set = new Set();
  state.notes.forEach(n => (n.tags || []).forEach(tag => set.add(tag)));
  return Array.from(set).sort();
}
