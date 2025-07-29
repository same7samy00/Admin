// shared.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js";

// Firebase Configuration - تم تضمين البيانات التي قدمتها
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

// *** متغيرات خاصة بجلسة الماسح الضوئي (مهمة جداً) ***
const SCANNER_SESSION_ID = "myScannerSession123"; 
const scannerSessionDocRef = doc(db, "scannerSessions", SCANNER_SESSION_ID);
let lastProcessedScannedValue = null; 

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

// وظيفة لطلب المسح (تستخدمها صفحات الكمبيوتر لفتح الماسح ولإرسال الغرض)
async function requestScan(purpose) {
    try {
        // تحديث حالة Firestore لـ "requested" لإخبار صفحة الماسح ببدء العمل
        await setDoc(scannerSessionDocRef, { 
            status: "requested", 
            purpose: purpose, 
            timestamp: new Date(),
            scannedValue: null // مسح القيمة السابقة
        });
        console.log("Scan requested for purpose:", purpose);
        showNotification(`تم إرسال طلب المسح. افتح صفحة الماسح وقم بالمسح.`, "info", 5000);
        
        // يمكنك فتح نافذة الماسح هنا إذا كنت تتوقعها على نفس الجهاز
        // window.open('scanner_only.html', '_blank', 'width=450,height=550,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=yes');
        
    } catch (e) {
        console.error("Error requesting scan:", e);
        showNotification("فشل طلب المسح. تأكد من اتصال Firebase وقواعد الأمان.", "error");
    }
}

// وظيفة للاستماع إلى جلسة الماسح الضوئي (تستخدمها صفحات الكمبيوتر لاستقبال النتائج)
function listenToScannerSession(callback) {
    onSnapshot(scannerSessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("shared.js: Scanner session data received:", data);
            
            // إذا كانت الحالة "scanned" ولقد تم مسح قيمة جديدة
            if (data.status === "scanned" && data.scannedValue && data.scannedValue !== lastProcessedScannedValue) {
                lastProcessedScannedValue = data.scannedValue; // تحديث القيمة المعالجة
                callback(data.scannedValue, data.purpose); // استدعاء الكولباك في الصفحة الرئيسية
                
                // بعد المعالجة، يتم إعادة تعيين الحالة في Firestore لتجنب التكرار
                updateDoc(scannerSessionDocRef, { status: "processed", scannedValue: null }).catch(e => console.error("Error updating scanner session status:", e));
            } else if (data.status === "processed" && lastProcessedScannedValue !== null) {
                // إذا تلقينا تأكيد المعالجة، يمكننا مسح القيمة المخزنة
                lastProcessedScannedValue = null;
                console.log("shared.js: lastProcessedScannedValue reset.");
            } else if (data.status === "idle" || data.status === "phoneReady") {
                // قد لا تحتاج رسالة لكل حالة خمول إذا كانت مزعجة
                console.log("Scanner is idle or ready.");
            }

        } else {
            console.log("Scanner session document does not exist. Creating a default one.");
            setDoc(scannerSessionDocRef, { status: "idle", purpose: null, timestamp: new Date(), scannedValue: null }).catch(e => console.error("Error creating default scanner session:", e));
        }
    }, (error) => {
        console.error("shared.js: Error listening to scanner session:", error);
        showNotification("خطأ في الاستماع للماسح الضوئي. تأكد من اتصال Firebase.", "error");
    });
}

// وظيفة لتحديث الكود الممسوح (تستخدمها صفحة الماسح الضوئي scanner_only.html)
async function updateScannedValue(value, purpose) {
    try {
        await updateDoc(scannerSessionDocRef, { 
            status: "scanned", 
            scannedValue: value, 
            purpose: purpose,
            timestamp: new Date()
        });
        console.log("Scanner updated Firestore with value:", value);
    } catch (e) {
        console.error("Scanner: Error updating scanned value in Firestore:", e);
        // يمكنك هنا عرض رسالة خطأ للمستخدم على صفحة الماسح
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
    requestScan, 
    listenToScannerSession, 
    updateScannedValue,
    SCANNER_SESSION_ID 
};
