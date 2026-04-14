const SUBJECT_LABELS = {
  math: '数学',
  chinese: '语文',
  english: '英语',
  other: '其他',
};

const ERROR_TYPE_LABELS = {
  calculation: '计算错误',
  concept: '概念不清',
  careless: '粗心大意',
  understand: '理解偏差',
  knowledge: '知识盲点',
  other: '其他',
};

// State
let currentView = 'list';
let currentQuestionId = null;
let currentImage = null;
let voiceControl = null;
let filters = { subject: 'all', search: '', showMastered: false };

// Paper state
let paperQuestions = [];
let paperConfig = { subject: 'all', count: 10, sortOrder: 'random' };

// Grade state
let gradeImage = null;

// DOM refs
const $ = (s) => document.querySelector(s);
const views = {
  list: $('#view-list'),
  add: $('#view-add'),
  detail: $('#view-detail'),
  paperConfig: $('#view-paper-config'),
  paper: $('#view-paper'),
  grade: $('#view-grade'),
  stats: $('#view-stats'),
  game: $('#view-game'),
};
const title = $('#page-title');
const backBtn = $('#btn-back');
const fab = $('#btn-add');
const tabBar = document.querySelector('.tab-bar');

// Navigation
function showView(name) {
  currentView = name;
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
  const isMainView = name === 'list' || name === 'paperConfig' || name === 'stats' || name === 'game';
  backBtn.classList.toggle('hidden', isMainView);
  fab.classList.toggle('hidden', name !== 'list');
  tabBar.classList.toggle('hidden', !isMainView);
}

function goBack() {
  if (currentView === 'detail') {
    title.textContent = '错题本';
    showView('list');
    renderList();
  } else if (currentView === 'add') {
    showView('list');
    resetForm();
    renderList();
  } else if (currentView === 'paper') {
    title.textContent = '组卷';
    showView('paperConfig');
  } else if (currentView === 'grade') {
    title.textContent = '组卷';
    showView('paper');
  } else if (currentView === 'game') {
    title.textContent = '错题本';
    showView('list');
    renderList();
  }
}

// Tab bar navigation
document.querySelectorAll('.tab-item').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-item').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    if (view === 'list') {
      title.textContent = '错题本';
      showView('list');
      renderList();
    } else if (view === 'paper-config') {
      title.textContent = '组卷';
      showPaperConfig();
    } else if (view === 'game') {
      title.textContent = '错题闯关';
      startGame(filters.subject);
    } else if (view === 'stats') {
      title.textContent = '学习分析';
      showStats();
    }
  });
});

backBtn.addEventListener('click', goBack);

// ==================== LIST VIEW ====================

