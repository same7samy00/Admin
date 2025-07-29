// shared.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
// تأكد من استيراد getDoc هنا بالإضافة إلى باقي الوظائف
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js";

// Firebase Configuration - REPLACE WITH YOUR ACTUAL FIREBASE PROJECT CONFIG
// هذه البيانات يجب أن تكون مطابقة تماماً لبيانات مشروعك الحقيقي في Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBfgOusQjs1qj6G_92_Ecu2wjxASeO2Tko",
    authDomain: "project-2965375871585611133.firebaseapp.com",
    projectId: "project-2965375871585611133",
    storageBucket: "project-2965375871585611133.firebasestorage.app",
    messagingSenderId: "195369497927",
    appId: "1:195369497927:web:451c349c098f2a59c18862",
    measurementId: "G-YN2HRECRL0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// معرف جلسة الماسح الضوئي المشترك - يجب أن يكون مطابقًا تماماً في scanner_only.html
const SHARED_SCANNER_SESSION_ID = "YOUR_STORE_UNIQUE_SCANNER_ID_12345";
const scannerSessionDocRef = doc(db, 'scannerSessions', SHARED_SCANNER_SESSION_ID);

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

// منطق جلسة الماسح الضوئي (يتفاعل مع scanner_only.html الجديد)
let scannerSessionListenerUnsubscribe = null;
let lastKnownScannedValue = null; // لتتبع آخر قيمة ممسوحة ومنع التكرار

function listenToScannerSession(callback) {
    if (scannerSessionListenerUnsubscribe) {
        scannerSessionListenerUnsubscribe(); // إلغاء الاشتراك من المستمع السابق
    }
    scannerSessionListenerUnsubscribe = onSnapshot(scannerSessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            // تحقق مما إذا كانت الحالة "scanned" ولقد تم مسح قيمة جديدة
            if (data.status === 'scanned' && data.scannedValue && data.scannedValue !== lastKnownScannedValue) {
                lastKnownScannedValue = data.scannedValue; // تحديث آخر قيمة معروفة
                callback(data.scannedValue, data.purpose); // 'purpose' سيأتي من requestScan
                
                // إعادة تعيين الحالة في Firestore بعد المعالجة للسماح بمسح جديد
                // هذا مهم لضمان أن التغييرات المستقبلية في الماسح الضوئي سيتم اكتشافها
                updateDoc(scannerSessionDocRef, {
                    status: 'readyForNextScan',
                    scannedValue: null, // مسح القيمة الممسوحة القديمة
                    purpose: null
                }).catch(e => console.error("Error resetting scanner status in Firestore:", e));
            } else if (data.status === 'phoneReady') {
                // إذا كان الماسح الضوئي أصبح جاهزًا بعد أن كان غير متصل
                showNotification("الماسح الضوئي متصل وجاهز للاستخدام.", "info", 3000);
            }
        }
    }, (error) => {
        console.error("Error listening to scanner session:", error);
        showNotification("خطأ في الاتصال بالماسح الضوئي.", "error");
    });
}

/**
 * يرسل "غرض" المسح الضوئي إلى Firestore ليقرأه الماسح الضوئي.
 * لا يتوقع هذا الطلب أن يبدأ الماسح الضوئي، بل فقط لإبلاغه بالنية.
 * @param {string} purpose - الغرض من المسح (مثل 'search' أو 'add_new').
 */
async function requestScan(purpose) {
    try {
        // تحديث الغرض في مستند الجلسة.
        // لا نتحقق من حالة الماسح الضوئي هنا، الماسح الضوئي سيعمل باستمرار.
        await updateDoc(scannerSessionDocRef, {
            purpose: purpose,
            requestedAt: new Date()
        });
        showNotification(`تم تعيين غرض المسح إلى: ${purpose}. امسح الكود الآن على جهاز الماسح.`, "info", 4000);
    } catch (e) {
        console.error("Error sending scan purpose:", e);
        showNotification("فشل إرسال غرض المسح الضوئي.", "error");
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
    listenToScannerSession,
    requestScan
};
