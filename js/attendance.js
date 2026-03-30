import { db } from './firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let html5QrCode;
let eventDataMap = {};

/**
 * HELPER: I-classify ang departamento base sa kurso
 */
function classifyStudent(course) {
    if (!course) return "Other Department";
    const c = course.toUpperCase();
    if (c.includes("BTLED") || c.includes("BTVTED")) return "Education Student";
    if (c.includes("BSINDTECH")) return "Industrial Technology Student";
    return "Other Department";
}

/**
 * INITIALIZE ATTENDANCE MODULE
 */
export async function initAttendance() {
    const container = document.getElementById('module-container');
    
    // Kunin ang Ongoing Events
    const q = query(collection(db, "events"), where("status", "==", "Ongoing"));
    const eventSnap = await getDocs(q);
    
    let eventOptions = eventSnap.docs.map(d => {
        const data = d.data();
        eventDataMap[d.id] = data;
        return `<option value="${d.id}">${data.name}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div>
                <h1 class="module-title" style="color:var(--hero-navy); font-weight:800;">Attendance Management</h1>
                <p class="module-subtitle">Scan Gun, Camera, or Manual Entry Supported.</p>
            </div>
            <button id="export-attendance-csv" class="btn-gold"><i data-lucide="download"></i> Export CSV</button>
        </div>

        <div class="dashboard-grid">
            <div class="dashboard-card">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                    <div>
                        <label style="font-size:10px; font-weight:800; color:var(--text-muted);">SELECT EVENT</label>
                        <select id="attendance-event-id" class="swal2-input" style="margin:5px 0; width:100%; font-size:14px;">
                            <option value="">-- Choose Event --</option>
                            ${eventOptions}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:10px; font-weight:800; color:var(--text-muted);">SELECT DAY</label>
                        <select id="attendance-day" class="swal2-input" style="margin:5px 0; width:100%; font-size:14px;">
                            <option value="">-- Select Event First --</option>
                        </select>
                    </div>
                </div>

                <div style="margin-bottom:15px;">
                    <label style="font-size:10px; font-weight:800; color:var(--hero-navy);">SCAN GUN / MANUAL INPUT</label>
                    <input type="text" id="manual-input" class="swal2-input" placeholder="Ready to scan..." 
                           style="width:100%; margin:5px 0; text-align:center; font-weight:800; border:2px solid var(--hero-navy);">
                </div>

                <div id="reader" style="width: 100%; border-radius:15px; overflow:hidden; border:2px solid var(--hero-navy); background:#000;"></div>
                
                <div id="scan-feedback" class="dashboard-card" style="margin-top:15px; text-align:center; background:#f8fafc; transition: 0.3s; border:1px solid #e2e8f0;">
                    <h3 id="scan-id" style="color:var(--hero-navy); font-weight:800; margin-bottom:5px;">---</h3>
                    <p id="scan-status" style="margin:5px 0 0 0; font-size:0.9rem;">Waiting for input...</p>
                </div>
            </div>

            <div class="dashboard-card">
                <h3 style="margin-bottom:15px;"><i data-lucide="list"></i> Eligible Participants</h3>
                <div class="data-table-container" style="max-height: 500px; overflow-y:auto;">
                    <table class="data-table" style="font-size:11px;">
                        <thead>
                            <tr>
                                <th>STUDENT NAME</th>
                                <th>ID & DEPT</th>
                                <th>COURSE & YEAR</th>
                                <th>TIME IN</th>
                                <th>TIME OUT</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody id="attendance-tbody">
                            <tr><td colspan="6" style="text-align:center; padding:20px;">Select an event to view participants.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
    startCameraScanner();
    lucide.createIcons();
}

/**
 * SETUP EVENT LISTENERS (SCAN GUN, DROPDOWNS)
 */
function setupEventListeners() {
    const eventSelect = document.getElementById('attendance-event-id');
    const daySelect = document.getElementById('attendance-day');
    const manualInput = document.getElementById('manual-input');

    // Scan Gun / Enter Key Logic
    manualInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAttendanceInput(manualInput.value.trim());
            manualInput.value = "";
        }
    });

    // Auto-focus para sa Scan Gun
    document.addEventListener('click', () => manualInput.focus());

    eventSelect.onchange = (e) => {
        const selectedId = e.target.value;
        if (!selectedId) {
            daySelect.innerHTML = '<option value="">-- Select Event First --</option>';
            return;
        }
        const ev = eventDataMap[selectedId];
        const start = new Date(ev.startDate);
        const end = new Date(ev.endDate);
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1; 

        daySelect.innerHTML = "";
        for (let i = 1; i <= diffDays; i++) {
            const dateStr = new Date(start.getTime() + (i-1)*86400000).toLocaleDateString();
            daySelect.innerHTML += `<option value="Day ${i}">Day ${i} (${dateStr})</option>`;
        }
        refreshAttendanceTable(selectedId, daySelect.value);
    };

    daySelect.onchange = () => refreshAttendanceTable(eventSelect.value, daySelect.value);
    document.getElementById('export-attendance-csv').onclick = exportToCSV;
}

/**
 * CAMERA SCANNER SETUP
 */
function startCameraScanner() {
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 25, qrbox: 250 }, (text) => {
        html5QrCode.pause();
        handleAttendanceInput(text);
        setTimeout(() => html5QrCode.resume(), 2500);
    }).catch(err => console.error(err));
}

/**
 * CENTRALIZED INPUT HANDLER (The "Brain")
 */
async function handleAttendanceInput(studentId) {
    const eventId = document.getElementById('attendance-event-id').value;
    const selectedDay = document.getElementById('attendance-day').value;

    if (!eventId) {
        Swal.fire('Event Required', 'Pumili muna ng event.', 'warning');
        return;
    }

    const beep = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const errorSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3');

    try {
        const [studentSnap, eventSnap] = await Promise.all([
            getDoc(doc(db, "students", studentId)),
            getDoc(doc(db, "events", eventId))
        ]);

        if (!studentSnap.exists()) {
            updateUI("Unknown ID", "ID not found in database", "danger");
            errorSound.play();
            return;
        }

        const student = studentSnap.data();
        const event = eventSnap.data();
        
        // --- STRICT VALIDATION ---
        const studentDept = classifyStudent(student.course);
        const studentYear = student.yearLevel.toString();

        const isDeptMatch = event.targetDept === "ALL" || event.targetDept === studentDept;
        const isYearMatch = event.targetYears.includes(studentYear);

        if (!isDeptMatch || !isYearMatch) {
            updateUI(student.fullName, "NOT ELIGIBLE FOR THIS EVENT", "danger");
            errorSound.play();
            return;
        }

        // --- PROCESS DATABASE UPDATE ---
        const docId = `${eventId}_${studentId}_${selectedDay.replace(/\s/g, '')}`;
        const attendanceRef = doc(db, "attendance", docId);
        const attendSnap = await getDoc(attendanceRef);
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (!attendSnap.exists()) {
            await setDoc(attendanceRef, {
                studentId, studentName: student.fullName, courseYear: student.course,
                classification: studentDept, eventId, eventName: event.name,
                day: selectedDay, timeIn: nowTime, timeOut: null, status: "In Venue", timestamp: serverTimestamp()
            });
            updateUI(student.fullName, `TIME IN SUCCESS`, "success");
        } else if (attendSnap.data().status === "In Venue") {
            await updateDoc(attendanceRef, { timeOut: nowTime, status: "Present" });
            updateUI(student.fullName, `TIME OUT SUCCESS`, "info");
        } else {
            updateUI(student.fullName, "ALREADY COMPLETED", "warning");
        }

        beep.play();
        refreshAttendanceTable(eventId, selectedDay);

    } catch (err) {
        console.error(err);
        updateUI("System Error", "Check connection", "danger");
    }
}

/**
 * REFRESH TABLE (Filters only eligible participants)
 */
async function refreshAttendanceTable(eventId, day) {
    const tbody = document.getElementById('attendance-tbody');
    if (!eventId || !day) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Filtering List...</td></tr>`;

    try {
        const eventSnap = await getDoc(doc(db, "events", eventId));
        const event = eventSnap.data();

        const [studentsSnap, logsSnap] = await Promise.all([
            getDocs(collection(db, "students")),
            getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId), where("day", "==", day)))
        ]);

        const logs = {};
        logsSnap.forEach(d => logs[d.data().studentId] = d.data());

        tbody.innerHTML = "";
        studentsSnap.forEach(sDoc => {
            const student = sDoc.data();
            const studentDept = classifyStudent(student.course);
            const studentYear = student.yearLevel.toString();

            // Only show if eligible
            if ((event.targetDept === "ALL" || event.targetDept === studentDept) && event.targetYears.includes(studentYear)) {
                const log = logs[sDoc.id];
                const row = document.createElement('tr');
                let statusBadge = log ? (log.status === 'Present' ? 
                    `<span class="badge" style="background:#22c55e; color:white; padding:3px 8px; border-radius:10px;">PRESENT</span>` : 
                    `<span class="badge" style="background:#eab308; color:white; padding:3px 8px; border-radius:10px;">IN VENUE</span>`) :
                    `<span class="badge" style="background:#ef4444; color:white; padding:3px 8px; border-radius:10px;">ABSENT</span>`;

                row.innerHTML = `
                    <td><b>${student.fullName}</b></td>
                    <td>${sDoc.id}<br><small>${studentDept}</small></td>
                    <td>${student.course} - Yr ${student.yearLevel}</td>
                    <td>${log ? log.timeIn : '--:--'}</td>
                    <td>${log ? (log.timeOut || '--:--') : '--:--'}</td>
                    <td>${statusBadge}</td>
                `;
                tbody.appendChild(row);
            }
        });
    } catch (err) { console.error(err); }
}

