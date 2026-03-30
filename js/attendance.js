import { db } from './firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, limit, startAfter, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * GLOBAL STATES
 */
let html5QrCode = null;
let eventDataMap = {};
let isScannerActive = false;
let unsubscribeAttendance = null;
const PAGE_SIZE = 20; 

// Sounds for Feedback
const audioSuccess = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const audioError = new Audio('https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3');

/**
 * HELPER: CLASSIFY STUDENT BY COURSE
 */
function classifyStudent(course) {
    if (!course) return "Other";
    const c = course.toUpperCase();
    if (c.includes("BTLED") || c.includes("BTVTED")) return "Education Student";
    if (c.includes("BSINDUSTECH")) return "Industrial Tech Student";
    return "Other Dept";
}

/**
 * MAIN: INITIALIZE MODULE
 */
export async function initAttendance() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <style>
            :root { --hero-navy: #000080; --hero-gold: #FFD700; }
            .attendance-grid { display: grid; grid-template-columns: 400px 1fr; gap: 20px; padding: 15px; }
            .scanner-card { background: #0f172a; border-radius: 20px; overflow: hidden; border: 4px solid #1e293b; position: relative; min-height: 300px; }
            #reader { width: 100% !important; border: none !important; }
            .data-table thead tr { background: var(--hero-navy); color: white; position: sticky; top: 0; }
            .status-badge { padding: 4px 8px; border-radius: 6px; font-weight: 800; font-size: 10px; }
            .btn-action { height: 45px; border-radius: 10px; font-weight: 700; transition: 0.3s; cursor: pointer; border: none; }
            .spin { animation: spin 2s linear infinite; }
            @keyframes spin { 100% { transform: rotate(360deg); } }
            @media (max-width: 900px) { .attendance-grid { grid-template-columns: 1fr; } }
        </style>

        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; background: white; padding: 15px; border-radius: 15px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <div>
                <h1 style="color:var(--hero-navy); font-weight:900; margin:0; font-size: 24px;">Attendance Monitor</h1>
                <p style="margin:0; font-size:12px; color: #64748b; font-weight: 600;">Real-time Database Sync Enabled</p>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
                <select id="attendance-event-id" class="swal2-input" style="margin:0; width:250px; height:45px; font-size:14px; border: 2px solid #e2e8f0;">
                    <option value="">-- Loading Events... --</option>
                </select>
                <button id="btn-toggle-camera" class="btn-action" style="background: var(--hero-navy); color: white; width: 180px;">
                    <span>Open Camera</span>
                </button>
            </div>
        </div>

        <div class="attendance-grid">
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div class="scanner-card">
                    <div id="reader"></div>
                    <div id="camera-placeholder" style="height:300px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#475569; background: #0f172a;">
                        <p style="font-weight:700; font-size:11px; color:#94a3b8;">CAMERA SYSTEM READY</p>
                    </div>
                </div>

                <div id="scan-feedback" style="background: white; padding: 20px; border-radius: 20px; text-align: center; border: 2px solid #f1f5f9; min-height: 140px; display: flex; flex-direction: column; justify-content: center; transition: 0.3s;">
                    <h2 id="scan-id" style="margin:0; color:var(--hero-navy); font-weight:900; font-size: 1.6rem;">---</h2>
                    <p id="scan-status" style="margin:5px 0 0 0; font-weight:700; color:#94a3b8; text-transform: uppercase; font-size: 11px;">Waiting for scan...</p>
                </div>

                <div style="background: white; padding: 15px; border-radius: 20px; border-bottom: 6px solid var(--hero-gold);">
                    <label style="display:block; font-size: 10px; font-weight: 800; color: var(--hero-navy); margin-bottom: 5px;">MANUAL ID ENTRY</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="manual-input" placeholder="Enter ID..." style="flex:1; height:50px; border-radius: 12px; border: 2px solid #e2e8f0; text-align: center; font-weight: 800; font-size: 18px;">
                        <button id="btn-manual-submit" class="btn-action" style="background: var(--hero-gold); color: black; width: 60px;">GO</button>
                    </div>
                </div>
            </div>

            <div style="background: white; border-radius: 20px; padding: 20px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0; font-size: 16px; color: var(--hero-navy); font-weight: 800;">Attendees (Direct Database)</h3>
                    <button id="btn-export-csv" class="btn-action" style="background: #f1f5f9; color: #475569; padding: 0 15px; font-size: 12px; height: 35px;">Download CSV</button>
                </div>
                <div style="overflow-x:auto; max-height: 550px;">
                    <table class="data-table" style="width:100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="text-align: left;">
                                <th style="padding:15px;">STUDENT NAME</th>
                                <th>ID & DEPT</th>
                                <th>COURSE & YEAR</th>
                                <th>TIME IN</th>
                                <th>TIME OUT</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-tbody">
                            <tr><td colspan="6" style="text-align:center; padding:100px; color:#94a3b8; font-weight: 600;">Select an event to start monitoring.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    loadOngoingEvents();
    setupCoreListeners();
}

async function loadOngoingEvents() {
    const sel = document.getElementById('attendance-event-id');
    try {
        const q = query(collection(db, "events"), where("status", "==", "Ongoing"));
        const snap = await getDocs(q);
        if(snap.empty) {
            sel.innerHTML = `<option value="">No Ongoing Events</option>`;
            return;
        }
        let options = `<option value="">-- Choose Event --</option>`;
        snap.forEach(doc => {
            eventDataMap[doc.id] = { id: doc.id, ...doc.data() };
            options += `<option value="${doc.id}">${doc.data().name}</option>`;
        });
        sel.innerHTML = options;
    } catch (e) { console.error("Event Load Error:", e); }
}

async function toggleCameraScanner(btn) {
    const readerDiv = document.getElementById('reader');
    const ph = document.getElementById('camera-placeholder');
    const btnSpan = btn.querySelector('span');

    if (isScannerActive) {
        if (html5QrCode) {
            await html5QrCode.stop();
            html5QrCode = null;
        }
        readerDiv.style.display = 'none';
        ph.style.display = 'flex';
        btn.style.background = "var(--hero-navy)";
        btnSpan.innerText = "Open Camera";
        isScannerActive = false;
    } else {
        btnSpan.innerText = "Starting...";
        readerDiv.style.display = 'block';
        ph.style.display = 'none';
        try {
            html5QrCode = new Html5Qrcode("reader");
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 15, qrbox: 250 },
                (decodedText) => {
                    handleAttendanceInput(decodedText);
                    audioSuccess.play();
                }
            );
            btn.style.background = "#ef4444"; 
            btnSpan.innerText = "Close Camera";
            isScannerActive = true;
        } catch (err) {
            Swal.fire("Camera Error", "Check permissions.", "error");
            btnSpan.innerText = "Open Camera";
        }
    }
}

