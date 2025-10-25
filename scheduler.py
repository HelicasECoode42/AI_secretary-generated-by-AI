from datetime import datetime, timedelta
from typing import List, Dict, Optional
import requests
import json

class Scheduler:
    def __init__(self, db):
        self.db = db
    
    def greedy_schedule(self, target_date: str = None) -> List[Dict]:
        """
        贪心算法自动排期
        
        Args:
            target_date: 目标日期 YYYY-MM-DD，默认今天
        
        Returns:
            排期后的任务列表
        """
        if not target_date:
            target_date = datetime.now().strftime('%Y-%m-%d')
        
        # 获取待排期任务
        all_tasks = self.db.get_all_tasks(status='pending')
        tasks = [t for t in all_tasks if not t['scheduled_start']]
        
        if not tasks:
            return []
        
        # 按优先级和截止日期排序
        priority_map = {'high': 3, 'medium': 2, 'low': 1}
        tasks.sort(key=lambda t: (
            -priority_map.get(t['priority'], 0),
            t['deadline'] if t['deadline'] else '9999-12-31'
        ))
        
        # 获取固定日程（今天的）
        fixed_schedules = self.db.get_all_fixed_schedules()
        busy_slots = self._get_busy_slots(target_date, fixed_schedules)
        
        # 获取用户偏好
        prefs = self.db.get_user_preferences()
        work_start = self._time_to_minutes(prefs['work_start_time'])
        work_end = self._time_to_minutes(prefs['work_end_time'])
        
        # 开始排期
        scheduled_tasks = []
        current_time = work_start
        
        for task in tasks:
            duration = task['estimated_duration']
            
            # 寻找下一个可用时段
            slot_start = self._find_next_available_slot(
                current_time, duration, work_end, busy_slots
            )
            
            if slot_start is None:
                continue  # 今天排不下了
            
            slot_end = slot_start + duration
            
            # 更新任务时间
            start_time = self._minutes_to_time(slot_start)
            end_time = self._minutes_to_time(slot_end)
            
            self.db.update_task(
                task['id'],
                scheduled_start=f"{target_date}T{start_time}:00",
                scheduled_end=f"{target_date}T{end_time}:00"
            )
            
            task['scheduled_start'] = f"{target_date}T{start_time}:00"
            task['scheduled_end'] = f"{target_date}T{end_time}:00"
            scheduled_tasks.append(task)
            
            # 记录已占用时段
            busy_slots.append((slot_start, slot_end))
            current_time = slot_end
        
        return scheduled_tasks
    
    def ai_optimize_schedule(self, target_date: str = None, api_key: str = None) -> Dict:
        """
        使用DeepSeek AI优化排期
        
        Args:
            target_date: 目标日期
            api_key: DeepSeek API密钥
        
        Returns:
            {'success': bool, 'message': str, 'tasks': List[Dict]}
        """
        if not target_date:
            target_date = datetime.now().strftime('%Y-%m-%d')
        
        if not api_key:
            return {
                'success': False,
                'message': '需要配置DeepSeek API密钥'
            }
        
        # 获取数据
        tasks = self.db.get_all_tasks(status='pending')
        fixed_schedules = self.db.get_all_fixed_schedules()
        prefs = self.db.get_user_preferences()
        
        # 构建prompt
        prompt = self._build_ai_prompt(target_date, tasks, fixed_schedules, prefs)
        
        try:
            # 调用DeepSeek API
            response = requests.post(
                'https://api.deepseek.com/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                },
                json={
                    'model': 'deepseek-chat',
                    'messages': [
                        {
                            'role': 'system',
                            'content': '你是一个智能日程规划助手，擅长合理安排任务时间。'
                        },
                        {
                            'role': 'user',
                            'content': prompt
                        }
                    ],
                    'temperature': 0.7
                },
                timeout=10
            )
            
            if response.status_code != 200:
                return {
                    'success': False,
                    'message': f'API调用失败: {response.status_code}'
                }
            
            result = response.json()
            ai_response = result['choices'][0]['message']['content']
            
            # 解析AI返回的JSON
            schedule_data = json.loads(ai_response)
            
            # 更新数据库
            for task_schedule in schedule_data.get('tasks', []):
                task_id = task_schedule['id']
                self.db.update_task(
                    task_id,
                    scheduled_start=task_schedule['scheduled_start'],
                    scheduled_end=task_schedule['scheduled_end']
                )
            
            return {
                'success': True,
                'message': 'AI优化完成',
                'tasks': schedule_data.get('tasks', [])
            }
        
        except Exception as e:
            return {
                'success': False,
                'message': f'AI优化失败: {str(e)}'
            }
    
    def _get_busy_slots(self, target_date: str, fixed_schedules: List[Dict]) -> List[tuple]:
        """获取已占用时段（分钟单位）"""
        busy = []
        weekday = datetime.strptime(target_date, '%Y-%m-%d').weekday()
        
        for schedule in fixed_schedules:
            if schedule['day_of_week'] == weekday:
                start = self._time_to_minutes(schedule['start_time'])
                end = self._time_to_minutes(schedule['end_time'])
                busy.append((start, end))
        
        return sorted(busy)
    
    def _find_next_available_slot(self, start_time: int, duration: int, 
                                   end_limit: int, busy_slots: List[tuple]) -> Optional[int]:
        """寻找下一个可用时段"""
        current = start_time
        
        while current + duration <= end_limit:
            # 检查是否与busy_slots冲突
            conflict = False
            for busy_start, busy_end in busy_slots:
                if not (current + duration <= busy_start or current >= busy_end):
                    conflict = True
                    current = busy_end  # 跳到忙碌时段后
                    break
            
            if not conflict:
                return current
        
        return None
    
    def _time_to_minutes(self, time_str: str) -> int:
        """时间字符串转分钟数 '09:30' -> 570"""
        h, m = map(int, time_str.split(':'))
        return h * 60 + m
    
    def _minutes_to_time(self, minutes: int) -> str:
        """分钟数转时间字符串 570 -> '09:30'"""
        h = minutes // 60
        m = minutes % 60
        return f"{h:02d}:{m:02d}"
    
    def _build_ai_prompt(self, target_date: str, tasks: List[Dict], 
                        fixed_schedules: List[Dict], prefs: Dict) -> str:
        """构建AI排期的prompt"""
        prompt = f"""
请为以下任务安排{target_date}的日程。

**固定日程（不可占用）：**
"""
        weekday = datetime.strptime(target_date, '%Y-%m-%d').weekday()
        for schedule in fixed_schedules:
            if schedule['day_of_week'] == weekday:
                prompt += f"- {schedule['start_time']}-{schedule['end_time']}: {schedule['title']}\n"
        
        prompt += f"""
**可工作时间：** {prefs['work_start_time']}-{prefs['work_end_time']}

**待安排任务：**
"""
        for task in tasks:
            prompt += f"- ID:{task['id']} | {task['content']} | 优先级:{task['priority']} | 预计时长:{task['estimated_duration']}分钟"
            if task['deadline']:
                prompt += f" | 截止:{task['deadline']}"
            prompt += "\n"
        
        prompt += """
**排期规则：**
1. 高优先级任务优先
2. 尊重截止日期
3. 避开固定日程
4. 相同分类任务尽量连续

请以JSON格式返回：
{
  "tasks": [
    {
      "id": 1,
      "scheduled_start": "2025-10-24T09:00:00",
      "scheduled_end": "2025-10-24T11:00:00"
    }
  ]
}
"""
        return prompt