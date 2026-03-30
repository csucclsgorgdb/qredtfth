import { db } from './firebase-config.js';
import { 
    collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp 
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
                <p class="module-subtitle">Create events and track student participation.</p>
            </div>
            <button class="btn-gold" id="create-event-btn"><i data-lucide="calendar-plus"></i> Create New Event</button>
        </div>

        <div class="dashboard-grid">
            <div class="dashboard-card">
                <h3 style="margin-bottom:20px;"><i data-lucide="list"></i> Recent Events</h3>
                <div class="data-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>EVENT NAME</th>
                                <th>DURATION</th>
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
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>Fetching events...</td></tr>";

    try {
        const q = query(collection(db, "events"), where("status", "!=", "Deleted"));
        const snap = await getDocs(q);
        tbody.innerHTML = "";

        if (snap.empty) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:20px;'>No events found.</td></tr>";
            return;
        }

        snap.forEach(docSnap => {
            const ev = docSnap.data();
            const isDone = ev.status === "Done";
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><b>${ev.name}</b><br><small style="color:var(--text-muted)">${ev.description.substring(0, 30)}...</small></td>
                <td>${ev.startDate} ${ev.endDate && ev.endDate !== ev.startDate ? `<br><small>to ${ev.endDate}</small>` : ''}</td>
                <td><span class="badge" style="background:rgba(255,255,255,0.1); color:white;">${ev.participants}</span></td>
                <td><span class="tag-online" style="background: ${isDone ? '#22c55e' : '#eab308'}; color:white;">${ev.status.toUpperCase()}</span></td>
                <td style="text-align:right">
                    ${!isDone ? `<button class="btn-icon btn-complete" data-id="${docSnap.id}" title="Mark as Done" style="color:#22c55e; border:none; background:none; cursor:pointer;"><i data-lucide="check-circle" style="width:20px"></i></button>` : ''}
                    <button class="btn-icon btn-export" data-id="${docSnap.id}" title="Export Data" style="color:var(--hero-gold); border:none; background:none; cursor:pointer; margin-left:10px;"><i data-lucide="download" style="width:20px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        attachEventActions();
        lucide.createIcons();
    } catch (e) {
        console.error("Event Load Error:", e);
    }
}

/**
 * MODAL: CREATE EVENT WITH DYNAMIC DATES
 */
async function showEventModal() {
    const { value: formValues } = await Swal.fire({
        title: '<span style="color:var(--hero-navy); font-weight:800;">CREATE NEW EVENT</span>',
        html: `
            <div style="text-align:left;">
                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">EVENT NAME</label>
                <input id="swal-ev-name" class="swal2-input" style="margin:0 0 15px 0; width:100%;">

                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">DESCRIPTION</label>
                <textarea id="swal-ev-desc" class="swal2-textarea" style="margin:0 0 15px 0; width:100%; height:80px;"></textarea>

                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <div style="flex:1">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">DURATION TYPE</label>
                        <select id="swal-ev-type" class="swal2-input" style="margin:0; width:100%;">
                            <option value="single">One Day Event</option>
                            <option value="range">Multi-Day Event</option>
                        </select>
                    </div>
                    <div style="flex:1" id="date-container">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">DATE</label>
                        <input type="date" id="swal-ev-start" class="swal2-input" style="margin:0; width:100%;">
                    </div>
                </div>

                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">PARTICIPANTS (PROGRAM/COURSE)</label>
                <input id="swal-ev-participants" class="swal2-input" placeholder="e.g. BTLED, BTVTEd or ALL" style="margin:0; width:100%; text-transform:uppercase;">
                <small style="color:#94a3b8; font-size:10px;">Separate multiple with commas. This filters attendance logs.</small>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Create Event',
        confirmButtonColor: '#001a3d',
        didOpen: () => {
            const typeSelect = document.getElementById('swal-ev-type');
            const dateContainer = document.getElementById('date-container');
            
            typeSelect.onchange = (e) => {
                if(e.target.value === 'range') {
                    dateContainer.innerHTML = `
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">FROM - TO</label>
                        <div style="display:flex; gap:5px;">
                            <input type="date" id="swal-ev-start" class="swal2-input" style="margin:0; width:100%; font-size:12px; padding:10px;">
                            <input type="date" id="swal-ev-end" class="swal2-input" style="margin:0; width:100%; font-size:12px; padding:10px;">
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
            const participants = document.getElementById('swal-ev-participants').value.trim().toUpperCase();
            
            if (!name || !start || !participants) {
                Swal.showValidationMessage('Please fill in required fields');
            }
            return {
                name,
                description: document.getElementById('swal-ev-desc').value.trim(),
                startDate: start,
                endDate: document.getElementById('swal-ev-end')?.value || start,
                participants: participants || 'ALL',
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
 * ACTIONS: COMPLETE & EXPORT
 */
function attachEventActions() {
    document.querySelectorAll('.btn-complete').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            const res = await Swal.fire({
                title: 'Mark Event as Done?',
                text: "This will finalize attendance records.",
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

    document.querySelectorAll('.btn-export').forEach(btn => {
        btn.onclick = (e) => exportEventAttendance(e.currentTarget.dataset.id);
    });
}

async function exportEventAttendance(eventId) {
    Swal.fire({ title: 'Preparing Data...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    // Logic to fetch all attendance logs linked to this eventId
    // and convert to Excel using XLSX.writeFile
    // (We will build the specific Attendance Query in the next step)
    
    setTimeout(() => {
        Swal.fire('Ready', 'Feature connected to Attendance Module.', 'success');
    }, 1000);
}
