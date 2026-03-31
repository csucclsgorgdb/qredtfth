import { dbRequest } from '../app.js';

// Pagination & Search State
let currentPage = 1;
let currentSearch = "";

/**
 * HELPER: CLASSIFICATION LOGIC
 */
function getClassification(program) {
    if (!program) return "UNCLASSIFIED";
    const p = program.toUpperCase();
    if (p.includes("BTLED") || p.includes("BTVTED")) return "EDUCATION STUDENT";
    if (p.includes("BSINDUSTECH")) return "INDUSTRIAL TECHNOLOGY STUDENT";
    return "OTHER DEPARTMENT";
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
                <p class="module-subtitle">Manage records via Google Sheets Database.</p>
            </div>
            <div style="display:flex; gap:12px;">
                <div class="search-box" style="position:relative;">
                    <input type="text" id="student-search" placeholder="Search name or ID..." style="padding:10px 15px; width:250px; border-radius:10px; border:1px solid #e2e8f0; height:40px;">
                </div>
                <button class="btn-gold" id="btn-add-manual" style="padding:0 20px; border-radius:8px; border:none; background:var(--hero-gold); color:var(--hero-navy); font-weight:800; cursor:pointer;">
                    + Add Student
                </button>
            </div>
        </div>

        <div class="dashboard-card table-responsive" style="background:white; border-radius:12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow:hidden;">
            <table class="data-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc; text-align:left;">
                        <th style="padding:15px;">NAME & CLASSIFICATION</th>
                        <th style="padding:15px;">ID NUMBER</th>
                        <th style="padding:15px;">PROGRAM</th>
                        <th style="padding:15px;">YEAR</th>
                        <th style="padding:15px; text-align:right;">ACTIONS</th>
                    </tr>
                </thead>
                <tbody id="student-list-body"></tbody>
            </table>
        </div>

        <div id="pagination-controls" style="display:flex; justify-content:center; align-items:center; gap:20px; margin-top:25px;">
            <button id="prev-btn" class="btn-navy" style="background:none; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:8px 15px; border-radius:6px; cursor:pointer;">Previous</button>
            <span id="page-indicator" style="font-weight:bold;">Page 1</span>
            <button id="next-btn" class="btn-navy" style="background:none; border:1px solid var(--hero-navy); color:var(--hero-navy); padding:8px 15px; border-radius:6px; cursor:pointer;">Next</button>
        </div>
    `;

    // Listeners
    document.getElementById('btn-add-manual').onclick = () => showStudentModal();
    document.getElementById('prev-btn').onclick = () => { if(currentPage > 1) { currentPage--; loadStudents(); } };
    document.getElementById('next-btn').onclick = () => { currentPage++; loadStudents(); };
    
    document.getElementById('student-search').oninput = (e) => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadStudents();
    };

    loadStudents();
}

/**
 * DATA FETCHING (Now calling Google Sheets)
 */
async function loadStudents() {
    const tbody = document.getElementById('student-list-body');
    const indicator = document.getElementById('page-indicator');
    
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px;'>Fetching from Cloud Sheets...</td></tr>";

    // Gagamit tayo ng 'SEARCH_STUDENTS' action sa Apps Script
    const response = await dbRequest("SEARCH_STUDENTS", { 
        query: currentSearch,
        page: currentPage 
    });

    if (response.status === "success") {
        renderTable(response.data);
        indicator.innerText = `Page ${currentPage}`;
    } else {
        tbody.innerHTML = `<tr><td colspan='5' style='text-align:center; color:red; padding:30px;'>${response.msg}</td></tr>`;
    }
}

function renderTable(students) {
    const tbody = document.getElementById('student-list-body');
    tbody.innerHTML = "";

    if (students.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding:30px;'>No records found.</td></tr>";
        return;
    }

    students.forEach(s => {
        const classification = getClassification(s.program);
        const row = document.createElement('tr');
        row.style.borderBottom = "1px solid #f1f5f9";
        row.innerHTML = `
            <td style="padding:15px;">
                <b style="color:var(--hero-navy);">${s.name}</b><br>
                <small style="color:var(--hero-gold); font-weight:bold; font-size:10px;">${classification}</small>
            </td>
            <td style="padding:15px;"><b>${s.id}</b></td>
            <td style="padding:15px;"><span style="background:#f1f5f9; padding:4px 8px; border-radius:5px; font-size:12px;">${s.program}</span></td>
            <td style="padding:15px;">Year ${s.year}</td>
            <td style="padding:15px; text-align:right;">
                <button onclick="editStudent('${s.id}')" style="background:none; border:none; color:var(--hero-navy); cursor:pointer; margin-right:10px;">Edit</button>
                <button onclick="deleteStudent('${s.id}')" style="background:none; border:none; color:red; cursor:pointer;">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * MODAL & ACTIONS
 */
async function showStudentModal(studentId = null) {
    // Gagamit tayo ng Swal (SweetAlert2) gaya ng dati mong code
    const { value: formValues } = await Swal.fire({
        title: studentId ? 'EDIT STUDENT' : 'ADD STUDENT',
        html: `
            <input id="swal-id" class="swal2-input" placeholder="ID Number" value="${studentId || ''}" ${studentId ? 'readonly' : ''}>
            <input id="swal-name" class="swal2-input" placeholder="Full Name">
            <input id="swal-program" class="swal2-input" placeholder="Program (e.g. BTLED)">
            <input id="swal-year" class="swal2-input" placeholder="Year Level">
        `,
        confirmButtonColor: '#000080',
        preConfirm: () => {
            return {
                studentId: document.getElementById('swal-id').value,
                name: document.getElementById('swal-name').value.toUpperCase(),
                program: document.getElementById('swal-program').value.toUpperCase(),
                year: document.getElementById('swal-year').value
            }
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Saving...', didOpen: () => Swal.showLoading() });
        const res = await dbRequest("SAVE_STUDENT", formValues);
        if (res.status === "success") {
            Swal.fire('Saved!', '', 'success');
            loadStudents();
        } else {
            Swal.fire('Error', res.msg, 'error');
        }
    }
}

// Gawing global para matawag ng onclick sa HTML strings
window.editStudent = (id) => showStudentModal(id);
window.deleteStudent = async (id) => {
    const confirm = await Swal.fire({
        title: 'Delete student?',
        text: "This will remove them from the Cloud Sheet.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33'
    });
    
    if (confirm.isConfirmed) {
        const res = await dbRequest("DELETE_STUDENT", { studentId: id });
        if(res.status === "success") loadStudents();
    }
}
