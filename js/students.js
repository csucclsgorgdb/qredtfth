import { db } from './firebase-config.js';
import { 
    collection, query, orderBy, limit, startAfter, getDocs, doc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let lastVisible = null; // Pagination cursor
const PAGE_SIZE = 20;

export async function initStudents() {
    const container = document.getElementById('module-container');
    container.innerHTML = `
        <div class="module-header">
            <h2>Student Management</h2>
            <div class="actions">
                <input type="file" id="csv-import" accept=".csv" style="display:none">
                <button class="btn-gold" onclick="document.getElementById('csv-import').click()">Import CSV</button>
                <button class="btn-navy" id="add-student-btn">Add New Student</button>
            </div>
        </div>
        <div class="table-responsive">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Student ID</th>
                        <th>Name</th>
                        <th>Course/Year</th>
                        <th>Balance</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="student-list-body"></tbody>
            </table>
        </div>
        <div class="pagination-footer">
            <button id="load-more-btn" class="btn-outline">Load More Students...</button>
        </div>
    `;

    lastVisible = null; // Reset pagination
    loadStudents();

    document.getElementById('load-more-btn').addEventListener('click', loadStudents);
    document.getElementById('csv-import').addEventListener('change', handleCSV);
}

async function loadStudents() {
    const loader = document.getElementById('load-more-btn');
    loader.innerText = "Loading...";

    try {
        let q = query(
            collection(db, "students"), 
            orderBy("lastName"), 
            limit(PAGE_SIZE)
        );

        if (lastVisible) {
            q = query(collection(db, "students"), orderBy("lastName"), startAfter(lastVisible), limit(PAGE_SIZE));
        }

        const documentSnapshots = await getDocs(q);
        
        // Save the last visible document for next page
        lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];

        const tbody = document.getElementById('student-list-body');
        
        documentSnapshots.forEach((doc) => {
            const data = doc.data();
            const row = `
                <tr>
                    <td>${data.studentId}</td>
                    <td>${data.lastName}, ${data.firstName}</td>
                    <td>${data.course} - ${data.year}</td>
                    <td>₱${data.balance || '0.00'}</td>
                    <td><button class="btn-sm"><i class="fas fa-edit"></i></button></td>
                </tr>
            `;
            tbody.innerHTML += row;
        });

        loader.innerText = lastVisible ? "Load More" : "End of Records";
        if (!lastVisible) loader.disabled = true;

    } catch (error) {
        console.error("Error loading students:", error);
    }
}

// Logic for CSV Bulk Import
async function handleCSV(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split('\n').slice(1); // Skip header
        
        for (let row of rows) {
            const [id, first, last, course, year] = row.split(',');
            if (id) {
                // Use setDoc so we can specify the Document ID as the Student ID
                await setDoc(doc(db, "students", id.trim()), {
                    studentId: id.trim(),
                    firstName: first.trim(),
                    lastName: last.trim(),
                    course: course.trim(),
                    year: year.trim(),
                    balance: 0,
                    orgId: localStorage.getItem('orgId')
                });
            }
        }
        alert("Import Complete!");
        initStudents(); // Refresh list
    };
    reader.readAsText(file);
}
