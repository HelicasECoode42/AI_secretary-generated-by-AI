// ==================== ȫ�ֱ��� ====================
let currentModule = 'todo';
let currentView = 'day';
let currentDate = new Date();
let allTasks = [];
let allFixedSchedules = [];
let ocrRecognizedSchedules = [];

// ==================== ��ʼ�� ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // ���õ�ǰ����
    document.getElementById('currentDate').valueAsDate = currentDate;
    
    // ��������
    loadFixedSchedules();
    loadTasks();
    loadChatHistory();
    
    // ��Ⱦʱ����
    renderTimeline();
    
    // ������ǰʱ���߸���
    updateCurrentTimeLine();
    setInterval(updateCurrentTimeLine, 60000); // ÿ���Ӹ���
    
    // �����Զ�ˢ��
    setInterval(() => {
        loadTasks();
        renderTimeline();
    }, 30000); // ÿ30��ˢ��
    
    // ��ʼ�������Ի�����
    initActiveChat();
}

// ==================== ģ���л� ====================
function switchModule(module) {
    currentModule = module;
    
    // ���µ�����ʽ
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-module="${module}"]`).classList.add('active');
    
    // �л���ͼ
    document.querySelectorAll('.view-container').forEach(view => {
        view.style.display = 'none';
    });
    
    const viewMap = {
        'todo': 'todoView',
        'review': 'reviewView',
        'growth': 'growthView',
        'journal': 'journalView'
    };
    
    document.getElementById(viewMap[module]).style.display = 'block';
}

// ==================== ��ͼ�л�����/��/�£�====================
function switchView(view) {
    currentView = view;
    
    // ���°�ť��ʽ
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // TODO: Phase 2 ʵ������ͼ������ͼ
    if (view === 'week' || view === 'month') {
        showToast(`${view === 'week' ? '��' : '��'}��ͼ���� Phase 2 ʵ��`, 'info');
    } else {
        renderTimeline();
    }
}

// ==================== �����л� ====================
function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    document.getElementById('currentDate').valueAsDate = currentDate;
    renderTimeline();
}

function onDateChange() {
    currentDate = document.getElementById('currentDate').valueAsDate;
    renderTimeline();
}

// ==================== �̶��ճ̹��� ====================

// ���ع̶��ճ�
async function loadFixedSchedules() {
    try {
        const response = await fetch('/api/fixed_schedules');
        const data = await response.json();
        
        if (data.success) {
            allFixedSchedules = data.schedules;
            renderFixedScheduleList();
        }
    } catch (error) {
        console.error('���ع̶��ճ�ʧ��:', error);
        showToast('���ع̶��ճ�ʧ��', 'error');
    }
}

// ��Ⱦ�̶��ճ��б�
function renderFixedScheduleList() {
    const container = document.getElementById('fixedScheduleList');
    
    if (allFixedSchedules.length === 0) {
        container.innerHTML = '<p class="empty-hint">���޹̶��ճ�</p>';
        return;
    }
    
    const weekDays = ['����', '��һ', '�ܶ�', '����', '����', '����', '����'];
    
    container.innerHTML = allFixedSchedules.map(schedule => `
        <div class="fixed-schedule-item">
            <div class="schedule-info">
                <span class="schedule-day">${weekDays[schedule.day_of_week]}</span>
                <span class="schedule-time">${schedule.start_time}-${schedule.end_time}</span>
                <span class="schedule-title">${schedule.title}</span>
            </div>
            <button class="btn-icon" onclick="deleteFixedSchedule(${schedule.id})" title="ɾ��">??</button>
        </div>
    `).join('');
}

// ��ʾ�ֶ����뵯��
function showManualInput() {
    document.getElementById('manualInputModal').style.display = 'flex';
}

// �ύ�ֶ�����Ĺ̶��ճ�
async function submitManualSchedule() {
    const title = document.getElementById('manualTitle').value.trim();
    const dayOfWeek = parseInt(document.getElementById('manualDayOfWeek').value);
    const startTime = document.getElementById('manualStartTime').value;
    const endTime = document.getElementById('manualEndTime').value;
    const location = document.getElementById('manualLocation').value.trim();
    
    if (!title || !startTime || !endTime) {
        showToast('����д������Ϣ', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/fixed_schedules', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                title,
                day_of_week: dayOfWeek,
                start_time: startTime,
                end_time: endTime,
                location,
                recurrence: 'weekly',
                source: 'manual'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('�̶��ճ���ӳɹ�', 'success');
            closeModal('manualInputModal');
            
            // ��ձ�
            document.getElementById('manualTitle').value = '';
            document.getElementById('manualLocation').value = '';
            
            // ���¼���
            await loadFixedSchedules();
            renderTimeline();
        } else {
            showToast('���ʧ��', 'error');
        }
    } catch (error) {
        console.error('��ӹ̶��ճ�ʧ��:', error);
        showToast('���ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ɾ���̶��ճ�
async function deleteFixedSchedule(id) {
    if (!confirm('ȷ��Ҫɾ�������̶��ճ���')) return;
    
    try {
        const response = await fetch(`/api/fixed_schedules/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('ɾ���ɹ�', 'success');
            await loadFixedSchedules();
            renderTimeline();
        }
    } catch (error) {
        console.error('ɾ��ʧ��:', error);
        showToast('ɾ��ʧ��', 'error');
    }
}

