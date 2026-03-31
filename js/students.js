import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, where, deleteDoc, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Pagination & Search State
let pageStack = []; 
let currentPage = 0;
let lastVisible = null; 
const PAGE_SIZE = 25;
let currentSearch = "";

/**
 * HELPER: CLASSIFICATION LOGIC
 * Automates the labeling of students based on their course/program.
 */
function getClassification(program) {
    if (!program) return "UNCLASSIFIED";
    const p = program.toUpperCase();
    if (p.includes("BTLED") || p.includes("BTVTED")) {
        return "EDUCATION STUDENT";
    } else if (p.includes("BSINDUSTECH")) {
        return "INDUSTRIAL TECHNOLOGY STUDENT";
    }
    return "OTHER DEPARTMENT";
}

/**
 * SECURITY: SANITIZATION
 */
function sanitize(str) {
    if (!str) return "";
    const temp = document.createElement('div');
    temp.textContent = String(str);
    return temp.innerHTML;
}

/**
 * MODULE INITIALIZATION
 */
export async function initStudents() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px;">
            <div>
                <h1 class="module-title" style="font-weight:800; color:var(--hero-navy);">Student Management</h1>
                <p class="module-subtitle">Manage records for Education and Industrial Technology Departments.</p>
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
                        <th>STUDENT NAME & CLASSIFICATION</th>
                        <th>ID NUMBER</th>
                        <th>COLLEGE</th>
                        <th>COURSE / PROGRAM</th>
                        <th>YEAR</th>
                        <th style="text-align:right">ACTIONS</th>
                    </tr>
                </thead>
                <tbody id="student-list-body"></tbody>
            </table>
        </div>

        <div style="display:flex; justify-content:center; align-items:center; gap:20px; margin:30px 0;">
            <button id="prev-btn" class="btn-navy" style="background:transparent; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:8px 20px; border-radius:8px; cursor:pointer;" disabled>
                <i data-lucide="chevron-left" style="width:16px; vertical-align:middle;"></i> Previous
            </button>
            
            <span id="page-indicator" style="font-weight:600; color:var(--hero-navy);">Page 1</span>
            
            <button id="next-btn" class="btn-navy" style="background:transparent; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:8px 20px; border-radius:8px; cursor:pointer;">
                Next <i data-lucide="chevron-right" style="width:16px; vertical-align:middle;"></i>
            </button>
        </div>
    `;

    // Listeners
    document.getElementById('btn-import-trigger').onclick = () => document.getElementById('file-import').click();
    document.getElementById('file-import').onchange = handleFileUpload;
    document.getElementById('btn-add-manual').onclick = () => showStudentModal();
    document.getElementById('prev-btn').onclick = () => movePage(-1);
    document.getElementById('next-btn').onclick = () => movePage(1);
    
    document.getElementById('student-search').oninput = (e) => {
        currentSearch = e.target.value.trim().toUpperCase();
        resetPagination();
        loadStudents();
    };

    loadStudents();
}

/**
 * PAGINATION HELPERS
 */
function resetPagination() {
    currentPage = 0;
    pageStack = [];
    lastVisible = null;
}

async function movePage(direction) {
    if (direction === 1) {
        pageStack.push(lastVisible);
        currentPage++;
    } else {
        pageStack.pop();
        currentPage--;
        lastVisible = pageStack[pageStack.length - 1] || null;
    }
    loadStudents();
}

/**
 * DATA FETCHING
 */
async function loadStudents() {
    const tbody = document.getElementById('student-list-body');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const indicator = document.getElementById('page-indicator');
    
    tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px;'>Loading Records...</td></tr>";

    try {
        let constraints = [orderBy("fullName"), limit(PAGE_SIZE)];

        if (currentSearch) {
            constraints = [
                where("fullName", ">=", currentSearch),
                where("fullName", "<=", currentSearch + "\uf8ff"),
                orderBy("fullName"),
                limit(PAGE_SIZE)
            ];
        }

        if (currentPage > 0 && pageStack.length > 0) {
            const startDoc = pageStack[pageStack.length - 1];
            constraints.push(startAfter(startDoc));
        }

        const q = query(collection(db, "students"), ...constraints);
        const snapshot = await getDocs(q);
        
        tbody.innerHTML = "";
        
        if (snapshot.empty) {
            tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px;'>No students found.</td></tr>";
            nextBtn.disabled = true;
            return;
        }

        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        indicator.innerText = `Page ${currentPage + 1}`;
        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = snapshot.docs.length < PAGE_SIZE;

        snapshot.forEach(docSnap => {
            const s = docSnap.data();
            const classification = getClassification(s.program); // Automatic Classification

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <b style="text-transform: uppercase;">${sanitize(s.fullName)}</b><br>
                    <small style="color:var(--hero-gold); font-weight:800; font-size:10px;">${classification}</small>
                </td>
                <td><b>${sanitize(s.studentId)}</b></td>
                <td>${sanitize(s.college)}</td>
                <td><span class="badge" style="background:#f1f5f9; color:var(--hero-navy); border:1px solid #e2e8f0; font-weight:700;">${sanitize(s.program)}</span></td>
                <td>${sanitize(s.yearLevel)}</td>
                <td style="text-align:right">
                    <button class="btn-edit" data-id="${docSnap.id}" style="border:none; background:none; color:var(--hero-navy); cursor:pointer;"><i data-lucide="edit-3" style="width:18px"></i></button>
                    <button class="btn-delete" data-id="${docSnap.id}" style="border:none; background:none; color:#ef4444; cursor:pointer; margin-left:12px;"><i data-lucide="trash-2" style="width:18px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        attachActionListeners();
        lucide.createIcons();
    } catch (e) { 
        console.error("Load Error:", e);
        tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; color:red;'>Error loading data. Check Firestore Indexes.</td></tr>";
    }
}

/**
 * MODAL: ADD/EDIT
 */
async function showStudentModal(studentId = null) {
    let s = { studentId: '', fullName: '', college: '', program: '', yearLevel: '' };
    
    if (studentId) {
        const snap = await getDoc(doc(db, "students", studentId));
        if (snap.exists()) s = snap.data();
    }

    const { value: formValues } = await Swal.fire({
        title: `<span style="font-weight:800; color:var(--hero-navy)">${studentId ? 'EDIT STUDENT' : 'ADD NEW STUDENT'}</span>`,
        html: `
            <div style="text-align:left;">
                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">ID NUMBER</label>
                <input id="swal-id" class="swal2-input" style="margin:0 0 15px 0; width:100%;" value="${sanitize(s.studentId)}" ${studentId ? 'readonly' : ''}>
                
                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">FULL NAME</label>
                <input id="swal-name" class="swal2-input" style="margin:0 0 15px 0; width:100%; text-transform:uppercase;" value="${sanitize(s.fullName)}">
                
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <div style="flex:1">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">COLLEGE</label>
                        <input id="swal-college" class="swal2-input" style="margin:0; width:100%;" value="${sanitize(s.college)}">
                    </div>
                    <div style="flex:1">
                        <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">YEAR LEVEL</label>
                        <input id="swal-year" class="swal2-input" style="margin:0; width:100%;" value="${sanitize(s.yearLevel)}">
                    </div>
                </div>

                <label style="font-size:11px; font-weight:700; color:#64748b; display:block; margin-bottom:5px;">COURSE / PROGRAM</label>
                <input id="swal-program" class="swal2-input" placeholder="e.g. BTLED" style="margin:0; width:100%; text-transform:uppercase;" value="${sanitize(s.program)}">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Record',
        confirmButtonColor: '#001a3d',
        preConfirm: () => {
            const sid = document.getElementById('swal-id').value.trim();
            const fname = document.getElementById('swal-name').value.trim().toUpperCase();
            if (!sid || !fname) return Swal.showValidationMessage('ID and Name are required');
            
            return {
                studentId: sid,
                fullName: fname,
                college: document.getElementById('swal-college').value.trim().toUpperCase(),
                program: document.getElementById('swal-program').value.trim().toUpperCase(),
                yearLevel: document.getElementById('swal-year').value.trim()
            }
        }
    });

    if (formValues) {
        try {
            await updateDoc(doc(db, "students", formValues.studentId), formValues).catch(async () => {
                await writeBatch(db).set(doc(db, "students", formValues.studentId), { ...formValues, balance: 0 }).commit();
            });
            Swal.fire({ icon: 'success', title: 'Saved!', timer: 1500, showConfirmButton: false });
            loadStudents();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    }
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
                text: `Permanent removal of ${id}.`,
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
                const id = String(row['ID NUMBER'] || row.Id || row.ID || row['Student ID'] || "").trim();
                const name = String(row['STUDENT NAME'] || row['Student Name'] || row.Name || row['Full Name'] || "").trim();
                const prog = String(row['COURSE/PROGRAM'] || row['Course/Program'] || row.Course || row.Program || "").trim();

                if (id && name) {
                    batch.set(doc(db, "students", id), {
                        studentId: id,
                        fullName: name.toUpperCase(),
                        college: String(row.COLLEGE || row.College || "").trim().toUpperCase(),
                        program: prog.toUpperCase(),
                        yearLevel: String(row.YEAR || row['Year Level'] || row.Year || "").trim(),
                        balance: 0,
                        lastUpdated: new Date().toISOString()
                    });
                }
            });
            await batch.commit();
            Swal.fire('Import Success', 'Data synced.', 'success');
            resetPagination();
            loadStudents();
        } catch (err) { Swal.fire('Error', err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = ""; 
}