async function renderList() {
  const list = $('#question-list');
  const items = await getAllQuestions(filters);

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-state">暂无错题记录</p>';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
    <article class="question-card" data-id="${item.id}">
      <div class="card-content">
        <div class="card-header">
          <span class="subject-tag subject-${item.subject}">${SUBJECT_LABELS[item.subject]}</span>
          ${item.mastered ? '<span class="mastered-tag">已掌握</span>' : ''}
        </div>
        <p class="card-question">${escapeHtml(truncate(item.question, 80))}</p>
        <time class="card-date">${formatDate(item.createdAt)}</time>
      </div>
    </article>`
    )
    .join('');

  list.querySelectorAll('.question-card').forEach((card) => {
    card.addEventListener('click', () => showDetail(+card.dataset.id));
  });
}

function showDetail(id) {
  currentQuestionId = id;
  title.textContent = '错题详情';
  showView('detail');
  getQuestion(id).then(renderDetail).catch((err) => {
    alert('加载错题详情失败：' + err.message);
    goBack();
  });
}

async function renderDetail(item) {
  if (!item) return;
  const content = $('#detail-content');
  content.innerHTML = `
    <div class="detail-card">
      ${item.knowledgePoint ? `<div class="detail-field"><span class="field-label">知识点</span><p>${escapeHtml(item.knowledgePoint)}</p></div>` : ''}
      ${item.errorType ? `<div class="detail-field"><span class="field-label">错误类型</span><p>${ERROR_TYPE_LABELS[item.errorType] || item.errorType}</p></div>` : ''}
      <div class="detail-field">
        <span class="field-label">科目</span>
        <span class="subject-tag subject-${item.subject}">${SUBJECT_LABELS[item.subject]}</span>
      </div>
      <div class="detail-field">
        <span class="field-label">题目</span>
        <p>${escapeHtml(item.question)}</p>
      </div>
      <div class="detail-field">
        <span class="field-label">孩子的答案</span>
        <p class="wrong-answer">${escapeHtml(item.wrongAnswer) || '未填写'}</p>
      </div>
      <div class="detail-field">
        <span class="field-label">正确答案</span>
        <p class="correct-answer">${escapeHtml(item.correctAnswer) || '未填写'}</p>
      </div>
      ${item.note ? `<div class="detail-field"><span class="field-label">备注</span><p>${escapeHtml(item.note)}</p></div>` : ''}
      ${item.attempts > 0 ? `<div class="detail-field"><span class="field-label">练习记录</span><p>尝试 ${item.attempts} 次，${item.lastResult === 'correct' ? '上次正确' : '上次错误'}</p></div>` : ''}
      <time class="detail-date">添加于 ${formatDate(item.createdAt)}</time>
    </div>
  `;

  const toggleBtn = $('#btn-toggle-master');
  toggleBtn.textContent = item.mastered ? '取消已掌握' : '标记已掌握';

  // Initialize QA panel
  initQASection(item);
}

// ==================== ADD / EDIT VIEW ====================

let isEditing = false;

function showAdd() {
  isEditing = false;
  currentQuestionId = null;
  resetForm();
  title.textContent = '添加错题';
  showView('add');
}

function showEdit(id) {
  isEditing = true;
  currentQuestionId = id;
  getQuestion(id).then((item) => {
    if (!item) return;
    title.textContent = '编辑错题';
    $('#form-subject').value = item.subject;
    $('#form-knowledge-point').value = item.knowledgePoint || '';
    $('#form-error-type').value = item.errorType || 'other';
    $('#form-question').value = item.question;
    $('#form-wrong').value = item.wrongAnswer;
    $('#form-correct').value = item.correctAnswer;
    $('#form-note').value = item.note;
    if (item.questionImage) {
      currentImage = item.questionImage;
      const preview = $('#image-preview');
      preview.src = item.questionImage;
      preview.classList.remove('hidden');
    }
    // Show form fields for editing
    $('#form-fields').classList.remove('hidden');
    $('#btn-save').classList.remove('hidden');
    showView('add');
  });
}

function resetForm() {
  $('#question-form').reset();
  currentImage = null;
  clearImage();
  $('#btn-analyze').classList.add('hidden');
  $('#analyze-status').classList.add('hidden');
  $('#form-fields').classList.add('hidden');
  $('#btn-save').classList.add('hidden');
  title.textContent = '错题本';
  isEditing = false;
}

// Form submit
  $('#question-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      subject: $('#form-subject').value,
      knowledgePoint: $('#form-knowledge-point').value.trim(),
      errorType: $('#form-error-type').value,
      question: $('#form-question').value.trim(),
      questionImage: currentImage,
      wrongAnswer: $('#form-wrong').value.trim(),
      correctAnswer: $('#form-correct').value.trim(),
      note: $('#form-note').value.trim(),
    };

    try {
      if (isEditing) {
        await updateQuestion(currentQuestionId, data);
      } else {
        await addQuestion(data);
      }
      isEditing = false;
      showView('list');
      renderList();
    } catch (err) {
      alert('保存失败：' + err.message);
    }
  });

// ==================== MULTI-QUESTION SELECTION ====================

let pendingQuestions = [];

function showQuestionSelection(items) {
  pendingQuestions = items;
  const modal = $('#selection-modal');
  const list = $('#selection-list');

  list.innerHTML = items.map((item, i) => `
    <div class="selection-item" data-index="${i}">
      <div class="selection-check">&#9744;</div>
      <div class="selection-content">
        <span class="subject-tag subject-${item.subject}">${SUBJECT_LABELS[item.subject]}</span>
        <p class="selection-question">${escapeHtml(truncate(item.question, 60)) || '（未识别到题目文本）'}</p>
        ${item.knowledgePoint ? `<span class="selection-kp">${escapeHtml(item.knowledgePoint)}</span>` : ''}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.selection-item').forEach((el) => {
    el.addEventListener('click', () => {
      el.classList.toggle('selected');
      const check = el.querySelector('.selection-check');
      check.textContent = el.classList.contains('selected') ? '\u2611' : '\u2610';
    });
    el.classList.add('selected');
    el.querySelector('.selection-check').textContent = '\u2611';
  });

  modal.classList.remove('hidden');
}

function hideQuestionSelection() {
  $('#selection-modal').classList.add('hidden');
  pendingQuestions = [];
}

$('#btn-select-cancel').addEventListener('click', () => {
  hideQuestionSelection();
});

$('#btn-select-add').addEventListener('click', async () => {
  const selected = [];
  document.querySelectorAll('#selection-list .selection-item.selected').forEach((el) => {
    selected.push(pendingQuestions[+el.dataset.index]);
  });

  hideQuestionSelection();

  if (selected.length === 0) return;

  if (selected.length === 1) {
    const item = selected[0];
    fillFormFromResult(item);
    showFormFields();

    const status = $('#analyze-status');
    status.className = 'analyze-status success';
    status.textContent = '识别成功！已填充字段，请确认后保存';
    status.classList.remove('hidden');
  } else {
    let saved = 0;
    for (const item of selected) {
      try {
        await addQuestion({
          subject: item.subject,
          knowledgePoint: item.knowledgePoint,
          errorType: item.errorType,
          question: item.question,
          questionImage: currentImage,
          wrongAnswer: item.wrongAnswer,
          correctAnswer: item.correctAnswer,
          note: '',
        });
        saved++;
      } catch (e) { /* skip */ }
    }
    const status = $('#analyze-status');
    status.className = 'analyze-status success';
    status.textContent = `已添加 ${saved}/${selected.length} 道错题`;
    status.classList.remove('hidden');
    showView('list');
    renderList();
  }
});

// ==================== DETAIL ACTIONS ====================

$('#btn-edit').addEventListener('click', () => showEdit(currentQuestionId));

$('#btn-delete').addEventListener('click', async () => {
  if (confirm('确定删除这道错题吗？')) {
    await deleteQuestion(currentQuestionId);
    currentQuestionId = null;
    showView('list');
    renderList();
  }
});

$('#btn-toggle-master').addEventListener('click', async () => {
  await toggleMastered(currentQuestionId);
  showDetail(currentQuestionId);
});

// ==================== SIMILAR QUESTIONS (举一反三) ====================

let similarQuestions = [];

$('#btn-similar').addEventListener('click', () => {
  showSimilarQuestions(currentQuestionId);
});

$('#btn-similar-close').addEventListener('click', () => {
  $('#similar-modal').classList.add('hidden');
});

$('#similar-modal').addEventListener('click', (e) => {
  if (e.target === $('#similar-modal')) $('#similar-modal').classList.add('hidden');
});