// OCR�ϴ�
function showOCRUpload() {
    document.getElementById('ocrUploadModal').style.display = 'flex';
}

function handleFileSelect() {
    const fileInput = document.getElementById('ocrFileInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    // Ԥ��ͼƬ
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImage').src = e.target.result;
        document.getElementById('ocrPreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    // �ϴ�ʶ��
    uploadAndRecognize(file);
}

async function uploadAndRecognize(file) {
    showLoading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/fixed_schedules/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            ocrRecognizedSchedules = data.schedules;
            renderOCRResult(data);
            document.getElementById('confirmOCRBtn').style.display = 'block';
            showToast(`ʶ��ɹ������ҵ� ${data.schedules.length} ���γ�`, 'success');
        } else {
            showToast(data.message || 'ʶ��ʧ��', 'error');
        }
    } catch (error) {
        console.error('OCRʶ��ʧ��:', error);
        showToast('ʶ��ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

function renderOCRResult(data) {
    const container = document.getElementById('ocrScheduleList');
    const weekDays = ['����', '��һ', '�ܶ�', '����', '����', '����', '����'];
    
    container.innerHTML = `
        <p class="hint">ԭʼʶ���ı���</p>
        <pre style="background:#f5f5f5; padding:10px; max-height:100px; overflow:auto;">${data.raw_text}</pre>
        <p class="hint">����������ɱ༭����</p>
        ${data.schedules.map((s, idx) => `
            <div class="ocr-schedule-item">
                <input type="text" value="${s.title}" onchange="ocrRecognizedSchedules[${idx}].title = this.value">
                <select onchange="ocrRecognizedSchedules[${idx}].day_of_week = parseInt(this.value)">
                    ${[0,1,2,3,4,5,6].map(d => `<option value="${d}" ${d === s.day_of_week ? 'selected' : ''}>${weekDays[d]}</option>`).join('')}
                </select>
                <input type="time" value="${s.start_time}" onchange="ocrRecognizedSchedules[${idx}].start_time = this.value">
                <input type="time" value="${s.end_time}" onchange="ocrRecognizedSchedules[${idx}].end_time = this.value">
            </div>
        `).join('')}
    `;
}

async function confirmOCRSchedules() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/fixed_schedules/batch', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({schedules: ocrRecognizedSchedules})
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(data.message, 'success');
            closeModal('ocrUploadModal');
            await loadFixedSchedules();
            renderTimeline();
        }
    } catch (error) {
        showToast('�������ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== ������� ====================

// ��������
async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        
        if (data.success) {
            allTasks = data.tasks;
            renderTaskList();
        }
    } catch (error) {
        console.error('��������ʧ��:', error);
    }
}

// �������
async function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    
    if (!text) {
        showToast('��������������', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/tasks/parse', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text})
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('������ӳɹ�', 'success');
            input.value = '';
            await loadTasks();
        } else {
            showToast(data.message || '���ʧ��', 'error');
        }
    } catch (error) {
        console.error('�������ʧ��:', error);
        showToast('���ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ��Ⱦ�����б�
function renderTaskList() {
    const container = document.getElementById('taskList');
    
    // Ӧ��ɸѡ
    const categoryFilter = document.getElementById('categoryFilter').value;
    const priorityFilter = document.getElementById('priorityFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    let filteredTasks = allTasks.filter(task => {
        if (categoryFilter !== 'all' && task.category !== categoryFilter) return false;
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
        if (statusFilter !== 'all' && task.status !== statusFilter) return false;
        return true;
    });
    
    if (filteredTasks.length === 0) {
        container.innerHTML = '<p class="empty-hint">��������</p>';
        return;
    }
    
    const priorityColors = {
        'high': '#ff4757',
        'medium': '#ffa502',
        'low': '#1e90ff'
    };
    
    const priorityText = {
        'high': '��',
        'medium': '��',
        'low': '��'
    };
    
    container.innerHTML = filteredTasks.map(task => `
        <div class="task-item ${task.status}" data-task-id="${task.id}">
            <div class="task-checkbox">
                <input type="checkbox" 
                    ${task.status === 'completed' ? 'checked' : ''} 
                    onchange="toggleTaskComplete(${task.id})"
                >
            </div>
            <div class="task-info">
                <div class="task-title">${task.content}</div>
                <div class="task-meta">
                    <span class="task-category">${task.category}</span>
                    <span class="task-priority" style="color:${priorityColors[task.priority]}">
                        ${priorityText[task.priority]}
                    </span>
                    <span class="task-duration">${task.estimated_duration}����</span>
                    ${task.scheduled_start ? `<span class="task-scheduled">? ������</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="btn-icon" onclick="editTask(${task.id})" title="�༭">??</button>
                <button class="btn-icon" onclick="deleteTask(${task.id})" title="ɾ��">??</button>
            </div>
        </div>
    `).join('');
}

function filterTasks() {
    renderTaskList();
}

// �л��������״̬
async function toggleTaskComplete(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    
    if (task.status === 'completed') {
        // ȡ����ɣ�������Ϊpending��
        await updateTaskStatus(taskId, 'pending');
    } else {
        // ������
        await completeTask(taskId);
    }
}

async function completeTask(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/complete`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('��������� ?', 'success');
            await loadTasks();
            renderTimeline();
        }
    } catch (error) {
        showToast('����ʧ��', 'error');
    }
}

async function updateTaskStatus(taskId, status) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status, completed_at: null})
        });
        
        const data = await response.json();
        
        if (data.success) {
            await loadTasks();
            renderTimeline();
        }
    } catch (error) {
        showToast('����ʧ��', 'error');
    }
}

