import { db } from './firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, limit, startAfter, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let html5QrCode = null;
let eventDataMap = {};
let isScannerActive = false;
let unsubscribeAttendance = null;

// Pagination State - Tinaasan sa 50 para sa Android efficiency
let lastVisibleStudent = null;
let currentPage = 1;
const PAGE_SIZE = 50; 

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
                <h1 style="color:var(--hero-navy); font-weight:800; margin:0; font-size:1.5rem;">Attendance Scan</h1>
                <p style="margin:0; font-size:12px; color:#64748b;">Live participant filtering active.</p>
            </div>
            <div style="display:flex; gap:8px;">
                <select id="attendance-event-id" class="swal2-input" style="margin:0; width:180px; height:45px; font-size:12px; border-radius:10px;">
                    <option value="">-- Select Event --</option>
                    ${eventOptions}
                </select>
                <button id="btn-toggle-camera" class="btn-gold" style="height:45px; width:50px; border-radius:10px;"><i data-lucide="camera"></i></button>
            </div>
        </div>

        <div class="dashboard-grid" style="grid-template-columns: 1fr; gap:15px; padding:0 10px;">
            <div class="dashboard-card" style="padding:5px; background:#000; border-radius:15px; overflow:hidden; position:relative; min-height:200px;">
                <div id="reader" style="width:100%;"></div>
                <div id="camera-placeholder" style="width:100%; height:200px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#475569; background:#1e293b;">
                    <p style="font-size:12px; font-weight:700;">CAMERA CLOSED</p>
                </div>
            </div>

            <div id="scan-feedback" class="dashboard-card" style="text-align:center; padding:15px; border:2px solid #e2e8f0; border-radius:15px;">
                <h2 id="scan-id" style="margin:0; font-weight:900; color:var(--hero-navy);">READY</h2>
                <p id="scan-status" style="margin:0; font-size:13px; font-weight:600; color:#64748b;">Waiting for Scan...</p>
            </div>

            <div class="dashboard-card" style="padding:15px;">
                <div style="display:flex; gap:8px;">
                    <input type="text" id="manual-input" class="swal2-input" placeholder="Type Student ID..." style="margin:0; flex:1; height:45px; text-align:center; font-weight:800; border-radius:10px;">
                    <button id="btn-manual-submit" class="btn-gold" style="width:50px; height:45px; border-radius:10px;"><i data-lucide="send"></i></button>
                </div>
            </div>

            <div class="dashboard-card" style="padding:15px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="margin:0; font-size:14px;">Participants</h3>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <button id="prev-page" class="btn-gold" style="padding:0 8px; height:30px;"><</button>
                        <span id="page-num" style="font-size:11px; font-weight:800;">Pg 1</span>
                        <button id="next-page" class="btn-gold" style="padding:0 8px; height:30px;">></button>
                    </div>
                </div>
                <div style="overflow-x:auto;">
                    <table class="data-table" style="font-size:10px; width:100%;">
                        <thead>
                            <tr><th>NAME</th><th>ID/DEPT</th><th>IN/OUT</th><th>STATUS</th></tr>
                        </thead>
                        <tbody id="attendance-tbody">
                            <tr><td colspan="4" style="text-align:center; padding:30px;">Select an event.</td></tr>
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

    const submitId = () => {
        const val = manualInput.value.trim();
        if (val) { handleAttendanceInput(val); manualInput.value = ""; }
    };

    manualInput.onkeypress = (e) => { if (e.key === 'Enter') submitId(); };
    document.getElementById('btn-manual-submit').onclick = submitId;
    document.getElementById('btn-toggle-camera').onclick = toggleCameraScanner;
    
    eventSelect.onchange = () => {
        currentPage = 1;
        lastVisibleStudent = null;
        refreshAttendanceTable();
    };

    document.getElementById('next-page').onclick = () => { currentPage++; refreshAttendanceTable(); };
    document.getElementById('prev-page').onclick = () => { if(currentPage > 1) { currentPage--; lastVisibleStudent = null; refreshAttendanceTable(); } };
}

/**
 * REFRESH TABLE - Android Hybrid Filter (No Index Link Needed)
 */
