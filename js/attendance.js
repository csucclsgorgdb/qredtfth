import { db } from './firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let html5QrCode;
let eventDataMap = {};
let isScannerActive = false;

// --- DYNAMIC CLASSIFICATION ---
function classifyStudent(course) {
    if (!course) return "Other";
    const c = course.toUpperCase();
    if (c.includes("BTLED") || c.includes("BTVTED")) return "Education Student";
    if (c.includes("BSINDTECH")) return "Industrial Tech Student";
    return "Other Dept";
}

/**
 * INITIALIZE ATTENDANCE MODULE
 */
export async function initAttendance() {
    const container = document.getElementById('module-container');
    
    // 1. Kunin ang mga Ongoing Events
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
                <p class="module-subtitle">Real-time "One-Scan" Time-In/Out System.</p>
            </div>
            <button id="btn-toggle-camera" class="btn-gold"><i data-lucide="camera"></i> Open Camera</button>
        </div>

        <div class="dashboard-grid" style="grid-template-columns: 0.8fr 1.2fr;">
            <div class="dashboard-card" style="text-align:center;">
                <div style="margin-bottom:15px; text-align:left;">
                    <label style="font-size:10px; font-weight:800; color:var(--text-muted);">SELECT EVENT</label>
                    <select id="attendance-event-id" class="swal2-input" style="margin:5px 0; width:100%;">
                        <option value="">-- Choose Event --</option>
                        ${eventOptions}
                    </select>
                </div>

                <div style="margin-bottom:15px;">
                    <label style="font-size:10px; font-weight:800; color:var(--hero-navy);">SCAN GUN / MANUAL ENTRY</label>
                    <input type="text" id="manual-input" class="swal2-input attendance-input-active" placeholder="Scan ID or Type here..." 
                           style="width:100%; margin:5px 0; height:45px;">
                </div>

                <div id="scanner-container" style="display:none; width:100%; border-radius:15px; overflow:hidden; border:2px solid var(--hero-navy); background:#000;">
                    <div id="reader"></div>
                </div>

                <div id="scan-feedback" class="dashboard-card" style="margin-top:15px; border:1px dashed #cbd5e1; background:#f8fafc; transition: 0.3s;">
                    <h3 id="scan-id" style="color:var(--hero-navy); font-weight:800; margin-bottom:5px;">---</h3>
                    <p id="scan-status" style="margin:5px 0 0 0; font-size:0.9rem;">Waiting for input...</p>
                </div>
            </div>

            <div class="dashboard-card">
                <h3 style="margin-bottom:15px;"><i data-lucide="activity"></i> Eligible Participants</h3>
                <div class="data-table-container" style="max-height: 480px; overflow-y:auto;">
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
                            <tr><td colspan="6" style="text-align:center; padding:20px;">Please select an event to view eligible students.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
    lucide.createIcons();
}

/**
 * SETUP EVENT LISTENERS (Focus, Keypress, Toggles)
 */
function setupEventListeners() {
    const eventSelect = document.getElementById('attendance-event-id');
    const manualInput = document.getElementById('manual-input');
    const cameraBtn = document.getElementById('btn-toggle-camera');

    // 1. SMART FOCUS Strategy for Scan Gun
    document.addEventListener('click', (e) => {
        // Iwasan ang focus kung kini-click ay select o button
        if (e.target.closest('select') || e.target.closest('button')) return;
        manualInput.focus();
    });

    // 2. Scan Gun / Manual Type and Enter
    manualInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAttendanceInput(manualInput.value.trim());
            manualInput.value = ""; // Clear for next scan
        }
    });

    // 3. Camera Toggle Logic
    cameraBtn.onclick = () => toggleCameraScanner(cameraBtn);

    // 4. Event Dropdown Logic
    eventSelect.onchange = (e) => {
        const selectedId = e.target.value;
        if (!selectedId) return;
        refreshAttendanceTable(selectedId);
    };
}

/**
 * CAMERA SCANNER LOGIC (With Delay Fix)
 */
function toggleCameraScanner(btn) {
    const container = document.getElementById('scanner-container');
    
    if (isScannerActive) {
        // STOP
        if(html5QrCode) html5QrCode.stop();
        container.style.display = 'none';
        btn.innerHTML = '<i data-lucide="camera"></i> Open Camera';
        lucide.createIcons();
        isScannerActive = false;
    } else {
        // START (Inspired by screenshot)
        container.style.display = 'block';
        btn.innerHTML = '<i data-lucide="camera-off"></i> Close Camera';
        btn.style.background = '#ef4444'; // Red background for Close
        lucide.createIcons();
        
        // --- DELAY FIX ---
        // Bigyan ng 500ms bago simulan ang scanner para tapos na mag-render ang DOM elements
        setTimeout(() => {
            html5QrCode = new Html5Qrcode("reader");
            const config = { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
            
            html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
                html5QrCode.pause(); // anti-double scan
                handleAttendanceInput(decodedText);
                setTimeout(() => html5QrCode.resume(), 2500); // resume scanner
            }).catch(err => console.error(err));
            
            isScannerActive = true;
        }, 500);
    }
}

