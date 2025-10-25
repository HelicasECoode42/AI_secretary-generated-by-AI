// ==================== 全局变量 ====================
let currentModule = 'todo';
let currentView = 'day';
let currentDate = new Date();
let allTasks = [];
let allFixedSchedules = [];
let ocrRecognizedSchedules = [];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 设置当前日期
    document.getElementById('currentDate').valueAsDate = currentDate;
    
    // 加载数据
    loadFixedSchedules();
    loadTasks();
    loadChatHistory();
    
    // 渲染时间轴
    renderTimeline();
    
    // 启动当前时间线更新
    updateCurrentTimeLine();
    setInterval(updateCurrentTimeLine, 60000); // 每分钟更新
    
    // 启动自动刷新
    setInterval(() => {
        loadTasks();
        renderTimeline();
    }, 30000); // 每30秒刷新
    
    // 初始化主动对话功能
    initActiveChat();
}

// ==================== 模块切换 ====================
function switchModule(module) {
    currentModule = module;
    
    // 更新导航样式
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-module="${module}"]`).classList.add('active');
    
    // 切换视图
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

// ==================== 视图切换（日/周/月）====================
function switchView(view) {
    currentView = view;
    
    // 更新按钮样式
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // TODO: Phase 2 实现周视图和月视图
    if (view === 'week' || view === 'month') {
        showToast(`${view === 'week' ? '周' : '月'}视图将在 Phase 2 实现`, 'info');
    } else {
        renderTimeline();
    }
}

// ==================== 日期切换 ====================
function changeDate(delta) {
    currentDate.setDate(currentDate.getDate() + delta);
    document.getElementById('currentDate').valueAsDate = currentDate;
    renderTimeline();
}

function onDateChange() {
    currentDate = document.getElementById('currentDate').valueAsDate;
    renderTimeline();
}

// ==================== 固定日程管理 ====================

// 加载固定日程
async function loadFixedSchedules() {
    try {
        const response = await fetch('/api/fixed_schedules');
        const data = await response.json();
        
        if (data.success) {
            allFixedSchedules = data.schedules;
            renderFixedScheduleList();
        }
    } catch (error) {
        console.error('加载固定日程失败:', error);
        showToast('加载固定日程失败', 'error');
    }
}

// 渲染固定日程列表
function renderFixedScheduleList() {
    const container = document.getElementById('fixedScheduleList');
    
    if (allFixedSchedules.length === 0) {
        container.innerHTML = '<p class="empty-hint">暂无固定日程</p>';
        return;
    }
    
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    container.innerHTML = allFixedSchedules.map(schedule => `
        <div class="fixed-schedule-item">
            <div class="schedule-info">
                <span class="schedule-day">${weekDays[schedule.day_of_week]}</span>
                <span class="schedule-time">${schedule.start_time}-${schedule.end_time}</span>
                <span class="schedule-title">${schedule.title}</span>
            </div>
            <button class="btn-icon" onclick="deleteFixedSchedule(${schedule.id})" title="删除">??</button>
        </div>
    `).join('');
}

// 显示手动输入弹窗
function showManualInput() {
    document.getElementById('manualInputModal').style.display = 'flex';
}

// 提交手动输入的固定日程
async function submitManualSchedule() {
    const title = document.getElementById('manualTitle').value.trim();
    const dayOfWeek = parseInt(document.getElementById('manualDayOfWeek').value);
    const startTime = document.getElementById('manualStartTime').value;
    const endTime = document.getElementById('manualEndTime').value;
    const location = document.getElementById('manualLocation').value.trim();
    
    if (!title || !startTime || !endTime) {
        showToast('请填写完整信息', 'warning');
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
            showToast('固定日程添加成功', 'success');
            closeModal('manualInputModal');
            
            // 清空表单
            document.getElementById('manualTitle').value = '';
            document.getElementById('manualLocation').value = '';
            
            // 重新加载
            await loadFixedSchedules();
            renderTimeline();
        } else {
            showToast('添加失败', 'error');
        }
    } catch (error) {
        console.error('添加固定日程失败:', error);
        showToast('添加失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 删除固定日程
async function deleteFixedSchedule(id) {
    if (!confirm('确定要删除这条固定日程吗？')) return;
    
    try {
        const response = await fetch(`/api/fixed_schedules/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('删除成功', 'success');
            await loadFixedSchedules();
            renderTimeline();
        }
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败', 'error');
    }
}

