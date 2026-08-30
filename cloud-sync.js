/*
  cloud-sync.js
  هذا الملف يضع واجهة مزامنة سحابية غير مفعلة تلقائيًا.
  يتطلب الاستخدام الفعلي مصادقة وقواعد صلاحيات تعزل بيانات كل مستخدم.

  ملاحظة مهمة:
  لا تضع مفاتيح سرية خاصة بالخادم داخل تطبيق واجهة أمامية.
  استخدم فقط مفاتيح public/anon المسموح بها للمتصفح.
*/

window.BotNoteCloudSync = {
  enabled: false,

  async push(_state) {
    if (!this.enabled) return;
    // Firebase/Supabase push هنا
  },

  async pull() {
    if (!this.enabled) return null;
    // Firebase/Supabase pull هنا
    return null;
  }
};

/*
مثال Firebase تقريبي:

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_PUBLIC_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.BotNoteCloudSync = {
  enabled: true,
  async push(state) {
    await setDoc(doc(db, "3bot-note", CURRENT_AUTHENTICATED_USER_ID), { state, updatedAt: Date.now() });
  },
  async pull() {
    const snap = await getDoc(doc(db, "3bot-note", CURRENT_AUTHENTICATED_USER_ID));
    return snap.exists() ? snap.data().state : null;
  }
};
*/

/*
مثال Supabase تقريبي:

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient("YOUR_SUPABASE_URL", "YOUR_SUPABASE_ANON_KEY");

window.BotNoteCloudSync = {
  enabled: true,
  async push(state) {
    await supabase.from("3bot-note").upsert({ id: CURRENT_AUTHENTICATED_USER_ID, state, updated_at: new Date().toISOString() });
  },
  async pull() {
    const { data } = await supabase.from("3bot-note").select("state").eq("id", CURRENT_AUTHENTICATED_USER_ID).single();
    return data?.state || null;
  }
};
*/
