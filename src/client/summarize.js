// summarize.js — استدعاء واجهة التلخيص الآمنة
// النداء يذهب إلى /api/summarize، ولا يمر مفتاح OpenAI عبر المتصفح.

import { activeNote } from './state.js';
import { alertDialog } from './modal.js';

export const MAX_SUMMARY_CHARS = 12_000;

let summaryController;
let summaryRequestToken = 0;
let btnEl;
let panelEl;

export function initSummarize(button, panel) {
  btnEl = button;
  panelEl = panel;
}

export function hideSummary() {
  summaryRequestToken += 1;
  summaryController?.abort();
  summaryController = undefined;
  if (btnEl) {
    btnEl.disabled = false;
    btnEl.textContent = '✨ تلخيص';
  }
  if (panelEl) {
    panelEl.hidden = true;
    panelEl.textContent = '';
  }
}

export async function summarizeNote() {
  const note = activeNote();
  const text = note?.body?.trim();
  if (!text) {
    await alertDialog('اكتب نصًا في الملاحظة قبل طلب التلخيص.');
    return;
  }
  if (text.length > MAX_SUMMARY_CHARS) {
    await alertDialog(`الحد الأقصى للتلخيص ${MAX_SUMMARY_CHARS.toLocaleString('ar-SA')} حرفًا.`);
    return;
  }

  summaryController?.abort();
  const controller = new AbortController();
  summaryController = controller;
  const requestToken = ++summaryRequestToken;
  const requestedNoteId = note.id;
  const requestedText = text;

  btnEl.disabled = true;
  btnEl.textContent = '⏳ جارٍ التلخيص';
  panelEl.hidden = false;
  panelEl.textContent = 'جارٍ إعداد الملخص الآمن...';

  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.summary !== 'string') {
      throw new Error(payload.error || 'تعذر تلخيص الملاحظة.');
    }

    const currentNote = activeNote();
    if (requestToken !== summaryRequestToken ||
        currentNote?.id !== requestedNoteId ||
        currentNote.body.trim() !== requestedText) return;

    const heading = document.createElement('strong');
    heading.textContent = 'ملخص بالذكاء الاصطناعي';
    panelEl.replaceChildren(heading, document.createTextNode(payload.summary));
  } catch (error) {
    if (error?.name === 'AbortError' || requestToken !== summaryRequestToken) return;
    panelEl.textContent = error.message || 'تعذر تلخيص الملاحظة.';
  } finally {
    if (requestToken === summaryRequestToken) {
      summaryController = undefined;
      btnEl.disabled = false;
      btnEl.textContent = '✨ تلخيص';
    }
  }
}
