import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, writeBatch, where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let lastVisible = null; 
const PAGE_SIZE = 25;
let currentSearch = "";

export async function initStudents() {
    const container = document.getElementById('module-container');
    
    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:30px;">
            <div>
                <h1 class="module-title">Student Directory</h1>
                <p class="module-subtitle">Manage institutional records and academic profiles</p>
            </div>
            <div style="display:flex; gap:12px;">
                <div class="search-box" style="position:relative;">
                    <i data-lucide="search" style="position:absolute; left:12px; top:10px; width:16px; color:var(--text-muted);"></i>
                    <input type="text" id="student-search" placeholder="Search Last Name..." style="padding-left:40px; width:250px; border-radius:10px; border:1px solid #e2e8f0; height:40px;">
                </div>
                <input type="file" id="csv-import" accept=".csv" style="display:none">
                <button class="btn-navy" onclick="document.getElementById('csv-import').click()" style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="file-up"></i> Import CSV
                </button>
                <button class="btn-gold" id="add-student-btn" style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="user-plus"></i> Add New
                </button>
            </div>
        </div>

        <div id="import-status-area" style="display:none;" class="dashboard-card">
            <div style="display:flex; align-items:center; gap:15px;">
                <div class="logo-circle" style="background:var(--hero-gold);"><i data-lucide="loader" class="spin"></i></div>
                <div>
                    <b id="import-msg">Importing Records...</b>
                    <p id="import-progress" style="font-size:0.8rem; color:var(--text-muted)">Please do not close the window.</p>
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
                        <th>Balance</th>
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
    document.getElementById('csv-import').onchange = handleCSV;
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
    loadBtn.innerText = "Loading...";

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
                <td><b style="color:var(--hero-navy)">₱${parseFloat(s.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</b></td>
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

async function handleCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusArea = document.getElementById('import-status-area');
    const msg = document.getElementById('import-msg');
    statusArea.style.display = "block";

    const reader = new FileReader();
    reader.onload = async (e) => {
        const rows = e.target.result.split('\n').filter(row => row.trim() !== '').slice(1);
        const batch = writeBatch(db); 
        let count = 0;

        try {
            for (let row of rows) {
                const cols = row.split(',');
                if (cols.length >= 5) {
                    const [id, first, last, course, year] = cols;
                    const studentRef = doc(db, "students", id.trim());
                    batch.set(studentRef, {
                        studentId: id.trim(),
                        firstName: first.trim(),
                        lastName: last.trim(),
                        course: course.trim(),
                        year: year.trim(),
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
            msg.innerHTML = `<span style="color:#ef4444">Import Failed: ${error.message}</span>`;
        }
    };
    reader.readAsText(file);
}
