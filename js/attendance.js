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
let lastVisibleStudent = null;
let currentPage = 1;
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
            .scanner-card { background: #0f172a; border-radius: 20px; overflow: hidden; border: 4px solid #1e293b; position: relative; }
            #reader { width: 100% !important; border: none !important; }
            #reader__dashboard_section_csr button { background: var(--hero-gold) !important; color: black !important; border-radius: 8px !important; }
            .data-table thead tr { background: var(--hero-navy); color: white; position: sticky; top: 0; }
            .status-badge { padding: 4px 8px; border-radius: 6px; font-weight: 800; font-size: 10px; }
            .btn-action { height: 45px; border-radius: 10px; font-weight: 700; transition: 0.3s; cursor: pointer; border: none; }
            .spin { animation: spin 2s linear infinite; }
            @keyframes spin { 100% { transform: rotate(360deg); } }
            @media (max-width: 900px) { .attendance-grid { grid-template-columns: 1fr; } }
        </style>

        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; background: white; padding: 15px; border-radius: 15px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <div>
                <h1 style="color:var(--hero-navy); font-weight:900; margin:0; font-size: 24px;">Attendance System</h1>
                <p style="margin:0; font-size:12px; color: #64748b; font-weight: 600;">Event-Based Participant Validation</p>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
                <select id="attendance-event-id" class="swal2-input" style="margin:0; width:250px; height:45px; font-size:14px; border: 2px solid #e2e8f0;">
                    <option value="">-- Loading Events... --</option>
                </select>
                <button id="btn-toggle-camera" class="btn-action" style="background: var(--hero-navy); color: white; width: 180px;">
                    <i data-lucide="camera"></i> <span>Open Camera</span>
                </button>
            </div>
        </div>

        <div class="attendance-grid">
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div class="scanner-card">
                    <div id="reader" style="display:none;"></div>
                    <div id="camera-placeholder" style="height:300px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#475569; background: #0f172a;">
                        <i data-lucide="aperture" class="spin" style="width:60px; height:60px; opacity:0.2;"></i>
                        <p style="margin-top:15px; font-weight:700; letter-spacing:1px; font-size:11px;">READY TO INITIALIZE</p>
                    </div>
                </div>

                <div id="scan-feedback" style="background: white; padding: 20px; border-radius: 20px; text-align: center; border: 2px solid #f1f5f9; min-height: 140px; display: flex; flex-direction: column; justify-content: center;">
                    <h2 id="scan-id" style="margin:0; color:var(--hero-navy); font-weight:900; font-size: 1.6rem;">---</h2>
                    <p id="scan-status" style="margin:5px 0 0 0; font-weight:700; color:#94a3b8; text-transform: uppercase; font-size: 11px;">Waiting for scan...</p>
                </div>

                <div style="background: white; padding: 15px; border-radius: 20px; border-bottom: 6px solid var(--hero-gold);">
                    <label style="display:block; font-size: 10px; font-weight: 800; color: var(--hero-navy); margin-bottom: 5px; margin-left: 5px;">MANUAL OVERRIDE / BARCODE GUN</label>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="manual-input" placeholder="Enter ID..." style="flex:1; height:50px; border-radius: 12px; border: 2px solid #e2e8f0; text-align: center; font-weight: 800; font-size: 18px;">
                        <button id="btn-manual-submit" class="btn-action" style="background: var(--hero-gold); color: black; width: 60px;">
                            <i data-lucide="send"></i>
                        </button>
                    </div>
                </div>
            </div>

            <div style="background: white; border-radius: 20px; padding: 20px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0; font-size: 16px; color: var(--hero-navy); font-weight: 800;">
                        <i data-lucide="users" style="vertical-align: middle; margin-right: 5px;"></i> Participant Monitor
                    </h3>
                    <div style="display:flex; gap:10px;">
                        <button id="btn-export-csv" class="btn-action" style="background: #f1f5f9; color: #475569; padding: 0 15px; font-size: 12px; height: 35px;">Export CSV</button>
                        <div style="display:flex; align-items:center; background:#f8fafc; border-radius:10px; padding: 2px 8px; border: 1px solid #e2e8f0;">
                            <button id="prev-page" style="border:none; background:none; cursor:pointer; padding: 5px;"><i data-lucide="chevron-left" style="width:18px;"></i></button>
                            <span id="page-num" style="font-weight:900; font-size:12px; margin: 0 10px;">PAGE 1</span>
                            <button id="next-page" style="border:none; background:none; cursor:pointer; padding: 5px;"><i data-lucide="chevron-right" style="width:18px;"></i></button>
                        </div>
                    </div>
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
                            <tr><td colspan="6" style="text-align:center; padding:100px; color:#94a3b8; font-weight: 600;">Please select an event to display participants.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    loadOngoingEvents();
    setupCoreListeners();
    lucide.createIcons();
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
            eventDataMap[doc.id] = doc.data();
            options += `<option value="${doc.id}">${doc.data().name}</option>`;
        });
        sel.innerHTML = options;
    } catch (e) { console.error("Event Load Error:", e); }
}

