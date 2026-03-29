import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. GLOBAL LOAD GUARD FOR EXCEL
let isExcelLibReady = false;
if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    script.onload = () => { 
        isExcelLibReady = true; 
        console.log("HERO System: Excel Library Loaded."); 
    };
    document.head.appendChild(script);
} else {
    isExcelLibReady = true;
}

let lastVisible = null; 
const PAGE_SIZE = 25;
let currentSearch = "";

export async function initStudents() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px;">
            <div>
                <h1 class="module-title" style="font-weight:800; color:var(--hero-navy);">Student Management</h1>
                <p class="module-subtitle">ID • Student Name • College • Course/Program • Year Level</p>
            </div>
            <div style="display:flex; gap:12px;">
                <div class="search-box" style="position:relative;">
                    <i data-lucide="search" style="position:absolute; left:12px; top:10px; width:16px; color:var(--text-muted);"></i>
                    <input type="text" id="student-search" placeholder="Search Full Name..." style="padding-left:40px; width:250px; border-radius:10px; border:1px solid #e2e8f0; height:40px;">
                </div>
                
                <input type="file" id="file-import" accept=".csv, .xlsx, .xls" style="display:none">
                
                <button class="btn-navy" id="btn-import-trigger" style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="file-up"></i> Bulk Import
                </button>
                <button class="btn-gold" id="btn-add-manual" style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="user-plus"></i> Add Student
                </button>
            </div>
        </div>

        <div id="import-status-area" style="display:none; margin-bottom: 20px;" class="dashboard-card">
            <div style="display:flex; align-items:center; gap:15px;">
                <div class="logo-circle" style="background:var(--hero-gold);"><i data-lucide="loader-2" class="spin"></i></div>
                <div>
                    <b id="import-msg">Syncing Records...</b>
                    <p id="import-progress" style="font-size:0.8rem; color:var(--text-muted)">Validating format: Id, Student Name, College, Course/Program, Year Level</p>
                </div>
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
                        <th>Year Level</th>
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

    // Listeners
    document.getElementById('btn-import-trigger').onclick = () => {
        if(!isExcelLibReady) return alert("Initializing Excel components...");
        document.getElementById('file-import').click();
    };

    document.getElementById('file-import').onchange = handleFileUpload;
    document.getElementById('load-more-btn').onclick = () => loadStudents(true);
    document.getElementById('btn-add-manual').onclick = () => showAddModal();

    document.getElementById('student-search').oninput = (e) => {
        currentSearch = e.target.value.trim().toUpperCase();
        lastVisible = null;
        loadStudents();
    };

    loadStudents();
    lucide.createIcons();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusArea = document.getElementById('import-status-area');
    const msg = document.getElementById('import-msg');
    statusArea.style.display = "block";
    msg.innerText = "Reading file...";

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            const batch = writeBatch(db); 
            let count = 0;

            for (let row of jsonData) {
                // Formatting based on your specific requirements:
                // Id, Student Name, College, Course/Program, Year Level
                const id = (row.Id || row['Student ID'] || row.ID || "").toString().trim();
                const fullName = (row['Student Name'] || row['Full Name'] || row.Name || "").toString().trim();

                if (id && fullName) {
                    const studentRef = doc(db, "students", id);
                    batch.set(studentRef, {
                        studentId: id,
                        fullName: fullName.toUpperCase(),
                        college: (row.College || "").toString().trim(),
                        program: (row['Course/Program'] || row.Course || row.Program || "").toString().trim(),
                        yearLevel: (row['Year Level'] || row.Year || "").toString().trim(),
                        balance: 0,
                        orgId: localStorage.getItem('orgId') || "HERO_001"
                    });
                    count++;
                }
            }

            await batch.commit();
            msg.innerHTML = `<span style="color:#166534">Successfully imported ${count} students!</span>`;
            setTimeout(() => { statusArea.style.display = "none"; initStudents(); }, 3000);
            
        } catch (error) {
            console.error("Import Error:", error);
            msg.innerHTML = `<span style="color:#ef4444">Import Failed: Check column headers.</span>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

async function loadStudents(isAppend = false) {
    const tbody = document.getElementById('student-list-body');
    const loadBtn = document.getElementById('load-more-btn');
    
    if(!isAppend) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:50px;">Syncing...</td></tr>`;

    try {
        const constraints = [orderBy("fullName"), limit(PAGE_SIZE)];
        if (currentSearch) {
            constraints.unshift(where("fullName", ">=", currentSearch), where("fullName", "<=", currentSearch + "\uf8ff"));
        }
        if (lastVisible && isAppend) constraints.push(startAfter(lastVisible));

        const q = query(collection(db, "students"), ...constraints);
        const snapshot = await getDocs(q);
        
        if (snapshot.empty && !isAppend) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:50px;">No records found.</td></tr>`;
            loadBtn.style.display = "none";
            return;
        }

        if(!isAppend) tbody.innerHTML = ""; 
        lastVisible = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach((doc) => {
            const s = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span style="font-weight:700; color:var(--hero-navy)">${s.studentId}</span></td>
                <td style="text-transform: uppercase;">${s.fullName}</td>
                <td><span class="badge" style="background:#f1f5f9; color:var(--hero-navy); border:1px solid #e2e8f0;">${s.college}</span></td>
                <td>${s.program}</td>
                <td style="font-weight:600;">${s.yearLevel}</td>
                <td style="text-align:right">
                    <button class="btn-icon" style="background:none; border:none; color:var(--hero-navy); cursor:pointer;"><i data-lucide="edit-3" style="width:16px"></i></button>
                    <button class="btn-icon" style="background:none; border:none; color:#ef4444; cursor:pointer; margin-left:10px;"><i data-lucide="trash-2" style="width:16px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        loadBtn.innerText = lastVisible ? "Load More Records" : "End of Records";
        loadBtn.disabled = !lastVisible;
        lucide.createIcons();
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}