/**
 * CENTRALIZED INPUT HANDLER
 */
async function handleAttendanceInput(studentId) {
    const eventId = document.getElementById('attendance-event-id').value;
    if (!eventId || !studentId) return;

    const beep = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    const errorSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2873/2873-preview.mp3');

    try {
        const [studentSnap, eventSnap] = await Promise.all([
            getDoc(doc(db, "students", studentId)),
            getDoc(doc(db, "events", eventId))
        ]);

        if (!studentSnap.exists()) {
            updateUI("ID: " + studentId, "Student not found in database", "danger");
            errorSound.play();
            return;
        }

        const student = studentSnap.data();
        const event = eventSnap.data();
        
        // --- STRICT ELIGIBILITY VALIDATION ---
        const studentDept = classifyStudent(student.course);
        const studentYear = student.yearLevel.toString();

        const isDeptMatch = event.targetDept === "ALL" || event.targetDept === studentDept;
        const isYearMatch = event.targetYears.includes(studentYear);

        if (!isDeptMatch || !isYearMatch) {
            updateUI(student.fullName, "NOT ELIGIBLE FOR THIS EVENT", "danger");
            errorSound.play();
            return;
        }

        // --- PROCESS DB LOGIC ---
        // Using temporary Single Day logic for consolidation, can be updated with Day logic
        const attendanceRef = doc(db, "attendance", `${eventId}_${studentId}`);
        const attendSnap = await getDoc(attendanceRef);
        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (!attendSnap.exists()) {
            await setDoc(attendanceRef, {
                studentId, studentName: student.fullName, courseYear: student.course,
                classification: studentDept, eventId, eventName: event.name,
                timeIn: nowTime, timeOut: null, status: "In Venue", timestamp: serverTimestamp()
            });
            updateUI(student.fullName, `TIME IN | ${studentDept}`, "success");
        } else if (attendSnap.data().status === "In Venue") {
            await updateDoc(attendanceRef, { timeOut: nowTime, status: "Present" });
            updateUI(student.fullName, `TIME OUT | ${studentDept}`, "info");
        } else {
            updateUI(student.fullName, "Already Completed Attendance", "warning");
        }

        beep.play();
        refreshAttendanceTable(eventId);

    } catch (err) {
        console.error(err);
        updateUI("System Error", "Check connection", "danger");
    }
}

/**
 * REFRESH TABLE (Filters eligible participants)
 */
async function refreshAttendanceTable(eventId) {
    const tbody = document.getElementById('attendance-tbody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Syncing Participants...</td></tr>`;

    try {
        const [eventSnap, studentsSnap, logsSnap] = await Promise.all([
            getDoc(doc(db, "events", eventId)),
            getDocs(collection(db, "students")),
            getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId)))
        ]);

        const event = eventSnap.data();
        const logs = {};
        logsSnap.forEach(d => logs[d.data().studentId] = d.data());

        tbody.innerHTML = "";
        studentsSnap.forEach(sDoc => {
            const student = sDoc.data();
            const sDept = classifyStudent(student.course);
            const sYear = student.yearLevel.toString();

            // Strict filter based on event criteria
            if ((event.targetDept === "ALL" || event.targetDept === sDept) && event.targetYears.includes(sYear)) {
                const log = logs[sDoc.id];
                const row = document.createElement('tr');
                let statusBadge = log ? (log.status === 'Present' ? 
                    `<span style="background:#22c55e; color:white; padding:3px 8px; border-radius:10px;">PRESENT</span>` : 
                    `<span style="background:#eab308; color:white; padding:3px 8px; border-radius:10px;">IN VENUE</span>`) :
                    `<span style="background:#ef4444; color:white; padding:3px 8px; border-radius:10px;">ABSENT</span>`;

                row.innerHTML = `
                    <td><b>${student.fullName}</b></td>
                    <td>${sDoc.id}<br><small style="color:var(--hero-gold);">${sDept}</small></td>
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
            box.style.background = "#f8fafc"; box.style.borderColor = "# cbd5e1";
        }
    }, 4000);
}

/**
 * EXPORT CSV
 */
async function exportToCSV() {
    const eventId = document.getElementById('attendance-event-id').value;
    if(!eventId) return Swal.fire('Error', 'Choose an event first.', 'error');
    const snap = await getDocs(query(collection(db, "attendance"), where("eventId", "==", eventId)));
    let csv = "ID,Name,Dept,Course,In,Out,Status\n";
    snap.forEach(d => {
        const v = d.data();
        csv += `"${v.studentId}","${v.studentName}","${v.classification}","${v.courseYear}","${v.timeIn}","${v.timeOut || ''}","${v.status}"\n`;
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `Attendance_${eventId}.csv`;
    link.click();
}
