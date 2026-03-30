import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, where, deleteDoc, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let lastVisible = null; 
const PAGE_SIZE = 25;
let currentSearch = "";

/**
 * MODULE INITIALIZATION
 */
export async function initStudents() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px;">
            <div>
                <h1 class="module-title" style="font-weight:800; color:var(--hero-navy);">Student Management</h1>
                <p class="module-subtitle">ID • Name • College • Course/Program • Year</p>
            </div>
            <div style="display:flex; gap:12px;">
                <div class="search-box" style="position:relative;">
                    <i data-lucide="search" style="position:absolute; left:12px; top:10px; width:16px; color:var(--text-muted);"></i>
                    <input type="text" id="student-search" placeholder="Search full name..." style="padding-left:40px; width:250px; border-radius:10px; border:1px solid #e2e8f0; height:40px;">
                </div>
                
                <input type="file" id="file-import" accept=".csv, .xlsx, .xls" style="display:none">
                
                <button class="btn-navy" id="btn-import-trigger"><i data-lucide="file-up"></i> Bulk Import</button>
                <button class="btn-gold" id="btn-add-manual"><i data-lucide="user-plus"></i> Add Student</button>
            </div>
        </div>

        <div class="dashboard-card table-responsive" style="padding:0; overflow:hidden; border-radius:12px; box-shadow: var(--shadow-sm);">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID NUMBER</th>
                        <th>STUDENT NAME</th>
                        <th>COLLEGE</th>
                        <th>COURSE / PROGRAM</th>
                        <th>YEAR</th>
                        <th style="text-align:right">ACTIONS</th>
                    </tr>
                </thead>
                <tbody id="student-list-body"></tbody>
            </table>
        </div>

        <div style="text-align:center; margin-top:30px; margin-bottom:50px;">
            <button id="load-more-btn" class="btn-navy" style="background:transparent; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:10px 40px; border-radius:30px; cursor:pointer; font-weight:600;">
                Load More Records
            </button>
        </div>
    `;

    // Re-binding Listeners
    document.getElementById('btn-import-trigger').onclick = () => document.getElementById('file-import').click();
    document.getElementById('file-import').onchange = handleFileUpload;
    document.getElementById('btn-add-manual').onclick = () => showStudentModal();
    document.getElementById('load-more-btn').onclick = () => loadStudents(true);
    
    document.getElementById('student-search').oninput = (e) => {
        currentSearch = e.target.value.trim().toUpperCase();
        lastVisible = null;
        loadStudents();
    };

    loadStudents();
}

/**
 * MODAL: PROFESSIONAL ADD/EDIT (SweetAlert2)
 */
async function showStudentModal(studentId = null) {
    let s = { studentId: '', fullName: '', college: '', program: '', yearLevel: '' };
    
    if (studentId) {
        const snap = await getDoc(doc(db, "students", studentId));
        if (snap.exists()) s = snap.data();
    }

    const { value: formValues } = await Swal.fire({
        title: `<span style="font-weight:800; color:#0a192f">${studentId ? 'EDIT STUDENT' : 'ADD NEW STUDENT'}</span>`,
        html: `
            <div style="text-align:left; font-family: inherit;">
                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">ID NUMBER</label>
                <input id="swal-id" class="swal2-input" style="margin:0 0 15px 0; width:100%;" placeholder="e.g. 2024-0001" value="${s.studentId}" ${studentId ? 'readonly' : ''}>
                
                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">FULL NAME</label>
                <input id="swal-name" class="swal2-input" style="margin:0 0 15px 0; width:100%; text-transform:uppercase;" placeholder="SURNAME, FIRSTNAME M." value="${s.fullName}">
                
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <div style="flex:1">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">COLLEGE</label>
                        <input id="swal-college" class="swal2-input" style="margin:0; width:100%;" placeholder="CITTE" value="${s.college}">
                    </div>
                    <div style="flex:1">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">YEAR LEVEL</label>
                        <input id="swal-year" class="swal2-input" style="margin:0; width:100%;" placeholder="1st Year" value="${s.yearLevel}">
                    </div>
                </div>

                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">COURSE / PROGRAM</label>
                <input id="swal-program" class="swal2-input" style="margin:0; width:100%;" placeholder="BTLED / BTVTEd" value="${s.program}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Record',
        confirmButtonColor: '#0a192f',
        cancelButtonColor: '#cbd5e1',
        preConfirm: () => {
            const id = document.getElementById('swal-id').value.trim();
            const name = document.getElementById('swal-name').value.trim();
            if (!id || !name) return Swal.showValidationMessage('ID and Name are required');
            return {
                studentId: id,
                fullName: name.toUpperCase(),
                college: document.getElementById('swal-college').value.trim().toUpperCase(),
                program: document.getElementById('swal-program').value.trim().toUpperCase(),
                yearLevel: document.getElementById('swal-year').value.trim()
            }
        }
    });

    if (formValues) {
        try {
            if (studentId) {
                await updateDoc(doc(db, "students", studentId), formValues);
            } else {
                await writeBatch(db).set(doc(db, "students", formValues.studentId), { ...formValues, balance: 0 }).commit();
            }
            Swal.fire({ icon: 'success', title: 'Saved!', timer: 1500, showConfirmButton: false });
            loadStudents();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    }
}