// �༭����
function editTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    document.getElementById('editTaskId').value = task.id;
    document.getElementById('editTaskContent').value = task.content;
    document.getElementById('editTaskCategory').value = task.category || '����';
    document.getElementById('editTaskPriority').value = task.priority || 'medium';
    document.getElementById('editTaskDuration').value = task.estimated_duration || 60;
    document.getElementById('editTaskDeadline').value = task.deadline ? task.deadline.slice(0, 16) : '';
    
    document.getElementById('editTaskModal').style.display = 'flex';
}

async function submitEditTask() {
    const taskId = document.getElementById('editTaskId').value;
    const content = document.getElementById('editTaskContent').value.trim();
    const category = document.getElementById('editTaskCategory').value;
    const priority = document.getElementById('editTaskPriority').value;
    const duration = parseInt(document.getElementById('editTaskDuration').value);
    const deadline = document.getElementById('editTaskDeadline').value;
    
    if (!content) {
        showToast('�������ݲ���Ϊ��', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                content,
                category,
                priority,
                estimated_duration: duration,
                deadline: deadline || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('������³ɹ�', 'success');
            closeModal('editTaskModal');
            await loadTasks();
            renderTimeline();
        }
    } catch (error) {
        showToast('����ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ɾ������
async function deleteTask(taskId) {
    if (!confirm('ȷ��Ҫɾ�����������')) return;
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('������ɾ��', 'success');
            await loadTasks();
            renderTimeline();
        }
    } catch (error) {
        showToast('ɾ��ʧ��', 'error');
    }
}

// ==================== ʱ������Ⱦ ====================

function renderTimeline() {
    renderTimelineHours();
    renderTimelineEvents();
}

// ��Ⱦʱ��̶�
function renderTimelineHours() {
    const container = document.getElementById('timelineHours');
    let html = '';
    
    for (let hour = 0; hour < 24; hour++) {
        html += `
            <div class="hour-slot" data-hour="${hour}">
                <span class="hour-label">${hour.toString().padStart(2, '0')}:00</span>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ��Ⱦ�ճ��¼�
async function renderTimelineEvents() {
    const container = document.getElementById('timelineEvents');
    const dateStr = currentDate.toISOString().split('T')[0];
    
    try {
        const response = await fetch(`/api/daily_schedule?date=${dateStr}`);
        const data = await response.json();
        
        if (!data.success) return;
        
        let html = '';
        
        // ��Ⱦ�̶��ճ�
        data.fixed_schedules.forEach(schedule => {
            const block = createEventBlock(schedule, 'fixed');
            html += block;
        });
        
        // ��Ⱦ����������
        data.tasks.forEach(task => {
            if (task.scheduled_start) {
                const block = createEventBlock(task, 'task');
                html += block;
            }
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('��Ⱦʱ����ʧ��:', error);
    }
}

function createEventBlock(event, type) {
    let startTime, endTime, title, color;
    
    if (type === 'fixed') {
        startTime = event.start_time;
        endTime = event.end_time;
        title = event.title;
        color = '#6c5ce7'; // �̶��ճ���ɫ
    } else {
        // ����
        const start = new Date(event.scheduled_start);
        const end = new Date(event.scheduled_end);
        startTime = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
        endTime = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
        title = event.content;
        
        const priorityColors = {
            'high': '#ff4757',
            'medium': '#ffa502',
            'low': '#1e90ff'
        };
        color = priorityColors[event.priority] || '#1e90ff';
    }
    
    const topPos = timeToPosition(startTime);
    const height = timeDurationToHeight(startTime, endTime);
    
    return `
        <div class="event-block ${type}-event" 
             style="top:${topPos}px; height:${height}px; background-color:${color};"
             data-type="${type}"
             data-id="${event.id}"
             ${type === 'task' ? 'draggable="true" ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)"' : ''}>
            <div class="event-time">${startTime}-${endTime}</div>
            <div class="event-title">${title}</div>
        </div>
    `;
}

function timeToPosition(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / 60) * 60; // ÿСʱ60px
}

function timeDurationToHeight(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    return (durationMinutes / 60) * 60; // ÿСʱ60px
}

// ���µ�ǰʱ����
function updateCurrentTimeLine() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const position = (totalMinutes / 60) * 60;
    
    const line = document.getElementById('currentTimeLine');
    line.style.top = position + 'px';
    line.style.display = 'block';
}

// ==================== ���ڹ��� ====================

// �Զ����ڹ��� - ���ؿ������ڣ�̰���㷨��
async function autoSchedule() {
    if (!confirm('ȷ��Ҫ�Զ���������δ���ŵ�������')) return;
    
    showLoading(true);
    
    try {
        // ʹ�ñ���̰���㷨��������
        const greedySchedule = await greedyScheduleTasks();
        
        if (greedySchedule.success) {
            showToast('�������ڳɹ���', 'success');
            await loadTasks();
            renderTimeline();
        } else {
            showToast('����ʧ��: ' + greedySchedule.message, 'error');
        }
    } catch (error) {
        console.error('����ʧ��:', error);
        showToast('����ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ����̰���㷨����
async function greedyScheduleTasks() {
    try {
        // ��ȡ��ǰ����
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // �Ӻ�˻�ȡ����͹̶��ճ̣����б������ڼ���
        const response = await fetch('/api/schedule/greedy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                date: dateStr
            })
        });
        
        return await response.json();
    } catch (error) {
        console.error('̰���㷨����ʧ��:', error);
        return { success: false, message: '���ڼ���ʧ��' };
    }
}

// AI�Ż�����
async function aiOptimizeSchedule() {
    showLoading(true);
    
    try {
        // ����AI���������Ż�����
        const response = await fetch('/api/ai/schedule/optimize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                date: currentDate.toISOString()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('AI�Ż����ڳɹ���', 'success');
            await loadTasks();
            renderTimeline();
        } else {
            showToast('�Ż�ʧ��: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('AI�Ż�ʧ��:', error);
        showToast('�Ż�ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== �����Ի����� ====================

// ��ʼ�������Ի�
function initActiveChat() {
    // ����Ƿ���Ҫ�����糿�ʺ�
    checkMorningGreeting();
    
    // �������ʼ����
    setInterval(checkTaskStartReminders, 300000); // ÿ5���Ӽ��һ��
    
    // ���˯ǰ����
    checkSleepReminder();
    
    // ��ʱ��רע����
    initFocusTimeTracking();
}

// �糿�ʺ�
function checkMorningGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const lastGreeting = localStorage.getItem('lastMorningGreeting');
    const today = now.toDateString();
    
    // ����6�㵽12��֮�䣬���ҽ��컹û�з��͹��ʺ�
    if (hour >= 6 && hour < 12 && lastGreeting !== today) {
        sendMorningGreeting();
        localStorage.setItem('lastMorningGreeting', today);
    }
}

// �����糿�ʺ�
async function sendMorningGreeting() {
    try {
        const response = await fetch('/api/ai/greeting/morning', {
            method: 'GET'
        });
        const data = await response.json();
        
        if (data.content) {
            addChatMessage('ai', data.content);
        }
    } catch (error) {
        console.error('��ȡ�糿�ʺ�ʧ��:', error);
        // ���ر����ʺ�
        addChatMessage('ai', '���Ϻã��������ǳ���������һ�죬����Ϊ��׼��������ճ̰��Űɣ�');
    }
}

// �������ʼ����
async function checkTaskStartReminders() {
    try {
        const response = await fetch('/api/ai/reminders/task_start', {
            method: 'GET'
        });
        const data = await response.json();
        
        if (data.reminders && data.reminders.length > 0) {
            data.reminders.forEach(reminder => {
                addChatMessage('ai', reminder);
            });
        }
    } catch (error) {
        console.error('��ȡ��������ʧ��:', error);
    }
}

// ���˯ǰ����
function checkSleepReminder() {
    // ��ȡ�û����õ�����ʱ�䣬Ĭ��Ϊ22:00
    const reminderTime = localStorage.getItem('sleepReminderTime') || '22:00';
    const [reminderHour, reminderMinute] = reminderTime.split(':').map(Number);
    
    // ���ö�ʱ����ÿ����ָ��ʱ�䷢�͸�������
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setHours(reminderHour, reminderMinute, 0, 0);
    
    // ��������ʱ���Ѿ����ˣ�����Ϊ����
    if (targetTime < now) {
        targetTime.setDate(targetTime.getDate() + 1);
    }
    
    const timeUntilReminder = targetTime - now;
    
    setTimeout(() => {
        sendSleepReview();
        // �ظ����ã�ÿ��ִ��
        checkSleepReminder();
    }, timeUntilReminder);
}

// ����˯ǰ����
async function sendSleepReview() {
    try {
        const response = await fetch('/api/ai/greeting/sleep', {
            method: 'GET'
        });
        const data = await response.json();
        
        if (data.content) {
            addChatMessage('ai', data.content);
        }
    } catch (error) {
        console.error('��ȡ˯ǰ����ʧ��:', error);
        // ���ر��ø���
        addChatMessage('ai', '���������ˣ������Ϣ������������ͣ�');
    }
}

// רעʱ�����
function initFocusTimeTracking() {
    let focusStartTime = null;
    let lastActivityTime = new Date();
    
    // ����û��
    function updateLastActivity() {
        lastActivityTime = new Date();
    }
    
    document.addEventListener('mousemove', updateLastActivity);
    document.addEventListener('keypress', updateLastActivity);
    
    // ���ڼ��רעʱ��
    setInterval(() => {
        const now = new Date();
        const timeSinceLastActivity = now - lastActivityTime;
        
        // ����û�5�������л����Ϊ��רע����
        if (timeSinceLastActivity < 5 * 60 * 1000) {
            if (!focusStartTime) {
                focusStartTime = now;
            }
            
            const focusDuration = now - focusStartTime;
            
            // ���רעʱ�䳬��90���ӣ�������Ϣ����
            if (focusDuration > 90 * 60 * 1000) {
                addChatMessage('ai', '�Ѿ�רע�ܾ��ˣ�������Ϣ10���ӣ��һ������Ŷ��');
                focusStartTime = null; // ����רעʱ��
            }
        } else {
            // �û���ʱ��û�л������רעʱ��
            focusStartTime = null;
        }
    }, 60000); // ÿ���Ӽ��һ��
}
    if (!confirm('ʹ��AI�Ż�������Ҫ����API��ȣ��Ƿ������')) return;
    
    showLoading(true);
    
    const dateStr = currentDate.toISOString().split('T')[0];
    
    try {
        const response = await fetch('/api/schedule/ai-optimize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({date: dateStr})
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('AI�Ż����', 'success');
            await loadTasks();
            renderTimeline();
        } else {
            showToast(data.message || 'AI�Ż�ʧ��', 'error');
        }
    } catch (error) {
        showToast('AI�Ż�ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// �������
async function clearSchedule() {
    if (!confirm('ȷ��Ҫ����������������ʱ����')) return;
    
    showLoading(true);
    
    try {
        // ��ȡ���������ڵ�����
        const scheduledTasks = allTasks.filter(t => t.scheduled_start);
        
        // ������
        for (const task of scheduledTasks) {
            await fetch(`/api/tasks/${task.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    scheduled_start: null,
                    scheduled_end: null
                })
            });
        }
        
        showToast('���������', 'success');
        await loadTasks();
        renderTimeline();
    } catch (error) {
        showToast('����ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== ��ק���ܣ�Phase 2��====================

let draggedTask = null;

function handleDragStart(e) {
    draggedTask = {
        id: e.target.dataset.id,
        type: e.target.dataset.type
    };
    e.target.style.opacity = '0.5';
}

function handleDragEnd(e) {
    e.target.style.opacity = '1';
    
    // TODO: Phase 2 ʵ����ק��ѯ�ʵ���
    // document.getElementById('dragConfirmModal').style.display = 'flex';
}

function handleDragResponse(action) {
    closeModal('dragConfirmModal');
    
    if (action === 'reschedule') {
        aiOptimizeSchedule();
    }
}

// ==================== AI�Ի� ====================

// ���ضԻ���ʷ
async function loadChatHistory() {
    try {
        const response = await fetch('/api/chat/history?limit=20');
        const data = await response.json();
        
        if (data.success) {
            const container = document.getElementById('chatMessages');
            container.innerHTML = data.history.map(msg => {
                const isAI = msg.role === 'assistant';
                return `
                    <div class="chat-message ${isAI ? 'ai-message' : 'user-message'}">
                        <div class="message-avatar">${isAI ? '?' : '?'}</div>
                        <div class="message-content">
                            <p>${msg.content}</p>
                        </div>
                    </div>
                `;
            }).join('');
            
            scrollChatToBottom();
        }
    } catch (error) {
        console.error('���ضԻ���ʷʧ��:', error);
    }
}

// ������Ϣ
async function sendChat() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // ��ʾ�û���Ϣ
    addChatMessage('user', message);
    input.value = '';
    
    // ���͵����
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({message})
        });
        
        const data = await response.json();
        
        if (data.success) {
            addChatMessage('assistant', data.reply);
        } else {
            addChatMessage('assistant', '��Ǹ����������һЩ����...');
        }
    } catch (error) {
        addChatMessage('assistant', '����������Ժ�����');
    }
}

function addChatMessage(role, content) {
    const container = document.getElementById('chatMessages');
    const isAI = role === 'assistant';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isAI ? 'ai-message' : 'user-message'}`;
    messageDiv.innerHTML = `
        <div class="message-avatar">${isAI ? '?' : '?'}</div>
        <div class="message-content">
            <p>${content}</p>
        </div>
    `;
    
    container.appendChild(messageDiv);
    scrollChatToBottom();
}

function scrollChatToBottom() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

function clearChatHistory() {
    if (!confirm('ȷ��Ҫ����Ի���ʷ��')) return;
    
    const container = document.getElementById('chatMessages');
    container.innerHTML = `
        <div class="chat-message ai-message">
            <div class="message-avatar">?</div>
            <div class="message-content">
                <p>�Ի���ʷ���������ʲô���԰������</p>
            </div>
        </div>
    `;
}

// ==================== ���ߺ��� ====================

// ��ʾ����״̬
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// ��ʾToast��ʾ
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// �ر�ģ̬��
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// ��ҳ����ռλ
function showWebImport() {
    showToast('��ҳ���빦�ܽ��� Phase 2 ʵ��', 'info');
}