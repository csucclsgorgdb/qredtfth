import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let html5QrCode;

export function initAttendance() {
    const eventId = localStorage.getItem('activeEventId');
    if (!eventId) {
        alert("Please select an event first!");
        window.location.hash = "#events";
        return;
    }

    const container = document.getElementById('module-container');
    container.innerHTML = `
        <div class="scanner-section">
            <div id="reader" style="width: 100%; max-width: 500px; margin: auto;"></div>
            <div id="scan-result" class="scan-feedback">
                <h3>Ready to Scan</h3>
                <p>Position the Student ID QR code in the frame</p>
            </div>
        </div>
    `;

    startScanner();
}

function startScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
}

async function onScanSuccess(decodedText) {
    // decodedText should be the Student ID
    const eventId = localStorage.getItem('activeEventId');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const attendanceDocId = `${eventId}_${decodedText}_${today}`;
    
    const attendanceRef = doc(db, "attendance", attendanceDocId);
    const snap = await getDoc(attendanceRef);

    const beep = new Audio('assets/beep.mp3');

    try {
        if (!snap.exists()) {
            // 1st Scan: Time In
            await setDoc(attendanceRef, {
                studentId: decodedText,
                eventId: eventId,
                date: today,
                timeIn: serverTimestamp(),
                status: "In Venue"
            });
            updateUI(decodedText, "TIME IN", "success");
        } else if (snap.data().status === "In Venue") {
            // 2nd Scan: Time Out
            await updateDoc(attendanceRef, {
                timeOut: serverTimestamp(),
                status: "Present"
            });
            updateUI(decodedText, "TIME OUT", "info");
        } else {
            updateUI(decodedText, "Already Logged Today", "warning");
        }
        beep.play();
    } catch (err) {
        console.error(err);
        updateUI("Error", "Check Permissions", "danger");
    }
}

function updateUI(id, status, type) {
    const res = document.getElementById('scan-result');
    res.className = `scan-feedback ${type}`;
    res.innerHTML = `<h3>${id}</h3><p>${status}</p>`;
}
