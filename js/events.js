import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function initEvents() {
    const container = document.getElementById('module-container');
    container.innerHTML = `
        <div class="module-header">
            <h2>Event Management</h2>
            <button class="btn-gold" id="create-event-btn">Create New Event</button>
        </div>
        <div id="event-list" class="grid-container">
            </div>
    `;

    loadEvents();
    document.getElementById('create-event-btn').onclick = showEventModal;
}

async function loadEvents() {
    const q = query(collection(db, "events"), where("orgId", "==", localStorage.getItem('orgId')));
    const snap = await getDocs(q);
    const list = document.getElementById('event-list');
    
    snap.forEach(doc => {
        const event = doc.data();
        list.innerHTML += `
            <div class="event-card">
                <h3>${event.name}</h3>
                <p><i class="fas fa-calendar"></i> ${event.startDate} to ${event.endDate}</p>
                <p><i class="fas fa-users"></i> Filter: ${event.filter || 'All Students'}</p>
                <button class="btn-navy" onclick="window.location.hash='#attendance'; localStorage.setItem('activeEventId', '${doc.id}')">
                    Open Scanner
                </button>
            </div>
        `;
    });
}

function showEventModal() {
    // Implement a simple prompt or custom modal to collect:
    // Event Name, Start Date, End Date, and Student Filter (e.g. 'BSIT')
    // Then call addDoc(collection(db, "events"), {...})
}