async function handleAttendanceInput(id) {
    const eventId = document.getElementById('attendance-event-id').value;
    if (!eventId) return Swal.fire("Select Event", "Please choose an event first.", "warning");

    const cleanId = id.trim();
    if (!cleanId) return;

    try {
        const studentDoc = await getDoc(doc(db, "students", cleanId));
        if (!studentDoc.exists()) {
            updateUIFeedback("ID NOT FOUND", cleanId, "danger");
            audioError.play();
            return;
        }

        const student = studentDoc.data();
        const event = eventDataMap[eventId];
        const studentDept = classifyStudent(student.program);
        const sYear = (student.yearLevel || "").toString();

        // STRICT ELIGIBILITY CHECK
        const isEligibleDept = (event.targetDept === "ALL" || event.targetDept === studentDept);
        const isEligibleYear = event.targetYears.some(yr => sYear.includes(yr));

        if (!isEligibleDept || !isEligibleYear) {
            updateUIFeedback(student.fullName, "NOT ELIGIBLE FOR THIS EVENT", "danger");
            audioError.play();
            return;
        }

        const attendRef = doc(db, "attendance", `${eventId}_${cleanId}`);
        const attendSnap = await getDoc(attendRef);
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

        if (!attendSnap.exists()) {
            await setDoc(attendRef, {
                studentId: cleanId, studentName: student.fullName, courseYear: `${student.program} - ${sYear}`,
                classification: studentDept, eventId: eventId, eventName: event.name, timeIn: timeNow,
                timeOut: null, status: "In Venue", timestamp: serverTimestamp()
            });
            updateUIFeedback(student.fullName, "TIME IN SUCCESS", "success");
            audioSuccess.play();
        } else {
            const data = attendSnap.data();
            if (data.status === "In Venue") {
                await updateDoc(attendRef, { timeOut: timeNow, status: "Present" });
                updateUIFeedback(student.fullName, "TIME OUT SUCCESS", "info");
                audioSuccess.play();
            } else {
                updateUIFeedback(student.fullName, "ALREADY LOGGED OUT", "warning");
            }
        }
    } catch (err) { console.error("Scan Process Error:", err); }
}

