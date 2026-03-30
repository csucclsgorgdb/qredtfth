import { db } from './firebase-config.js';
import { 
    collection, addDoc, getDocs, query, where, updateDoc, deleteDoc, doc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * INITIALIZE EVENT MODULE
 */
export async function initEvents() {
    const container = document.getElementById('module-container');
    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
            <div>
                <h1 class="module-title" style="font-weight:800; color:var(--hero-navy);">Event Management</h1>
                <p class="module-subtitle">Create targeted events and manage records safely.</p>
            </div>
            <button class="btn-gold" id="create-event-btn"><i data-lucide="calendar-plus"></i> Create New Event</button>
        </div>

        <div class="dashboard-grid">
            <div class="dashboard-card">
                <h3 style="margin-bottom:20px; color:var(--hero-navy);"><i data-lucide="list"></i> Recent Events</h3>
                <div class="data-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>EVENT NAME</th>
                                <th>DATE</th>
                                <th>PARTICIPANTS</th>
                                <th>STATUS</th>
                                <th style="text-align:right">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody id="event-table-body"></tbody>
                    </table>
                </div>
            </div>

            <div class="dashboard-card status-panel">
                <h3 style="color:var(--hero-gold) !important;"><i data-lucide="pie-chart"></i> Quick Stats</h3>
                <div id="event-stats-container" style="margin-top:20px;">
                    <p style="font-size:0.8rem; opacity:0.8;">Select a completed event to view attendance analytics.</p>
                </div>
            </div>
        </div>
    `;

    loadEvents();
    document.getElementById('create-event-btn').onclick = showEventModal;
    lucide.createIcons();
}

/**
 * LOAD EVENTS FROM FIREBASE
 */
async function loadEvents() {
    const tbody = document.getElementById('event-table-body');
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>Updating list...</td></tr>";

    try {
        const q = query(collection(db, "events"), where("status", "!=", "Deleted"));
        const snap = await getDocs(q);
        tbody.innerHTML = "";

        if (snap.empty) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>No events found.</td></tr>";
            return;
        }

        const now = new Date();

        snap.forEach(docSnap => {
            const ev = docSnap.data();
            const isDone = ev.status === "Done";
            
            // 7-DAY LOCK LOGIC
            let canDelete = false;
            let daysRemaining = 0;

            if (isDone && ev.endDate) {
                const eventEnd = new Date(ev.endDate);
                const diffTime = now - eventEnd;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays >= 7) {
                    canDelete = true;
                } else {
                    daysRemaining = 7 - diffDays;
                }
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <b>${ev.name}</b><br>
                    <small style="color:var(--text-muted)">${ev.description?.substring(0, 25) || 'No description'}...</small>
                </td>
                <td>${ev.startDate}${ev.endDate && ev.endDate !== ev.startDate ? `<br><small>to ${ev.endDate}</small>` : ''}</td>
                <td>
                    <span style="font-size:11px; font-weight:700; color:var(--hero-navy); display:block;">${ev.targetDept || 'ALL'}</span>
                    <small style="color:var(--hero-gold); font-weight:600;">Year: ${ev.targetYears?.join(', ') || 'ALL'}</small>
                </td>
                <td><span class="tag-online" style="background: ${isDone ? '#22c55e' : '#eab308'}; color:white; padding:4px 8px; border-radius:5px; font-size:10px;">${ev.status.toUpperCase()}</span></td>
                <td style="text-align:right">
                    ${!isDone ? `<button class="btn-icon btn-complete" data-id="${docSnap.id}" title="Complete" style="color:#22c55e; border:none; background:none; cursor:pointer;"><i data-lucide="check-circle" style="width:18px"></i></button>` : ''}
                    
                    ${isDone ? `
                        <button class="btn-icon btn-delete-ev" data-id="${docSnap.id}" data-locked="${!canDelete}" data-days="${daysRemaining}" title="${canDelete ? 'Delete Event' : 'Locked'}" style="color:${canDelete ? '#ef4444' : '#cbd5e1'}; border:none; background:none; cursor:pointer; margin-left:8px;">
                            <i data-lucide="${canDelete ? 'trash-2' : 'lock'}" style="width:18px"></i>
                        </button>
                    ` : ''}
                    
                    <button class="btn-icon btn-export" data-id="${docSnap.id}" title="Export" style="color:var(--hero-gold); border:none; background:none; cursor:pointer; margin-left:8px;"><i data-lucide="download" style="width:18px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        attachEventActions();
        lucide.createIcons();
    } catch (e) { console.error("Event Load Error:", e); }
}

/**
 * MODAL: CREATE EVENT
 */
async function showEventModal() {
    const { value: formValues } = await Swal.fire({
        title: '<span style="color:var(--hero-navy); font-weight:800;">CREATE NEW EVENT</span>',
        html: `
            <div style="text-align:left; font-family:inherit;">
                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">EVENT NAME</label>
                <input id="swal-ev-name" class="swal2-input" style="margin:0 0 15px 0; width:100%;" placeholder="Enter event title...">

                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">DESCRIPTION</label>
                <textarea id="swal-ev-desc" class="swal2-textarea" style="margin:0 0 15px 0; width:100%; height:60px;" placeholder="Brief details..."></textarea>

                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <div style="flex:1">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">DURATION TYPE</label>
                        <select id="swal-ev-duration-type" class="swal2-input" style="margin:0; width:100%;">
                            <option value="single">One Day Event</option>
                            <option value="range">Multi-Day Event</option>
                        </select>
                    </div>
                    <div style="flex:1" id="swal-date-container">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">DATE</label>
                        <input type="date" id="swal-ev-start" class="swal2-input" style="margin:0; width:100%;">
                    </div>
                </div>

                <div style="margin-bottom:15px;">
                    <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">TARGET DEPARTMENT</label>
                    <select id="swal-ev-dept" class="swal2-input" style="margin:0; width:100%;">
                        <option value="ALL">ALL DEPARTMENTS</option>
                        <option value="EDUCATION STUDENT">EDUCATION STUDENT</option>
                        <option value="INDUSTRIAL TECHNOLOGY STUDENT">INDUSTRIAL TECHNOLOGY STUDENT</option>
                        <option value="OTHER DEPARTMENT">OTHER DEPARTMENT</option>
                    </select>
                </div>

                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:8px;">TARGET YEAR LEVELS</label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:5px;">
                    <label style="font-size:13px; cursor:pointer;"><input type="checkbox" class="year-lvl" value="1"> 1st Year</label>
                    <label style="font-size:13px; cursor:pointer;"><input type="checkbox" class="year-lvl" value="2"> 2nd Year</label>
                    <label style="font-size:13px; cursor:pointer;"><input type="checkbox" class="year-lvl" value="3"> 3rd Year</label>
                    <label style="font-size:13px; cursor:pointer;"><input type="checkbox" class="year-lvl" value="4"> 4th Year</label>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Create Event',
        confirmButtonColor: '#001a3d',
        didOpen: () => {
            const typeSelect = document.getElementById('swal-ev-duration-type');
            const dateContainer = document.getElementById('swal-date-container');
            
            typeSelect.onchange = (e) => {
                if(e.target.value === 'range') {
                    dateContainer.innerHTML = `
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">FROM - TO</label>
                        <div style="display:flex; gap:5px;">
                            <input type="date" id="swal-ev-start" class="swal2-input" style="margin:0; width:100%; font-size:11px; padding:10px;">
                            <input type="date" id="swal-ev-end" class="swal2-input" style="margin:0; width:100%; font-size:11px; padding:10px;">
                        </div>
                    `;
                } else {
                    dateContainer.innerHTML = `
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">DATE</label>
                        <input type="date" id="swal-ev-start" class="swal2-input" style="margin:0; width:100%;">
                    `;
                }
            };
        },
        preConfirm: () => {
            const name = document.getElementById('swal-ev-name').value.trim();
            const start = document.getElementById('swal-ev-start').value;
            const years = Array.from(document.querySelectorAll('.year-lvl:checked')).map(cb => cb.value);

            if (!name || !start) { 
                Swal.showValidationMessage('Event Name and Date are required'); 
                return false; 
            }
            if (years.length === 0) { 
                Swal.showValidationMessage('Select at least one Year Level'); 
                return false; 
            }

            return {
                name,
                description: document.getElementById('swal-ev-desc').value.trim(),
                startDate: start,
                endDate: document.getElementById('swal-ev-end')?.value || start,
                targetDept: document.getElementById('swal-ev-dept').value,
                targetYears: years,
                status: 'Ongoing',
                createdAt: serverTimestamp()
            }
        }
    });

    if (formValues) {
        try {
            await addDoc(collection(db, "events"), formValues);
            Swal.fire({ icon: 'success', title: 'Event Created', showConfirmButton: false, timer: 1500 });
            loadEvents();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    }
}

