/**
 * 错题本 API Client
 * 保持与原有 IndexedDB 版本相同的函数签名
 * app.js 和 game.js 零修改
 */

const API_BASE = '/api';

async function addQuestion(data) {
  const res = await fetch(`${API_BASE}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`添加失败: ${res.status}`);
  const result = await res.json();
  return result.id;
}

async function updateQuestion(id, data) {
  const res = await fetch(`${API_BASE}/questions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `更新失败: ${res.status}`);
  }
  return res.json();
}

async function deleteQuestion(id) {
  const res = await fetch(`${API_BASE}/questions/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`删除失败: ${res.status}`);
}

async function getQuestion(id) {
  const res = await fetch(`${API_BASE}/questions/${id}`);
  if (!res.ok) return null;
  return res.json();
}

async function getAllQuestions({ subject = 'all', search = '', showMastered = false } = {}) {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (search) params.set('search', search);
  if (showMastered) params.set('showMastered', 'true');

  const res = await fetch(`${API_BASE}/questions?${params.toString()}`);
  if (!res.ok) throw new Error(`查询失败: ${res.status}`);
  return res.json();
}

async function toggleMastered(id) {
  const res = await fetch(`${API_BASE}/questions/${id}/toggle-mastered`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `切换状态失败: ${res.status}`);
  }
  return res.json();
}

async function markCorrect(id) {
  const res = await fetch(`${API_BASE}/questions/${id}/mark-correct`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `标记答对失败: ${res.status}`);
  }
  return res.json();
}

async function markWrong(id) {
  const res = await fetch(`${API_BASE}/questions/${id}/mark-wrong`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `标记答错失败: ${res.status}`);
  }
  return res.json();
}

async function getRandomQuestions(count, { subject = 'all', showMastered = false } = {}) {
  const all = await getAllQuestions({ subject, showMastered });
  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ==================== GAME PERSISTENCE ====================

async function saveGameResult(data) {
  const res = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`保存游戏失败: ${res.status}`);
  const result = await res.json();
  return result.id;
}

async function getGameHistory(limit = 20) {
  const res = await fetch(`${API_BASE}/games/history?limit=${limit}`);
  if (!res.ok) throw new Error(`获取游戏历史失败: ${res.status}`);
  return res.json();
}

async function getGameStats() {
  const res = await fetch(`${API_BASE}/games/stats`);
  if (!res.ok) throw new Error(`获取游戏统计失败: ${res.status}`);
  const data = await res.json();
  return data || null;
}
