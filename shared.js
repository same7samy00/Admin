// shared.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js";

// Firebase Configuration - REPLACE WITH YOUR ACTUAL FIREBASE PROJECT CONFIG
// تأكد أن هذه البيانات مطابقة تماماً لما تحصل عليه من Firebase Console
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // استبدل بهذا
    authDomain: "YOUR_AUTH_DOMAIN", // استبدل بهذا
    projectId: "YOUR_PROJECT_ID", // استبدل بهذا
    storageBucket: "YOUR_STORAGE_BUCKET", // استبدل بهذا
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // استبدل بهذا
    appId: "YOUR_APP_ID", // استبدل بهذا
    measurementId: "YOUR_MEASUREMENT_ID" // استبدل بهذا
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// *** متغيرات خاصة بجلسة الماسح الضوئي (مهمة جداً) ***
// يجب أن يكون هذا الـ ID فريدًا ومعروفًا لكلا الجهازين (الكمبيوتر والهاتف)
// يمكنك تغيير هذا الـ ID إلى أي سلسلة عشوائية، فقط تأكد أنها متطابقة في جميع الملفات
const SCANNER_SESSION_ID = "myScannerSession123"; 
const scannerSessionDocRef = doc(db, "scannerSessions", SCANNER_SESSION_ID);
let lastProcessedScannedValue = null; // لتجنب معالجة نفس القيمة مرتين

// الإعدادات الافتراضية للأذونات
let currentSettings = {
    canAddProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canAccessSalesHistory: true,
    canAccessSettings: true
};

// تحميل الإعدادات من Firestore
function loadSettings() {
    const settingsDocRef = doc(db, 'settings', 'userPermissions');
    onSnapshot(settingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            currentSettings = { ...currentSettings, ...docSnap.data() };
            console.log("Settings updated:", currentSettings);
            const event = new CustomEvent('settingsUpdated');
            document.dispatchEvent(event);
        } else {
            console.warn("No user permissions settings found. Using default and creating a default doc.");
            setDoc(settingsDocRef, currentSettings, { merge: true }).catch(e => console.error("Error creating default settings:", e));
        }
    }, (error) => {
        console.error("Error listening to settings:", error);
        showNotification("خطأ في تحميل الإعدادات.", "error");
    });
}

// وظيفة عرض الإشعارات
function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.warn("Notification container not found. Notification will not be displayed.");
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    let iconClass = '';
    if (type === 'success') iconClass = 'ri-check-line';
    else if (type === 'error') iconClass = 'ri-error-warning-line';
    else if (type === 'warning') iconClass = 'ri-alert-line';
    else iconClass = 'ri-information-line';

    notification.innerHTML = `<i class="${iconClass}"></i><span>${message}</span>`;
    
    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        notification.addEventListener('transitionend', () => notification.remove());
    }, duration);
}

// وظيفة عرض نافذة التأكيد
function showConfirmation(message, onConfirm) {
    const overlay = document.getElementById('confirmationModalOverlay');
    const messageEl = document.getElementById('confirmationMessage');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelConfirmBtn');

    if (!overlay || !messageEl || !confirmBtn || !cancelBtn) {
        console.error("Confirmation modal elements not found. Cannot show confirmation.");
        if (confirm(message)) {
            onConfirm();
        }
        return;
    }

    messageEl.textContent = message;
    overlay.classList.add('show');

    const handleConfirm = () => {
        onConfirm();
        overlay.classList.remove('show');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    const handleCancel = () => {
        overlay.classList.remove('show');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
}

// وظائف التحقق من الأذونات
function canAddProducts() { return currentSettings.canAddProducts; }
function canEditProducts() { return currentSettings.canEditProducts; }
function canDeleteProducts() { return currentSettings.canDeleteProducts; }
function canAccessSalesHistory() { return currentSettings.canAccessSalesHistory; }
function canAccessSettings() { return currentSettings.canAccessSettings; }

// *** وظائف الماسح الضوئي باستخدام Firestore ***

// وظيفة لطلب المسح (تستخدمها صفحات الكمبيوتر)
async function requestScan(purpose) {
    try {
        await setDoc(scannerSessionDocRef, { 
            status: "requested", 
            purpose: purpose, 
            timestamp: new Date(),
            scannedValue: null // مسح القيمة السابقة
        });
        console.log("Scan requested for purpose:", purpose);
        showNotification(`الماسح جاهز. يرجى مسح الكود من هاتفك لـ ${purpose === 'search' ? 'البحث' : 'إضافة منتج'}.`, "info", 5000);
    } catch (e) {
        console.error("Error requesting scan:", e);
        showNotification("فشل طلب المسح. تأكد من اتصال Firebase.", "error");
    }
}

// وظيفة للاستماع إلى جلسة الماسح الضوئي (تستخدمها صفحات الكمبيوتر)
function listenToScannerSession(callback) {
    onSnapshot(scannerSessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Scanner session data received:", data);
            if (data.status === "scanned" && data.scannedValue && data.scannedValue !== lastProcessedScannedValue) {
                lastProcessedScannedValue = data.scannedValue; // تحديث القيمة المعالجة
                callback(data.scannedValue, data.purpose);
                // بعد المعالجة، يمكن إعادة تعيين الحالة في Firestore لتجنب التكرار
                updateDoc(scannerSessionDocRef, { status: "processed", scannedValue: null }).catch(e => console.error("Error updating scanner session status:", e));
            }
        } else {
            console.log("Scanner session document does not exist. Creating a default one.");
            setDoc(scannerSessionDocRef, { status: "idle", purpose: null, timestamp: new Date(), scannedValue: null }).catch(e => console.error("Error creating default scanner session:", e));
        }
    }, (error) => {
        console.error("Error listening to scanner session:", error);
        showNotification("خطأ في الاستماع للماسح الضوئي.", "error");
    });
}

// وظيفة لتحديث الكود الممسوح (تستخدمها صفحة الماسح الضوئي)
async function updateScannedValue(value, purpose) {
    try {
        await updateDoc(scannerSessionDocRef, { 
            status: "scanned", 
            scannedValue: value, 
            purpose: purpose,
            timestamp: new Date()
        });
        console.log("Scanned value updated in Firestore:", value);
    } catch (e) {
        console.error("Error updating scanned value in Firestore:", e);
        showNotification("فشل إرسال الكود إلى السيرفر.", "error");
    }
}

// تصدير الكائنات والوظائف لتكون متاحة للصفحات الأخرى
export { 
    db, 
    app, 
    analytics, 
    showNotification, 
    showConfirmation, 
    loadSettings,
    canAddProducts, 
    canEditProducts, 
    canDeleteProducts, 
    canAccessSalesHistory, 
    canAccessSettings,
    requestScan, // تم إضافتها
    listenToScannerSession, // تم إضافتها
    updateScannedValue, // تم إضافتها
    SCANNER_SESSION_ID // تم إضافتها
};
