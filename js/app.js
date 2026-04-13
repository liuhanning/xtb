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

// DOM refs
const $ = (s) => document.querySelector(s);
const views = {
  list: $('#view-list'),
  add: $('#view-add'),
  detail: $('#view-detail'),
  print: $('#view-print'),
  stats: $('#view-stats'),
};
const title = $('#page-title');
const backBtn = $('#btn-back');
const fab = $('#btn-add');
const printBtn = $('#btn-print');
const tabBar = document.querySelector('.tab-bar');

// Navigation
function showView(name) {
  currentView = name;
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
  const isMainView = name === 'list' || name === 'stats';
  backBtn.classList.toggle('hidden', isMainView);
  fab.classList.toggle('hidden', name !== 'list');
  printBtn.classList.toggle('hidden', name !== 'list');
  tabBar.classList.toggle('hidden', !isMainView);
}

function goBack() {
  if (currentView === 'detail' || currentView === 'print') {
    title.textContent = '错题本';
    showView('list');
  } else if (currentView === 'add') {
    showView('list');
    resetForm();
  }
}

// Tab bar navigation
document.querySelectorAll('.tab-item').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-item').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    if (view === 'stats') {
      title.textContent = '学习分析';
      showStats();
    } else {
      title.textContent = '错题本';
      showView('list');
    }
  });
});

backBtn.addEventListener('click', goBack);

// List
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
      ${item.questionImage ? `<img class="card-thumb" src="${item.questionImage}" alt="题目图片">` : ''}
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
  getQuestion(id).then(renderDetail);
  showView('detail');
}

  const errorTypeLabels = {
    calculation: '计算错误',
    concept: '概念不清',
    careless: '粗心大意',
    understand: '理解偏差',
    knowledge: '知识盲点',
    other: '其他',
  };

async function renderDetail(item) {
  if (!item) return;
  const content = $('#detail-content');
  content.innerHTML = `
    <div class="detail-card">
      ${item.questionImage ? `<img class="detail-image" src="${item.questionImage}" alt="题目图片">` : ''}
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
      <time class="detail-date">添加于 ${formatDate(item.createdAt)}</time>
    </div>
  `;

  const toggleBtn = $('#btn-toggle-master');
  toggleBtn.textContent = item.mastered ? '取消已掌握' : '标记已掌握';
}

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
    showView('add');
  });
}

function resetForm() {
  $('#question-form').reset();
  currentImage = null;
  clearImage();
  $('#btn-analyze').classList.add('hidden');
  $('#analyze-status').classList.add('hidden');
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

  if (isEditing) {
    await updateQuestion(currentQuestionId, data);
  } else {
    await addQuestion(data);
  }
  isEditing = false;

  showView('list');
  renderList();
});

// Detail actions
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

// Smart analyze
$('#btn-analyze').addEventListener('click', async () => {
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
    const result = await QwenAI.analyzeImage(currentImage);

    // Auto-fill form fields
    if (result.subject) $('#form-subject').value = result.subject;
    if (result.knowledgePoint) $('#form-knowledge-point').value = result.knowledgePoint;
    if (result.question) $('#form-question').value = result.question;
    if (result.wrongAnswer) $('#form-wrong').value = result.wrongAnswer;
    if (result.correctAnswer) $('#form-correct').value = result.correctAnswer;
    if (result.errorType) $('#form-error-type').value = result.errorType;

    status.className = 'analyze-status success';
    status.textContent = `识别成功！已填充：${[
      result.knowledgePoint && '知识点',
      result.question && '题目',
      result.wrongAnswer && '孩子答案',
      result.correctAnswer && '正确答案',
    ].filter(Boolean).join('、') || '无有效字段'}`;
  } catch (err) {
    status.className = 'analyze-status error';
    status.textContent = `识别失败：${err.message}`;
  } finally {
    btn.classList.remove('analyzing');
    btn.textContent = '智能识别';
  }
});

// Settings modal
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

// Filters
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filters.subject = btn.dataset.subject;
    renderList();
  });
});

$('#search-input').addEventListener('input', (e) => {
  filters.search = e.target.value.trim();
  renderList();
});

$('#toggle-mastered').addEventListener('change', (e) => {
  filters.showMastered = e.target.checked;
  renderList();
});

