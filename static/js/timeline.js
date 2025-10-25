// ========== 时间轴渲染主函数 ==========
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

// ========== 日视图渲染 ==========
function renderDayView(container) {
    const currentDate = new Date();
    const dayOfWeek = currentDate.getDay();
    
    // 生成24小时时间轴
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
                <!-- 任务块将动态生成 -->
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // 渲染固定日程
    renderFixedSchedulesOnTimeline(dayOfWeek);
    
    // 渲染任务
    renderTasksOnTimeline(currentDate);
    
    // 绑定拖拽事件
    bindDragEvents();
}

// ========== 在时间轴上渲染固定日程 ==========
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

// ========== 在时间轴上渲染任务 ==========
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

// ========== 创建任务块元素 ==========
function createTaskBlock(data) {
    const block = document.createElement('div');
    
    // 使用CSS中定义的类名
    block.className = data.isFixed ? 'event-block fixed-event' : 'event-block task-event';
    
    if (data.id) {
        block.dataset.taskId = data.id;
    }
    
    const categoryInfo = TaskCategories[data.category] || TaskCategories['其他'];
    if (!data.isFixed && categoryInfo) {
        block.style.backgroundColor = categoryInfo.color;
    }
    
    block.innerHTML = `
        <div class="event-time">${data.start_time} - ${data.end_time}</div>
        <div class="event-title">${data.title}</div>
    `;
    
    return block;
}

// ========== 定位任务块 ==========
function positionTaskBlock(block, startTime, endTime) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    // 计算起始位置和持续时间（以分钟为单位）
    const startPosition = startHour * 60 + startMinute;
    const duration = (endHour * 60 + endMinute) - startPosition;
    
    // 设置绝对定位样式
    block.style.top = `${startPosition}px`;
    block.style.height = `${duration}px`;
    block.style.position = 'absolute';
    block.style.left = '10px';
    block.style.right = '10px';
    
    // 添加到事件容器
    const eventsContainer = document.getElementById('timelineEvents');
    if (eventsContainer) {
        eventsContainer.appendChild(block);
    }
}

// ========== 提取时间字符串 ==========
function extractTime(datetime) {
    if (!datetime) return '00:00';
    return datetime.split('T')[1].substring(0, 5);
}

// ========== 计算时长 ==========
function calculateDuration(startTime, endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
}

// ========== 拖拽功能 ==========
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
    
    // 限制在 0-1440 分钟范围内（24小时）
    const clampedTop = Math.max(0, Math.min(1440, newTop));
    
    dragState.taskBlock.style.top = `${clampedTop}px`;
}

async function handleDragEnd(e) {
    if (!dragState.isDragging) return;
    
    // 重置拖拽状态
    dragState.isDragging = false;
    dragState.taskBlock.style.opacity = '1';
    dragState.taskBlock.style.zIndex = '1';
    
    // 获取新位置的时间
    const taskBlock = dragState.taskBlock;
    const newTop = parseInt(taskBlock.style.top) || 0;
    const taskId = dragState.originalTaskId;
    
    // 计算新的时间
    const newHour = Math.floor(newTop / 60);
    const newMinute = newTop % 60;
    const newStartTime = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
    
    // 计算结束时间
    const duration = parseInt(taskBlock.style.height);
    const endTotalMinutes = newTop + duration;
    const endHour = Math.floor(endTotalMinutes / 60);
    const endMinute = endTotalMinutes % 60;
    const newEndTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
    
    // 移除事件监听器
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    
    // 显示拖拽后操作选择对话框
    showDragActionDialog(taskId, newStartTime, newEndTime);
    
    // 重置拖拽状态
    dragState = {
        isDragging: false,
        taskBlock: null,
        originalTaskId: null,
        startY: 0,
        originalTop: 0
    };
}

