import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, where, deleteDoc, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let lastVisible = null; 
const PAGE_SIZE = 25;
let currentSearch = "";

/**
 * MODULE INITIALIZATION
 * Sets up the UI and initial data fetch.
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

        <div id="import-status-area" style="display:none; margin-bottom:20px;" class="dashboard-card">
            <div style="display:flex; align-items:center; gap:15px;">
                <div class="logo-circle" style="background:var(--hero-gold);"><i data-lucide="loader-2" class="spin"></i></div>
                <b id="import-msg">Syncing records...</b>
            </div>
        </div>

        <div class="dashboard-card table-responsive" style="padding:0; overflow:hidden;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID Number</th>
                        <th>Student Name</th>
                        <th>College</th>
                        <th>Course / Program</th>
                        <th>Year</th>
                        <th style="text-align:right">Actions</th>
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

    // Event Bindings
    document.getElementById('btn-import-trigger').onclick = () => document.getElementById('file-import').click();
    document.getElementById('file-import').onchange = handleFileUpload;
    document.getElementById('btn-add-manual').onclick = () => showStudentModal(); 
    document.getElementById('load-more-btn').onclick = () => loadStudents(true);
    
    const searchInput = document.getElementById('student-search');
    searchInput.oninput = (e) => {
        currentSearch = e.target.value.trim().toUpperCase();
        lastVisible = null;
        loadStudents();
    };

    loadStudents();
    lucide.createIcons();
}

/**
 * DATA FETCHING & RENDERING
 */
async function loadStudents(isAppend = false) {
    const tbody = document.getElementById('student-list-body');
    const loadMoreBtn = document.getElementById('load-more-btn');
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
        
        // Toggle "Load More" button visibility
        loadMoreBtn.style.display = snapshot.docs.length < PAGE_SIZE ? "none" : "inline-block";

        snapshot.forEach(docSnap => {
            const s = docSnap.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><b>${s.studentId}</b></td>
                <td style="text-transform: uppercase;">${s.fullName}</td>
                <td>${s.college || '---'}</td>
                <td><span class="badge" style="background:#f1f5f9; color:var(--hero-navy); border:1px solid #e2e8f0;">${s.program || '---'}</span></td>
                <td>${s.yearLevel || '---'}</td>
                <td style="text-align:right">
                    <button class="btn-edit-trigger" data-id="${docSnap.id}" style="border:none; background:none; color:var(--hero-navy); cursor:pointer;"><i data-lucide="edit-3" style="width:16px"></i></button>
                    <button class="btn-delete-trigger" data-id="${docSnap.id}" style="border:none; background:none; color:#ef4444; cursor:pointer; margin-left:12px;"><i data-lucide="trash-2" style="width:16px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        attachActionListeners();
        lucide.createIcons();
    } catch (e) { console.error("Error loading students:", e); }
}

/**
 * EXCEL BULK IMPORT
 */
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('import-status-area').style.display = "block";

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet);

            const batch = writeBatch(db);
            let count = 0;

            for (let row of jsonData) {
                const id = (row.Id || row['Student ID'] || row.ID || "").toString().trim();
                const name = (row['Student Name'] || row.Name || row['Full Name'] || "").toString().trim();

                if (id && name) {
                    batch.set(doc(db, "students", id), {
                        studentId: id,
                        fullName: name.toUpperCase(),
                        college: (row.College || "").toString().trim(),
                        program: (row['Course/Program'] || row.Course || row.Program || "").toString().trim(),
                        yearLevel: (row['Year Level'] || row.Year || "").toString().trim(),
                        balance: 0,
                        orgId: "HERO_001"
                    });
                    count++;
                }
            }
            await batch.commit();
            alert(`Successfully imported ${count} students!`);
            initStudents(); // Full refresh
        } catch (err) { alert("Import Error: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * MODAL: ADD & EDIT STUDENT
 */
async function showStudentModal(studentId = null) {
    let s = { studentId: '', fullName: '', college: '', program: '', yearLevel: '' };
    
    // Fetch data if editing
    if (studentId) {
        const docRef = await getDoc(doc(db, "students", studentId));
        if (docRef.exists()) s = docRef.data();
    }

    const modalHtml = `
        <div class="modal-overlay" id="student-modal-container">
            <div class="modal-content" style="max-width:450px; padding:30px;">
                <h3 style="margin-bottom:20px; color:var(--hero-navy)">${studentId ? 'Update' : 'Add New'} Student</h3>
                <form id="student-form-submit">
                    <label style="font-size:0.8rem; font-weight:600;">ID NUMBER</label>
                    <input type="text" name="id" value="${s.studentId}" ${studentId ? 'readonly' : 'required'} style="width:100%; margin-bottom:12px; padding:10px; border-radius:8px; border:1px solid #ddd;">
                    
                    <label style="font-size:0.8rem; font-weight:600;">FULL NAME</label>
                    <input type="text" name="name" value="${s.fullName}" required style="width:100%; margin-bottom:12px; padding:10px; border-radius:8px; border:1px solid #ddd;">
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-size:0.8rem; font-weight:600;">COLLEGE</label>
                            <input type="text" name="college" value="${s.college}" style="width:100%; margin-bottom:12px; padding:10px; border-radius:8px; border:1px solid #ddd;">
                        </div>
                        <div>
                            <label style="font-size:0.8rem; font-weight:600;">YEAR LEVEL</label>
                            <input type="text" name="year" value="${s.yearLevel}" style="width:100%; margin-bottom:12px; padding:10px; border-radius:8px; border:1px solid #ddd;">
                        </div>
                    </div>
                    
                    <label style="font-size:0.8rem; font-weight:600;">COURSE/PROGRAM</label>
                    <input type="text" name="program" value="${s.program}" style="width:100%; margin-bottom:25px; padding:10px; border-radius:8px; border:1px solid #ddd;">
                    
                    <div style="text-align:right">
                        <button type="button" onclick="document.getElementById('student-modal-container').remove()" class="btn-outline" style="border:none; background:#f1f5f9; padding:10px 20px; border-radius:8px; cursor:pointer;">Cancel</button>
                        <button type="submit" class="btn-gold" style="padding:10px 20px;">Save Record</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('modal-root').innerHTML = modalHtml;

    document.getElementById('student-form-submit').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const newData = {
            studentId: fd.get('id'),
            fullName: fd.get('name').toUpperCase(),
            college: fd.get('college'),
            program: fd.get('program'),
            yearLevel: fd.get('year')
        };

        if (studentId) {
            await updateDoc(doc(db, "students", studentId), newData);
        } else {
            await writeBatch(db).set(doc(db, "students", newData.studentId), { ...newData, balance: 0 }).commit();
        }

        document.getElementById('student-modal-container').remove();
        loadStudents(); // Refresh current view
    };
}

/**
 * ROW ACTIONS
 */
function attachActionListeners() {
    document.querySelectorAll('.btn-delete-trigger').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if(confirm(`Are you sure you want to delete student record ${id}?`)) {
                await deleteDoc(doc(db, "students", id));
                loadStudents();
            }
        };
    });

    document.querySelectorAll('.btn-edit-trigger').forEach(btn => {
        btn.onclick = (e) => showStudentModal(e.currentTarget.dataset.id);
    });
}