async function showSimilarQuestions(id) {
  const item = await getQuestion(id);
  if (!item) return;

  const modal = $('#similar-modal');
  const status = $('#similar-status');
  const list = $('#similar-list');
  const printBtn = $('#btn-similar-print');

  modal.classList.remove('hidden');
  printBtn.classList.add('hidden');
  status.className = 'analyze-status loading';
  status.textContent = '正在生成变式题，请稍候...';
  status.classList.remove('hidden');
  list.innerHTML = '';
  similarQuestions = [];

  try {
    // Step 1: Find similar questions from DB (same knowledge point, unmastered)
    const all = await getAllQuestions({ showMastered: true });
    const dbSimilar = all
      .filter((q) => q.id !== id && q.knowledgePoint && q.knowledgePoint === item.knowledgePoint)
      .slice(0, 3);

    // Step 2: If not enough, generate with AI
    let aiQuestions = [];
    if (dbSimilar.length < 3 && QwenAI.hasApiKey() && item.question) {
      try {
        aiQuestions = await QwenAI.generateSimilarQuestions(item);
      } catch (e) {
        // AI failed, continue with what we have
      }
    }

    // Combine: DB first, then AI
    const combined = [];
    dbSimilar.forEach((q, i) => {
      combined.push({
        index: i + 1,
        question: q.question,
        answer: q.correctAnswer || '',
        hint: `同知识点错题：${q.errorType ? ERROR_TYPE_LABELS[q.errorType] || q.errorType : '未分类'}`,
        source: 'db',
        dbId: q.id,
      });
    });
    aiQuestions.forEach((q, i) => {
      combined.push({
        index: dbSimilar.length + i + 1,
        question: q.question,
        answer: q.answer,
        hint: q.hint,
        source: 'ai',
        dbId: null,
      });
    });

    similarQuestions = combined;

    if (combined.length === 0) {
      status.className = 'analyze-status error';
      status.textContent = '暂无同知识点题目，AI生成也失败了';
      return;
    }

    status.className = 'analyze-status success';
    status.textContent = `找到 ${combined.length} 道同类型题目`;

    list.innerHTML = combined.map((q, i) => `
      <div class="similar-item" data-index="${i}">
        <div class="similar-item-header">
          <span class="similar-item-index">变式题 ${i + 1}</span>
          <span class="similar-item-source ${q.source === 'db' ? 'source-db' : 'source-ai'}">${q.source === 'db' ? '原题' : 'AI生成'}</span>
        </div>
        <div class="similar-item-question">${escapeHtml(q.question)}</div>
        <div class="similar-item-hint">${q.hint ? '💡 ' + escapeHtml(q.hint) : ''}</div>
        <div class="similar-item-answer hidden">
          <strong>正确答案：</strong>${escapeHtml(q.answer)}
        </div>
        <button class="btn-show-answer btn-secondary" data-index="${i}">查看答案</button>
      </div>
    `).join('');

    // Show answer buttons
    list.querySelectorAll('.btn-show-answer').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.index;
        const answerEl = list.querySelector(`.similar-item[data-index="${idx}"] .similar-item-answer`);
        answerEl.classList.toggle('hidden');
        btn.textContent = answerEl.classList.contains('hidden') ? '查看答案' : '隐藏答案';
      });
    });

    // Show print button if we have questions
    if (combined.length > 0) {
      printBtn.classList.remove('hidden');
    }
  } catch (err) {
    status.className = 'analyze-status error';
    status.textContent = '生成失败：' + err.message;
  }
}

