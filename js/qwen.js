(function () {
  const DASHSCOPE_URL = 'https://coding.dashscope.aliyuncs.com/v1/chat/completions';
  const MODEL = 'qwen3.6-plus';

  const ANALYZE_PROMPT = `你是一位小学教育专家。请分析这张作业错题图片，提取以下信息并返回纯JSON格式（不要其他任何文字）：

{
  "subject": "math|chinese|english|other（根据题目内容判断科目）",
  "knowledgePoint": "知识点名称，如：分数加减法、古诗默写",
  "question": "题目完整文本",
  "wrongAnswer": "孩子写的答案（如果图片中能看到）",
  "correctAnswer": "正确答案",
  "errorType": "calculation|concept|careless|understand|knowledge|other（判断错误类型）"
}

要求：
1. 只返回JSON，不要用markdown代码框包裹
2. 如果某个字段无法从图片中识别，留空字符串
3. 科目和错误类型必须从给定的枚举值中选择
4. 知识点要具体明确`;

const DEFAULT_API_KEY = 'sk-sp-09c9278443f74017a7bd6b0c6455a19b';

  window.QwenAI = {
    getApiKey() {
      return localStorage.getItem('dashscope_api_key') || DEFAULT_API_KEY;
    },

    setApiKey(key) {
      localStorage.setItem('dashscope_api_key', key.trim());
    },

    hasApiKey() {
      return this.getApiKey().length > 0;
    },

    async analyzeImage(imageBase64) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('未配置API Key');

      const fullBase64 = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

      const response = await fetch(DASHSCOPE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: fullBase64 } },
                { type: 'text', text: ANALYZE_PROMPT },
              ],
            },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API请求失败: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();

      if (!text) throw new Error('模型返回内容为空');

      // Parse JSON (may have markdown code fences)
      let jsonStr = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
      const result = JSON.parse(jsonStr);

      return {
        subject: result.subject || 'other',
        knowledgePoint: result.knowledgePoint || '',
        question: result.question || '',
        wrongAnswer: result.wrongAnswer || '',
        correctAnswer: result.correctAnswer || '',
        errorType: result.errorType || 'other',
      };
    },
  };
})();
