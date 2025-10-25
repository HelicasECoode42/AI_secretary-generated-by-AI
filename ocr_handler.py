import pytesseract
from PIL import Image
import re
from typing import List, Dict

class OCRHandler:
    def __init__(self):
        # 尝试设置Tesseract路径（Windows用户需要）
        try:
            pytesseract.get_tesseract_version()
        except:
            # Windows默认安装路径
            pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
   
    def recognize_schedule_image(self, image_path: str) -> Dict:
        """
        识别课表图片
        
        Args:
            image_path: 图片路径
        
        Returns:
            {
                'success': bool,
                'message': str,
                'raw_text': str,  # 原始识别文本
                'schedules': List[Dict]  # 解析出的课表列表
            }
        """
        try:
            # 打开图片
            image = Image.open(image_path)
            
            # 🔧 修复：支持中英文混合识别
            # 修改前：text = pytesseract.image_to_string(image, lang='chi_sim+eng')
            # 修改后：先尝试中英文，失败则降级到仅英文
            try:
                text = pytesseract.image_to_string(image, lang='chi_sim+eng')
            except Exception as lang_error:
                print(f"中文识别失败，尝试仅英文识别: {lang_error}")
                text = pytesseract.image_to_string(image, lang='eng')
            
            if not text.strip():
                return {
                    'success': False,
                    'message': '未能识别出文字，请确保图片清晰且包含文字内容',
                    'raw_text': '',
                    'schedules': []
                }
            
            # 解析课表文本
            schedules = self._parse_schedule_text(text)
            
            return {
                'success': True,
                'message': f'识别成功！共解析出 {len(schedules)} 条课程',
                'raw_text': text,  # 返回原始文本供用户校对
                'schedules': schedules
            }
        
        except FileNotFoundError:
            return {
                'success': False,
                'message': '图片文件不存在',
                'raw_text': '',
                'schedules': []
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'识别失败: {str(e)}',
                'raw_text': '',
                'schedules': []
            }
   
    def _parse_schedule_text(self, text: str) -> List[Dict]:
        """
        解析OCR识别的课表文本
        
        规则：
        - 匹配时间格式：08:00-09:30 或 8:00-9:30
        - 课程名通常在时间后面
        - 识别星期信息
        """
        schedules = []
        lines = text.split('\n')
        
        # 🔧 修复：更宽松的时间正则（支持中文分隔符）
        # 匹配：8:00-9:30、08:00～09:30、8点-9点30分
        time_pattern = r'(\d{1,2})[:\.](\d{2})\s*[-~～至]\s*(\d{1,2})[:\.](\d{2})'
        
        # 🔧 修复：更全面的星期映射
        weekday_map = {
            '周一': 1, '星期一': 1, '礼拜一': 1, 'Monday': 1, 'Mon': 1,
            '周二': 2, '星期二': 2, '礼拜二': 2, 'Tuesday': 2, 'Tue': 2,
            '周三': 3, '星期三': 3, '礼拜三': 3, 'Wednesday': 3, 'Wed': 3,
            '周四': 4, '星期四': 4, '礼拜四': 4, 'Thursday': 4, 'Thu': 4,
            '周五': 5, '星期五': 5, '礼拜五': 5, 'Friday': 5, 'Fri': 5,
            '周六': 6, '星期六': 6, '礼拜六': 6, 'Saturday': 6, 'Sat': 6,
            '周日': 0, '周天': 0, '星期日': 0, '星期天': 0, '礼拜日': 0, 'Sunday': 0, 'Sun': 0
        }
        
        current_weekday = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # 检测星期信息
            for key, value in weekday_map.items():
                if key in line:
                    current_weekday = value
                    break
            
            # 匹配时间
            time_match = re.search(time_pattern, line)
            if time_match:
                start_h, start_m, end_h, end_m = time_match.groups()
                start_time = f"{int(start_h):02d}:{start_m}"
                end_time = f"{int(end_h):02d}:{end_m}"
                
                # 提取课程名（时间后面的文字）
                course_name = line[time_match.end():].strip()
                # 清理特殊字符但保留中文
                course_name = re.sub(r'[^\w\s\u4e00-\u9fa5]', '', course_name)
                
                # 🔧 修复：如果未识别到星期，尝试从前文查找
                if current_weekday is None:
                    for prev_line in lines[:lines.index(line)]:
                        for key, value in weekday_map.items():
                            if key in prev_line:
                                current_weekday = value
                                break
                        if current_weekday is not None:
                            break
                
                if course_name and current_weekday is not None:
                    schedules.append({
                        'title': course_name,
                        'day_of_week': current_weekday,
                        'start_time': start_time,
                        'end_time': end_time,
                        'recurrence': 'weekly',
                        'source': 'ocr'
                    })
        
        return schedules
   
    def parse_web_schedule(self, html_content: str) -> Dict:
        """
        解析网页课表（预留接口）
        
        实际使用时可以结合BeautifulSoup + AI解析
        """
        return {
            'success': False,
            'message': '网页解析功能将在 Phase 2 实现',
            'schedules': []
        }