/**
 * ATTACH EVENT ACTIONS (BUTTON BINDING)
 */
function attachEventActions() {
    // 1. MARK DONE
    document.querySelectorAll('.btn-complete').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            const res = await Swal.fire({
                title: 'Mark Event as Done?',
                text: "Attendance will be finalized and deletion locked for 7 days.",
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#22c55e',
                confirmButtonText: 'Yes, Mark Done'
            });
            if (res.isConfirmed) {
                await updateDoc(doc(db, "events", id), { status: "Done" });
                loadEvents();
            }
        };
    });

    // 2. DELETE (WITH SECURITY LOCK)
    document.querySelectorAll('.btn-delete-ev').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            const isLocked = e.currentTarget.dataset.locked === "true";
            const daysLeft = e.currentTarget.dataset.days;

            if (isLocked) {
                Swal.fire({
                    icon: 'info',
                    title: 'Action Locked',
                    text: `This event is still in the audit period. You can delete it in ${daysLeft} day(s).`,
                    confirmButtonColor: '#001a3d'
                });
                return;
            }

            const res = await Swal.fire({
                title: 'Delete Permanently?',
                text: "Warning: All records for this event will be gone.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Yes, Delete'
            });

            if (res.isConfirmed) {
                await deleteDoc(doc(db, "events", id));
                Swal.fire('Deleted!', 'Event removed successfully.', 'success');
                loadEvents();
            }
        };
    });

    // 3. EXPORT
    document.querySelectorAll('.btn-export').forEach(btn => {
        btn.onclick = (e) => exportEventAttendance(e.currentTarget.dataset.id);
    });
}

/**
 * EXPORT LOGIC
 */
async function exportEventAttendance(eventId) {
    Swal.fire({ 
        title: 'Generating Report...', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });
    
    // Placeholder for Excel/PDF export
    setTimeout(() => {
        Swal.fire('Export Ready', 'The attendance report is ready for download.', 'success');
    }, 1200);
}
