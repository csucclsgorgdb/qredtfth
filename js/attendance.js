// ... (imports remain the same)

export async function initAttendance() {
    const container = document.getElementById('module-container');
    
    // Fetch Ongoing Events
    const q = query(collection(db, "events"), where("status", "==", "Ongoing"));
    const eventSnap = await getDocs(q);
    
    // Store event data locally so we can access dates without re-fetching
    const eventDataMap = {};
    let eventOptions = eventSnap.docs.map(d => {
        const data = d.data();
        eventDataMap[d.id] = data; // Save dates here
        return `<option value="${d.id}">${data.name}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="module-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h1 class="module-title">Attendance Scanner</h1>
                <p class="module-subtitle">Scan QR to log Time In/Out</p>
            </div>
            <button id="export-attendance-csv" class="btn-gold"><i data-lucide="download"></i> Export CSV</button>
        </div>

        <div class="dashboard-grid">
            <div class="dashboard-card">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
                    <div>
                        <label style="font-size:10px; font-weight:800; color:var(--text-muted);">SELECT EVENT</label>
                        <select id="attendance-event-id" class="swal2-input" style="margin:5px 0; width:100%; font-size:14px;">
                            <option value="">-- Choose Event --</option>
                            ${eventOptions}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:10px; font-weight:800; color:var(--text-muted);">SELECT DAY</label>
                        <select id="attendance-day" class="swal2-input" style="margin:5px 0; width:100%; font-size:14px;">
                            <option value="">-- Select Event First --</option>
                        </select>
                    </div>
                </div>

                <div id="reader" style="width: 100%; border-radius:15px; overflow:hidden; border:2px solid var(--hero-navy);"></div>
                
                <div id="scan-feedback" class="dashboard-card" style="margin-top:15px; text-align:center; background:#f8fafc;">
                    <h3 id="scan-id">---</h3>
                    <p id="scan-status">Ready to Scan</p>
                </div>
            </div>

            </div>
    `;

    const eventSelect = document.getElementById('attendance-event-id');
    const daySelect = document.getElementById('attendance-day');

    // DYNAMIC DAY CALCULATION
    eventSelect.onchange = (e) => {
        const selectedId = e.target.value;
        if (!selectedId) return;

        const ev = eventDataMap[selectedId];
        const start = new Date(ev.startDate);
        const end = new Date(ev.endDate);
        
        // Calculate difference in days
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 

        daySelect.innerHTML = "";
        for (let i = 1; i <= diffDays; i++) {
            daySelect.innerHTML += `<option value="Day ${i}">Day ${i} (${new Date(start.getTime() + (i-1)*86400000).toLocaleDateString()})</option>`;
        }
        
        refreshAttendanceTable(selectedId, daySelect.value);
    };

    daySelect.onchange = () => refreshAttendanceTable(eventSelect.value, daySelect.value);

    document.getElementById('export-attendance-csv').onclick = exportToCSV;
    startScanner();
    lucide.createIcons();
}
