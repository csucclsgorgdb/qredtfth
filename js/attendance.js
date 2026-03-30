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
const PAGE_SIZE = 15; 

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
    
    // Fetch Ongoing Events
    const q = query(collection(db, "events"), where("status", "==", "Ongoing"));
    const eventSnap = await getDocs(q);
    
    let eventOptions = eventSnap.docs.map(d => {
        eventDataMap[d.id] = d.data();
        return `<option value="${d.id}">${d.data().name}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div>
                <h1 class="module-title" style="color:var(--hero-navy); font-weight:800; margin:0;">Attendance Management</h1>
                <p class="module-subtitle" style="margin:0;">Scan QR Code or Manual ID Input.</p>
            </div>
            
            <div style="display:flex; gap:10px; align-items:center;">
                <select id="attendance-event-id" class="swal2-input" style="margin:0; width:220px; height:45px; font-size:14px;">
                    <option value="">-- Select Event --</option>
                    ${eventOptions}
                </select>
                <button id="btn-toggle-camera" class="btn-gold" style="height:45px; display:flex; align-items:center; gap:8px; min-width:160px; justify-content:center;">
                    <i data-lucide="camera"></i> <span>Open Camera</span>
                </button>
            </div>
        </div>

        <div class="dashboard-grid" style="display: grid; grid-template-columns: 1fr 1.6fr; gap:20px;">
            
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div class="dashboard-card" style="padding:10px; background:#000; border-radius:15px; min-height:250px; position:relative; overflow:hidden; border: 2px solid var(--hero-navy);">
                    <div id="reader" style="width:100%; display:none;"></div>
                    <div id="camera-placeholder" style="width:100%; height:250px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8; background:#1e293b;">
                        <i data-lucide="camera-off" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i>
                        <p style="font-size:13px; font-weight:600;">Camera is currently closed</p>
                    </div>
                </div>

                <div class="dashboard-card" style="padding:15px; border-top: 4px solid var(--hero-gold);">
                    <label style="font-size:10px; font-weight:800; color:var(--hero-navy); letter-spacing:1px;">MANUAL ID ENTRY / SCAN GUN</label>
                    <div style="display:flex; gap:8px; margin-top:5px;">
                        <input type="text" id="manual-input" class="swal2-input" placeholder="Type ID Number..." 
                               style="margin:0; flex:1; height:45px; text-align:center; font-weight:800; border:2px solid #e2e8f0;">
                        <button id="btn-manual-submit" class="btn-gold" style="width:50px; height:45px;"><i data-lucide="arrow-right"></i></button>
                    </div>
                </div>

                <div id="scan-feedback" class="dashboard-card" style="text-align:center; background:white; border:1px solid #e2e8f0; min-height:100px; display:flex; flex-direction:column; justify-content:center;">
                    <h2 id="scan-id" style="margin:0; color:var(--hero-navy); font-weight:800;">---</h2>
                    <p id="scan-status" style="margin:5px 0 0 0; font-weight:600; font-size:0.85rem; color:#64748b;">Ready for Student ID</p>
                </div>
            </div>

            <div class="dashboard-card" style="border-top: 4px solid var(--hero-navy);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0; color:var(--hero-navy);"><i data-lucide="users"></i> Participants List</h3>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div style="display:flex; gap:5px; align-items:center; background:#f1f5f9; padding:5px; border-radius:8px;">
                            <button id="prev-page" class="btn-gold" style="padding:2px 8px; height:30px; min-width:30px;"><</button>
                            <span id="page-num" style="font-size:11px; font-weight:800; min-width:40px; text-align:center;">Pg 1</span>
                            <button id="next-page" class="btn-gold" style="padding:2px 8px; height:30px; min-width:30px;">></button>
                        </div>
                        <button id="btn-export-csv" class="btn-gold" style="padding:5px 12px; font-size:11px;">CSV</button>
                    </div>
                </div>
                <div class="data-table-container" style="max-height: 520px; overflow-y:auto;">
                    <table class="data-table" style="font-size:10px; width:100%;">
                        <thead>
                            <tr style="background: var(--hero-navy); color: white;">
                                <th>NAME</th><th>ID & DEPT</th><th>COURSE/YR</th><th>IN</th><th>OUT</th><th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-tbody">
                            <tr><td colspan="6" style="text-align:center; padding:40px; color:#94a3b8;">Select event to start...</td></tr>
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

    const processInput = () => {
        const val = manualInput.value.trim();
        if (val) { handleAttendanceInput(val); manualInput.value = ""; }
    };

    manualInput.onkeypress = (e) => { if (e.key === 'Enter') processInput(); };
    document.getElementById('btn-manual-submit').onclick = processInput;
    document.getElementById('btn-toggle-camera').onclick = (e) => toggleCameraScanner(e.currentTarget);
    document.getElementById('btn-export-csv').onclick = exportToCSV;
    
    eventSelect.onchange = () => {
        currentPage = 1;
        lastVisibleStudent = null;
        refreshAttendanceTable();
    };

    document.getElementById('next-page').onclick = () => { currentPage++; refreshAttendanceTable(); };
    document.getElementById('prev-page').onclick = () => { 
        if(currentPage > 1) { currentPage--; lastVisibleStudent = null; refreshAttendanceTable(); } 
    };

    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
            manualInput.focus();
        }
    });
}

/**
 * ANDROID CAMERA FIX
 */
async function toggleCameraScanner(btn) {
    const readerDiv = document.getElementById('reader');
    const placeholder = document.getElementById('camera-placeholder');
    const btnText = btn.querySelector('span');

    if (isScannerActive) {
        try {
            if (html5QrCode) {
                await html5QrCode.stop();
                html5QrCode = null;
            }
        } catch (err) { console.error(err); }
        
        readerDiv.style.display = 'none';
        placeholder.style.display = 'flex';
        btnText.innerText = "Open Camera";
        btn.style.background = ""; 
        isScannerActive = false;
    } else {
        readerDiv.style.display = 'block';
        placeholder.style.display = 'none';
        btnText.innerText = "Starting..."; 
        
        try {
            await Html5Qrcode.getCameras(); // Permission check
            html5QrCode = new Html5Qrcode("reader");
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 15, qrbox: { width: 250, height: 250 } }, 
                (text) => {
                    handleAttendanceInput(text);
                    html5QrCode.pause(true);
                    setTimeout(() => { if(html5QrCode) html5QrCode.resume(); }, 3000);
                }
            );
            btnText.innerText = "Close Camera";
            btn.style.background = "#ef4444";
            isScannerActive = true;
        } catch (err) {
            console.error(err);
            Swal.fire("Camera Error", "Check permissions or if camera is used by another app.", "error");
            readerDiv.style.display = 'none';
            placeholder.style.display = 'flex';
            btnText.innerText = "Open Camera";
        }
    }
}

/**
 * ATTENDANCE HANDLER
 */
async function handleAttendanceInput(studentId) {
    const eventId = document.getElementById('attendance-event-id').value;
    if (!eventId) return Swal.fire('Wait!', 'Select event first.', 'warning');

    const beep = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const errorSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3');

    try {
        const studentSnap = await getDoc(doc(db, "students", studentId));
        if (!studentSnap.exists()) {
            updateUI("ID: " + studentId, "STUDENT NOT FOUND", "danger");
            errorSound.play();
            return;
        }

        const student = studentSnap.data();
        const event = eventDataMap[eventId];
        const studentDept = classifyStudent(student.course);

        if ((event.targetDept !== "ALL" && event.targetDept !== studentDept) || !event.targetYears.includes(student.yearLevel.toString())) {
            updateUI(student.fullName, "NOT ELIGIBLE", "danger");
            errorSound.play();
            return;
        }

        const attendanceRef = doc(db, "attendance", `${eventId}_${studentId}`);
        const attendSnap = await getDoc(attendanceRef);
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

        if (!attendSnap.exists()) {
            await setDoc(attendanceRef, {
                studentId, studentName: student.fullName, courseYear: student.course,
                classification: studentDept, eventId, eventName: event.name,
                timeIn: nowTime, timeOut: null, status: "In Venue", timestamp: serverTimestamp()
            });
            updateUI(student.fullName, "TIME IN SUCCESS", "success");
        } else if (attendSnap.data().status === "In Venue") {
            await updateDoc(attendanceRef, { timeOut: nowTime, status: "Present" });
            updateUI(student.fullName, "TIME OUT SUCCESS", "info");
        } else {
            updateUI(student.fullName, "Already Completed", "warning");
        }

        beep.play();
    } catch (err) { console.error(err); }
}

/**
 * REFRESH TABLE (LIVE)
 */
async function refreshAttendanceTable() {
    const eventId = document.getElementById('attendance-event-id').value;
    const tbody = document.getElementById('attendance-tbody');
    if (!eventId) return;

    if (unsubscribeAttendance) unsubscribeAttendance();
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Loading...</td></tr>`;

    try {
        const event = eventDataMap[eventId];
        let studentQuery = query(collection(db, "students"), orderBy("fullName"), limit(PAGE_SIZE));

        if (currentPage > 1 && lastVisibleStudent) {
            studentQuery = query(collection(db, "students"), orderBy("fullName"), startAfter(lastVisibleStudent), limit(PAGE_SIZE));
        }

        const studentsSnap = await getDocs(studentQuery);
        if (studentsSnap.empty) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">End of list.</td></tr>`;
            return;
        }

        lastVisibleStudent = studentsSnap.docs[studentsSnap.docs.length - 1];
        document.getElementById('page-num').innerText = `Pg ${currentPage}`;

        const attendanceQuery = query(collection(db, "attendance"), where("eventId", "==", eventId));
        unsubscribeAttendance = onSnapshot(attendanceQuery, (snap) => {
            const logs = {};
            snap.forEach(d => logs[d.data().studentId] = d.data());

            tbody.innerHTML = "";
            studentsSnap.forEach(sDoc => {
                const s = sDoc.data();
                const sDept = classifyStudent(s.course);
                if ((event.targetDept === "ALL" || event.targetDept === sDept) && event.targetYears.includes(s.yearLevel.toString())) {
                    const log = logs[sDoc.id];
                    tbody.innerHTML += `
                        <tr>
                            <td><b>${s.fullName}</b></td>
                            <td>${sDoc.id}<br><small>${sDept}</small></td>
                            <td>${s.course} - ${s.yearLevel}</td>
                            <td>${log ? log.timeIn : '--:--'}</td>
                            <td>${log ? (log.timeOut || '--:--') : '--:--'}</td>
                            <td style="font-weight:800; color:${log ? (log.status === 'Present' ? '#16a34a' : '#ca8a04') : '#ef4444'}">
                                ${log ? (log.status === 'Present' ? '✅ PRESENT' : '⏳ IN VENUE') : '❌ ABSENT'}
                            </td>
                        </tr>`;
                }
            });
        });
    } catch (err) { console.error(err); }
}

function updateUI(name, status, type) {
    const idEl = document.getElementById('scan-id'), statusEl = document.getElementById('scan-status'), box = document.getElementById('scan-feedback');
    const colors = { success: '#dcfce7', info: '#dbeafe', warning: '#fef9c3', danger: '#fee2e2' };
    idEl.innerText = name; statusEl.innerText = status;
    box.style.background = colors[type];
    setTimeout(() => { idEl.innerText = "---"; statusEl.innerText = "Ready for Student ID"; box.style.background = "white"; }, 4000);
}

async function exportToCSV() {
    const eventId = document.getElementById('attendance-event-id').value;
    if(!eventId) return;
    const snap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId)));
    let csv = "ID,Name,Dept,In,Out,Status\n";
    snap.forEach(d => { const v = d.data(); csv += `"${v.studentId}","${v.studentName}","${v.classification}","${v.timeIn}","${v.timeOut || ''}","${v.status}"\n`; });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `Attendance_${eventId}.csv`; link.click();
}