async function refreshAttendanceTable() {
    const eventId = document.getElementById('attendance-event-id').value;
    const tbody = document.getElementById('attendance-tbody');
    if (!eventId) return;

    if (unsubscribeAttendance) unsubscribeAttendance();
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">Fetching List...</td></tr>`;

    try {
        const event = eventDataMap[eventId];
        
        // Single where query para hindi mag-error sa Android/No Console
        let studentQuery = query(collection(db, "students"), orderBy("fullName"), limit(PAGE_SIZE));
        if (currentPage > 1 && lastVisibleStudent) {
            studentQuery = query(collection(db, "students"), orderBy("fullName"), startAfter(lastVisibleStudent), limit(PAGE_SIZE));
        }

        const studentsSnap = await getDocs(studentQuery);
        if (studentsSnap.empty) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">No more students.</td></tr>`;
            return;
        }

        lastVisibleStudent = studentsSnap.docs[studentsSnap.docs.length - 1];
        document.getElementById('page-num').innerText = `Pg ${currentPage}`;

        const attendanceQuery = query(collection(db, "attendance"), where("eventId", "==", eventId));
        unsubscribeAttendance = onSnapshot(attendanceQuery, (snap) => {
            const logs = {};
            snap.forEach(d => logs[d.data().studentId] = d.data());

            tbody.innerHTML = "";
            let shownCount = 0;

            studentsSnap.forEach(sDoc => {
                const s = sDoc.data();
                const dept = classifyStudent(s.course);
                const isDeptMatch = (event.targetDept === "ALL" || event.targetDept === dept);
                const isYearMatch = event.targetYears.includes(s.yearLevel.toString());

                if (isDeptMatch && isYearMatch) {
                    const log = logs[sDoc.id];
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="font-weight:700;">${s.fullName}</td>
                        <td>${sDoc.id}<br><small>${dept}</small></td>
                        <td style="font-family:monospace;">${log ? `${log.timeIn}${log.timeOut ? '/' + log.timeOut : ''}` : '--'}</td>
                        <td style="font-weight:800; color:${log ? '#16a34a' : '#ef4444'}">${log ? log.status.toUpperCase() : 'ABSENT'}</td>
                    `;
                    tbody.appendChild(tr);
                    shownCount++;
                }
            });

            if(shownCount === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">No participants on this page. Click Next.</td></tr>`;
            }
        });
    } catch (err) { tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Error loading list.</td></tr>`; }
}

/**
 * HANDLE SCAN/INPUT
 */
async function handleAttendanceInput(studentId) {
    const eventId = document.getElementById('attendance-event-id').value;
    if (!eventId) return Swal.fire("Event Required", "Select an event first.", "warning");

    try {
        const studentSnap = await getDoc(doc(db, "students", studentId));
        if (!studentSnap.exists()) return updateUI("UNKNOWN ID", "NOT FOUND", "danger");

        const student = studentSnap.data();
        const event = eventDataMap[eventId];
        const dept = classifyStudent(student.course);

        // Eligibility Check
        if ((event.targetDept !== "ALL" && event.targetDept !== dept) || !event.targetYears.includes(student.yearLevel.toString())) {
            return updateUI(student.fullName, "NOT ELIGIBLE", "danger");
        }

        const attendRef = doc(db, "attendance", `${eventId}_${studentId}`);
        const attendSnap = await getDoc(attendRef);
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

        if (!attendSnap.exists()) {
            await setDoc(attendRef, {
                studentId, studentName: student.fullName, classification: dept,
                eventId, eventName: event.name, timeIn: now, status: "In Venue", timestamp: serverTimestamp()
            });
            updateUI(student.fullName, "TIME IN", "success");
        } else if (attendSnap.data().status === "In Venue") {
            await updateDoc(attendRef, { timeOut: now, status: "Present" });
            updateUI(student.fullName, "TIME OUT", "info");
        } else {
            updateUI(student.fullName, "COMPLETED", "warning");
        }
    } catch (err) { console.error(err); }
}

/**
 * CAMERA FIX FOR ANDROID
 */
async function toggleCameraScanner() {
    const reader = document.getElementById('reader');
    const ph = document.getElementById('camera-placeholder');

    if (isScannerActive) {
        if (html5QrCode) {
            await html5QrCode.stop();
            html5QrCode = null;
        }
        reader.style.display = 'none';
        ph.style.display = 'flex';
        isScannerActive = false;
    } else {
        // RESET CAMERA INSTANCE
        reader.style.display = 'block';
        ph.style.display = 'none';
        
        try {
            // Check permissions first
            await Html5Qrcode.getCameras(); 
            
            html5QrCode = new Html5Qrcode("reader");
            await html5QrCode.start(
                { facingMode: "environment" }, 
                { fps: 15, qrbox: 250 }, 
                (text) => {
                    handleAttendanceInput(text);
                    html5QrCode.pause(true);
                    setTimeout(() => { if(html5QrCode) html5QrCode.resume(); }, 3000);
                }
            );
            isScannerActive = true;
        } catch (err) {
            console.error(err);
            Swal.fire("Camera Error", "Please allow camera access and refresh the page.", "error");
            reader.style.display = 'none';
            ph.style.display = 'flex';
        }
    }
}

function updateUI(name, status, type) {
    const idEl = document.getElementById('scan-id'), stEl = document.getElementById('scan-status'), box = document.getElementById('scan-feedback');
    const theme = { success: '#dcfce7', info: '#dbeafe', warning: '#fef9c3', danger: '#fee2e2' };
    idEl.innerText = name; stEl.innerText = status;
    box.style.background = theme[type];
    setTimeout(() => { idEl.innerText = "READY"; stEl.innerText = "Waiting for Scan..."; box.style.background = "white"; }, 3000);
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
    link.download = `Attendance_${eventId}.csv`; link.click();
}
