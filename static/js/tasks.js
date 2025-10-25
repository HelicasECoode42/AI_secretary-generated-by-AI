// ========== 任务解析辅助 ==========

/**
 * 解析用户输入的任务文本
 * 示例：
 * - "写报告 2h high" -> { content: "写报告", duration: 120, priority: "high" }
 * - "学英语 [学习]" -> { content: "学英语", category: "学习", duration: 60, priority: "medium" }
 */
function parseTaskInput(text) {
    const result = {
        content: text,
        category: '工作',
        priority: 'medium',
        estimated_duration: 60,
        deadline: null
    };
    
    // 匹配时长（如：2h, 30m, 1.5h）
    const durationMatch = text.match(/(\d+(?:\.\d+)?)\s*(h|m|小时|分钟)/i);
    if (durationMatch) {
        const value = parseFloat(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        
        if (unit === 'h' || unit === '小时') {
            result.estimated_duration = value * 60;
        } else {
            result.estimated_duration = value;
        }
        
        // 移除时长部分
        text = text.replace(durationMatch[0], '').trim();
    }
    
    // 匹配优先级
    const priorityMatch = text.match(/\b(high|medium|low|高|中|低)\b/i);
    if (priorityMatch) {
        const p = priorityMatch[1].toLowerCase();
        const priorityMap = {
            'high': 'high', '高': 'high',
            'medium': 'medium', '中': 'medium',
            'low': 'low', '低': 'low'
        };
        result.priority = priorityMap[p] || 'medium';
        
        // 移除优先级部分
        text = text.replace(priorityMatch[0], '').trim();
    }
    
    // 匹配分类（如：[工作]、[学习]、[生活]）
    const categoryMatch = text.match(/\[(.*?)\]/);
    if (categoryMatch) {
        result.category = categoryMatch[1];
        text = text.replace(categoryMatch[0], '').trim();
    }
    
    result.content = text;
    
    return result;
}

// ========== 任务分类管理 ==========
const TaskCategories = {
    '工作': { color: '#FF6B6B', icon: '💼' },
    '学习': { color: '#4ECDC4', icon: '📚' },
    '生活': { color: '#F7B733', icon: '🏠' },
    '运动': { color: '#95E1D3', icon: '⚽' },
    '其他': { color: '#a8a8a8', icon: '📌' }
};

function getCategoryColor(category) {
    return TaskCategories[category]?.color || TaskCategories['其他'].color;
}

function getCategoryIcon(category) {
    return TaskCategories[category]?.icon || TaskCategories['其他'].icon;
}

// ========== 任务优先级管理 ==========
const TaskPriorities = {
    'high': { label: '高优先级', color: '#FF5252', value: 3 },
    'medium': { label: '中优先级', color: '#F5A623', value: 2 },
    'low': { label: '低优先级', color: '#7ED321', value: 1 }
};

function comparePriority(a, b) {
    const priorityA = TaskPriorities[a]?.value || 0;
    const priorityB = TaskPriorities[b]?.value || 0;
    return priorityB - priorityA; // 降序
}

// ========== 任务状态管理 ==========
const TaskStatuses = {
    'pending': '待处理',
    'in_progress': '进行中',
    'completed': '已完成',
    'cancelled': '已取消'
};

// ========== 任务排序 ==========
function sortTasks(tasks, sortBy = 'priority') {
    const sorted = [...tasks];
    
    switch (sortBy) {
        case 'priority':
            sorted.sort((a, b) => comparePriority(a.priority, b.priority));
            break;
        
        case 'deadline':
            sorted.sort((a, b) => {
                if (!a.deadline) return 1;
                if (!b.deadline) return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            });
            break;
        
        case 'created':
            sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        
        case 'duration':
            sorted.sort((a, b) => a.estimated_duration - b.estimated_duration);
            break;
    }
    
    return sorted;
}

// ========== 任务筛选 ==========
function filterTasks(tasks, filters) {
    return tasks.filter(task => {
        // 状态筛选
        if (filters.status && task.status !== filters.status) {
            return false;
        }
        
        // 分类筛选
        if (filters.category && task.category !== filters.category) {
            return false;
        }
        
        // 优先级筛选
        if (filters.priority && task.priority !== filters.priority) {
            return false;
        }
        
        // 关键词搜索
        if (filters.keyword) {
            const keyword = filters.keyword.toLowerCase();
            return task.content.toLowerCase().includes(keyword);
        }
        
        return true;
    });
}

// ========== 任务统计 ==========
function getTaskStatistics(tasks) {
    const stats = {
        total: tasks.length,
        pending: 0,
        completed: 0,
        byCategory: {},
        byPriority: {
            high: 0,
            medium: 0,
            low: 0
        },
        totalDuration: 0,
        completedDuration: 0
    };
    
    tasks.forEach(task => {
        // 状态统计
        if (task.status === 'pending') stats.pending++;
        if (task.status === 'completed') stats.completed++;
        
        // 分类统计
        stats.byCategory[task.category] = (stats.byCategory[task.category] || 0) + 1;
        
        // 优先级统计
        stats.byPriority[task.priority]++;
        
        // 时长统计
        stats.totalDuration += task.estimated_duration || 0;
        if (task.status === 'completed') {
            stats.completedDuration += task.estimated_duration || 0;
        }
    });
    
    return stats;
}

// ========== 任务时间冲突检测 ==========
function detectTaskConflicts(tasks, fixedSchedules) {
    const conflicts = [];
    
    // 将所有时间段转换为统一格式
    const timeSlots = [];
    
    // 添加固定日程
    fixedSchedules.forEach(schedule => {
        timeSlots.push({
            type: 'fixed',
            id: schedule.id,
            title: schedule.title,
            start: timeToMinutes(schedule.start_time),
            end: timeToMinutes(schedule.end_time)
        });
    });
    
    // 添加已排期任务
    tasks.filter(t => t.scheduled_start && t.scheduled_end).forEach(task => {
        timeSlots.push({
            type: 'task',
            id: task.id,
            title: task.content,
            start: timeToMinutes(extractTime(task.scheduled_start)),
            end: timeToMinutes(extractTime(task.scheduled_end))
        });
    });
    
    // 检测冲突
    for (let i = 0; i < timeSlots.length; i++) {
        for (let j = i + 1; j < timeSlots.length; j++) {
            const slotA = timeSlots[i];
            const slotB = timeSlots[j];
            
            // 检查时间是否重叠
            if (!(slotA.end <= slotB.start || slotA.start >= slotB.end)) {
                conflicts.push({
                    slot1: slotA,
                    slot2: slotB,
                    overlapStart: Math.max(slotA.start, slotB.start),
                    overlapEnd: Math.min(slotA.end, slotB.end)
                });
            }
        }
    }
    
    return conflicts;
}

// ========== 时间工具函数 ==========
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ========== 任务验证 ==========
function validateTask(task) {
    const errors = [];
    
    if (!task.content || task.content.trim() === '') {
        errors.push('任务内容不能为空');
    }
    
    if (task.content && task.content.length > 200) {
        errors.push('任务内容不能超过200个字符');
    }
    
    if (task.estimated_duration && task.estimated_duration <= 0) {
        errors.push('预计时长必须大于0');
    }
    
    if (task.estimated_duration && task.estimated_duration > 1440) {
        errors.push('预计时长不能超过24小时');
    }
    
    if (task.deadline) {
        const deadlineDate = new Date(task.deadline);
        if (isNaN(deadlineDate.getTime())) {
            errors.push('截止日期格式不正确');
        }
    }
    
    const validPriorities = ['high', 'medium', 'low'];
    if (task.priority && !validPriorities.includes(task.priority)) {
        errors.push('优先级必须是 high、medium 或 low');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ========== 任务导出 ==========
function exportTasksToJSON(tasks) {
    const data = {
        export_date: new Date().toISOString(),
        total_tasks: tasks.length,
        tasks: tasks.map(task => ({
            content: task.content,
            category: task.category,
            priority: task.priority,
            estimated_duration: task.estimated_duration,
            deadline: task.deadline,
            status: task.status,
            created_at: task.created_at,
            completed_at: task.completed_at
        }))
    };
    
    return JSON.stringify(data, null, 2);
}

function downloadTasksAsJSON(tasks) {
    const jsonStr = exportTasksToJSON(tasks);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ========== 任务导入 ==========
function importTasksFromJSON(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        
        if (!data.tasks || !Array.isArray(data.tasks)) {
            throw new Error('无效的任务数据格式');
        }
        
        const importedTasks = [];
        const errors = [];
        
        data.tasks.forEach((task, index) => {
            const validation = validateTask(task);
            if (validation.valid) {
                importedTasks.push(task);
            } else {
                errors.push({
                    index,
                    task: task.content,
                    errors: validation.errors
                });
            }
        });
        
        return {
            success: true,
            imported: importedTasks.length,
            errors: errors
        };
        
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

// ========== 任务搜索 ==========
function searchTasks(tasks, query) {
    if (!query || query.trim() === '') {
        return tasks;
    }
    
    const lowerQuery = query.toLowerCase().trim();
    
    return tasks.filter(task => {
        // 搜索任务内容
        if (task.content.toLowerCase().includes(lowerQuery)) {
            return true;
        }
        
        // 搜索分类
        if (task.category.toLowerCase().includes(lowerQuery)) {
            return true;
        }
        
        // 搜索优先级
        const priorityText = TaskPriorities[task.priority]?.label || '';
        if (priorityText.toLowerCase().includes(lowerQuery)) {
            return true;
        }
        
        return false;
    });
}

// ========== 任务批量操作 ==========
function batchCompleteT asks(taskIds) {
    return Promise.all(
        taskIds.map(id => 
            fetch(`${API_BASE}/api/tasks/${id}/complete`, {
                method: 'POST'
            })
        )
    );
}

function batchDeleteTasks(taskIds) {
    return Promise.all(
        taskIds.map(id => 
            fetch(`${API_BASE}/api/tasks/${id}`, {
                method: 'DELETE'
            })
        )
    );
}

function batchUpdateTasksPriority(taskIds, priority) {
    return Promise.all(
        taskIds.map(id => 
            fetch(`${API_BASE}/api/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ priority })
            })
        )
    );
}

// ========== 任务提醒 ==========
function checkTaskReminders(tasks) {
    const now = new Date();
    const reminders = [];
    
    tasks.forEach(task => {
        if (task.status !== 'pending') return;
        
        // 检查截止日期提醒
        if (task.deadline) {
            const deadline = new Date(task.deadline);
            const hoursUntilDeadline = (deadline - now) / (1000 * 60 * 60);
            
            // 24小时内到期
            if (hoursUntilDeadline > 0 && hoursUntilDeadline <= 24) {
                reminders.push({
                    type: 'deadline',
                    task: task,
                    message: `任务"${task.content}"将在${Math.floor(hoursUntilDeadline)}小时后到期`,
                    urgency: hoursUntilDeadline <= 3 ? 'high' : 'medium'
                });
            }
        }
        
        // 检查开始时间提醒
        if (task.scheduled_start) {
            const startTime = new Date(task.scheduled_start);
            const minutesUntilStart = (startTime - now) / (1000 * 60);
            
            // 5分钟内开始
            if (minutesUntilStart > 0 && minutesUntilStart <= 5) {
                reminders.push({
                    type: 'start',
                    task: task,
                    message: `任务"${task.content}"即将开始`,
                    urgency: 'high'
                });
            }
        }
    });
    
    return reminders;
}

// ========== 任务建议生成 ==========
function generateTaskSuggestions(tasks, currentTime) {
    const suggestions = [];
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    
    // 高优先级任务建议
    const highPriorityTasks = pendingTasks.filter(t => t.priority === 'high');
    if (highPriorityTasks.length > 0) {
        suggestions.push({
            type: 'priority',
            message: `你有 ${highPriorityTasks.length} 个高优先级任务待完成`,
            tasks: highPriorityTasks.slice(0, 3)
        });
    }
    
    // 即将到期任务建议
    const now = new Date();
    const urgentTasks = pendingTasks.filter(t => {
        if (!t.deadline) return false;
        const deadline = new Date(t.deadline);
        const hoursLeft = (deadline - now) / (1000 * 60 * 60);
        return hoursLeft > 0 && hoursLeft <= 24;
    });
    
    if (urgentTasks.length > 0) {
        suggestions.push({
            type: 'urgent',
            message: `有 ${urgentTasks.length} 个任务即将到期`,
            tasks: urgentTasks
        });
    }
    
    // 快速任务建议（时长短的任务）
    const quickTasks = pendingTasks
        .filter(t => t.estimated_duration <= 30)
        .slice(0, 3);
    
    if (quickTasks.length > 0) {
        suggestions.push({
            type: 'quick',
            message: '这些任务可以快速完成（30分钟内）',
            tasks: quickTasks
        });
    }
    
    return suggestions;
}

// ========== 暴露到全局 ==========
if (typeof window !== 'undefined') {
    window.TaskUtils = {
        parseTaskInput,
        getCategoryColor,
        getCategoryIcon,
        comparePriority,
        sortTasks,
        filterTasks,
        getTaskStatistics,
        detectTaskConflicts,
        timeToMinutes,
        minutesToTime,
        validateTask,
        exportTasksToJSON,
        downloadTasksAsJSON,
        importTasksFromJSON,
        searchTasks,
        batchCompleteTasks,
        batchDeleteTasks,
        batchUpdateTasksPriority,
        checkTaskReminders,
        generateTaskSuggestions,
        TaskCategories,
        TaskPriorities,
        TaskStatuses
    };
}