function updateUIFeedback(name, status, type) {
    const box = document.getElementById('scan-feedback');
    const idH = document.getElementById('scan-id');
    const stP = document.getElementById('scan-status');
    const themes = {
        success: { bg: '#dcfce7', text: '#16a34a' },
        info: { bg: '#dbeafe', text: '#2563eb' },
        warning: { bg: '#fef9c3', text: '#ca8a04' },
        danger: { bg: '#fee2e2', text: '#dc2626' }
    };
    const theme = themes[type];
    box.style.background = theme.bg; idH.innerText = name; idH.style.color = theme.text;
    stP.innerText = status; stP.style.color = theme.text;

    setTimeout(() => {
        box.style.background = "white"; idH.innerText = "---"; idH.style.color = "var(--hero-navy)";
        stP.innerText = "Waiting for scan..."; stP.style.color = "#94a3b8";
    }, 4000);
}

function refreshAttendanceTable() {
    const eventId = document.getElementById('attendance-event-id').value;
    const tbody = document.getElementById('attendance-tbody');
    
    if (unsubscribeAttendance) unsubscribeAttendance();
    if (!eventId) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">Syncing Attendees...</td></tr>`;

    // DIRECT READ FROM ATTENDANCE COLLECTION
    const q = query(collection(db, "attendance"), where("eventId", "==", eventId), orderBy("timestamp", "desc"));
    
    unsubscribeAttendance = onSnapshot(q, (snap) => {
        if (snap.empty) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:#94a3b8;">No valid scans yet.</td></tr>`;
            return;
        }

        let html = "";
        snap.forEach(doc => {
            const log = doc.data();
            const sColor = log.status === "Present" ? "#16a34a" : (log.status === "In Venue" ? "#ca8a04" : "#ef4444");
            html += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding:15px; font-weight:700;">${log.studentName}</td>
                    <td><b>${log.studentId}</b><br><small>${log.classification}</small></td>
                    <td>${log.courseYear}</td>
                    <td>${log.timeIn || '--'}</td>
                    <td>${log.timeOut || '--'}</td>
                    <td><span class="status-badge" style="background:${sColor}20; color:${sColor}">${log.status}</span></td>
                </tr>`;
        });
        tbody.innerHTML = html;
    }, (err) => {
        console.error("Listener Error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Firebase Error: ${err.message}</td></tr>`;
    });
}

function setupCoreListeners() {
    const input = document.getElementById('manual-input');
    const btnSubmit = document.getElementById('btn-manual-submit');
    const eventSel = document.getElementById('attendance-event-id');

    const handleManual = () => { if(input.value.trim()) { handleAttendanceInput(input.value.trim()); input.value = ""; } };
    
    input.onkeypress = (e) => { if(e.key === 'Enter') handleManual(); };
    btnSubmit.onclick = handleManual;
    document.getElementById('btn-toggle-camera').onclick = (e) => toggleCameraScanner(e.currentTarget);
    document.getElementById('btn-export-csv').onclick = exportToCSV;
    eventSel.onchange = () => refreshAttendanceTable();
}

async function exportToCSV() {
    const eventId = document.getElementById('attendance-event-id').value;
    if(!eventId) return Swal.fire("Export", "Select event first.", "info");
    const q = query(collection(db, "attendance"), where("eventId", "==", eventId));
    const snap = await getDocs(q);
    let csv = "ID,Name,Dept,Course_Year,Time_In,Time_Out,Status\n";
    snap.forEach(doc => { const v = doc.data(); csv += `"${v.studentId}","${v.studentName}","${v.classification}","${v.courseYear}","${v.timeIn}","${v.timeOut || ''}","${v.status}"\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Attendance_Report.csv`; a.click();
}