// ========== 显示拖拽后操作对话框 ==========
function showDragActionDialog(taskId, newStartTime, newEndTime) {
    // 检查是否已存在对话框元素
    let dialog = document.getElementById('dragActionDialog');
    
    if (!dialog) {
        // 创建对话框元素
        dialog = document.createElement('div');
        dialog.id = 'dragActionDialog';
        dialog.className = 'drag-action-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h4>检测到您手动调整了任务时间</h4>
                <div class="dialog-options">
                    <button id="saveOnlyBtn" class="btn-primary">仅保存此修改</button>
                    <button id="aiRescheduleBtn" class="btn-secondary">AI重新排期</button>
                </div>
                <div class="dialog-checkbox">
                    <input type="checkbox" id="rememberChoice" checked>
                    <label for="rememberChoice">记住我的选择，下次不再询问</label>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        
        // 添加样式
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
    
    // 显示对话框
    dialog.style.display = 'block';
    
    // 保存当前任务信息
    dialog.dataset.taskId = taskId;
    dialog.dataset.newStartTime = newStartTime;
    dialog.dataset.newEndTime = newEndTime;
    
    // 绑定事件
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

// ========== 仅保存任务修改 ==========
async function saveOnlyTaskChange(taskId, newStartTime, newEndTime) {
    // 这里实现仅保存单个任务修改的逻辑
    const currentDate = new Date();
    const dateStr = currentDate.toISOString().split('T')[0];
    
    const newStartDateTime = `${dateStr}T${newStartTime}:00`;
    const newEndDateTime = `${dateStr}T${newEndTime}:00`;
    
    try {
        // 调用API更新任务
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
            showToast('任务时间已更新', 'success');
            // 重新加载任务和渲染时间轴
            loadTasks();
            renderTimeline();
        } else {
            showToast('更新失败', 'error');
        }
    } catch (error) {
        console.error('更新任务失败:', error);
        showToast('更新失败', 'error');
    }
}

// ========== AI重新排期 ==========
async function aiRescheduleAfterDrag(taskId, newStartTime, newEndTime) {
    showLoading(true);
    
    try {
        // 首先更新任务的时间
        const currentDate = new Date();
        const dateStr = currentDate.toISOString().split('T')[0];
        
        const newStartDateTime = `${dateStr}T${newStartTime}:00`;
        const newEndDateTime = `${dateStr}T${newEndTime}:00`;
        
        // 调用AI优化排期API
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
            showToast('已使用AI重新优化排期', 'success');
            // 重新加载任务和渲染时间轴
            loadTasks();
            renderTimeline();
        } else {
            showToast('AI优化失败', 'error');
        }
    } catch (error) {
        console.error('AI重新排期失败:', error);
        showToast('AI优化失败', 'error');
    } finally {
        showLoading(false);
    }
}

// ========== 拖拽确认模态框 ==========
function showDragConfirmModal(taskId, newStartTime, newEndTime) {
    const modal = document.getElementById('drag-confirm-modal');
    const textEl = document.getElementById('drag-confirm-text');
    
    textEl.textContent = `任务时间将调整为 ${newStartTime} - ${newEndTime}，是否保存？`;
    
    showModal('drag-confirm-modal');
    
    // 绑定按钮事件
    document.getElementById('drag-save-only-btn').onclick = async () => {
        await saveDraggedTask(taskId, newStartTime, newEndTime, false);
        hideModal('drag-confirm-modal');
    };
    
    document.getElementById('drag-ai-reschedule-btn').onclick = async () => {
        await saveDraggedTask(taskId, newStartTime, newEndTime, true);
        hideModal('drag-confirm-modal');
    };
}

// ========== 保存拖拽后的任务 ==========
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
            showNotification('任务时间已更新', 'success');
            
            if (aiReschedule) {
                // 触发 AI 重新排期
                await generateSchedule();
            } else {
                // 仅重新加载任务
                await loadTasks();
            }
        } else {
            showNotification(data.message || '更新失败', 'error');
            await loadTasks(); // 恢复原状
        }
    } catch (error) {
        console.error('保存任务失败:', error);
        showNotification('保存失败', 'error');
        await loadTasks(); // 恢复原状
    }
}

// ========== 周视图渲染（Phase 3） ==========
function renderWeekView(container) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-week"></i><p>周视图功能将在 Phase 3 实现</p></div>';
}

// ========== 月视图渲染（Phase 3） ==========
function renderMonthView(container) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>月视图功能将在 Phase 3 实现</p></div>';
}