(function () {
  // Same-origin path, proxied by backend to avoid CORS
  const API_PATH = '/api/chat/completions';
  const MODEL = 'qwen3-vl-plus';

  /**
   * 为 API 调用做二次压缩，控制图片在 640px 宽、quality 0.6
   * 将 base64 体积控制在 100KB 以内，避免 API 超时
   */
  function compressImageForApi(imageSource, maxWidth, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((maxWidth / w) * h);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        // 压缩失败，返回原始图片
        resolve(imageSource.startsWith('data:') ? imageSource : `data:image/jpeg;base64,${imageSource}`);
      };
      img.src = imageSource;
    });
  }

  const ANALYZE_PROMPT = `你是一位小学教育专家。请分析这张作业错题图片，提取图片中所有题目信息，返回JSON数组格式（不要其他任何文字）：

[
  {
    "subject": "math|chinese|english|other（根据题目内容判断科目）",
    "knowledgePoint": "知识点名称，如：分数加减法、古诗默写",
    "question": "题目完整文本",
    "wrongAnswer": "孩子写的答案（如果图片中能看到）",
    "correctAnswer": "正确答案",
    "errorType": "calculation|concept|careless|understand|knowledge|other（判断错误类型）"
  }
]

要求：
1. 返回JSON数组，即使只有一道题也要用数组包裹 [ {...} ]
2. 如果图片中有多道题目，每道题作为数组的一个元素
3. 如果某个字段无法从图片中识别，留空字符串
4. 科目和错误类型必须从给定的枚举值中选择
5. 知识点要具体明确
6. 不要用markdown代码框包裹`;

  const GRADE_PROMPT = `你是一位小学教师。请分析这张学生做完的试卷图片，识别每道题的对错标记（老师打勾√或打叉×）。

按题目顺序返回JSON数组（不要其他任何文字）：
[
  {"questionIndex": 1, "isCorrect": true, "studentAnswer": "学生写的答案"},
  {"questionIndex": 2, "isCorrect": false, "studentAnswer": "学生写的答案"}
]

要求：
1. 只返回JSON数组，不要用markdown代码框
2. questionIndex 从1开始，按题目在卷子中的序号
3. isCorrect 根据 √/× 或批改标记判断
4. studentAnswer 填写学生手写的答案，如果能看到
5. 如果某题无法判断对错，isCorrect 设为 null`;

  const SIMILAR_PROMPT = `你是一位小学教育专家。请根据以下错题信息，生成3道同知识点、同难度的变式练习题（举一反三）。

【科目】{SUBJECT}
【知识点】{KNOWLEDGE_POINT}
【原题目】{QUESTION}
【孩子错误答案】{WRONG_ANSWER}
【错误类型】{ERROR_TYPE}
【正确答案】{CORRECT_ANSWER}

返回JSON数组格式（不要其他任何文字）：
[
  {
    "question": "变式题完整文本",
    "answer": "正确答案",
    "hint": "解题思路提示（针对孩子的错误类型）"
  }
]

要求：
1. 只返回JSON数组，不要用markdown代码框
2. 必须生成3道题
3. 题目要与原题不同，但考查同一知识点
4. 难度相当，适合小学生
5. 解题思路提示要针对孩子的错误类型给出提醒
6. 题目要完整可作答`;

    const DEFAULT_API_KEY = 'sk-2a643b19a157474b937c594ed7f0d97c';

  /**
   * 基于题目上下文向AI提问，获取讲解
   */
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

      // 二次压缩：缩小尺寸+降低质量，避免 API 超时
      const compressedBase64 = await compressImageForApi(imageBase64, 640, 0.6);

      const response = await fetch(API_PATH, {
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
                { type: 'image_url', image_url: { url: compressedBase64 } },
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
      const results = JSON.parse(jsonStr);

      // Normalize: ensure it's always an array of objects
      const items = Array.isArray(results) ? results : [results];

      return items.map(item => ({
        subject: item.subject || 'other',
        knowledgePoint: item.knowledgePoint || '',
        question: item.question || '',
        wrongAnswer: item.wrongAnswer || '',
        correctAnswer: item.correctAnswer || '',
        errorType: item.errorType || 'other',
      }));
    },

    async askQuestion(questionItem, userMessage, chatHistory) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('未配置API Key');

      // Build system context from question item
      const subjectLabel = { math: '数学', chinese: '语文', english: '英语', other: '其他' }[questionItem.subject] || '其他';
      const errorTypeLabel = { calculation: '计算错误', concept: '概念不清', careless: '粗心大意', understand: '理解偏差', knowledge: '知识盲点', other: '其他' }[questionItem.errorType] || '其他';

      const systemPrompt = `你是一位耐心的小学教师。孩子正在学习${subjectLabel}，遇到以下错题：

- 知识点：${questionItem.knowledgePoint || '未指定'}
- 题目：${questionItem.question || '未提供'}
- 孩子的答案：${questionItem.wrongAnswer || '未作答'}
- 正确答案：${questionItem.correctAnswer || '未提供'}
- 错误类型：${errorTypeLabel}

请用通俗易懂的方式讲解，帮助孩子理解。回答要适合小学生，多用生活化的例子。不要直接给出答案，引导孩子自己思考。`;

      // Build messages with chat history
      const messages = [{ role: 'system', content: systemPrompt }];
      if (chatHistory && chatHistory.length > 0) {
        messages.push(...chatHistory.slice(-10)); // Keep last 10 messages
      }
      messages.push({ role: 'user', content: [{ type: 'text', text: userMessage }] });

      const response = await fetch(API_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API请求失败: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('模型返回内容为空');
      return text;
    },

    async gradePaper(imageBase64) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('未配置API Key');

      const compressedBase64 = await compressImageForApi(imageBase64, 800, 0.7);

      const response = await fetch(API_PATH, {
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
                { type: 'image_url', image_url: { url: compressedBase64 } },
                { type: 'text', text: GRADE_PROMPT },
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

      let jsonStr = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
      const results = JSON.parse(jsonStr);

      return Array.isArray(results) ? results : [results];
    },

    async generateSimilarQuestions(questionItem) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('未配置API Key');

      const prompt = SIMILAR_PROMPT
        .replace('{SUBJECT}', questionItem.subject || 'math')
        .replace('{KNOWLEDGE_POINT}', questionItem.knowledgePoint || '未指定')
        .replace('{QUESTION}', questionItem.question || '')
        .replace('{WRONG_ANSWER}', questionItem.wrongAnswer || '未作答')
        .replace('{ERROR_TYPE}', questionItem.errorType || 'other')
        .replace('{CORRECT_ANSWER}', questionItem.correctAnswer || '未提供');

      const response = await fetch(API_PATH, {
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
              content: prompt,
            },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API请求失败: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();

      if (!text) throw new Error('模型返回内容为空');

      let jsonStr = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
      const results = JSON.parse(jsonStr);

      return (Array.isArray(results) ? results : [results]).map(item => ({
        question: item.question || '',
        answer: item.answer || '',
        hint: item.hint || '',
      }));
    },
  };
})();
