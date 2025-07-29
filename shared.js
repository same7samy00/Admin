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

// معرف جلسة الماسح الضوئي المشترك - يجب أن يكون مطابقًا تماماً في qr_scanner.html
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

// منطق جلسة الماسح الضوئي (مخصص للتواصل مع qr_scanner.html)
let scannerSessionListenerUnsubscribe = null;

function listenToScannerSession(callback) {
    if (scannerSessionListenerUnsubscribe) {
        scannerSessionListenerUnsubscribe();
    }
    scannerSessionListenerUnsubscribe = onSnapshot(scannerSessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.status === 'scanned' && data.scannedValue) {
                callback(data.scannedValue, data.purpose);
                updateDoc(scannerSessionDocRef, {
                    status: 'readyForNextScan',
                    scannedValue: null,
                    purpose: null
                }).catch(e => console.error("Error resetting scanner status:", e));
            }
        }
    }, (error) => {
        console.error("Error listening to scanner session:", error);
        showNotification("خطأ في الاتصال بالماسح الضوئي.", "error");
    });
}

async function requestScan(purpose) {
    try {
        const docSnap = await getDoc(scannerSessionDocRef); // تم حل مشكلة getDoc is not defined هنا
        if (docSnap.exists() && (docSnap.data().status === 'phoneReady' || docSnap.data().status === 'readyForNextScan')) {
            await setDoc(scannerSessionDocRef, {
                status: 'scanRequested',
                purpose: purpose,
                requestedAt: new Date()
            }, { merge: true });
            showNotification("تم إرسال طلب المسح الضوئي إلى جهاز QR.", "info");
        } else {
            showNotification("الماسح الضوئي غير جاهز أو غير متصل. يرجى فتح صفحة الماسح.", "warning", 5000);
            console.warn("Scanner not ready. Current status:", docSnap.exists() ? docSnap.data().status : 'Document not found');
        }
    } catch (e) {
        console.error("Error requesting scan:", e);
        showNotification("فشل إرسال طلب المسح الضوئي.", "error");
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