$('#btn-similar-print').addEventListener('click', () => {
  if (similarQuestions.length === 0) return;

  const printWindow = window.open('', '_blank');
  let html = '<div class="print-header"><h2>举一反三 — 变式练习</h2><p>共 ' + similarQuestions.length + ' 题 | ' + new Date().toLocaleDateString('zh-CN') + '</p></div>';
  html += '<div class="print-questions">';
  similarQuestions.forEach((q, i) => {
    html += `
      <div class="print-item">
        <div class="print-item-title">${i + 1}. ${escapeHtml(q.question)}</div>
        <div class="print-answer-space"></div>
      </div>`;
  });
  html += '</div>';

  // Answers
  html += '<div class="print-answers"><h3>参考答案</h3>';
  similarQuestions.forEach((q, i) => {
    html += `<div class="print-answer-item"><strong>${i + 1}.</strong> ${escapeHtml(q.answer)}</div>`;
  });
  html += '</div>';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><title>举一反三练习</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: "Microsoft YaHei", sans-serif; padding: 20mm; font-size: 14px; line-height: 1.8; color: #000; }
      .print-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 12px; }
      .print-header h2 { font-size: 20px; margin-bottom: 4px; }
      .print-header p { font-size: 13px; color: #666; }
      .print-questions { margin-bottom: 30px; }
      .print-item { margin-bottom: 24px; page-break-inside: avoid; }
      .print-item-title { font-size: 15px; margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; }
      .print-answer-space { min-height: 60px; border-bottom: 1px dashed #ccc; margin-top: 8px; }
      .print-answers { page-break-before: always; border-top: 2px solid #000; padding-top: 16px; }
      .print-answers h3 { margin-bottom: 12px; font-size: 16px; }
      .print-answer-item { margin-bottom: 8px; font-size: 13px; line-height: 1.6; }
      @media print { body { padding: 0; } .print-answer-space { min-height: 80px; } }
    </style></head><body>
    ${html}
    <script>window.onload = function() { window.print(); };<\/script>
    </body></html>
  `);
  printWindow.document.close();
});

// ==================== QA PANEL (AI提问) ====================

let qaChatHistory = [];
let qaCurrentItem = null;

function initQASection(item) {
  qaCurrentItem = item;
  qaChatHistory = [];
  $('#qa-chat').innerHTML = '<p class="qa-empty-hint">展开面板，向AI提问获取讲解</p>';
  $('#qa-body').classList.add('hidden');
  $('#qa-panel').classList.remove('hidden');
}

$('#btn-qa-toggle').addEventListener('click', () => {
  const body = $('#qa-body');
  body.classList.toggle('hidden');
});

$('#btn-qa-send').addEventListener('click', sendQuestion);
$('#qa-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendQuestion();
  }
});

async function sendQuestion() {
  const input = $('#qa-input');
  const message = input.value.trim();
  if (!message) return;
  if (!qaCurrentItem) return;
  if (!QwenAI.hasApiKey()) {
    alert('请先在设置中配置 DashScope API Key');
    openSettingsModal();
    return;
  }

  // Remove empty hint
  const hint = $('#qa-chat .qa-empty-hint');
  if (hint) hint.remove();

  // Append user message
  appendQAMessage(message, 'user');
  qaChatHistory.push({ role: 'user', content: message });
  input.value = '';

  // Show loading
  const loadingId = 'qa-loading-' + Date.now();
  const loadingEl = document.createElement('div');
  loadingEl.className = 'qa-message qa-message-ai';
  loadingEl.id = loadingId;
  loadingEl.textContent = '思考中...';
  $('#qa-chat').appendChild(loadingEl);
  scrollQAChat();

  const sendBtn = $('#btn-qa-send');
  sendBtn.disabled = true;

  try {
    const reply = await QwenAI.askQuestion(qaCurrentItem, message, qaChatHistory);
    const loading = document.getElementById(loadingId);
    if (loading) loading.remove();

    appendQAMessage(reply, 'ai');
    qaChatHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    const loading = document.getElementById(loadingId);
    if (loading) {
      loading.textContent = '回答失败：' + err.message;
      loading.classList.add('qa-error');
    }
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function appendQAMessage(text, type) {
  const el = document.createElement('div');
  el.className = `qa-message qa-message-${type}`;
  el.textContent = text;
  $('#qa-chat').appendChild(el);
  scrollQAChat();
}

function scrollQAChat() {
  const chat = $('#qa-chat');
  chat.scrollTop = chat.scrollHeight;
}

// ==================== KNOWLEDGE HEATMAP ====================

function renderKnowledgeHeatmap(items) {
  // Group by knowledge point
  const kpMap = {};
  items.forEach((item) => {
    const kp = item.knowledgePoint || '(未分类)';
    if (!kpMap[kp]) kpMap[kp] = { total: 0, mastered: 0, subject: item.subject };
    kpMap[kp].total++;
    if (item.mastered) kpMap[kp].mastered++;
  });

  // Group by subject
  const bySubject = {};
  Object.entries(kpMap).forEach(([name, data]) => {
    const subj = data.subject || 'other';
    if (!bySubject[subj]) bySubject[subj] = [];
    bySubject[subj].push({ name, ...data });
  });

  // Sort within each subject by error count desc
  Object.values(bySubject).forEach((arr) => arr.sort((a, b) => (b.total - b.mastered) - (a.total - a.mastered)));

  let html = '<div class="heatmap-section"><h3>&#128302; 知识图谱 · 掌握度热力图</h3>';

  const subjectOrder = ['math', 'chinese', 'english', 'other'];
  subjectOrder.forEach((subj) => {
    if (!bySubject[subj]) return;
    html += `<div class="heatmap-subject-header">${SUBJECT_LABELS[subj] || '其他'}</div>`;
    html += '<div class="heatmap-grid">';
    bySubject[subj].forEach((kp) => {
      const rate = kp.total > 0 ? Math.round((kp.mastered / kp.total) * 100) : 0;
      const unmastered = kp.total - kp.mastered;
      // Color: green >= 80%, yellow 50-80%, red < 50%
      let bg;
      if (rate >= 80) bg = 'linear-gradient(135deg, #22c55e, #16a34a)';
      else if (rate >= 50) bg = 'linear-gradient(135deg, #f59e0b, #d97706)';
      else bg = 'linear-gradient(135deg, #ef4444, #dc2626)';

      html += `
        <div class="heatmap-card" style="background:${bg}" data-kp="${escapeHtml(kp.name)}" data-subj="${subj}">
          <div class="heatmap-card-name">${escapeHtml(kp.name)}</div>
          <div class="heatmap-card-stats">${rate}% 掌握 · ${unmastered}题未掌握</div>
        </div>`;
    });
    html += '</div>';
  });

  html += '</div>';

  // Insert before the stats section content, after existing overview
  const statsEl = $('#stats-content');
  // Append heatmap to the end of existing stats HTML
  statsEl.innerHTML += html;

  // Click handler for heatmap cards
  document.querySelectorAll('.heatmap-card').forEach((card) => {
    card.addEventListener('click', () => {
      const kp = card.dataset.kp;
      // Set filter and go back to list
      filters.subject = 'all';
      filters.search = kp === '(未分类)' ? '' : kp;
      // Deactivate all filter buttons, activate "all"
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      document.querySelector('.filter-btn[data-subject="all"]').classList.add('active');
      // Show list
      title.textContent = '错题本';
      // Activate list tab
      document.querySelectorAll('.tab-item').forEach((t) => t.classList.remove('active'));
      document.querySelector('.tab-item[data-view="list"]').classList.add('active');
      showView('list');
      renderList();
    });
  });
}

// ==================== SMART ANALYZE ====================

/**
 * Show form fields after successful AI recognition
 */
function showFormFields() {
  $('#form-fields').classList.remove('hidden');
  $('#btn-save').classList.remove('hidden');
}

/**
 * Fill form fields from AI result and show them
 */
function fillFormFromResult(result) {
  if (result.subject) $('#form-subject').value = result.subject;
  if (result.knowledgePoint) $('#form-knowledge-point').value = result.knowledgePoint;
  if (result.question) $('#form-question').value = result.question;
  if (result.wrongAnswer) $('#form-wrong').value = result.wrongAnswer;
  if (result.correctAnswer) $('#form-correct').value = result.correctAnswer;
  if (result.errorType) $('#form-error-type').value = result.errorType;
}

/**
 * Trigger AI recognition on current image
 * Called either by button click or automatically after photo
 */
async function triggerAnalyze() {
  if (!currentImage) {
    alert('请先拍照或选择图片');
    return;
  }
  if (!QwenAI.hasApiKey()) {
    alert('请先在设置中配置 DashScope API Key');
    openSettingsModal();
    return;
  }

  const btn = $('#btn-analyze');
  const status = $('#analyze-status');

  btn.classList.add('analyzing');
  btn.textContent = '识别中...';
  status.className = 'analyze-status loading';
  status.textContent = '正在分析图片，请稍候...';
  status.classList.remove('hidden');

  try {
    const results = await QwenAI.analyzeImage(currentImage);

    if (results.length === 0) {
      status.className = 'analyze-status error';
      status.textContent = '未能识别到任何题目，请重试';
    } else if (results.length === 1) {
      const result = results[0];
      fillFormFromResult(result);
      showFormFields();

      status.className = 'analyze-status success';
      status.textContent = `识别成功！已填充：${[
        result.knowledgePoint && '知识点',
        result.question && '题目',
        result.wrongAnswer && '孩子答案',
        result.correctAnswer && '正确答案',
      ].filter(Boolean).join('、') || '无有效字段'}`;
    } else {
      status.textContent = `识别到 ${results.length} 道题目，请选择要添加的`;
      showQuestionSelection(results);
    }
  } catch (err) {
    status.className = 'analyze-status error';
    status.textContent = `识别失败：${err.message}`;
  } finally {
    btn.classList.remove('analyzing');
    btn.textContent = '智能识别';
  }
}

$('#btn-analyze').addEventListener('click', triggerAnalyze);

// ==================== SETTINGS ====================

function openSettingsModal() {
  $('#settings-modal').classList.remove('hidden');
  $('#settings-api-key').value = QwenAI.getApiKey();
}

function closeSettingsModal() {
  $('#settings-modal').classList.add('hidden');
}

$('#btn-settings').addEventListener('click', openSettingsModal);
$('#btn-close-settings').addEventListener('click', closeSettingsModal);

$('#settings-modal').addEventListener('click', (e) => {
  if (e.target === $('#settings-modal')) closeSettingsModal();
});

$('#btn-save-settings').addEventListener('click', () => {
  const key = $('#settings-api-key').value.trim();
  if (key) {
    QwenAI.setApiKey(key);
    alert('API Key 已保存');
  } else {
    localStorage.removeItem('dashscope_api_key');
  }
  closeSettingsModal();
});

// ==================== DATA IMPORT/EXPORT ====================

$('#btn-export').addEventListener('click', async () => {
  try {
    const data = await getAllQuestions({ showMastered: true });
    if (data.length === 0) {
      alert('暂无数据可导出');
      return;
    }
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuotiben_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert(`已导出 ${data.length} 条错题`);
  } catch (e) {
    alert(`导出失败：${e.message}`);
  }
});

$('#btn-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    });
    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.length === 0) {
      alert('文件格式不正确');
      return;
    }
    if (!confirm(`确定导入 ${data.length} 条错题？`)) return;

    let successCount = 0;
    for (const item of data) {
      try {
        await addQuestion({
          subject: item.subject || 'other',
          knowledgePoint: item.knowledgePoint,
          errorType: item.errorType,
          question: item.question,
          wrongAnswer: item.wrongAnswer,
          correctAnswer: item.correctAnswer,
          note: item.note || '',
          questionImage: item.questionImage,
        });
        successCount++;
      } catch (err) {
        console.warn('Import skip:', item.id, err.message);
      }
    }
    alert(`导入完成：${successCount}/${data.length} 条`);
    renderList();
  } catch (err) {
    alert(`导入失败：${err.message}`);
  }
  e.target.value = '';
});

// ==================== FILTERS ====================

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filters.subject = btn.dataset.subject;
    renderList();
  });
});

// Debounced search
let searchTimeout = null;
$('#search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filters.search = e.target.value.trim();
    renderList();
  }, 300);
});

$('#toggle-mastered').addEventListener('change', (e) => {
  filters.showMastered = e.target.checked;
  renderList();
});

// ==================== FAB ====================

fab.addEventListener('click', showAdd);

// ==================== CAMERA & VOICE ====================

initCamera((base64) => {
  currentImage = base64;
  // Auto-trigger AI recognition after photo
  triggerAnalyze();
});

voiceControl = initVoiceInput($('#form-question'));

// ==================== PAPER CONFIG VIEW ====================

function showPaperConfig() {
  showView('paperConfig');
}

// Quantity selector
document.querySelectorAll('.qty-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.qty-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    paperConfig.count = +btn.dataset.count;
    $('#paper-custom-count').value = '';
  });
});

$('#paper-custom-count').addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  if (val > 0) {
    document.querySelectorAll('.qty-btn').forEach((b) => b.classList.remove('active'));
    paperConfig.count = val;
  }
});

$('#btn-generate-paper').addEventListener('click', async () => {
  paperConfig.subject = $('#paper-subject').value;
  paperConfig.sortOrder = $('#paper-sort-order').value;

  let questions;
  if (paperConfig.sortOrder === 'random') {
    questions = await getRandomQuestions(paperConfig.count, {
      subject: paperConfig.subject,
      showMastered: filters.showMastered,
    });
  } else {
    const all = await getAllQuestions({
      subject: paperConfig.subject,
      showMastered: filters.showMastered,
    });
    if (paperConfig.sortOrder === 'newest') {
      questions = all.slice(0, paperConfig.count);
    } else {
    questions = [...all].reverse().slice(0, paperConfig.count);
    }
  }

  if (questions.length === 0) {
    alert('当前没有符合条件的错题');
    return;
  }

  paperQuestions = questions;
  renderPaper(questions);
  title.textContent = '试卷预览';
  showView('paper');
});

// ==================== PAPER VIEW ====================

function renderPaper(questions) {
  const preview = $('#paper-preview');
  const subjectName = paperConfig.subject === 'all' ? '全科' : SUBJECT_LABELS[paperConfig.subject];
  let html = `<div class="print-header"><h2>错题练习卷 - ${subjectName}</h2><p>共 ${questions.length} 题 | ${new Date().toLocaleDateString('zh-CN')}</p></div>`;

  html += '<div class="print-questions">';
  questions.forEach((item, i) => {
    html += `
      <div class="print-item">
        <div class="print-item-title">${i + 1}. ${escapeHtml(item.question)}</div>
        <div class="print-answer-space"></div>
      </div>`;
  });
  html += '</div>';

  preview.innerHTML = html;
}

$('#btn-print-paper').addEventListener('click', () => {
  if (paperQuestions.length === 0) return;
  const printWindow = window.open('', '_blank');
  const subjectName = paperConfig.subject === 'all' ? '全科' : SUBJECT_LABELS[paperConfig.subject];

  let html = `<div class="print-header"><h2>错题练习卷 - ${subjectName}</h2><p>共 ${paperQuestions.length} 题 | ${new Date().toLocaleDateString('zh-CN')}</p></div>`;
  html += '<div class="print-questions">';
  paperQuestions.forEach((item, i) => {
    html += `
      <div class="print-item">
        <div class="print-item-title">${i + 1}. ${escapeHtml(item.question)}</div>
        <div class="print-answer-space"></div>
      </div>`;
  });
  html += '</div>';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><title>错题练习卷</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: "Microsoft YaHei", sans-serif; padding: 20mm; font-size: 14px; line-height: 1.8; color: #000; }
      .print-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 12px; }
      .print-header h2 { font-size: 20px; margin-bottom: 4px; }
      .print-header p { font-size: 13px; color: #666; }
      .print-questions { margin-bottom: 30px; }
      .print-item { margin-bottom: 24px; page-break-inside: avoid; }
      .print-item-title { font-size: 15px; margin-bottom: 8px; white-space: pre-wrap; word-break: break-word; }
      .print-item-image { max-width: 100%; max-height: 200px; margin-bottom: 8px; }
      .print-answer-space { min-height: 60px; border-bottom: 1px dashed #ccc; margin-top: 8px; }
      @media print { body { padding: 0; } .print-answer-space { min-height: 80px; } }
    </style></head><body>
    ${html}
    <script>window.onload = function() { window.print(); };<\/script>
    </body></html>
  `);
  printWindow.document.close();
});

// ==================== GRADE VIEW ====================

$('#btn-grade-paper').addEventListener('click', showGradePage);

function showGradePage() {
  gradeImage = null;
  $('#grade-preview').classList.add('hidden');
  $('#grade-results').classList.add('hidden');
  $('#grade-status').classList.add('hidden');
  $('#btn-submit-grade').disabled = true;
  title.textContent = '拍照判卷';
  showView('grade');
}

// Grade camera
$('#btn-grade-camera').addEventListener('click', async () => {
  const input = $('#grade-image');
  input.capture = 'environment';
  input.click();
});

$('#btn-grade-gallery').addEventListener('click', () => {
  const input = $('#grade-image');
  input.removeAttribute('capture');
  input.click();
});

$('#grade-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    gradeImage = ev.target.result;
    const preview = $('#grade-preview');
    preview.src = gradeImage;
    preview.classList.remove('hidden');
    $('#btn-submit-grade').disabled = false;
  };
  reader.readAsDataURL(file);
});