/**
 * CAMERA LIFECYCLE: CLEAN VERSION (No more Debug Alerts)
 */
async function toggleCameraScanner(btn) {
    const readerDiv = document.getElementById('reader');
    const ph = document.getElementById('camera-placeholder');
    const btnSpan = btn.querySelector('span');

    if (isScannerActive) {
        btnSpan.innerText = "Closing...";
        if (html5QrCode) {
            try {
                await html5QrCode.stop();
                await html5QrCode.clear();
            } catch (err) { console.warn("Cleanup Warning:", err); }
            html5QrCode = null;
        }
        readerDiv.style.display = 'none';
        readerDiv.innerHTML = ""; 
        ph.style.display = 'flex';
        btn.style.background = "var(--hero-navy)";
        btnSpan.innerText = "Open Camera";
        isScannerActive = false;
    } else {
        // Diretsong initialize na tayo, wala nang abalang alert
        btnSpan.innerText = "Initializing...";
        readerDiv.style.display = 'block';
        ph.style.display = 'none';

        try {
            const devices = await Html5Qrcode.getCameras();
            if (!devices || devices.length === 0) throw new Error("No camera detected.");

            html5QrCode = new Html5Qrcode("reader", { verbose: false }); // Ginawa nating false ang verbose para clean console
            
            const qrConfig = { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

            await html5QrCode.start(
                { facingMode: "environment" }, 
                qrConfig,
                (decodedText) => {
                    handleAttendanceInput(decodedText);
                    html5QrCode.pause(true);
                    setTimeout(() => { if(html5QrCode) html5QrCode.resume(); }, 3000);
                }
            );

            btn.style.background = "#ef4444"; 
            btnSpan.innerText = "Close Camera";
            isScannerActive = true;
        } catch (err) {
            console.error("Scanner Error:", err.message);
            isScannerActive = false;
            readerDiv.style.display = 'none';
            ph.style.display = 'flex';
            btnSpan.innerText = "Open Camera";
            Swal.fire("Scanner Error", "Cannot access Camera. Please check permission first.", "error");
        }
    }
}
async function handleAttendanceInput(id) {
    const eventId = document.getElementById('attendance-event-id').value;
    if (!eventId) {
        Swal.fire("Attention", "Select an ongoing event first.", "warning");
        return;
    }
    const cleanId = id.trim();
    if (!cleanId) return;

    try {
        const studentDoc = await getDoc(doc(db, "students", cleanId));
        if (!studentDoc.exists()) {
            updateUIFeedback("ID NOT FOUND", `ID: ${cleanId}`, "danger");
            audioError.play();
            return;
        }
        const student = studentDoc.data();
        const event = eventDataMap[eventId];
        const studentDept = classifyStudent(student.course);

        const isEligibleDept = (event.targetDept === "ALL" || event.targetDept === studentDept);
        const isEligibleYear = event.targetYears.includes(student.yearLevel.toString());

        if (!isEligibleDept || !isEligibleYear) {
            updateUIFeedback(student.fullName, "NOT ELIGIBLE", "danger");
            audioError.play();
            return;
        }

        const attendRef = doc(db, "attendance", `${eventId}_${cleanId}`);
        const attendSnap = await getDoc(attendRef);
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

        if (!attendSnap.exists()) {
            await setDoc(attendRef, {
                studentId: cleanId, studentName: student.fullName, courseYear: `${student.course} - ${student.yearLevel}`,
                classification: studentDept, eventId: eventId, eventName: event.name, timeIn: timeNow,
                timeOut: null, status: "In Venue", timestamp: serverTimestamp()
            });
            updateUIFeedback(student.fullName, "TIME IN SUCCESSFUL", "success");
            audioSuccess.play();
        } else {
            const data = attendSnap.data();
            if (data.status === "In Venue") {
                await updateDoc(attendRef, { timeOut: timeNow, status: "Present" });
                updateUIFeedback(student.fullName, "TIME OUT SUCCESSFUL", "info");
                audioSuccess.play();
            } else {
                updateUIFeedback(student.fullName, "ALREADY COMPLETED", "warning");
            }
        }
    } catch (err) { console.error("Firestore Error:", err); }
}

function updateUIFeedback(name, status, type) {
    const box = document.getElementById('scan-feedback');
    const idH = document.getElementById('scan-id');
    const stP = document.getElementById('scan-status');
    const colors = {
        success: { bg: '#dcfce7', text: '#16a34a', border: '#bbf7d0' },
        info: { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' },
        warning: { bg: '#fef9c3', text: '#ca8a04', border: '#fef08a' },
        danger: { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' }
    };
    const theme = colors[type];
    box.style.background = theme.bg; box.style.borderColor = theme.border;
    idH.innerText = name; idH.style.color = theme.text;
    stP.innerText = status; stP.style.color = theme.text;

    setTimeout(() => {
        box.style.background = "white"; box.style.borderColor = "#f1f5f9";
        idH.innerText = "---"; idH.style.color = "var(--hero-navy)";
        stP.innerText = "Waiting for scan..."; stP.style.color = "#94a3b8";
    }, 4000);
}

async function refreshAttendanceTable() {
    const eventId = document.getElementById('attendance-event-id').value;
    const tbody = document.getElementById('attendance-tbody');
    if (!eventId) return;

    if (unsubscribeAttendance) unsubscribeAttendance();
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">🔍 Searching Students...</td></tr>`;

    try {
        const event = eventDataMap[eventId];
        
        // DEBUG: Check muna natin kung may laman ang event data
        if (!event) {
            tbody.innerHTML = `<tr><td colspan="6" style="color:orange;">Error: Event data not found.</td></tr>`;
            return;
        }

        // 1. Fetch Students
        const studentQ = query(collection(db, "students"), orderBy("fullName"), limit(PAGE_SIZE));
        const studentDocs = await getDocs(studentQ);

        if (studentDocs.empty) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Empty 'students' collection.</td></tr>`;
            return;
        }

        // 2. Real-time Attendance Listener
        const attQ = query(collection(db, "attendance"), where("eventId", "==", eventId));
        
        unsubscribeAttendance = onSnapshot(attQ, (snap) => {
            const logMap = {};
            snap.forEach(d => {
                const data = d.data();
                logMap[data.studentId] = data;
            });

            let html = "";
            let matchCount = 0;

            studentDocs.forEach(sDoc => {
                const s = sDoc.data();
                const dept = classifyStudent(s.program); // Check if 'program' is correct

                // Check Year Level logic (Safe check)
                const sYear = s.yearLevel ? s.yearLevel.toString() : "";
                const isEligibleDept = (event.targetDept === "ALL" || event.targetDept === dept);
                const isEligibleYear = event.targetYears.some(yr => sYear.includes(yr));

                if (isEligibleDept && isEligibleYear) {
                    const log = logMap[sDoc.id];
                    const statusText = log ? log.status : "Absent";
                    const statusColor = log ? (log.status === "Present" ? "#16a34a" : "#ca8a04") : "#ef4444";
                    
                    html += `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding:15px; font-weight:700;">${s.fullName}</td>
                            <td><span style="font-weight:600;">${sDoc.id}</span><br><small>${dept}</small></td>
                            <td>${s.program || 'N/A'} - ${s.yearLevel || 'N/A'}</td>
                            <td>${log ? log.timeIn : '--:--'}</td>
                            <td>${log ? (log.timeOut || '--:--') : '--:--'}</td>
                            <td><span class="status-badge" style="background:${statusColor}15; color:${statusColor}">${statusText}</span></td>
                        </tr>`;
                    matchCount++;
                }
            });

            tbody.innerHTML = matchCount > 0 ? html : `<tr><td colspan="6" style="text-align:center; padding:20px;">No students match the criteria for this event.</td></tr>`;
        }, (error) => {
            // DITO NATIN MAKIKITA ANG ERROR KAHIT WALANG F12
            tbody.innerHTML = `<tr><td colspan="6" style="color:red; padding:20px;">Firebase Error: ${error.message}</td></tr>`;
        });

    } catch (e) { 
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; padding:20px;">System Error: ${e.message}</td></tr>`;
    }
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
    eventSel.onchange = () => { currentPage = 1; lastVisibleStudent = null; refreshAttendanceTable(); };
    document.getElementById('next-page').onclick = () => { currentPage++; refreshAttendanceTable(); };
    document.getElementById('prev-page').onclick = () => { if(currentPage > 1) { currentPage--; lastVisibleStudent = null; refreshAttendanceTable(); } };
    document.addEventListener('keydown', (e) => { if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') input.focus(); });
}

async function exportToCSV() {
    const eventId = document.getElementById('attendance-event-id').value;
    if(!eventId) return Swal.fire("Export", "Select event first.", "info");
    try {
        const q = query(collection(db, "attendance"), where("eventId", "==", eventId));
        const snap = await getDocs(q);
        let csv = "ID,Name,Dept,Course_Year,Time_In,Time_Out,Status\n";
        snap.forEach(doc => { const v = doc.data(); csv += `"${v.studentId}","${v.studentName}","${v.classification}","${v.courseYear}","${v.timeIn}","${v.timeOut || ''}","${v.status}"\n`; });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Attendance_${eventDataMap[eventId].name}.csv`; a.click();
    } catch (e) { console.error("CSV Error:", e); }
}