/**
 * FEEDBACK UI
 */
function updateUI(name, status, type) {
    const idEl = document.getElementById('scan-id');
    const statusEl = document.getElementById('scan-status');
    const box = document.getElementById('scan-feedback');
    const colors = { success: '#dcfce7', info: '#dbeafe', warning: '#fef9c3', danger: '#fee2e2' };

    idEl.innerText = name;
    statusEl.innerText = status;
    box.style.background = colors[type] || '#f8fafc';
    box.style.borderColor = type === 'danger' ? '#ef4444' : '#cbd5e1';

    setTimeout(() => {
        if(idEl.innerText === name) {
            idEl.innerText = "---"; statusEl.innerText = "Waiting for input...";
            box.style.background = "#f8fafc"; box.style.borderColor = "#e2e8f0";
        }
    }, 4000);
}

/**
 * EXPORT CSV
 */
async function exportToCSV() {
    const eventId = document.getElementById('attendance-event-id').value;
    const day = document.getElementById('attendance-day').value;
    if(!eventId) return;

    const snap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId), where("day", "==", day)));
    let csv = "ID,Name,Dept,Course,Day,In,Out,Status\n";
    snap.forEach(d => {
        const v = d.data();
        csv += `"${v.studentId}","${v.studentName}","${v.classification}","${v.courseYear}","${v.day}","${v.timeIn}","${v.timeOut || ''}","${v.status}"\n`;
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `Attendance_${eventId}_${day}.csv`;
    link.click();
}
