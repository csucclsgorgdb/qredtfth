import { db } from './firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let html5QrCode;

/**
 * HELPER: Automatikong i-classify ang departamento base sa kurso
 */
function classifyStudent(course) {
    if (!course) return "Other Department";
    const c = course.toUpperCase();
    if (c.includes("BTLED") || c.includes("BTVTED")) {
        return "Education Student";
    } else if (c.includes("BSINDTECH")) {
        return "Industrial Technology Student";
    }
    return "Other Department";
}

/**
 * INITIALIZE ATTENDANCE MODULE
 */
export async function initAttendance() {
    const container = document.getElementById('module-container');
    
    // 1. Kunin ang mga Ongoing Events para sa dropdown
    const q = query(collection(db, "events"), where("status", "==", "Ongoing"));
    const eventSnap = await getDocs(q);
    
    const eventDataMap = {};
    let eventOptions = eventSnap.docs.map(d => {
        const data = d.data();
        eventDataMap[d.id] = data;
        return `<option value="${d.id}">${data.name}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div>
                <h1 class="module-title" style="color:var(--hero-navy); font-weight:800;">Attendance Management</h1>
                <p class="module-subtitle">Scan student IDs and auto-classify departments.</p>
            </div>
            <button id="export-attendance-csv" class="btn-gold"><i data-lucide="download"></i> Export CSV</button>
        </div>

        <div class="dashboard-grid">
            <div class="dashboard-card">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
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

                <div id="reader" style="width: 100%; border-radius:15px; overflow:hidden; border:2px solid var(--hero-navy); background:#000;"></div>
                
                <div id="scan-feedback" class="dashboard-card" style="margin-top:15px; text-align:center; background:#f8fafc; transition: 0.3s;">
                    <h3 id="scan-id" style="color:var(--hero-navy); font-weight:800; margin-bottom:5px;">---</h3>
                    <p id="scan-dept" style="margin:0; font-size:0.8rem; font-weight:600; color:var(--hero-gold);"></p>
                    <p id="scan-status" style="margin:5px 0 0 0; font-size:0.9rem;">Ready to Scan</p>
                </div>
            </div>

            <div class="dashboard-card">
                <h3 style="margin-bottom:15px;"><i data-lucide="list"></i> Attendance Logs</h3>
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
                            <tr><td colspan="6" style="text-align:center; padding:20px;">Please select an event to start.</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const eventSelect = document.getElementById('attendance-event-id');
    const daySelect = document.getElementById('attendance-day');

    // DYNAMIC DAY LOGIC: Nagbabago base sa Start at End date ng event
    eventSelect.onchange = (e) => {
        const selectedId = e.target.value;
        if (!selectedId) {
            daySelect.innerHTML = '<option value="">-- Select Event First --</option>';
            return;
        }

        const ev = eventDataMap[selectedId];
        const start = new Date(ev.startDate);
        const end = new Date(ev.endDate);
        
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 

        daySelect.innerHTML = "";
        for (let i = 1; i <= diffDays; i++) {
            const dateStr = new Date(start.getTime() + (i-1)*86400000).toLocaleDateString();
            daySelect.innerHTML += `<option value="Day ${i}">Day ${i} (${dateStr})</option>`;
        }
        
        refreshAttendanceTable(selectedId, daySelect.value);
    };

    daySelect.onchange = () => refreshAttendanceTable(eventSelect.value, daySelect.value);
    document.getElementById('export-attendance-csv').onclick = exportToCSV;

    startScanner();
    lucide.createIcons();
}

/**
 * SCANNER SETUP
 */
function startScanner() {
    html5QrCode = new Html5Qrcode("reader");
    const config = { 
        fps: 25, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0 
    };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
        .catch(err => console.error("Scanner Error:", err));
}

/**
 * SCAN SUCCESS HANDLER
 */
async function onScanSuccess(decodedText) {
    const eventId = document.getElementById('attendance-event-id').value;
    const selectedDay = document.getElementById('attendance-day').value;

    if (!eventId) {
        Swal.fire('Event Required', 'Pumili muna ng event sa dropdown.', 'warning');
        return;
    }

    const docId = `${eventId}_${decodedText}_${selectedDay.replace(/\s/g, '')}`;
    const attendanceRef = doc(db, "attendance", docId);
    const beep = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    
    try {
        const snap = await getDoc(attendanceRef);
        const studentSnap = await getDoc(doc(db, "students", decodedText));
        const studentData = studentSnap.exists() ? studentSnap.data() : null;

        if (!studentData) {
            updateUI(decodedText, "ID not found in database", "danger");
            return;
        }

        const course = studentData.course || studentData.program || "N/A";
        const classification = classifyStudent(course);

        if (!snap.exists()) {
            // --- 1ST SCAN: TIME IN ---
            await setDoc(attendanceRef, {
                studentId: decodedText,
                studentName: studentData.fullName,
                courseYear: course,
                classification: classification,
                eventName: document.querySelector(`#attendance-event-id option[value="${eventId}"]`).text,
                eventId: eventId,
                day: selectedDay,
                timeIn: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timeOut: null,
                status: "In Venue",
                timestamp: serverTimestamp()
            });
            updateUI(studentData.fullName, `TIME IN | ${classification}`, "success");
        } else if (snap.data().status === "In Venue") {
            // --- 2ND SCAN: TIME OUT ---
            await updateDoc(attendanceRef, {
                timeOut: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: "Present"
            });
            updateUI(studentData.fullName, `TIME OUT | ${classification}`, "info");
        } else {
            updateUI(studentData.fullName, "Already Completed Today", "warning");
        }
        
        beep.play();
        refreshAttendanceTable(eventId, selectedDay);
        
    } catch (err) {
        console.error(err);
        updateUI("Error", "Permission Denied", "danger");
    }
}