// FAB
fab.addEventListener('click', showAdd);

// Init camera
initCamera((base64) => {
  currentImage = base64;
  // Show analyze button when image is selected
  $('#btn-analyze').classList.remove('hidden');
  $('#analyze-status').classList.add('hidden');
});

// Init voice
voiceControl = initVoiceInput($('#form-question'));

// Print
printBtn.addEventListener('click', () => showPrintPreview());

async function showPrintPreview() {
  title.textContent = '打印预览';
  const items = await getAllQuestions(filters);
  if (items.length === 0) {
    alert('当前没有可打印的错题');
    return;
  }
  renderPrintPreview(items);
  showView('print');
}

function renderPrintPreview(items) {
  const preview = $('#print-preview');
  const subjectName = filters.subject === 'all' ? '全科' : SUBJECT_LABELS[filters.subject];
  let html = `<div class="print-header"><h2>错题练习卷 - ${subjectName}</h2><p>共 ${items.length} 题 | ${new Date().toLocaleDateString('zh-CN')}</p></div>`;

  html += '<div class="print-questions">';
  items.forEach((item, i) => {
    html += `
      <div class="print-item">
        <div class="print-item-title">${i + 1}. ${escapeHtml(item.question)}</div>
        ${item.questionImage ? `<img class="print-item-image" src="${item.questionImage}" alt="">` : ''}
        <div class="print-answer-space"></div>
      </div>`;
  });
  html += '</div>';

  // Answers section
  html += '<div class="print-answers"><h3>参考答案</h3>';
  items.forEach((item, i) => {
    html += `
      <div class="print-answer-item">
        <strong>${i + 1}.</strong> 正确答案：${escapeHtml(item.correctAnswer) || '—'}
        ${item.wrongAnswer ? `<br>孩子答案：<span class="wrong">${escapeHtml(item.wrongAnswer)}</span>` : ''}
        ${item.note ? `<br>备注：${escapeHtml(item.note)}` : ''}
      </div>`;
  });
  html += '</div>';

  preview.innerHTML = html;
}

$('#btn-do-print').addEventListener('click', () => {
  const includeAnswers = $('#print-include-answers').checked;
  const includeImages = $('#print-include-images').checked;

  const printWindow = window.open('', '_blank');
  const printContent = $('#print-preview').cloneNode(true);

  if (!includeAnswers) {
    const answers = printContent.querySelector('.print-answers');
    if (answers) answers.remove();
  }
  if (!includeImages) {
    printContent.querySelectorAll('.print-item-image').forEach((el) => el.remove());
  }

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
      .print-answers { page-break-before: always; border-top: 2px solid #000; padding-top: 16px; }
      .print-answers h3 { margin-bottom: 12px; font-size: 16px; }
      .print-answer-item { margin-bottom: 8px; font-size: 13px; line-height: 1.6; }
      .wrong { color: #c00; }
      @media print { body { padding: 0; } .print-answer-space { min-height: 80px; } }
    </style></head><body>
    ${printContent.innerHTML}
    <script>window.onload = function() { window.print(); };<\/script>
    </body></html>
  `);
  printWindow.document.close();
});

// Register SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}

// Populate knowledge point datalist
async function populateKnowledgePoints() {
  const all = await getAllQuestions({ showMastered: true });
  const points = [...new Set(all.map((i) => i.knowledgePoint).filter(Boolean))];
  $('#knowledge-point-list').innerHTML = points.map((p) => `<option value="${escapeHtml(p)}">`).join('');
}
populateKnowledgePoints();

// Statistics
async function showStats() {
  const all = await getAllQuestions({ showMastered: true });
  if (all.length === 0) {
    $('#stats-content').innerHTML = '<p class="empty-state">暂无数据，先添加一些错题吧</p>';
    showView('stats');
    return;
  }
  renderStats(all);
  showView('stats');
}

function renderStats(items) {
  const total = items.length;
  const mastered = items.filter((i) => i.mastered).length;
  const unmastered = total - mastered;
  const masteryRate = total > 0 ? Math.round((mastered / total) * 100) : 0;

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

  $('#stats-content').innerHTML = html;
}

// Helpers
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
