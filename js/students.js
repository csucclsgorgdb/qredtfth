import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, where, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let lastVisible = null; 
const PAGE_SIZE = 25;
let currentSearch = "";

export async function initStudents() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px;">
            <div>
                <h1 class="module-title" style="font-weight:800; color:var(--hero-navy);">Student Management</h1>
                <p class="module-subtitle">Direct Database Access • No Format Restrictions</p>
            </div>
            <div style="display:flex; gap:12px;">
                <div class="search-box" style="position:relative;">
                    <i data-lucide="search" style="position:absolute; left:12px; top:10px; width:16px; color:var(--text-muted);"></i>
                    <input type="text" id="student-search" placeholder="Search name..." style="padding-left:40px; width:250px; border-radius:10px; border:1px solid #e2e8f0; height:40px;">
                </div>
                
                <input type="file" id="file-import" accept=".csv, .xlsx, .xls" style="display:none">
                
                <button class="btn-navy" id="btn-import-trigger"><i data-lucide="file-up"></i> Bulk Import</button>
                <button class="btn-gold" id="btn-add-manual"><i data-lucide="user-plus"></i> Add Student</button>
            </div>
        </div>

        <div id="import-status-area" style="display:none;" class="dashboard-card">
            <div style="display:flex; align-items:center; gap:15px;">
                <div class="logo-circle" style="background:var(--hero-gold);"><i data-lucide="loader-2" class="spin"></i></div>
                <b id="import-msg">Processing...</b>
            </div>
        </div>

        <div class="dashboard-card table-responsive" style="padding:0; overflow:hidden;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Student Name</th>
                        <th>College</th>
                        <th>Course/Program</th>
                        <th>Year</th>
                        <th style="text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody id="student-list-body"></tbody>
            </table>
        </div>

        <div style="text-align:center; margin-top:30px; margin-bottom:50px;">
            <button id="load-more-btn" class="btn-navy" style="background:transparent; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:10px 40px; border-radius:30px; cursor:pointer;">
                Load More
            </button>
        </div>
    `;

    // --- RE-BINDING ALL LISTENERS ---
    document.getElementById('btn-import-trigger').onclick = () => document.getElementById('file-import').click();
    document.getElementById('file-import').onchange = handleFileUpload;
    document.getElementById('btn-add-manual').onclick = () => showAddModal();
    document.getElementById('load-more-btn').onclick = () => loadStudents(true);
    
    // Fixed Search Logic
    const searchInput = document.getElementById('student-search');
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim().toUpperCase();
        lastVisible = null;
        loadStudents();
    });

    loadStudents();
    lucide.createIcons();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const msg = document.getElementById('import-msg');
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
                // FLEXIBLE MAPPING: Takes whatever value is in the cell (BTLED, BTVTEd, etc.)
                const id = (row.Id || row['Student ID'] || row.ID || "").toString().trim();
                const name = (row['Student Name'] || row.Name || row['Full Name'] || "").toString().trim();

                if (id && name) {
                    const studentRef = doc(db, "students", id);
                    batch.set(studentRef, {
                        studentId: id,
                        fullName: name.toUpperCase(),
                        college: (row.College || "N/A").toString().trim(),
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
            location.reload(); 
        } catch (err) {
            alert("Import Error: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function loadStudents(isAppend = false) {
    const tbody = document.getElementById('student-list-body');
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

        snapshot.forEach(docSnap => {
            const s = docSnap.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><b>${s.studentId}</b></td>
                <td>${s.fullName}</td>
                <td>${s.college}</td>
                <td><span class="badge" style="background:#e2e8f0; color:#1e293b">${s.program}</span></td>
                <td>${s.yearLevel}</td>
                <td style="text-align:right">
                    <button class="btn-edit" data-id="${docSnap.id}" style="border:none; background:none; color:var(--hero-navy); cursor:pointer; padding:5px;"><i data-lucide="edit-3"></i></button>
                    <button class="btn-delete" data-id="${docSnap.id}" style="border:none; background:none; color:#ef4444; cursor:pointer; padding:5px; margin-left:10px;"><i data-lucide="trash-2"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // RE-ATTACH EDIT/DELETE LISTENERS AFTER TABLE RENDERS
        attachActionListeners();
        lucide.createIcons();
    } catch (e) { console.error(e); }
}

function attachActionListeners() {
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if(confirm(`Delete student ${id}?`)) {
                await deleteDoc(doc(db, "students", id));
                loadStudents(); // Refresh
            }
        };
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            alert("Edit feature for " + id + " is loading...");
            // You can call showEditModal(id) here
        };
    });
}

// Manual Add Modal (Simplified)
export function showAddModal() {
    const modalHtml = `
        <div class="modal-overlay" id="modal-container">
            <div class="modal-content" style="padding:30px;">
                <h3>Add New Student</h3><br>
                <form id="manual-add-form">
                    <input type="text" name="id" placeholder="ID Number" required style="width:100%; margin-bottom:10px; padding:10px;">
                    <input type="text" name="name" placeholder="Full Name" required style="width:100%; margin-bottom:10px; padding:10px;">
                    <input type="text" name="college" placeholder="College" style="width:100%; margin-bottom:10px; padding:10px;">
                    <input type="text" name="program" placeholder="Course/Program" style="width:100%; margin-bottom:10px; padding:10px;">
                    <input type="text" name="year" placeholder="Year Level" style="width:100%; margin-bottom:20px; padding:10px;">
                    <div style="text-align:right">
                        <button type="button" onclick="document.getElementById('modal-container').remove()" class="btn-outline">Cancel</button>
                        <button type="submit" class="btn-gold">Save Student</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.getElementById('modal-root').innerHTML = modalHtml;

    document.getElementById('manual-add-form').onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const data = Object.fromEntries(f.entries());
        
        await writeBatch(db).set(doc(db, "students", data.id), {
            studentId: data.id,
            fullName: data.name.toUpperCase(),
            college: data.college,
            program: data.program,
            yearLevel: data.year,
            balance: 0
        }).commit();

        document.getElementById('modal-container').remove();
        loadStudents();
    };
}