// OCR上传
function showOCRUpload() {
    document.getElementById('ocrUploadModal').style.display = 'flex';
}

function handleFileSelect() {
    const fileInput = document.getElementById('ocrFileInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImage').src = e.target.result;
        document.getElementById('ocrPreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
    
    // 上传识别
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
            showToast(`识别成功！共找到 ${data.schedules.length} 条课程`, 'success');
        } else {
            showToast(data.message || '识别失败', 'error');
        }
    } catch (error) {
        console.error('OCR识别失败:', error);
        showToast('识别失败', 'error');
    } finally {
        showLoading(false);
    }
}

function renderOCRResult(data) {
    const container = document.getElementById('ocrScheduleList');
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    container.innerHTML = `
        <p class="hint">原始识别文本：</p>
        <pre style="background:#f5f5f5; padding:10px; max-height:100px; overflow:auto;">${data.raw_text}</pre>
        <p class="hint">解析结果（可编辑）：</p>
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
        showToast('批量添加失败', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 任务管理 ====================

// 加载任务
async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        
        if (data.success) {
            allTasks = data.tasks;
            renderTaskList();
        }
    } catch (error) {
        console.error('加载任务失败:', error);
    }
}

// 添加任务
async function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    
    if (!text) {
        showToast('请输入任务内容', 'warning');
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
            showToast('任务添加成功', 'success');
            input.value = '';
            await loadTasks();
        } else {
            showToast(data.message || '添加失败', 'error');
        }
    } catch (error) {
        console.error('添加任务失败:', error);
        showToast('添加失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 渲染任务列表
function renderTaskList() {
    const container = document.getElementById('taskList');
    
    // 应用筛选
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
        container.innerHTML = '<p class="empty-hint">暂无任务</p>';
        return;
    }
    
    const priorityColors = {
        'high': '#ff4757',
        'medium': '#ffa502',
        'low': '#1e90ff'
    };
    
    const priorityText = {
        'high': '高',
        'medium': '中',
        'low': '低'
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
                    <span class="task-duration">${task.estimated_duration}分钟</span>
                    ${task.scheduled_start ? `<span class="task-scheduled">? 已排期</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="btn-icon" onclick="editTask(${task.id})" title="编辑">??</button>
                <button class="btn-icon" onclick="deleteTask(${task.id})" title="删除">??</button>
            </div>
        </div>
    `).join('');
}

function filterTasks() {
    renderTaskList();
}

// 切换任务完成状态
async function toggleTaskComplete(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    
    if (task.status === 'completed') {
        // 取消完成（重新设为pending）
        await updateTaskStatus(taskId, 'pending');
    } else {
        // 标记完成
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
            showToast('任务已完成 ?', 'success');
            await loadTasks();
            renderTimeline();
        }
    } catch (error) {
        showToast('操作失败', 'error');
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
        showToast('操作失败', 'error');
    }
}

// 编辑任务
function editTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    document.getElementById('editTaskId').value = task.id;
    document.getElementById('editTaskContent').value = task.content;
    document.getElementById('editTaskCategory').value = task.category || '工作';
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
        showToast('任务内容不能为空', 'warning');
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
            showToast('任务更新成功', 'success');
            closeModal('editTaskModal');
            await loadTasks();
            renderTimeline();
        }
    } catch (error) {
        showToast('更新失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 删除任务
async function deleteTask(taskId) {
    if (!confirm('确定要删除这个任务吗？')) return;
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('任务已删除', 'success');
            await loadTasks();
            renderTimeline();
        }
    } catch (error) {
        showToast('删除失败', 'error');
    }
}

// ==================== 时间轴渲染 ====================

function renderTimeline() {
    renderTimelineHours();
    renderTimelineEvents();
}

// 渲染时间刻度
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

// 渲染日程事件
async function renderTimelineEvents() {
    const container = document.getElementById('timelineEvents');
    const dateStr = currentDate.toISOString().split('T')[0];
    
    try {
        const response = await fetch(`/api/daily_schedule?date=${dateStr}`);
        const data = await response.json();
        
        if (!data.success) return;
        
        let html = '';
        
        // 渲染固定日程
        data.fixed_schedules.forEach(schedule => {
            const block = createEventBlock(schedule, 'fixed');
            html += block;
        });
        
        // 渲染已排期任务
        data.tasks.forEach(task => {
            if (task.scheduled_start) {
                const block = createEventBlock(task, 'task');
                html += block;
            }
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('渲染时间轴失败:', error);
    }
}

function createEventBlock(event, type) {
    let startTime, endTime, title, color;
    
    if (type === 'fixed') {
        startTime = event.start_time;
        endTime = event.end_time;
        title = event.title;
        color = '#6c5ce7'; // 固定日程紫色
    } else {
        // 任务
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
    return (totalMinutes / 60) * 60; // 每小时60px
}

function timeDurationToHeight(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    return (durationMinutes / 60) * 60; // 每小时60px
}

// 更新当前时间线
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

// ==================== 排期功能 ====================

// 自动排期功能 - 本地快速排期（贪心算法）
async function autoSchedule() {
    if (!confirm('确定要自动排期所有未安排的任务吗？')) return;
    
    showLoading(true);
    
    try {
        // 使用本地贪心算法快速排期
        const greedySchedule = await greedyScheduleTasks();
        
        if (greedySchedule.success) {
            showToast('快速排期成功！', 'success');
            await loadTasks();
            renderTimeline();
        } else {
            showToast('排期失败: ' + greedySchedule.message, 'error');
        }
    } catch (error) {
        console.error('排期失败:', error);
        showToast('排期失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 本地贪心算法排期
async function greedyScheduleTasks() {
    try {
        // 获取当前日期
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // 从后端获取任务和固定日程，进行本地排期计算
        const response = await fetch('/api/schedule/greedy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                date: dateStr
            })
        });
        
        return await response.json();
    } catch (error) {
        console.error('贪心算法排期失败:', error);
        return { success: false, message: '排期计算失败' };
    }
}

// AI优化排期
async function aiOptimizeSchedule() {
    showLoading(true);
    
    try {
        // 调用AI进行智能优化排期
        const response = await fetch('/api/ai/schedule/optimize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                date: currentDate.toISOString()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('AI优化排期成功！', 'success');
            await loadTasks();
            renderTimeline();
        } else {
            showToast('优化失败: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('AI优化失败:', error);
        showToast('优化失败', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 主动对话功能 ====================

// 初始化主动对话
function initActiveChat() {
    // 检查是否需要发送早晨问候
    checkMorningGreeting();
    
    // 检查任务开始提醒
    setInterval(checkTaskStartReminders, 300000); // 每5分钟检查一次
    
    // 检查睡前复盘
    checkSleepReminder();
    
    // 长时间专注提醒
    initFocusTimeTracking();
}

// 早晨问候
function checkMorningGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const lastGreeting = localStorage.getItem('lastMorningGreeting');
    const today = now.toDateString();
    
    // 早上6点到12点之间，并且今天还没有发送过问候
    if (hour >= 6 && hour < 12 && lastGreeting !== today) {
        sendMorningGreeting();
        localStorage.setItem('lastMorningGreeting', today);
    }
}

// 发送早晨问候
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
        console.error('获取早晨问候失败:', error);
        // 本地备用问候
        addChatMessage('ai', '早上好！今天又是充满活力的一天，让我为您准备今天的日程安排吧！');
    }
}

// 检查任务开始提醒
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
        console.error('获取任务提醒失败:', error);
    }
}

// 检查睡前复盘
function checkSleepReminder() {
    // 获取用户设置的提醒时间，默认为22:00
    const reminderTime = localStorage.getItem('sleepReminderTime') || '22:00';
    const [reminderHour, reminderMinute] = reminderTime.split(':').map(Number);
    
    // 设置定时器，每天在指定时间发送复盘提醒
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setHours(reminderHour, reminderMinute, 0, 0);
    
    // 如果今天的时间已经过了，设置为明天
    if (targetTime < now) {
        targetTime.setDate(targetTime.getDate() + 1);
    }
    
    const timeUntilReminder = targetTime - now;
    
    setTimeout(() => {
        sendSleepReview();
        // 重复设置，每天执行
        checkSleepReminder();
    }, timeUntilReminder);
}

// 发送睡前复盘
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
        console.error('获取睡前复盘失败:', error);
        // 本地备用复盘
        addChatMessage('ai', '今天辛苦了！早点休息，明天继续加油！');
    }
}

// 专注时间跟踪
function initFocusTimeTracking() {
    let focusStartTime = null;
    let lastActivityTime = new Date();
    
    // 检测用户活动
    function updateLastActivity() {
        lastActivityTime = new Date();
    }
    
    document.addEventListener('mousemove', updateLastActivity);
    document.addEventListener('keypress', updateLastActivity);
    
    // 定期检查专注时间
    setInterval(() => {
        const now = new Date();
        const timeSinceLastActivity = now - lastActivityTime;
        
        // 如果用户5分钟内有活动，认为在专注工作
        if (timeSinceLastActivity < 5 * 60 * 1000) {
            if (!focusStartTime) {
                focusStartTime = now;
            }
            
            const focusDuration = now - focusStartTime;
            
            // 如果专注时间超过90分钟，发送休息提醒
            if (focusDuration > 90 * 60 * 1000) {
                addChatMessage('ai', '已经专注很久了，建议休息10分钟，活动一下身体哦！');
                focusStartTime = null; // 重置专注时间
            }
        } else {
            // 用户长时间没有活动，重置专注时间
            focusStartTime = null;
        }
    }, 60000); // 每分钟检查一次
}
    if (!confirm('使用AI优化排期需要消耗API额度，是否继续？')) return;
    
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
            showToast('AI优化完成', 'success');
            await loadTasks();
            renderTimeline();
        } else {
            showToast(data.message || 'AI优化失败', 'error');
        }
    } catch (error) {
        showToast('AI优化失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 清除排期
async function clearSchedule() {
    if (!confirm('确定要清除所有任务的排期时间吗？')) return;
    
    showLoading(true);
    
    try {
        // 获取所有有排期的任务
        const scheduledTasks = allTasks.filter(t => t.scheduled_start);
        
        // 逐个清除
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
        
        showToast('排期已清除', 'success');
        await loadTasks();
        renderTimeline();
    } catch (error) {
        showToast('操作失败', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== 拖拽功能（Phase 2）====================

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
    
    // TODO: Phase 2 实现拖拽后询问弹窗
    // document.getElementById('dragConfirmModal').style.display = 'flex';
}

function handleDragResponse(action) {
    closeModal('dragConfirmModal');
    
    if (action === 'reschedule') {
        aiOptimizeSchedule();
    }
}

// ==================== AI对话 ====================

// 加载对话历史
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
        console.error('加载对话历史失败:', error);
    }
}

// 发送消息
async function sendChat() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // 显示用户消息
    addChatMessage('user', message);
    input.value = '';
    
    // 发送到后端
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
            addChatMessage('assistant', '抱歉，我遇到了一些问题...');
        }
    } catch (error) {
        addChatMessage('assistant', '网络错误，请稍后再试');
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
    if (!confirm('确定要清除对话历史吗？')) return;
    
    const container = document.getElementById('chatMessages');
    container.innerHTML = `
        <div class="chat-message ai-message">
            <div class="message-avatar">?</div>
            <div class="message-content">
                <p>对话历史已清除，有什么可以帮你的吗？</p>
            </div>
        </div>
    `;
}

// ==================== 工具函数 ====================

// 显示加载状态
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// 显示Toast提示
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 关闭模态框
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// 网页导入占位
function showWebImport() {
    showToast('网页导入功能将在 Phase 2 实现', 'info');
}