import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Load SheetJS Dynamically for Excel (.xlsx) support
if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    document.head.appendChild(script);
}

let lastVisible = null; 
const PAGE_SIZE = 25;
let currentSearch = "";

export async function initStudents() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px;">
            <div>
                <h1 class="module-title" style="font-weight:800; color:var(--hero-navy);">Student Directory</h1>
                <p class="module-subtitle">Manage institutional records and academic profiles</p>
            </div>
            <div style="display:flex; gap:12px;">
                <div class="search-box" style="position:relative;">
                    <i data-lucide="search" style="position:absolute; left:12px; top:10px; width:16px; color:var(--text-muted);"></i>
                    <input type="text" id="student-search" placeholder="Search Last Name..." style="padding-left:40px; width:250px; border-radius:10px; border:1px solid #e2e8f0; height:40px;">
                </div>
                <input type="file" id="file-import" accept=".csv, .xlsx, .xls" style="display:none">
                
                <button class="btn-navy" onclick="document.getElementById('file-import').click()" style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="file-up"></i> Import Excel/CSV
                </button>
                <button class="btn-gold" id="btn-add-manual" style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="user-plus"></i> Add Student
                </button>
            </div>
        </div>

        <div id="import-status-area" style="display:none;" class="dashboard-card">
            <div style="display:flex; align-items:center; gap:15px;">
                <div class="logo-circle" style="background:var(--hero-gold);"><i data-lucide="loader-2" class="spin"></i></div>
                <div>
                    <b id="import-msg">Processing Records...</b>
                    <p id="import-progress" style="font-size:0.8rem; color:var(--text-muted)">Uploading to cloud database. Please wait.</p>
                </div>
            </div>
        </div>

        <div class="dashboard-card table-responsive" style="padding:0; overflow:hidden; margin-top:20px;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student ID</th>
                        <th>Name</th>
                        <th>Course & Year</th>
                        <th>College</th>
                        <th style="text-align:right">Actions</th>
                    </tr>
                </thead>
                <tbody id="student-list-body">
                    <tr><td colspan="5" style="text-align:center; padding:50px; color:var(--text-muted)">Connecting to database...</td></tr>
                </tbody>
            </table>
        </div>

        <div style="text-align:center; margin-top:30px; margin-bottom:50px;">
            <button id="load-more-btn" class="btn-navy" style="background:transparent; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:10px 40px; border-radius:30px; cursor:pointer; font-weight:600;">
                Load More Records
            </button>
        </div>
    `;

    // Reset State
    lastVisible = null;
    currentSearch = "";
    
    // Listeners
    document.getElementById('load-more-btn').onclick = () => loadStudents(true);
    document.getElementById('file-import').onchange = handleFileUpload;
    document.getElementById('btn-add-manual').onclick = () => alert("Manual Registration Modal coming soon!");
    
    document.getElementById('student-search').oninput = (e) => {
        currentSearch = e.target.value.trim();
        lastVisible = null;
        loadStudents();
    };

    loadStudents();
    lucide.createIcons();
}

async function loadStudents(isAppend = false) {
    const tbody = document.getElementById('student-list-body');
    const loadBtn = document.getElementById('load-more-btn');
    
    if(!isAppend) tbody.innerHTML = "";
    loadBtn.innerText = "Syncing...";

    try {
        const constraints = [orderBy("lastName"), limit(PAGE_SIZE)];
        
        if (currentSearch) {
            constraints.unshift(where("lastName", ">=", currentSearch), where("lastName", "<=", currentSearch + "\uf8ff"));
        }

        if (lastVisible && isAppend) {
            constraints.push(startAfter(lastVisible));
        }

        const q = query(collection(db, "students"), ...constraints);
        const snapshot = await getDocs(q);
        
        if (snapshot.empty && !isAppend) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px;">No students found matching "${currentSearch}".</td></tr>`;
            loadBtn.style.display = "none";
            return;
        }

        lastVisible = snapshot.docs[snapshot.docs.length - 1];

        snapshot.forEach((doc) => {
            const s = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span style="font-weight:700; color:var(--hero-navy)">${s.studentId}</span></td>
                <td>${s.lastName}, ${s.firstName}</td>
                <td><span class="badge" style="background:#f1f5f9; color:var(--hero-navy); border:1px solid #e2e8f0;">${s.course}</span> <small>${s.year}</small></td>
                <td><span style="color:var(--text-muted); font-size:0.85rem; font-weight:600;">${s.college || 'N/A'}</span></td>
                <td style="text-align:right">
                    <button class="btn-icon" style="background:none; border:none; cursor:pointer; color:var(--hero-navy); padding:5px;"><i data-lucide="edit-3" style="width:16px"></i></button>
                    <button class="btn-icon" style="background:none; border:none; cursor:pointer; color:#ef4444; padding:5px; margin-left:8px;"><i data-lucide="trash-2" style="width:16px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        loadBtn.innerText = lastVisible ? "Load More Records" : "End of Records";
        loadBtn.disabled = !lastVisible;
        loadBtn.style.opacity = lastVisible ? "1" : "0.5";
        lucide.createIcons();

    } catch (error) {
        console.error("Fetch Error:", error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">Database Error: ${error.message}</td></tr>`;
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusArea = document.getElementById('import-status-area');
    const msg = document.getElementById('import-msg');
    statusArea.style.display = "block";

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to JSON (Header mapping handled here)
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            const batch = writeBatch(db); 
            let count = 0;

            for (let row of jsonData) {
                // Map headers flexibly: ID/Student ID, FirstName, LastName, Course, Year, College
                const id = (row.ID || row['Student ID'] || row.studentId || "").toString().trim();
                
                if (id) {
                    const studentRef = doc(db, "students", id);
                    batch.set(studentRef, {
                        studentId: id,
                        firstName: (row.FirstName || row['First Name'] || "").toString().trim(),
                        lastName: (row.LastName || row['Last Name'] || "").toString().trim(),
                        course: (row.Course || "").toString().trim(),
                        year: (row.Year || "").toString().trim(),
                        college: (row.College || "").toString().trim(),
                        balance: 0,
                        orgId: localStorage.getItem('orgId') || "HERO_001"
                    });
                    count++;
                }
            }

            await batch.commit();
            msg.innerHTML = `<span style="color:#166534">Successfully imported ${count} students!</span>`;
            setTimeout(() => { statusArea.style.display = "none"; }, 3000);
            initStudents();
        } catch (error) {
            console.error(error);
            msg.innerHTML = `<span style="color:#ef4444">Import Failed: ${error.message}</span>`;
        }
    };

    // Read as ArrayBuffer to handle both Excel and CSV
    reader.readAsArrayBuffer(file);
}
