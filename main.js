/* ===========================================
   Study Timetable Generator - Application Logic
   =========================================== */

(function () {
    'use strict';

    // ─── State ────────────────────────────────────────────
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const START_HOUR = 8;   // 8 AM
    const END_HOUR = 22;    // 10 PM
    const SLOT_MINUTES = 30;
    const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES; // 28 slots
    const MAX_BLOCK_MINUTES = 120; // 2 hours before a break is required
    const BREAK_MINUTES = 30;

    let subjects = [];
    let commitments = [];

    // ─── DOM References ───────────────────────────────────
    const dom = {
        subjectName: document.getElementById('subject-name'),
        subjectPriority: document.getElementById('subject-priority'),
        addSubjectBtn: document.getElementById('add-subject-btn'),
        subjectList: document.getElementById('subject-list'),

        commitmentName: document.getElementById('commitment-name'),
        commitmentDay: document.getElementById('commitment-day'),
        commitmentStart: document.getElementById('commitment-start'),
        commitmentEnd: document.getElementById('commitment-end'),
        addCommitmentBtn: document.getElementById('add-commitment-btn'),
        commitmentList: document.getElementById('commitment-list'),

        generateBtn: document.getElementById('generate-btn'),
        errorMsg: document.getElementById('error-message'),

        timetableSection: document.getElementById('timetable-section'),
        timetableGrid: document.getElementById('timetable-grid'),

        downloadPngBtn: document.getElementById('download-png-btn'),
        downloadPdfBtn: document.getElementById('download-pdf-btn'),
    };

    // ─── Utility Helpers ──────────────────────────────────
    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function minutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function formatTimeDisplay(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }

    function getDayIndex(dayName) {
        return DAYS.indexOf(dayName);
    }

    function slotIndexFromTime(minutes) {
        return Math.floor((minutes - START_HOUR * 60) / SLOT_MINUTES);
    }

    // ─── Render Lists ─────────────────────────────────────
    function renderSubjects() {
        dom.subjectList.innerHTML = '';
        subjects.forEach((s, i) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>
                    <span class="item-label">${escHtml(s.name)}</span>
                    <span class="priority-badge priority-${s.priority}">P${s.priority}</span>
                </span>
                <button class="btn-danger-sm" data-index="${i}">Remove</button>
            `;
            li.querySelector('.btn-danger-sm').addEventListener('click', () => {
                subjects.splice(i, 1);
                renderSubjects();
            });
            dom.subjectList.appendChild(li);
        });
    }

    function renderCommitments() {
        dom.commitmentList.innerHTML = '';
        commitments.forEach((c, i) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>
                    <span class="item-label">${escHtml(c.name)}</span>
                    <span class="item-detail">${c.day} · ${formatTimeDisplay(c.start)} – ${formatTimeDisplay(c.end)}</span>
                </span>
                <button class="btn-danger-sm" data-index="${i}">Remove</button>
            `;
            li.querySelector('.btn-danger-sm').addEventListener('click', () => {
                commitments.splice(i, 1);
                renderCommitments();
            });
            dom.commitmentList.appendChild(li);
        });
    }

    function escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Add Handlers ─────────────────────────────────────
    dom.addSubjectBtn.addEventListener('click', () => {
        const name = dom.subjectName.value.trim();
        const priority = parseInt(dom.subjectPriority.value, 10);
        if (!name) {
            dom.errorMsg.textContent = 'Please enter a subject name.';
            return;
        }
        if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
            dom.errorMsg.textContent = 'Subject already added.';
            return;
        }
        subjects.push({ name, priority });
        dom.subjectName.value = '';
        dom.subjectPriority.value = '3';
        dom.errorMsg.textContent = '';
        renderSubjects();
        dom.subjectName.focus();
    });

    dom.addCommitmentBtn.addEventListener('click', () => {
        const name = dom.commitmentName.value.trim();
        const day = dom.commitmentDay.value;
        const startStr = dom.commitmentStart.value;
        const endStr = dom.commitmentEnd.value;
        if (!name) {
            dom.errorMsg.textContent = 'Please enter a commitment name.';
            return;
        }
        if (!startStr || !endStr) {
            dom.errorMsg.textContent = 'Please select start and end times.';
            return;
        }
        const start = timeToMinutes(startStr);
        const end = timeToMinutes(endStr);
        if (end <= start) {
            dom.errorMsg.textContent = 'End time must be after start time.';
            return;
        }
        if (start < START_HOUR * 60 || end > END_HOUR * 60) {
            dom.errorMsg.textContent = `Commitments must be between ${START_HOUR}:00 and ${END_HOUR}:00.`;
            return;
        }
        commitments.push({ name, day, start, end });
        dom.commitmentName.value = '';
        dom.errorMsg.textContent = '';
        renderCommitments();
        dom.commitmentName.focus();
    });

    // Allow Enter key on inputs
    dom.subjectName.addEventListener('keydown', (e) => { if (e.key === 'Enter') dom.addSubjectBtn.click(); });
    dom.commitmentName.addEventListener('keydown', (e) => { if (e.key === 'Enter') dom.addCommitmentBtn.click(); });

    // ─── Timetable Generation ─────────────────────────────
    dom.generateBtn.addEventListener('click', generateTimetable);

    function generateTimetable() {
        dom.errorMsg.textContent = '';

        if (subjects.length === 0) {
            dom.errorMsg.textContent = 'Please add at least one subject.';
            return;
        }
        if (commitments.length === 0) {
            dom.errorMsg.textContent = 'Please add at least one commitment so the timetable knows your free slots.';
            return;
        }

        // Read user's preferred study hours per day from the dropdowns
        const hourSelects = document.querySelectorAll('.hours-select');
        const MAX_STUDY_PER_DAY = [];
        hourSelects.forEach(sel => {
            const hours = parseFloat(sel.value);
            MAX_STUDY_PER_DAY.push(Math.round(hours * 60)); // convert to minutes
        });

        // Build availability grid: dayIndex -> array of free 30-min slots (boolean)
        const freeSlots = {};
        DAYS.forEach((_, di) => {
            freeSlots[di] = new Array(TOTAL_SLOTS).fill(true);
        });

        // Block out commitments
        commitments.forEach(c => {
            const di = getDayIndex(c.day);
            const startSlot = slotIndexFromTime(c.start);
            const endSlot = slotIndexFromTime(c.end);
            for (let s = startSlot; s < endSlot; s++) {
                if (s >= 0 && s < TOTAL_SLOTS) {
                    freeSlots[di][s] = false;
                }
            }
        });

        // Calculate total available minutes, but capped per day
        let totalStudyMinutes = 0;
        DAYS.forEach((_, di) => {
            let freeCount = 0;
            freeSlots[di].forEach(free => {
                if (free) freeCount++;
            });
            const freeMinutes = freeCount * SLOT_MINUTES;
            totalStudyMinutes += Math.min(freeMinutes, MAX_STUDY_PER_DAY[di]);
        });

        if (totalStudyMinutes < 30) {
            dom.errorMsg.textContent = 'Not enough free time available. Please reduce commitments.';
            return;
        }

        // Distribute time proportionally by priority
        const totalPriority = subjects.reduce((sum, s) => sum + s.priority, 0);
        const allocMinutes = subjects.map(s => ({
            ...s,
            allocated: Math.round((s.priority / totalPriority) * totalStudyMinutes)
        }));

        // Round to nearest 30-min slot, ensure no subject gets 0 if they have priority
        allocMinutes.forEach(a => {
            a.allocated = Math.max(30, Math.round(a.allocated / 30) * 30);
        });

        // Normalize so total doesn't exceed available
        let totalAlloc = allocMinutes.reduce((s, a) => s + a.allocated, 0);
        while (totalAlloc > totalStudyMinutes) {
            const max = allocMinutes.reduce((best, a) => a.allocated > best.allocated ? a : best);
            if (max.allocated <= 30) break;
            max.allocated -= 30;
            totalAlloc -= 30;
        }

        // Collect free slot positions, capped per day
        const freeSlotPositions = [];
        DAYS.forEach((_, di) => {
            let slotsUsed = 0;
            const maxSlots = MAX_STUDY_PER_DAY[di] / SLOT_MINUTES;
            for (let si = 0; si < TOTAL_SLOTS; si++) {
                if (freeSlots[di][si]) {
                    if (slotsUsed < maxSlots) {
                        freeSlotPositions.push({ dayIndex: di, slotIndex: si });
                        slotsUsed++;
                    }
                }
            }
        });

        // Build a queue of subject names, each appearing as many times as their allocated slots
        let queue = [];
        allocMinutes.forEach(a => {
            const count = Math.floor(a.allocated / SLOT_MINUTES);
            for (let i = 0; i < count; i++) {
                queue.push(a.name);
            }
        });
        shuffleArray(queue);

        // Shuffle free positions so study blocks are distributed across the week
        const shuffledPositions = [...freeSlotPositions];
        shuffleArray(shuffledPositions);

        // Assign subjects to shuffled positions
        const assignment = new Array(freeSlotPositions.length).fill(null);
        for (let i = 0; i < queue.length && i < shuffledPositions.length; i++) {
            const pos = shuffledPositions[i];
            const origIdx = freeSlotPositions.findIndex(
                p => p.dayIndex === pos.dayIndex && p.slotIndex === pos.slotIndex
            );
            if (origIdx !== -1) {
                assignment[origIdx] = queue[i];
            }
        }

        // Build timetable blocks (group consecutive same-subject slots, enforce break rule)
        const dayBlocks = {};
        DAYS.forEach((_, di) => {
            dayBlocks[di] = [];
        });

        for (let i = 0; i < freeSlotPositions.length; i++) {
            const pos = freeSlotPositions[i];
            const subjectName = assignment[i];
            if (!subjectName) continue;

            const slotStart = START_HOUR * 60 + pos.slotIndex * SLOT_MINUTES;
            const slotEnd = slotStart + SLOT_MINUTES;

            const blocks = dayBlocks[pos.dayIndex];
            const prev = blocks.length > 0 ? blocks[blocks.length - 1] : null;

            if (prev && prev.type === 'study' && prev.subject === subjectName && prev.end === slotStart) {
                const newDuration = (slotEnd - prev.start);
                if (newDuration <= MAX_BLOCK_MINUTES) {
                    prev.end = slotEnd;
                } else {
                    const breakEnd = slotStart + BREAK_MINUTES;
                    blocks.push({ type: 'break', start: slotStart, end: breakEnd, subject: null });
                    blocks.push({ type: 'study', subject: subjectName, start: breakEnd, end: breakEnd + SLOT_MINUTES });
                }
            } else {
                blocks.push({ type: 'study', subject: subjectName, start: slotStart, end: slotEnd });
            }
        }

        // Add commitment blocks for display
        commitments.forEach(c => {
            const di = getDayIndex(c.day);
            dayBlocks[di].push({ type: 'commitment', subject: null, title: c.name, start: c.start, end: c.end });
        });

        // Sort blocks within each day by start time
        DAYS.forEach((_, di) => {
            dayBlocks[di].sort((a, b) => a.start - b.start);
        });

        renderTimetable(dayBlocks);
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ─── Render Timetable Grid ────────────────────────────
    function renderTimetable(dayBlocks) {
        const grid = dom.timetableGrid;
        grid.innerHTML = '';

        // Header row
        const emptyHeader = createEl('div', 'tt-header', '');
        grid.appendChild(emptyHeader);
        DAYS.forEach(day => {
            const h = createEl('div', 'tt-header', day.slice(0, 3));
            grid.appendChild(h);
        });

        // Time rows
        for (let si = 0; si < TOTAL_SLOTS; si++) {
            const slotStart = START_HOUR * 60 + si * SLOT_MINUTES;
            const slotEnd = slotStart + SLOT_MINUTES;

            // Time label
            const timeLabel = createEl('div', 'tt-time', formatTimeDisplay(slotStart));
            grid.appendChild(timeLabel);

            // Cells for each day
            DAYS.forEach((_, di) => {
                const cell = createEl('div', 'tt-cell');
                // Weekend shading
                if (di >= 5) cell.classList.add('weekend');

                // Find blocks that overlap this slot
                const blocks = dayBlocks[di].filter(b => b.start < slotEnd && b.end > slotStart);
                blocks.forEach(b => {
                    const blockStart = Math.max(b.start, slotStart);
                    const blockEnd = Math.min(b.end, slotEnd);
                    const blockDuration = blockEnd - blockStart;

                    // Only render if block fills at least half the slot
                    if (blockDuration < SLOT_MINUTES / 2) return;

                    if (b.type === 'study') {
                        const inner = createEl('div', 'tt-study-block', '');
                        inner.innerHTML = `
                            <div class="block-subject">${escHtml(b.subject)}</div>
                            <div class="block-time">${formatTimeDisplay(b.start)} – ${formatTimeDisplay(b.end)}</div>
                        `;
                        // Store data for tooltip
                        inner.title = `${b.subject}\n${formatTimeDisplay(b.start)} – ${formatTimeDisplay(b.end)}`;
                        cell.appendChild(inner);
                    } else if (b.type === 'commitment') {
                        const inner = createEl('div', 'tt-commitment-block', '');
                        inner.innerHTML = `
                            <div class="block-title">${escHtml(b.title)}</div>
                            <div class="block-time">${formatTimeDisplay(b.start)} – ${formatTimeDisplay(b.end)}</div>
                        `;
                        inner.title = `${b.title}\n${formatTimeDisplay(b.start)} – ${formatTimeDisplay(b.end)}`;
                        cell.appendChild(inner);
                    } else if (b.type === 'break') {
                        const inner = createEl('div', 'tt-break-block', 'Break');
                        inner.title = `Break\n${formatTimeDisplay(b.start)} – ${formatTimeDisplay(b.end)}`;
                        cell.appendChild(inner);
                    }
                });

                grid.appendChild(cell);
            });
        }

        // Show timetable section
        dom.timetableSection.style.display = 'block';
        dom.timetableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function createEl(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    // ─── Download Handlers ────────────────────────────────
    dom.downloadPngBtn.addEventListener('click', downloadPNG);
    dom.downloadPdfBtn.addEventListener('click', downloadPDF);

    async function downloadPNG() {
        const wrapper = document.getElementById('timetable-wrapper');
        if (!wrapper) return;
        try {
            const canvas = await html2canvas(wrapper, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                logging: false,
            });
            const link = document.createElement('a');
            link.download = 'study-timetable.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            dom.errorMsg.textContent = 'Failed to generate PNG: ' + err.message;
        }
    }

    async function downloadPDF() {
        const wrapper = document.getElementById('timetable-wrapper');
        if (!wrapper) return;
        try {
            const canvas = await html2canvas(wrapper, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                logging: false,
            });
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('study-timetable.pdf');
        } catch (err) {
            dom.errorMsg.textContent = 'Failed to generate PDF: ' + err.message;
        }
    }

})();