$('#btn-submit-grade').addEventListener('click', async () => {
  if (!gradeImage) {
    alert('请先拍照或选择试卷图片');
    return;
  }
  if (!QwenAI.hasApiKey()) {
    alert('请先在设置中配置 DashScope API Key');
    openSettingsModal();
    return;
  }
  if (paperQuestions.length === 0) {
    alert('请先生成试卷');
    return;
  }

  const btn = $('#btn-submit-grade');
  const status = $('#grade-status');

  btn.disabled = true;
  btn.textContent = '判卷中...';
  status.className = 'analyze-status loading';
  status.textContent = 'AI正在判卷，请稍候...';
  status.classList.remove('hidden');

  try {
    const results = await QwenAI.gradePaper(gradeImage);
    applyGradeResults(results, paperQuestions);
  } catch (err) {
    status.className = 'analyze-status error';
    status.textContent = `判卷失败：${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 判卷';
  }
});

async function applyGradeResults(aiResults, questions) {
  const status = $('#grade-status');
  const resultsDiv = $('#grade-results');

  // Build a map: questionIndex -> question id
  const questionMap = {};
  questions.forEach((q, i) => {
    questionMap[i + 1] = q.id;
  });

  let correctCount = 0;
  let total = 0;
  const resultItems = [];

  for (const aiResult of aiResults) {
    const idx = aiResult.questionIndex;
    const qId = questionMap[idx];
    if (!qId) continue;

    total++;
    const isCorrect = aiResult.isCorrect;

    try {
      if (isCorrect) {
        await markCorrect(qId);
        correctCount++;
      } else if (isCorrect === false) {
        await markWrong(qId);
      }
    } catch (e) { /* skip */ }

    resultItems.push({
      index: idx,
      isCorrect,
      studentAnswer: aiResult.studentAnswer || '',
      question: questions[idx - 1]?.question || '',
    });
  }

  // Show results
  let html = `<div class="grade-summary">判卷完成：${correctCount}/${total} 正确</div>`;
  html += '<div class="grade-result-list">';
  resultItems.forEach((r) => {
    const icon = r.isCorrect ? '\u2713' : '\u2717';
    const cls = r.isCorrect ? 'grade-correct' : 'grade-wrong';
    html += `
      <div class="grade-result-item ${cls}">
        <span class="grade-icon">${icon}</span>
        <div class="grade-result-content">
          <span class="grade-result-index">第${r.index}题</span>
          <span class="grade-result-question">${escapeHtml(truncate(r.question, 50))}</span>
          ${r.studentAnswer ? `<span class="grade-result-answer">学生答案：${escapeHtml(r.studentAnswer)}</span>` : ''}
        </div>
      </div>`;
  });
  html += '</div>';

  resultsDiv.innerHTML = html;
  resultsDiv.classList.remove('hidden');

  status.className = 'analyze-status success';
  status.textContent = `判卷完成：${correctCount}/${total} 正确`;
}

// ==================== STATS VIEW ====================

async function showStats() {
  const all = await getAllQuestions({ showMastered: true });
  if (all.length === 0) {
    $('#stats-content').innerHTML = '<p class="empty-state">暂无数据，先添加一些错题吧</p>';
    showView('stats');
    return;
  }
  renderStats(all);
  renderKnowledgeHeatmap(all);
  showView('stats');
}

function renderStats(items) {
  const total = items.length;
  const mastered = items.filter((i) => i.mastered).length;
  const unmastered = total - mastered;
  const masteryRate = total > 0 ? Math.round((mastered / total) * 100) : 0;

  // Practice attempts stats
  const totalAttempts = items.reduce((sum, i) => sum + (i.attempts || 0), 0);
  const correctAttempts = items.filter((i) => i.lastResult === 'correct').length;
  const accuracyRate = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

  // Subject breakdown
  const subjectStats = {};
  Object.keys(SUBJECT_LABELS).forEach((s) => {
    const sub = items.filter((i) => i.subject === s);
    if (sub.length > 0) {
      subjectStats[s] = {
        total: sub.length,
        mastered: sub.filter((i) => i.mastered).length,
        rate: Math.round((sub.filter((i) => i.mastered).length / sub.length) * 100),
      };
    }
  });

  // Knowledge point analysis
  const kpStats = {};
  items.forEach((i) => {
    const kp = i.knowledgePoint || '(未分类)';
    if (!kpStats[kp]) kpStats[kp] = { total: 0, mastered: 0, errorTypes: {}, subject: i.subject };
    kpStats[kp].total++;
    if (i.mastered) kpStats[kp].mastered++;
    if (i.errorType) kpStats[kp].errorTypes[i.errorType] = (kpStats[kp].errorTypes[i.errorType] || 0) + 1;
  });

  // Error type breakdown
  const errorTypeStats = {};
  items.forEach((i) => {
    const et = i.errorType || 'other';
    if (!errorTypeStats[et]) errorTypeStats[et] = 0;
    errorTypeStats[et]++;
  });

  // Weekly trend (last 4 weeks)
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const start = now - (w + 1) * weekMs;
    const end = now - w * weekMs;
    const count = items.filter((i) => i.createdAt >= start && i.createdAt < end).length;
    weeks.unshift({ label: `${w === 0 ? '本周' : w + '周前'}`, count });
  }
  const maxWeek = Math.max(...weeks.map((w) => w.count), 1);

  // Weak points (unmastered, highest count)
  const weakPoints = Object.entries(kpStats)
    .filter(([, v]) => v.total - v.mastered > 0)
    .sort(([, a], [, b]) => (b.total - b.mastered) - (a.total - a.mastered))
    .slice(0, 5);

  // Build HTML
  let html = '';

  // Overview cards
  html += `
    <div class="stats-overview">
      <div class="stat-card">
        <div class="stat-num">${total}</div>
        <div class="stat-label">总错题</div>
      </div>
      <div class="stat-card">
        <div class="stat-num mastered">${mastered}</div>
        <div class="stat-label">已掌握</div>
      </div>
      <div class="stat-card">
        <div class="stat-num unmastered">${unmastered}</div>
        <div class="stat-label">待掌握</div>
      </div>
      <div class="stat-card">
        <div class="stat-num rate">${masteryRate}%</div>
        <div class="stat-label">掌握率</div>
      </div>
    </div>`;

  // Practice stats
  if (totalAttempts > 0) {
    html += `
      <div class="stats-section">
        <h3>练习统计</h3>
        <div class="stats-bar-row">
          <span class="stats-bar-label">总尝试</span>
          <div class="stats-bar-track">
            <div class="stats-bar-fill" style="width:100%">${totalAttempts} 次</div>
          </div>
        </div>
        <div class="stats-bar-row">
          <span class="stats-bar-label">正确率</span>
          <div class="stats-bar-track">
            <div class="stats-bar-fill" style="width:${accuracyRate}%;background:var(--success)">${accuracyRate}%</div>
          </div>
          <span class="stats-bar-count">${correctAttempts}/${total}</span>
        </div>
      </div>`;
  }

  // Subject breakdown
  html += '<div class="stats-section"><h3>科目掌握情况</h3>';
  Object.entries(subjectStats).forEach(([key, val]) => {
    html += `
      <div class="stats-bar-row">
        <span class="stats-bar-label">${SUBJECT_LABELS[key]}</span>
        <div class="stats-bar-track">
          <div class="stats-bar-fill subject-${key}" style="width:${val.rate}%">${val.rate}%</div>
        </div>
        <span class="stats-bar-count">${val.mastered}/${val.total}</span>
      </div>`;
  });
  html += '</div>';

  // Weekly trend
  html += '<div class="stats-section"><h3>近4周错题趋势</h3><div class="stats-chart">';
  weeks.forEach((w) => {
    const h = Math.round((w.count / maxWeek) * 120);
    html += `
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="height:${h}px"><span>${w.count}</span></div>
        <div class="chart-label">${w.label}</div>
      </div>`;
  });
  html += '</div></div>';

  // Error type analysis
  html += '<div class="stats-section"><h3>错误类型分布</h3>';
  Object.entries(errorTypeStats)
    .sort(([, a], [, b]) => b - a)
    .forEach(([key, count]) => {
      const pct = Math.round((count / total) * 100);
      html += `
        <div class="stats-bar-row">
          <span class="stats-bar-label">${ERROR_TYPE_LABELS[key] || key}</span>
          <div class="stats-bar-track">
            <div class="stats-bar-fill" style="width:${pct}%">${count}题 (${pct}%)</div>
          </div>
        </div>`;
    });
  html += '</div>';

  // Weak knowledge points
  if (weakPoints.length > 0) {
    html += '<div class="stats-section stats-warning"><h3>&#9888; 薄弱环节</h3>';
    html += '<p class="stats-tip">以下知识点错题较多，建议重点复习：</p>';
    weakPoints.forEach(([name, val]) => {
      const unmasteredCount = val.total - val.mastered;
      const topError = Object.entries(val.errorTypes).sort(([, a], [, b]) => b - a)[0];
      html += `
        <div class="weak-item">
          <span class="weak-name">${escapeHtml(name)}</span>
          <span class="weak-count">${unmasteredCount}题未掌握</span>
          ${topError ? `<span class="weak-error">主要错误：${ERROR_TYPE_LABELS[topError[0]] || topError[0]}</span>` : ''}
        </div>`;
    });
    html += '</div>';
  }

  // Knowledge point detail
  html += '<div class="stats-section"><h3>知识点明细</h3>';
  const sortedKP = Object.entries(kpStats).sort(([, a], [, b]) => b.total - a.total);
  sortedKP.forEach(([name, val]) => {
    const rate = val.total > 0 ? Math.round((val.mastered / val.total) * 100) : 0;
    const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444';
    html += `
      <div class="kp-item">
        <div class="kp-header">
          <span class="kp-name">${escapeHtml(name)}</span>
          <span class="kp-rate" style="color:${color}">${rate}%</span>
        </div>
        <div class="stats-bar-track">
          <div class="stats-bar-fill" style="width:${rate}%;background:${color}"></div>
        </div>
        <div class="kp-detail">${val.total}题 | 已掌握${val.mastered} | 未掌握${val.total - val.mastered}</div>
      </div>`;
  });
  html += '</div>';

  // Game stats
  getGameStats().then(gs => {
    if (!gs) return;
    const statsContent = $('#stats-content');
    const gameSection = document.createElement('div');
    gameSection.className = 'stats-section';
    gameSection.innerHTML = `
      <h3>🎮 闯关记录</h3>
      <div class="stats-overview" style="margin-top: 12px">
        <div class="stat-card">
          <div class="stat-num">${gs.totalGames}</div>
          <div class="stat-label">游戏次数</div>
        </div>
        <div class="stat-card">
          <div class="stat-num mastered">${gs.totalCorrect}</div>
          <div class="stat-label">答对题数</div>
        </div>
        <div class="stat-card">
          <div class="stat-num rate">${gs.avgAccuracy}%</div>
          <div class="stat-label">平均正确率</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${gs.totalCoins}</div>
          <div class="stat-label">累计金币</div>
        </div>
      </div>
    `;
    statsContent.appendChild(gameSection);

    // Recent games table
    if (gs.recentGames.length > 0) {
      const recentSection = document.createElement('div');
      recentSection.className = 'stats-section';
      let recentHtml = '<h3>最近游戏</h3>';
      gs.recentGames.forEach(g => {
        recentHtml += `
          <div class="weak-item">
            <span class="weak-name">${SUBJECT_LABELS[g.subject] || '全部'}</span>
            <span class="weak-count">${g.accuracy}%</span>
            <span class="weak-error">${g.correctCount}对 ${g.wrongCount}错</span>
            <span class="weak-error">💰${g.coins}</span>
            <span class="weak-error">${formatDate(g.playedAt)}</span>
          </div>`;
      });
      recentSection.innerHTML = recentHtml;
      statsContent.appendChild(recentSection);
    }
  });

  $('#stats-content').innerHTML = html;
}

// ==================== KNOWLEDGE POINTS ====================

async function populateKnowledgePoints() {
  const all = await getAllQuestions({ showMastered: true });
  const points = [...new Set(all.map((i) => i.knowledgePoint).filter(Boolean))];
  $('#knowledge-point-list').innerHTML = points.map((p) => `<option value="${escapeHtml(p)}">`).join('');
}
populateKnowledgePoints();

// ==================== HELPERS ====================

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str, len) {
  return str && str.length > len ? str.slice(0, len) + '...' : str;
}

function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Initial render
renderList();
