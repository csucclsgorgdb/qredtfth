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
                    <input type="text" id="student-search" placeholder="Search Last Name..." style="padding-left:40px; width:250px;">
                </div>
                <input type="file" id="csv-import" accept=".csv" style="display:none">
                <button class="btn-navy" onclick="document.getElementById('csv-import').click()">
                    <i data-lucide="file-up"></i> Import CSV
                </button>
                <button class="btn-gold" id="add-student-btn">
                    <i data-lucide="user-plus"></i> Add New
                </button>
            </div>
        </div>

        <div class="dashboard-card table-responsive" style="padding:0; overflow:hidden;">
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
                    <tr><td colspan="5" style="text-align:center; padding:50px; color:var(--text-muted)">Initialising Database...</td></tr>
                </tbody>
            </table>
        </div>

        <div style="text-align:center; margin-top:30px;">
            <button id="load-more-btn" class="btn-navy" style="background:transparent; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:10px 40px;">
                Load More Records
            </button>
        </div>
    `;

    // Reset State
    lastVisible = null;
    currentSearch = "";
    
    // Listeners
    document.getElementById('load-more-btn').addEventListener('click', () => loadStudents(true));
    document.getElementById('csv-import').addEventListener('change', handleCSV);
    document.getElementById('student-search').addEventListener('input', (e) => {
        currentSearch = e.target.value.trim();
        lastVisible = null; // Reset pagination for search
        document.getElementById('student-list-body').innerHTML = ""; 
        loadStudents();
    });

    loadStudents();
    lucide.createIcons();
}

async function loadStudents(isAppend = false) {
    const tbody = document.getElementById('student-list-body');
    const loadBtn = document.getElementById('load-more-btn');
    
    if(!isAppend) tbody.innerHTML = "";
    loadBtn.innerText = "Processing...";

    try {
        let q;
        const constraints = [orderBy("lastName"), limit(PAGE_SIZE)];
        
        // Add Search Filter if applicable
        if (currentSearch) {
            constraints.unshift(where("lastName", ">=", currentSearch), where("lastName", "<=", currentSearch + "\uf8ff"));
        }

        if (lastVisible && isAppend) {
            constraints.push(startAfter(lastVisible));
        }

        q = query(collection(db, "students"), ...constraints);
        const snapshot = await getDocs(q);
        
        if (snapshot.empty && !isAppend) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px;">No students found matching your criteria.</td></tr>`;
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
                <td><span class="badge" style="background:#e2e8f0; color:var(--hero-navy);">${s.course}</span> ${s.year}</td>
                <td>₱${parseFloat(s.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="text-align:right">
                    <button class="btn-action" style="background:none; border:none; cursor:pointer; color:var(--hero-navy)"><i data-lucide="edit-3" style="width:18px"></i></button>
                    <button class="btn-action" style="background:none; border:none; cursor:pointer; color:#ef4444; margin-left:10px"><i data-lucide="trash-2" style="width:18px"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });

        loadBtn.innerText = lastVisible ? "Load More Records" : "End of Database";
        loadBtn.disabled = !lastVisible;
        lucide.createIcons();

    } catch (error) {
        console.error("Fetch Error:", error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red">Error accessing database. Check console.</td></tr>`;
    }
}

async function handleCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const rows = e.target.result.split('\n').slice(1);
        const batch = writeBatch(db); 
        let count = 0;

        document.getElementById('student-list-body').innerHTML = `<tr><td colspan="5" style="text-align:center; padding:50px;">Importing ${rows.length} records... Please wait.</td></tr>`;

        for (let row of rows) {
            const [id, first, last, course, year] = row.split(',');
            if (id && id.trim()) {
                const studentRef = doc(db, "students", id.trim());
                batch.set(studentRef, {
                    studentId: id.trim(),
                    firstName: first.trim(),
                    lastName: last.trim(),
                    course: course.trim(),
                    year: year.trim(),
                    balance: 0,
                    orgId: localStorage.getItem('orgId') || "HERO_DEFAULT"
                });
                count++;
            }
        }

        await batch.commit();
        alert(`Success: ${count} students imported.`);
        initStudents();
    };
    reader.readAsText(file);
}
