import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function initFinance() {
    const container = document.getElementById('module-container');
    container.innerHTML = `
        <div class="module-header">
            <h2>Finance & Payments</h2>
        </div>
        <div class="payment-form">
            <input type="text" id="pay-student-id" placeholder="Student ID">
            <input type="number" id="pay-amount" placeholder="Amount (₱)">
            <input type="text" id="pay-desc" placeholder="Purpose (e.g. Tuition)">
            <button class="btn-gold" id="process-pay">Process & Email Receipt</button>
        </div>
    `;

    document.getElementById('process-pay').onclick = processPayment;
}

async function processPayment() {
    const studentId = document.getElementById('pay-student-id').value;
    const amount = document.getElementById('pay-amount').value;
    const desc = document.getElementById('pay-desc').value;

    const paymentData = {
        studentId,
        amount: parseFloat(amount),
        description: desc,
        timestamp: new Date().toLocaleString(),
        receiptId: "REC-" + Math.random().toString(36).substr(2, 9).toUpperCase()
    };

    try {
        // 1. Save to Firestore
        await addDoc(collection(db, "payments"), {
            ...paymentData,
            createdAt: serverTimestamp()
        });

        // 2. Trigger Google Apps Script Emailing
        sendToGAS(paymentData);
        alert("Payment Recorded! Receipt is being emailed.");
    } catch (e) { console.error(e); }
}

async function sendToGAS(data) {
    const GAS_URL = "YOUR_GOOGLE_SCRIPT_WEB_APP_URL";
    // Using 'no-cors' mode because GAS returns a redirect which standard fetch blocks
    await fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
    });
}
