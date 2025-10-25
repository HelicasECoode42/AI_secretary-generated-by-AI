// ========== ʱ������Ⱦ������ ==========
function renderTimeline() {
    const timelineEl = document.getElementById('timelineContainer');
    
    if (currentView === 'day') {
        renderDayView(timelineEl);
    } else if (currentView === 'week') {
        renderWeekView(timelineEl);
    } else if (currentView === 'month') {
        renderMonthView(timelineEl);
    }
}

// ========== ����ͼ��Ⱦ ==========
function renderDayView(container) {
    const currentDate = new Date();
    const dayOfWeek = currentDate.getDay();
    
    // ����24Сʱʱ����
    let html = `
        <div class="timeline-wrapper">
            <div class="timeline-hours" id="timelineHours">
                ${Array.from({length: 24}, (_, hour) => `
                    <div class="hour-slot">
                        <div class="hour-label">${String(hour).padStart(2, '0')}:00</div>
                    </div>
                `).join('')}
            </div>
            <div class="timeline-events" id="timelineEvents">
                <!-- ����齫��̬���� -->
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // ��Ⱦ�̶��ճ�
    renderFixedSchedulesOnTimeline(dayOfWeek);
    
    // ��Ⱦ����
    renderTasksOnTimeline(currentDate);
    
    // ����ק�¼�
    bindDragEvents();
}

// ========== ��ʱ��������Ⱦ�̶��ճ� ==========
function renderFixedSchedulesOnTimeline(dayOfWeek) {
    const fixedSchedules = allFixedSchedules.filter(
        s => s.day_of_week === dayOfWeek
    );
    
    fixedSchedules.forEach(schedule => {
        const taskBlock = createTaskBlock({
            title: schedule.title,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            category: 'fixed',
            isFixed: true
        });
        
        positionTaskBlock(taskBlock, schedule.start_time, schedule.end_time);
    });
}

// ========== ��ʱ��������Ⱦ���� ==========
function renderTasksOnTimeline(currentDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    
    const scheduledTasks = allTasks.filter(task => {
        if (!task.scheduled_start) return false;
        const taskDate = task.scheduled_start.split('T')[0];
        return taskDate === dateStr;
    });
    
    scheduledTasks.forEach(task => {
        const taskBlock = createTaskBlock({
            id: task.id,
            title: task.content,
            start_time: extractTime(task.scheduled_start),
            end_time: extractTime(task.scheduled_end),
            category: task.category,
            priority: task.priority,
            isFixed: false
        });
        
        positionTaskBlock(
            taskBlock, 
            extractTime(task.scheduled_start), 
            extractTime(task.scheduled_end)
        );
    });
}

// ========== ���������Ԫ�� ==========
function createTaskBlock(data) {
    const block = document.createElement('div');
    
    // ʹ��CSS�ж��������
    block.className = data.isFixed ? 'event-block fixed-event' : 'event-block task-event';
    
    if (data.id) {
        block.dataset.taskId = data.id;
    }
    
    const categoryInfo = TaskCategories[data.category] || TaskCategories['����'];
    if (!data.isFixed && categoryInfo) {
        block.style.backgroundColor = categoryInfo.color;
    }
    
    block.innerHTML = `
        <div class="event-time">${data.start_time} - ${data.end_time}</div>
        <div class="event-title">${data.title}</div>
    `;
    
    return block;
}

// ========== ��λ����� ==========
function positionTaskBlock(block, startTime, endTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    // ������ʼλ�úͳ���ʱ�䣨�Է���Ϊ��λ��
    const startPosition = startHour * 60 + startMinute;
    const duration = (endHour * 60 + endMinute) - startPosition;
    
    // ���þ��Զ�λ��ʽ
    block.style.top = `${startPosition}px`;
    block.style.height = `${duration}px`;
    block.style.position = 'absolute';
    block.style.left = '10px';
    block.style.right = '10px';
    
    // ��ӵ��¼�����
    const eventsContainer = document.getElementById('timelineEvents');
    if (eventsContainer) {
        eventsContainer.appendChild(block);
    }
}

// ========== ��ȡʱ���ַ��� ==========
function extractTime(datetime) {
    if (!datetime) return '00:00';
    return datetime.split('T')[1].substring(0, 5);
}

// ========== ����ʱ�� ==========
function calculateDuration(startTime, endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
}

// ========== ��ק���� ==========
let dragState = {
    isDragging: false,
    taskBlock: null,
    originalTaskId: null,
    startY: 0,
    originalTop: 0
};

function bindDragEvents() {
    const taskBlocks = document.querySelectorAll('.task-block:not(.fixed)');
    
    taskBlocks.forEach(block => {
        block.addEventListener('mousedown', handleDragStart);
    });
}

function handleDragStart(e) {
    if (e.target.closest('.fixed')) return;
    
    dragState.isDragging = true;
    dragState.taskBlock = e.currentTarget;
    dragState.originalTaskId = dragState.taskBlock.dataset.taskId;
    dragState.startY = e.clientY;
    dragState.originalTop = parseInt(dragState.taskBlock.style.top) || 0;
    
    dragState.taskBlock.style.opacity = '0.7';
    dragState.taskBlock.style.zIndex = '1000';
    
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    
    e.preventDefault();
}

function handleDragMove(e) {
    if (!dragState.isDragging) return;
    
    const deltaY = e.clientY - dragState.startY;
    const newTop = dragState.originalTop + deltaY;
    
    // ������ 0-1440 ���ӷ�Χ�ڣ�24Сʱ��
    const clampedTop = Math.max(0, Math.min(1440, newTop));
    
    dragState.taskBlock.style.top = `${clampedTop}px`;
}

async function handleDragEnd(e) {
    if (!dragState.isDragging) return;
    
    // ������ק״̬
    dragState.isDragging = false;
    dragState.taskBlock.style.opacity = '1';
    dragState.taskBlock.style.zIndex = '1';
    
    // ��ȡ��λ�õ�ʱ��
    const taskBlock = dragState.taskBlock;
    const newTop = parseInt(taskBlock.style.top) || 0;
    const taskId = dragState.originalTaskId;
    
    // �����µ�ʱ��
    const newHour = Math.floor(newTop / 60);
    const newMinute = newTop % 60;
    const newStartTime = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
    
    // �������ʱ��
    const duration = parseInt(taskBlock.style.height);
    const endTotalMinutes = newTop + duration;
    const endHour = Math.floor(endTotalMinutes / 60);
    const endMinute = endTotalMinutes % 60;
    const newEndTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    
    // �Ƴ��¼�������
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    
    // ��ʾ��ק�����ѡ��Ի���
    showDragActionDialog(taskId, newStartTime, newEndTime);
    
    // ������ק״̬
    dragState = {
        isDragging: false,
        taskBlock: null,
        originalTaskId: null,
        startY: 0,
        originalTop: 0
    };
}

// ========== ��ʾ��ק������Ի��� ==========
function showDragActionDialog(taskId, newStartTime, newEndTime) {
    // ����Ƿ��Ѵ��ڶԻ���Ԫ��
    let dialog = document.getElementById('dragActionDialog');
    
    if (!dialog) {
        // �����Ի���Ԫ��
        dialog = document.createElement('div');
        dialog.id = 'dragActionDialog';
        dialog.className = 'drag-action-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h4>��⵽���ֶ�����������ʱ��</h4>
                <div class="dialog-options">
                    <button id="saveOnlyBtn" class="btn-primary">��������޸�</button>
                    <button id="aiRescheduleBtn" class="btn-secondary">AI��������</button>
                </div>
                <div class="dialog-checkbox">
                    <input type="checkbox" id="rememberChoice" checked>
                    <label for="rememberChoice">��ס�ҵ�ѡ���´β���ѯ��</label>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        
        // �����ʽ
        const style = document.createElement('style');
        style.textContent = `
            .drag-action-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10000;
                padding: 0;
            }
            .dialog-content {
                padding: 20px;
            }
            .dialog-content h4 {
                margin-bottom: 15px;
                font-size: 16px;
                color: #333;
            }
            .dialog-options {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }
            .dialog-checkbox {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 13px;
                color: #666;
            }
        `;
        document.head.appendChild(style);
    }
    
    // ��ʾ�Ի���
    dialog.style.display = 'block';
    
    // ���浱ǰ������Ϣ
    dialog.dataset.taskId = taskId;
    dialog.dataset.newStartTime = newStartTime;
    dialog.dataset.newEndTime = newEndTime;
    
    // ���¼�
    document.getElementById('saveOnlyBtn').onclick = function() {
        saveOnlyTaskChange(taskId, newStartTime, newEndTime);
        dialog.style.display = 'none';
        if (document.getElementById('rememberChoice').checked) {
            localStorage.setItem('dragActionPreference', 'saveOnly');
        }
    };
    
    document.getElementById('aiRescheduleBtn').onclick = function() {
        aiRescheduleAfterDrag(taskId, newStartTime, newEndTime);
        dialog.style.display = 'none';
        if (document.getElementById('rememberChoice').checked) {
            localStorage.setItem('dragActionPreference', 'aiReschedule');
        }
    };
}

// ========== �����������޸� ==========
async function saveOnlyTaskChange(taskId, newStartTime, newEndTime) {
    // ����ʵ�ֽ����浥�������޸ĵ��߼�
    const currentDate = new Date();
    const dateStr = currentDate.toISOString().split('T')[0];
    
    const newStartDateTime = `${dateStr}T${newStartTime}:00`;
    const newEndDateTime = `${dateStr}T${newEndTime}:00`;
    
    try {
        // ����API��������
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                scheduled_start: newStartDateTime,
                scheduled_end: newEndDateTime
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('����ʱ���Ѹ���', 'success');
            // ���¼����������Ⱦʱ����
            loadTasks();
            renderTimeline();
        } else {
            showToast('����ʧ��', 'error');
        }
    } catch (error) {
        console.error('��������ʧ��:', error);
        showToast('����ʧ��', 'error');
    }
}

// ========== AI�������� ==========
async function aiRescheduleAfterDrag(taskId, newStartTime, newEndTime) {
    showLoading(true);
    
    try {
        // ���ȸ��������ʱ��
        const currentDate = new Date();
        const dateStr = currentDate.toISOString().split('T')[0];
        
        const newStartDateTime = `${dateStr}T${newStartTime}:00`;
        const newEndDateTime = `${dateStr}T${newEndTime}:00`;
        
        // ����AI�Ż�����API
        const response = await fetch('/api/ai/schedule/optimize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                task_id: taskId,
                new_start_time: newStartDateTime,
                new_end_time: newEndDateTime
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showToast('��ʹ��AI�����Ż�����', 'success');
            // ���¼����������Ⱦʱ����
            loadTasks();
            renderTimeline();
        } else {
            showToast('AI�Ż�ʧ��', 'error');
        }
    } catch (error) {
        console.error('AI��������ʧ��:', error);
        showToast('AI�Ż�ʧ��', 'error');
    } finally {
        showLoading(false);
    }
}

// ========== ��קȷ��ģ̬�� ==========
function showDragConfirmModal(taskId, newStartTime, newEndTime) {
    const modal = document.getElementById('drag-confirm-modal');
    const textEl = document.getElementById('drag-confirm-text');
    
    textEl.textContent = `����ʱ�佫����Ϊ ${newStartTime} - ${newEndTime}���Ƿ񱣴棿`;
    
    showModal('drag-confirm-modal');
    
    // �󶨰�ť�¼�
    document.getElementById('drag-save-only-btn').onclick = async () => {
        await saveDraggedTask(taskId, newStartTime, newEndTime, false);
        hideModal('drag-confirm-modal');
    };
    
    document.getElementById('drag-ai-reschedule-btn').onclick = async () => {
        await saveDraggedTask(taskId, newStartTime, newEndTime, true);
        hideModal('drag-confirm-modal');
    };
}

// ========== ������ק������� ==========
async function saveDraggedTask(taskId, newStartTime, newEndTime, aiReschedule) {
    try {
        const currentDate = AppState.currentDate.toISOString().split('T')[0];
        const scheduled_start = `${currentDate}T${newStartTime}:00`;
        const scheduled_end = `${currentDate}T${newEndTime}:00`;
        
        const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduled_start,
                scheduled_end
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('����ʱ���Ѹ���', 'success');
            
            if (aiReschedule) {
                // ���� AI ��������
                await generateSchedule();
            } else {
                // �����¼�������
                await loadTasks();
            }
        } else {
            showNotification(data.message || '����ʧ��', 'error');
            await loadTasks(); // �ָ�ԭ״
        }
    } catch (error) {
        console.error('��������ʧ��:', error);
        showNotification('����ʧ��', 'error');
        await loadTasks(); // �ָ�ԭ״
    }
}

// ========== ����ͼ��Ⱦ��Phase 3�� ==========
function renderWeekView(container) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-week"></i><p>����ͼ���ܽ��� Phase 3 ʵ��</p></div>';
}

// ========== ����ͼ��Ⱦ��Phase 3�� ==========
function renderMonthView(container) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>����ͼ���ܽ��� Phase 3 ʵ��</p></div>';
}