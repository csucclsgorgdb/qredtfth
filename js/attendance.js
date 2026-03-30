import { db } from './firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, orderBy, onSnapshot, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * GLOBAL STATES & ASSETS
 */
let html5QrCode = null;
let eventDataMap = {};
let isScannerActive = false;
let unsubscribeAttendance = null;
let currentView = 'present'; // Toggle between 'present' and 'absent'

const audioSuccess = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const audioError = new Audio('https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3');

/**
 * HELPER: CLASSIFY STUDENT (Based on your Excel/DB structure)
 */
function classifyStudent(course) {
    if (!course) return "Other Dept";
    const c = course.toUpperCase();
    if (c.includes("BTLED") || c.includes("BTVTED")) return "Education Student";
    if (c.includes("BSINDUSTECH")) return "Industrial Tech Student";
    return "Other Dept";
}

/**
 * MAIN: INITIALIZE ATTENDANCE MODULE
 */
export async function initAttendance() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <style>
            :root { --hero-navy: #000080; --hero-gold: #FFD700; }
            .attendance-grid { display: grid; grid-template-columns: 400px 1fr; gap: 20px; padding: 20px; background: #f8fafc; min-height: 100vh; }
            .scanner-section { display: flex; flex-direction: column; gap: 15px; }
            .card { background: white; border-radius: 20px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
            .scanner-box { background: #0f172a; border-radius: 15px; overflow: hidden; position: relative; min-height: 250px; }
            .nav-tabs { display: flex; gap: 20px; border-bottom: 2px solid #f1f5f9; margin-bottom: 20px; }
            .tab { padding: 10px 5px; cursor: pointer; font-weight: 800; color: #94a3b8; border-bottom: 3px solid transparent; transition: 0.3s; }
            .tab.active { color: var(--hero-navy); border-bottom-color: var(--hero-gold); }
            .status-badge { padding: 5px 12px; border-radius: 50px; font-size: 11px; font-weight: 700; }
            .btn-main { height: 45px; border-radius: 10px; font-weight: 700; cursor: pointer; border: none; transition: 0.3s; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; padding: 12px; text-align: left; position: sticky; top: 0; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        </style>

        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; padding: 20px; background: white; border-bottom: 1px solid #e2e8f0;">
            <div>
                <h1 style="color:var(--hero-navy); font-weight:900; margin:0;">Live Attendance</h1>
                <p id="event-stats" style="margin:0; font-size:12px; color: #64748b; font-weight: 600;">Select an event to start tracking</p>
            </div>
            <div style="display:flex; gap:10px;">
                <select id="attendance-event-id" style="width:250px; height:45px; border-radius:10px; border:2px solid #e2e8f0; padding:0 15px; font-weight:600;"></select>
                <button id="btn-toggle-camera" class="btn-main" style="background:var(--hero-navy); color:white; padding:0 20px;">Open Camera</button>
            </div>
        </div>

        <div class="attendance-grid">
            <div class="scanner-section">
                <div class="card scanner-box" id="reader-container">
                    <div id="reader" style="display:none; width:100%;"></div>
                    <div id="cam-placeholder" style="height:250px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#475569;">
                        <span style="font-weight:800; font-size:12px; letter-spacing:1px;">SCANNER READY</span>
                    </div>
                </div>

                <div id="scan-feedback" class="card" style="text-align:center; min-height:150px; display:flex; flex-direction:column; justify-content:center; transition: 0.5s;">
                    <h2 id="scan-name" style="margin:0; color:var(--hero-navy); font-size:1.5rem; font-weight:900;">---</h2>
                    <p id="scan-msg" style="margin:5px 0 0 0; font-weight:700; color:#94a3b8; text-transform:uppercase; font-size:11px;">Waiting for scan...</p>
                </div>

                <div class="card" style="border-bottom: 5px solid var(--hero-gold);">
                    <label style="font-size:10px; font-weight:800; color:var(--hero-navy);">MANUAL ID / BARCODE GUN</label>
                    <input type="text" id="manual-input" placeholder="Type Student ID..." style="width:100%; height:45px; border:none; background:#f1f5f9; border-radius:8px; text-align:center; font-weight:800; font-size:18px; margin-top:5px;">
                </div>
            </div>

            <div class="card" style="display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <div class="nav-tabs">
                        <div id="tab-present" class="tab active">PRESENT</div>
                        <div id="tab-absent" class="tab">ABSENT</div>
                    </div>
                    <button id="btn-export" class="btn-main" style="background:#f1f5f9; color:#475569; padding:0 15px; font-size:12px; height:35px;">Export CSV</button>
                </div>
                
                <div style="flex:1; overflow-y:auto; max-height: 600px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Student Information</th>
                                <th>Dept & Year</th>
                                <th style="text-align:center;">Time In</th>
                                <th style="text-align:center;">Time Out</th>
                                <th style="text-align:center;">Status</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-tbody">
                            <tr><td colspan="5" style="text-align:center; padding:100px; color:#94a3b8;">No data to display. Select an event.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    await loadOngoingEvents();
    setupCoreListeners();
    lucide.createIcons();
}

/**
 * DATA LOADERS
 */
async function loadOngoingEvents() {
    const sel = document.getElementById('attendance-event-id');
    const q = query(collection(db, "events"), where("status", "==", "Ongoing"));
    const snap = await getDocs(q);
    let options = `<option value="">-- Choose Ongoing Event --</option>`;
    snap.forEach(doc => {
        eventDataMap[doc.id] = doc.data();
        options += `<option value="${doc.id}">${doc.data().name}</option>`;
    });
    sel.innerHTML = options;
}

async function refreshTable() {
    const eventId = document.getElementById('attendance-event-id').value;
    const tbody = document.getElementById('attendance-tbody');
    const stats = document.getElementById('event-stats');
    if (!eventId) return;

    if (unsubscribeAttendance) unsubscribeAttendance();
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px;">🔄 Syncing Data...</td></tr>`;

    if (currentView === 'present') {
        // REAL-TIME PRESENT VIEW
        const q = query(collection(db, "attendance"), where("eventId", "==", eventId), orderBy("timestamp", "desc"));
        unsubscribeAttendance = onSnapshot(q, (snap) => {
            let html = "";
            snap.forEach(d => {
                const log = d.data();
                html += `
                    <tr>
                        <td><b>${log.studentName}</b><br><small style="color:#64748b;">${log.studentId}</small></td>
                        <td>${log.courseYear}<br><small>${log.classification}</small></td>
                        <td align="center"><b>${log.timeIn}</b></td>
                        <td align="center">${log.timeOut || '--:--'}</td>
                        <td align="center"><span class="status-badge" style="background:#dcfce7; color:#16a34a;">${log.status}</span></td>
                    </tr>`;
            });
            tbody.innerHTML = html || `<tr><td colspan="5" style="text-align:center; padding:50px; color:#94a3b8;">No one has scanned yet.</td></tr>`;
            stats.innerText = `Total Present: ${snap.size} students`;
        });
    } else {
        // STATIC ABSENT VIEW (Comparing Eligible vs Present)
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px;">🔍 Analyzing 10,000 student records...</td></tr>`;
        const event = eventDataMap[eventId];
        
        const presSnap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId)));
        const presIds = new Set();
        presSnap.forEach(d => presIds.add(d.data().studentId));

        const studSnap = await getDocs(query(collection(db, "students"), limit(1000))); // Limit to prevent crash, use search for specific
        let html = "";
        let absentCount = 0;

        studSnap.forEach(sDoc => {
            const s = sDoc.data();
            const sDept = classifyStudent(s.program);
            const isEligible = (event.targetDept === "ALL" || event.targetDept === sDept) && 
                               event.targetYears.some(y => (s.yearLevel||"").toString().includes(y));

            if (isEligible && !presIds.has(sDoc.id)) {
                html += `
                    <tr style="opacity:0.6;">
                        <td><b>${s.fullName}</b><br><small>${sDoc.id}</small></td>
                        <td>${s.program} - ${s.yearLevel}</td>
                        <td align="center">--:--</td>
                        <td align="center">--:--</td>
                        <td align="center"><span class="status-badge" style="background:#fee2e2; color:#dc2626;">ABSENT</span></td>
                    </tr>`;
                absentCount++;
            }
        });
        tbody.innerHTML = html || `<tr><td colspan="5" style="text-align:center; padding:50px;">Perfect Attendance!</td></tr>`;
        stats.innerText = `Absentees Found: ${absentCount} (showing sample)`;
    }
}

/**
 * SCAN & LOGIC
 */
async function handleAttendanceInput(id) {
    const eventId = document.getElementById('attendance-event-id').value;
    if (!eventId) return;

    const cleanId = id.trim();
    try {
        const studDoc = await getDoc(doc(db, "students", cleanId));
        if (!studDoc.exists()) {
            showFeedback("ID NOT FOUND", "Invalid Record", "danger");
            audioError.play();
            return;
        }

        const student = studDoc.data();
        const event = eventDataMap[eventId];
        const sDept = classifyStudent(student.program);
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Eligibility Check
        const isEligible = (event.targetDept === "ALL" || event.targetDept === sDept) && 
                           event.targetYears.some(y => (student.yearLevel||"").toString().includes(y));

        if (!isEligible) {
            showFeedback(student.fullName, "NOT ELIGIBLE", "danger");
            audioError.play();
            return;
        }

        const attRef = doc(db, "attendance", `${eventId}_${cleanId}`);
        const attSnap = await getDoc(attRef);

        if (!attSnap.exists()) {
            await setDoc(attRef, {
                studentId: cleanId, studentName: student.fullName, courseYear: `${student.program} - ${student.yearLevel}`,
                classification: sDept, eventId, timeIn: timeNow, status: "In Venue", timestamp: serverTimestamp()
            });
            showFeedback(student.fullName, "TIME IN SUCCESS", "success");
            audioSuccess.play();
        } else if (attSnap.data().status === "In Venue") {
            await updateDoc(attRef, { timeOut: timeNow, status: "Present" });
            showFeedback(student.fullName, "TIME OUT SUCCESS", "info");
            audioSuccess.play();
        } else {
            showFeedback(student.fullName, "ALREADY LOGGED", "warning");
        }
    } catch (e) { console.error(e); }
}

function showFeedback(name, msg, type) {
    const box = document.getElementById('scan-feedback');
    const nameH = document.getElementById('scan-name');
    const msgP = document.getElementById('scan-msg');
    const colors = { success: '#dcfce7', danger: '#fee2e2', info: '#dbeafe', warning: '#fef9c3' };
    const textColors = { success: '#16a34a', danger: '#dc2626', info: '#2563eb', warning: '#ca8a04' };

    box.style.background = colors[type];
    nameH.innerText = name; nameH.style.color = textColors[type];
    msgP.innerText = msg; msgP.style.color = textColors[type];

    setTimeout(() => {
        box.style.background = "white";
        nameH.innerText = "---"; nameH.style.color = "var(--hero-navy)";
        msgP.innerText = "Waiting for scan..."; msgP.style.color = "#94a3b8";
    }, 4000);
}

/**
 * SCANNER ENGINE
 */
async function toggleCamera(btn) {
    const readerDiv = document.getElementById('reader');
    const ph = document.getElementById('cam-placeholder');
    
    if (isScannerActive) {
        if (html5QrCode) { await html5QrCode.stop(); await html5QrCode.clear(); }
        readerDiv.style.display = 'none'; ph.style.display = 'flex';
        btn.innerText = "Open Camera"; btn.style.background = "var(--hero-navy)";
        isScannerActive = false;
    } else {
        readerDiv.style.display = 'block'; ph.style.display = 'none';
        html5QrCode = new Html5Qrcode("reader");
        await html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, (text) => {
            handleAttendanceInput(text);
            html5QrCode.pause(true);
            setTimeout(() => html5QrCode.resume(), 3000);
        });
        btn.innerText = "Close Camera"; btn.style.background = "#ef4444";
        isScannerActive = true;
    }
}

/**
 * UI LISTENERS
 */
function setupCoreListeners() {
    document.getElementById('attendance-event-id').onchange = refreshTable;
    document.getElementById('btn-toggle-camera').onclick = (e) => toggleCamera(e.target);
    
    document.getElementById('tab-present').onclick = (e) => {
        currentView = 'present';
        e.target.classList.add('active');
        document.getElementById('tab-absent').classList.remove('active');
        refreshTable();
    };

    document.getElementById('tab-absent').onclick = (e) => {
        currentView = 'absent';
        e.target.classList.add('active');
        document.getElementById('tab-present').classList.remove('active');
        refreshTable();
    };

    const manual = document.getElementById('manual-input');
    manual.onkeypress = (e) => { if(e.key === 'Enter') { handleAttendanceInput(manual.value); manual.value = ""; } };
    
    document.getElementById('btn-export').onclick = async () => {
        const eventId = document.getElementById('attendance-event-id').value;
        if (!eventId) return;
        const snap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId)));
        let csv = "ID,Name,Course,In,Out,Status\n";
        snap.forEach(d => {
            const v = d.data();
            csv += `${v.studentId},${v.studentName},${v.courseYear},${v.timeIn},${v.timeOut || ''},${v.status}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Attendance.csv`; a.click();
    };
}