/**
 * REFRESH TABLE
 */
async function refreshAttendanceTable(eventId, day) {
    const tbody = document.getElementById('attendance-tbody');
    const q = query(collection(db, "attendance"), 
              where("eventId", "==", eventId), 
              where("day", "==", day));
    
    const snap = await getDocs(q);
    tbody.innerHTML = "";

    if (snap.empty) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">No logs found for this day.</td></tr>`;
        return;
    }

    snap.docs.forEach(d => {
        const data = d.data();
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><b>${data.studentName}</b></td>
            <td>
                <span style="font-weight:700;">${data.studentId}</span><br>
                <small style="color:var(--hero-gold); font-weight:800; font-size:9px;">${data.classification || ''}</small>
            </td>
            <td>${data.courseYear}</td>
            <td>${data.timeIn}</td>
            <td>${data.timeOut || '--:--'}</td>
            <td>
                <span style="background:${data.status === 'Present' ? '#22c55e' : '#eab308'}; color:white; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:800;">
                    ${data.status.toUpperCase()}
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * FEEDBACK UI
 */
function updateUI(name, status, type) {
    const idEl = document.getElementById('scan-id');
    const statusEl = document.getElementById('scan-status');
    const box = document.getElementById('scan-feedback');

    idEl.innerText = name;
    statusEl.innerText = status;
    
    const colors = { success: '#dcfce7', info: '#dbeafe', warning: '#fef9c3', danger: '#fee2e2' };
    box.style.background = colors[type] || '#f8fafc';
    
    setTimeout(() => {
        if(idEl.innerText === name) {
            idEl.innerText = "---";
            statusEl.innerText = "Ready to Scan";
            box.style.background = "#f8fafc";
        }
    }, 4000);
}

/**
 * EXPORT CSV
 */
async function exportToCSV() {
    const eventId = document.getElementById('attendance-event-id').value;
    if(!eventId) return Swal.fire('Error', 'Pumili ng event para sa export.', 'error');

    const q = query(collection(db, "attendance"), where("eventId", "==", eventId));
    const snap = await getDocs(q);
    
    if (snap.empty) return Swal.fire('Empty', 'Walang data na ma-export.', 'info');

    let csvContent = "Student ID,Classification,Name,Course,Event,Day,Time In,Time Out,Status\n";
    
    snap.forEach(doc => {
        const d = doc.data();
        csvContent += `"${d.studentId}","${d.classification}","${d.studentName}","${d.courseYear}","${d.eventName}","${d.day}","${d.timeIn}","${d.timeOut || 'N/A'}","${d.status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_Export_${eventId}.csv`);
    link.click();
}
