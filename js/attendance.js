import { db } from './firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, limit, startAfter, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let html5QrCode = null;
let eventDataMap = {};
let isScannerActive = false;
let unsubscribeAttendance = null;

// Pagination State
let lastVisibleStudent = null;
let currentPage = 1;
const PAGE_SIZE = 20; 

/**
 * DYNAMIC CLASSIFICATION
 */
function classifyStudent(course) {
    if (!course) return "Other";
    const c = course.toUpperCase();
    if (c.includes("BTLED") || c.includes("BTVTED")) return "Education Student";
    if (c.includes("BSINDUSTECH")) return "Industrial Tech Student";
    return "Other Dept";
}

/**
 * INITIALIZE ATTENDANCE MODULE
 */
export async function initAttendance() {
    const container = document.getElementById('module-container');
    
    // Fetch only Ongoing Events
    const q = query(collection(db, "events"), where("status", "==", "Ongoing"));
    const eventSnap = await getDocs(q);
    
    let eventOptions = eventSnap.docs.map(d => {
        eventDataMap[d.id] = d.data();
        return `<option value="${d.id}">${d.data().name}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:0 10px;">
            <div>
                <h1 style="color:var(--hero-navy); font-weight:800; margin:0;">Attendance Management</h1>
                <p style="margin:0; font-size:12px; color:#64748b;">Automated Participant Filtering Active</p>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <select id="attendance-event-id" class="swal2-input" style="margin:0; width:220px; height:45px; font-size:13px; border-radius:10px;">
                    <option value="">-- Select Event --</option>
                    ${eventOptions}
                </select>
                <button id="btn-toggle-camera" class="btn-gold" style="height:45px; width:160px; border-radius:10px; font-weight:700;">
                    <i data-lucide="camera"></i> <span>Open Camera</span>
                </button>
            </div>
        </div>

        <div class="dashboard-grid" style="display: grid; grid-template-columns: 1fr 1.8fr; gap:15px; padding:0 10px;">
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div class="dashboard-card" style="padding:10px; background:#0f172a; border-radius:20px; min-height:280px; position:relative; overflow:hidden; border:4px solid #1e293b;">
                    <div id="reader" style="width:100%; display:none;"></div>
                    <div id="camera-placeholder" style="width:100%; height:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#475569;">
                        <i data-lucide="aperture" class="spin" style="width:50px; height:50px; opacity:0.3;"></i>
                        <p style="font-size:12px; font-weight:600; margin-top:10px;">SCANNER READY</p>
                    </div>
                </div>

                <div id="scan-feedback" class="dashboard-card" style="text-align:center; transition: 0.3s ease; border:2px solid #e2e8f0; min-height:120px; display:flex; flex-direction:column; justify-content:center;">
                    <h2 id="scan-id" style="margin:0; color:var(--hero-navy); font-weight:900; font-size:1.4rem;">READY</h2>
                    <p id="scan-status" style="margin:5px 0 0 0; font-weight:700; font-size:0.9rem; color:#64748b;">Waiting for Student...</p>
                </div>

                <div class="dashboard-card" style="padding:15px; border-bottom: 5px solid var(--hero-gold);">
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="manual-input" class="swal2-input" placeholder="Enter ID Number..." style="margin:0; flex:1; height:50px; text-align:center; font-weight:800; border:2px solid #cbd5e1; border-radius:12px;">
                        <button id="btn-manual-submit" class="btn-gold" style="width:60px; height:50px; border-radius:12px;"><i data-lucide="arrow-right"></i></button>
                    </div>
                </div>
            </div>

            <div class="dashboard-card" style="padding:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0; font-size:15px;"><i data-lucide="clipboard-check"></i> Live Participant List</h3>
                    <div style="display:flex; gap:10px;">
                        <button id="btn-export-csv" class="btn-gold" style="padding:0 15px; height:32px; font-size:11px;">CSV Export</button>
                        <div style="display:flex; gap:4px; background:#f1f5f9; padding:4px; border-radius:10px;">
                            <button id="prev-page" class="btn-gold" style="padding:0 10px; height:32px;"><</button>
                            <span id="page-num" style="font-size:12px; font-weight:800; min-width:45px; text-align:center; line-height:32px;">Pg 1</span>
                            <button id="next-page" class="btn-gold" style="padding:0 10px; height:32px;">></button>
                        </div>
                    </div>
                </div>
                <div class="data-table-container" style="max-height: 550px; overflow-y:auto; border-radius:10px;">
                    <table class="data-table" style="font-size:11px; width:100%;">
                        <thead>
                            <tr style="background: var(--hero-navy); color: white;">
                                <th>STUDENT NAME</th>
                                <th>ID & DEPT</th>
                                <th>COURSE/YR</th>
                                <th>TIME IN</th>
                                <th>TIME OUT</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-tbody">
                            <tr><td colspan="6" style="text-align:center; padding:50px; color:#94a3b8;">Select an event.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
    lucide.createIcons();
}

function setupEventListeners() {
    const manualInput = document.getElementById('manual-input');
    const eventSelect = document.getElementById('attendance-event-id');

    const triggerSubmit = () => {
        const val = manualInput.value.trim();
        if (val) { handleAttendanceInput(val); manualInput.value = ""; }
    };

    manualInput.onkeypress = (e) => { if (e.key === 'Enter') triggerSubmit(); };
    document.getElementById('btn-manual-submit').onclick = triggerSubmit;
    document.getElementById('btn-toggle-camera').onclick = (e) => toggleCameraScanner(e.currentTarget);
    document.getElementById('btn-export-csv').onclick = exportToCSV;
    
    eventSelect.onchange = () => {
        currentPage = 1;
        lastVisibleStudent = null;
        refreshAttendanceTable();
    };

    document.getElementById('next-page').onclick = () => { currentPage++; refreshAttendanceTable(); };
    document.getElementById('prev-page').onclick = () => { if(currentPage > 1) { currentPage--; lastVisibleStudent = null; refreshAttendanceTable(); } };

    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
            manualInput.focus();
        }
    });
}

/**
 * CAMERA FIX: CLEARING INSTANCES FOR ANDROID
 */
async function toggleCameraScanner(btn) {
    const reader = document.getElementById('reader');
    const ph = document.getElementById('camera-placeholder');
    const span = btn.querySelector('span');

    if (isScannerActive) {
        if (html5QrCode) {
            try {
                await html5QrCode.stop();
                await html5QrCode.clear();
            } catch (e) { console.warn(e); }
            html5QrCode = null;
        }
        reader.style.display = 'none';
        ph.style.display = 'flex';
        span.innerText = "Open Camera";
        btn.style.background = "";
        isScannerActive = false;
    } else {
        reader.innerHTML = ""; // Clear existing elements
        reader.style.display = 'block';
        ph.style.display = 'none';
        span.innerText = "Starting...";

        try {
            await Html5Qrcode.getCameras(); // Permission Ping
            html5QrCode = new Html5Qrcode("reader");
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 20, qrbox: { width: 250, height: 250 } }, 
                (text) => {
                    handleAttendanceInput(text);
                    html5QrCode.pause(true);
                    setTimeout(() => { if(html5QrCode) html5QrCode.resume(); }, 2500);
                }
            );
            span.innerText = "Close Camera";
            btn.style.background = "#ef4444";
            isScannerActive = true;
        } catch (err) {
            console.error(err);
            Swal.fire("Camera Error", "Blocked by browser or busy. Refresh page.", "error");
            reader.style.display = 'none';
            ph.style.display = 'flex';
            span.innerText = "Open Camera";
            isScannerActive = false;
        }
    }
}

/**
 * REFRESH TABLE: LIVE LISTENING + DEPT FILTERING
 */
async function refreshAttendanceTable() {
    const eventId = document.getElementById('attendance-event-id').value;
    const tbody = document.getElementById('attendance-tbody');
    if (!eventId) return;

    if (unsubscribeAttendance) unsubscribeAttendance();
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Filtering Participants...</td></tr>`;

    try {
        const event = eventDataMap[eventId];
        let studentQuery = query(collection(db, "students"), orderBy("fullName"), limit(PAGE_SIZE));
        if (currentPage > 1 && lastVisibleStudent) {
            studentQuery = query(collection(db, "students"), orderBy("fullName"), startAfter(lastVisibleStudent), limit(PAGE_SIZE));
        }

        const studentsSnap = await getDocs(studentQuery);
        if (studentsSnap.empty) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">No students found.</td></tr>`;
            return;
        }

        lastVisibleStudent = studentsSnap.docs[studentsSnap.docs.length - 1];
        document.getElementById('page-num').innerText = `Pg ${currentPage}`;

        const attendanceQuery = query(collection(db, "attendance"), where("eventId", "==", eventId));
        unsubscribeAttendance = onSnapshot(attendanceQuery, (snap) => {
            const currentLogs = {};
            snap.forEach(d => currentLogs[d.data().studentId] = d.data());

            tbody.innerHTML = "";
            let matchInPage = 0;

            studentsSnap.forEach(sDoc => {
                const s = sDoc.data();
                const dept = classifyStudent(s.course);
                const isDeptMatch = (event.targetDept === "ALL" || event.targetDept === dept);
                const isYearMatch = event.targetYears.includes(s.yearLevel.toString());

                if (isDeptMatch && isYearMatch) {
                    const log = currentLogs[sDoc.id];
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="font-weight:700;">${s.fullName}</td>
                        <td>${sDoc.id}<br><small style="color:#64748b">${dept}</small></td>
                        <td>${s.course} - ${s.yearLevel}</td>
                        <td style="font-family:monospace; font-weight:bold;">${log ? log.timeIn : '--:--'}</td>
                        <td style="font-family:monospace; font-weight:bold;">${log ? (log.timeOut || '--:--') : '--:--'}</td>
                        <td>${log ? `<span style="color:#16a34a; font-weight:800;">${log.status.toUpperCase()}</span>` : `<span style="color:#ef4444; font-weight:800;">ABSENT</span>`}</td>
                    `;
                    tbody.appendChild(tr);
                    matchInPage++;
                }
            });

            if(matchInPage === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#94a3b8;">No matching participants on this page. Try Next.</td></tr>`;
            }
        });
    } catch (err) { console.error("Table Error:", err); }
}

/**
 * ATTENDANCE HANDLER (SCAN/MANUAL)
 */
async function handleAttendanceInput(studentId) {
    const eventId = document.getElementById('attendance-event-id').value;
    if (!eventId) return Swal.fire("Required", "Select an event first.", "warning");

    const beep = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const errorSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3');

    try {
        const studentSnap = await getDoc(doc(db, "students", studentId));
        if (!studentSnap.exists()) {
            updateUI("UNKNOWN ID", "NOT FOUND", "danger");
            errorSound.play();
            return;
        }

        const student = studentSnap.data();
        const event = eventDataMap[eventId];
        const dept = classifyStudent(student.course);

        if ((event.targetDept !== "ALL" && event.targetDept !== dept) || !event.targetYears.includes(student.yearLevel.toString())) {
            updateUI(student.fullName, "NOT ELIGIBLE", "danger");
            errorSound.play();
            return;
        }

        const attendRef = doc(db, "attendance", `${eventId}_${studentId}`);
        const attendSnap = await getDoc(attendRef);
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

        if (!attendSnap.exists()) {
            await setDoc(attendRef, {
                studentId, studentName: student.fullName, classification: dept,
                eventId, eventName: event.name, timeIn: now, status: "In Venue", timestamp: serverTimestamp()
            });
            updateUI(student.fullName, "CHECK-IN OK", "success");
        } else if (attendSnap.data().status === "In Venue") {
            await updateDoc(attendRef, { timeOut: now, status: "Present" });
            updateUI(student.fullName, "CHECK-OUT OK", "info");
        } else {
            updateUI(student.fullName, "ALREADY LOGGED", "warning");
        }
        beep.play();
    } catch (err) { console.error("Logging Error:", err); }
}

function updateUI(name, status, type) {
    const idEl = document.getElementById('scan-id'), stEl = document.getElementById('scan-status'), box = document.getElementById('scan-feedback');
    const theme = { success: '#dcfce7', info: '#dbeafe', warning: '#fef9c3', danger: '#fee2e2' };
    idEl.innerText = name; stEl.innerText = status;
    box.style.background = theme[type];
    setTimeout(() => { idEl.innerText = "READY"; stEl.innerText = "Waiting for Student..."; box.style.background = "white"; }, 3000);
}

async function exportToCSV() {
    const eventId = document.getElementById('attendance-event-id').value;
    if(!eventId) return;
    const snap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId)));
    let csv = "ID,Name,Dept,In,Out,Status\n";
    snap.forEach(d => {
        const v = d.data();
        csv += `"${v.studentId}","${v.studentName}","${v.classification}","${v.timeIn}","${v.timeOut || ''}","${v.status}"\n`;
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `Attendance_Report.csv`; link.click();
}