/**
 * DATA FETCHING
 */
async function loadStudents(isAppend = false) {
    const tbody = document.getElementById('student-list-body');
    const loadBtn = document.getElementById('load-more-btn');
    if(!isAppend) tbody.innerHTML = "";

    try {
        const constraints = [orderBy("fullName"), limit(PAGE_SIZE)];
        if (currentSearch) {
            constraints.unshift(where("fullName", ">=", currentSearch), where("fullName", "<=", currentSearch + "\uf8ff"));
        }
        if (lastVisible && isAppend) constraints.push(startAfter(lastVisible));

        const q = query(collection(db, "students"), ...constraints);
        const snapshot = await getDocs(q);
        
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        loadBtn.style.display = snapshot.docs.length < PAGE_SIZE ? "none" : "inline-block";

        snapshot.forEach(docSnap => {
            const s = docSnap.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><b>${s.studentId}</b></td>
                <td style="text-transform: uppercase;">${s.fullName}</td>
                <td>${s.college || '---'}</td>
                <td><span class="badge" style="background:#f1f5f9; color:#0a192f; border:1px solid #e2e8f0;">${s.program || '---'}</span></td>
                <td>${s.yearLevel || '---'}</td>
                <td style="text-align:right">
                    <button class="btn-edit" data-id="${docSnap.id}" style="border:none; background:none; color:#0a192f; cursor:pointer;"><i data-lucide="edit-3" style="width:18px"></i></button>
                    <button class="btn-delete" data-id="${docSnap.id}" style="border:none; background:none; color:#ef4444; cursor:pointer; margin-left:12px;"><i data-lucide="trash-2" style="width:18px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        attachActionListeners();
        lucide.createIcons();
    } catch (e) { console.error(e); }
}

/**
 * ROW ACTIONS
 */
function attachActionListeners() {
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            const res = await Swal.fire({
                title: 'Delete Student?',
                text: `Removing student ${id} is permanent.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Yes, Delete'
            });
            if (res.isConfirmed) {
                await deleteDoc(doc(db, "students", id));
                loadStudents();
            }
        };
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.onclick = (e) => showStudentModal(e.currentTarget.dataset.id);
    });
}

/**
 * EXCEL IMPORT
 */
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    Swal.fire({ title: 'Importing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            const batch = writeBatch(db);
            
            jsonData.forEach(row => {
                const id = (row.Id || row['Student ID'] || row.ID || "").toString().trim();
                const name = (row['Student Name'] || row.Name || row['Full Name'] || "").toString().trim();
                if (id && name) {
                    batch.set(doc(db, "students", id), {
                        studentId: id,
                        fullName: name.toUpperCase(),
                        college: (row.College || "").toString().trim().toUpperCase(),
                        program: (row['Course/Program'] || row.Course || row.Program || "").toString().trim().toUpperCase(),
                        yearLevel: (row['Year Level'] || row.Year || "").toString().trim(),
                        balance: 0
                    });
                }
            });
            await batch.commit();
            Swal.fire('Import Success', 'Database updated.', 'success');
            initStudents();
        } catch (err) { Swal.fire('Error', err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
}
