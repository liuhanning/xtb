/**
 * 错题大富翁 — 游戏核心状态机 + 地图渲染
 * State machine: INIT → ROLL → MOVE → QUIZ → RESULT → END
 */

(function () {
  'use strict';

  // ==================== CONFIG ====================
  const TILE_COUNT = 16;
  const BOARD_COLS = 4;
  const MAX_LIVES = 3;
  const START_COINS = 100;
  const QUIZ_LIFE_LOSS = 1;
  const QUIZ_COIN_GAIN = 10;
  const START_TILE = 0;
  const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

  // Shop items
  const SHOP_ITEMS = [
    {
      id: 'hint',
      icon: '\u{1F4A1}',
      name: '提示卡',
      desc: '答题时排除2个错误选项（自动触发）',
      price: 30,
    },
    {
      id: 'life',
      icon: '\u2764\ufe0f\u200d\ufe0f',
      name: '生命药水',
      desc: '立即恢复1点生命',
      price: 50,
    },
    {
      id: 'double',
      icon: '\u2728',
      name: '双倍金币卡',
      desc: '下次答对获得双倍金币',
      price: 40,
    },
  ];

  // ==================== STATE ====================
  let gameState = null;

  function createInitialState(subject, tiles) {
    return {
      phase: 'INIT',
      board: tiles,
      playerPos: START_TILE,
      lives: MAX_LIVES,
      coins: START_COINS,
      diceValue: 1,
      diceAnimating: false,
      quizTarget: null,
      quizResult: null,
      currentTurn: 0,
      answered: [],
      correctCount: 0,
      wrongCount: 0,
      subject,
      powerUps: {
        hint: 0,     // hint card count
        double: 0,   // double coins card count
      },
    };
  }

  // ==================== BOARD GENERATION ====================
  window.GameBoard = {
    async generateBoard(subject, count) {
      let questions = [];
      try {
        questions = await getAllQuestions({ subject, showMastered: false });
      } catch (err) {
        console.error('[Board] getAllQuestions failed:', err);
      }

      let tiles = [];
      const knowledgeMap = new Map();

      questions.forEach(q => {
        const key = q.knowledgePoint || q.question?.slice(0, 20) || `未命名-${q.id}`;
        if (!knowledgeMap.has(key)) {
          knowledgeMap.set(key, q);
        }
      });

      tiles = Array.from(knowledgeMap.values()).map(q => ({
        id: q.id,
        knowledgePoint: q.knowledgePoint || '未分类',
        subject: q.subject,
        question: q.question,
        wrongAnswer: q.wrongAnswer,
        correctAnswer: q.correctAnswer,
        errorType: q.errorType,
      }));

      // Fill with generic tiles if not enough
      while (tiles.length < count) {
        tiles.push({
          id: 'fill-' + tiles.length,
          knowledgePoint: '综合练习',
          subject: 'math',
          question: '综合知识题',
          wrongAnswer: '',
          correctAnswer: '',
          errorType: 'other',
        });
      }

      const shuffled = [...tiles].sort(() => Math.random() - 0.5);
      const finalTiles = shuffled.slice(0, count);

      const state = createInitialState(subject, finalTiles);
      gameState = state;
      return state;
    },
  };

  // ==================== GAME ENGINE ====================
  window.GameEngine = {
    getState() {
      return gameState;
    },

    async rollDice() {
      if (gameState.phase !== 'ROLL') return;

      gameState.diceAnimating = true;
      GameRenderer.renderBoard();

      // 3D rolling animation
      const rollDuration = 800;
      const rollInterval = 100;
      const rollSteps = rollDuration / rollInterval;
      const cube = document.getElementById('dice-cube');

      await new Promise(resolve => {
        let step = 0;
        let currentRotX = 0;
        let currentRotY = 0;
        const timer = setInterval(() => {
          // Random spin each frame
          currentRotX += Math.floor(Math.random() * 180) + 90;
          currentRotY += Math.floor(Math.random() * 180) + 90;
          gameState.diceValue = Math.floor(Math.random() * 6) + 1;

          if (cube) {
            cube.style.transition = 'none';
            cube.style.transform = `rotateX(${currentRotX}deg) rotateY(${currentRotY}deg)`;
          }

          step++;
          if (step >= rollSteps) {
            clearInterval(timer);
            resolve();
          }
        }, rollInterval);
      });

      // Final value + snap to face
      gameState.diceValue = Math.floor(Math.random() * 6) + 1;
      gameState.diceAnimating = false;

      // Smooth snap to the final face
      if (cube) {
        cube.style.transition = 'transform 0.6s cubic-bezier(0.2, 0.8, 0.3, 1.2)';
        const final = DICE_ROTATIONS[gameState.diceValue];
        cube.style.transform = `rotateX(${final.x}deg) rotateY(${final.y}deg)`;
      }

      gameState.phase = 'MOVING';
      GameRenderer.renderBoard();

      await this.movePlayer(gameState.diceValue);
    },

    async movePlayer(steps) {
      let pos = gameState.playerPos;
      for (let i = 0; i < steps; i++) {
        pos = (pos + 1) % gameState.board.length;
        gameState.playerPos = pos;
        GameRenderer.renderBoard();
        await delay(150);
      }

      gameState.quizTarget = pos;
      gameState.phase = 'QUIZ';

      // Check if already answered this tile
      if (gameState.answered.includes(pos)) {
        // Skip already-answered tiles, go back to roll
        gameState.phase = 'ROLL';
        gameState.currentTurn++;
        GameRenderer.renderBoard();
        return;
      }

      // Show quiz modal
      showQuizModal(gameState.board[pos], pos);
    },

    handleQuizAnswer(isCorrect) {
      if (isCorrect) {
        gameState.quizResult = 'correct';
        let coinsEarned = QUIZ_COIN_GAIN;
        // Apply double coins card
        if (gameState.powerUps.double > 0) {
          coinsEarned *= 2;
          gameState.powerUps.double--;
        }
        gameState.coins += coinsEarned;
        gameState.correctCount++;
      } else {
        gameState.quizResult = 'wrong';
        gameState.lives -= QUIZ_LIFE_LOSS;
        gameState.wrongCount++;
      }

      if (!gameState.answered.includes(gameState.quizTarget)) {
        gameState.answered.push(gameState.quizTarget);
      }

      // Check end conditions
      if (gameState.lives <= 0 || gameState.answered.length >= gameState.board.length) {
        gameState.phase = 'END';
      } else {
        gameState.phase = 'RESULT';
      }

      // Show result in modal
      showQuizResult(isCorrect);
    },

    nextTurn() {
      gameState.currentTurn++;
      gameState.quizTarget = null;
      gameState.quizResult = null;

      if (gameState.phase === 'END') {
        // Persist before showing end modal
        this.saveGameResult();
        showGameEndModal();
        return;
      }

      gameState.phase = 'ROLL';
      hideQuizModal();
      GameRenderer.renderBoard();
    },

    reset() {
      const tiles = [...gameState.board];
      gameState = createInitialState(gameState.subject, tiles);
      hideGameEndModal();
    },

    saveGameResult() {
      const total = gameState.correctCount + gameState.wrongCount;
      saveGameResult({
        subject: gameState.subject,
        correctCount: gameState.correctCount,
        wrongCount: gameState.wrongCount,
        totalQuestions: gameState.board.length,
        coins: gameState.coins,
        turns: gameState.currentTurn,
        accuracy: total > 0 ? Math.round((gameState.correctCount / total) * 100) : 0,
      }).catch(err => console.error('Save game result error:', err));
    },
  };

  // ==================== SVG ICONS ====================
  const FOX_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <polygon points="6,4 12,14 3,14" fill="#f59e0b"/>
    <polygon points="26,4 20,14 29,14" fill="#f59e0b"/>
    <polygon points="7,6 11,13 5,13" fill="#fde68a"/>
    <polygon points="25,6 21,13 27,13" fill="#fde68a"/>
    <ellipse cx="16" cy="18" rx="10" ry="9" fill="#fef3c7"/>
    <ellipse cx="10" cy="22" rx="5" ry="4" fill="#fde68a" opacity="0.6"/>
    <ellipse cx="22" cy="22" rx="5" ry="4" fill="#fde68a" opacity="0.6"/>
    <circle cx="12" cy="16" r="2" fill="#1e293b"/>
    <circle cx="20" cy="16" r="2" fill="#1e293b"/>
    <circle cx="11.3" cy="15.2" r="0.7" fill="white"/>
    <circle cx="19.3" cy="15.2" r="0.7" fill="white"/>
    <ellipse cx="16" cy="20" rx="1.8" ry="1.4" fill="#fb7185"/>
    <path d="M14,22 Q16,24 18,22" stroke="#92400e" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <ellipse cx="9" cy="19" rx="2" ry="1.5" fill="#fca5a5" opacity="0.5"/>
    <ellipse cx="23" cy="19" rx="2" ry="1.5" fill="#fca5a5" opacity="0.5"/>
  </svg>`;

  // Dice dot patterns: value -> array of visible dot positions (1-9, row-major 3x3)
  const DICE_PATTERNS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  // 3D dice: rotation angles to show each face toward viewer
  // front=1, back=6, right=2, left=5, top=3, bottom=4
  const DICE_ROTATIONS = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 },
  };

  // ==================== RENDERING ====================
  window.GameRenderer = {
    renderBoard() {
      const container = document.getElementById('game-board-grid');
      if (!container || !gameState) return;

      const { board, playerPos, answered } = gameState;

      let html = '';
      board.forEach((tile, index) => {
        const isPlayer = index === playerPos;
        const isAnswered = answered.includes(index);
        const subjectClass = `subject-${tile.subject}`;

        html += `<div class="game-tile ${subjectClass} ${isPlayer ? 'player-here' : ''} ${isAnswered ? 'answered' : ''}"
                      data-index="${index}">
          <div class="tile-number">${index + 1}</div>
          <div class="tile-kp">${escapeHtml(truncate(tile.knowledgePoint, 12))}</div>
          ${isPlayer ? `<div class="player-piece">${FOX_SVG}</div>` : ''}
          ${isAnswered ? '<div class="answered-badge">✓</div>' : ''}
        </div>`;
      });

      container.innerHTML = html;

      // Render dice face
      this.renderDiceFace();

      // Render path lines
      this.renderPathLines();

      updateGameStats();
      updatePhaseUI();
    },

    renderDiceFace() {
      const cube = document.getElementById('dice-cube');
      if (!cube || !gameState) return;

      // Face dot patterns (standard dice: opposite faces sum to 7)
      // front=1, back=6, right=3, left=4, top=2, bottom=5
      const faceDots = {
        'dice-front':  [5],           // 1
        'dice-back':   [1,3,4,6,7,9], // 6
        'dice-right':  [1,5,9],        // 3
        'dice-left':   [1,3,7,9],      // 4
        'dice-top':    [1,9],          // 2
        'dice-bottom': [1,3,5,7,9],    // 5
      };

      cube.querySelectorAll('.dice-face').forEach(faceEl => {
        const faceClass = faceEl.classList[1]; // dice-front, dice-back, etc.
        const dots = faceDots[faceClass] || [];
        faceEl.querySelectorAll('.dice-dot').forEach(dot => {
          const pos = parseInt(dot.dataset.pos);
          dot.classList.toggle('visible', dots.includes(pos));
        });
      });

      if (gameState.diceAnimating) {
        cube.classList.add('rolling');
        cube.style.transform = '';
      } else {
        cube.classList.remove('rolling');
        // Rotate cube to show the target face
        const rotation = DICE_ROTATIONS[gameState.diceValue] || DICE_ROTATIONS[1];
        cube.style.transform = `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
      }
    },

    renderPathLines() {
      const svg = document.getElementById('game-path-svg');
      const grid = document.getElementById('game-board-grid');
      if (!svg || !grid || !gameState) return;

      const tiles = grid.querySelectorAll('.game-tile');
      if (tiles.length < 2) return;

      const gridRect = grid.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const offsetX = gridRect.left - svgRect.left;
      const offsetY = gridRect.top - svgRect.top;

      // Build snake order positions
      const cols = 4;
      const positions = [];
      for (let i = 0; i < gameState.board.length; i++) {
        const row = Math.floor(i / cols);
        const colInRow = i % cols;
        const actualCol = row % 2 === 1 ? (cols - 1 - colInRow) : colInRow;

        const tile = tiles[i];
        if (tile) {
          const tileRect = tile.getBoundingClientRect();
          positions.push({
            x: tileRect.left - svgRect.left + tileRect.width / 2,
            y: tileRect.top - svgRect.top + tileRect.height / 2,
          });
        }
      }

      if (positions.length < 2) return;

      let pathD = `M ${positions[0].x} ${positions[0].y}`;
      for (let i = 1; i < positions.length; i++) {
        pathD += ` L ${positions[i].x} ${positions[i].y}`;
      }

      svg.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);
      svg.innerHTML = `
        <path class="game-path-line" d="${pathD}"/>
        <circle cx="${positions[0].x}" cy="${positions[0].y}" r="6" fill="#22c55e" opacity="0.6"/>
        <text x="${positions[0].x}" y="${positions[0].y + 3}" text-anchor="middle" font-size="8" fill="white" font-weight="bold">起</text>
      `;
    },
  };

  // ==================== QUIZ MODAL ====================
  function showQuizModal(tile, index) {
    const modal = document.getElementById('game-quiz-modal');
    const title = document.getElementById('quiz-title');
    const questionEl = document.getElementById('quiz-question');
    const optionsEl = document.getElementById('quiz-options');
    const resultEl = document.getElementById('quiz-result');
    const nextBtn = document.getElementById('btn-quiz-next');

    title.textContent = `第 ${index + 1} 格 — ${tile.knowledgePoint}`;
    questionEl.textContent = tile.question || '请根据知识点作答';
    optionsEl.innerHTML = '';
    resultEl.classList.add('hidden');
    nextBtn.classList.add('hidden');

    // Generate 4 options from DB + AI
    generateQuizOptions(tile).then(options => {
      options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.dataset.correct = opt.isCorrect ? 'true' : 'false';
        btn.innerHTML = `<span class="option-letter">${OPTION_LETTERS[i]}</span>${escapeHtml(opt.text)}`;
        btn.addEventListener('click', () => {
          // Disable all options
          optionsEl.querySelectorAll('.quiz-option').forEach(b => {
            b.disabled = true;
            if (b === btn) {
              b.classList.add(opt.isCorrect ? 'selected-correct' : 'selected-wrong');
            }
            // Show correct answer
            if (opt.isCorrect && b !== btn) {
              b.classList.add('selected-correct');
            }
          });
          GameEngine.handleQuizAnswer(opt.isCorrect);
        });
        optionsEl.appendChild(btn);
      });

      // Apply hint power-up if available
      if (gameState.powerUps.hint > 0) {
        applyHint();
      }
    });

    modal.classList.remove('hidden');
  }

  function showQuizResult(isCorrect) {
    const resultEl = document.getElementById('quiz-result');
    const nextBtn = document.getElementById('btn-quiz-next');

    resultEl.className = `quiz-result ${isCorrect ? 'correct' : 'wrong'}`;
    resultEl.textContent = isCorrect
      ? `\u2713 回答正确！+${QUIZ_COIN_GAIN} 金币`
      : `\u2717 回答错误！-${QUIZ_LIFE_LOSS} 生命`;
    resultEl.classList.remove('hidden');

    if (gameState.phase === 'END') {
      nextBtn.textContent = '查看结果';
    } else {
      nextBtn.textContent = '下一回合';
    }
    nextBtn.classList.remove('hidden');
  }

  function hideQuizModal() {
    document.getElementById('game-quiz-modal').classList.add('hidden');
  }

  // ==================== GAME END MODAL ====================
  function showGameEndModal() {
    const modal = document.getElementById('game-end-modal');
    const statsEl = document.getElementById('game-end-stats');

    const total = gameState.answered.length;
    const rate = total > 0 ? Math.round((gameState.correctCount / total) * 100) : 0;

    statsEl.innerHTML = `
      <div class="end-score">${gameState.coins} 金币</div>
      <div class="end-label">最终得分</div>
      <div class="end-detail">
        <div class="end-detail-item">
          <div class="end-detail-value" style="color: var(--success)">${gameState.correctCount}</div>
          <div class="end-detail-label">答对</div>
        </div>
        <div class="end-detail-item">
          <div class="end-detail-value" style="color: var(--danger)">${gameState.wrongCount}</div>
          <div class="end-detail-label">答错</div>
        </div>
        <div class="end-detail-item">
          <div class="end-detail-value">${rate}%</div>
          <div class="end-detail-label">正确率</div>
        </div>
        <div class="end-detail-item">
          <div class="end-detail-value">${gameState.currentTurn}</div>
          <div class="end-detail-label">回合数</div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    hideQuizModal();
  }

  function hideGameEndModal() {
    document.getElementById('game-end-modal').classList.add('hidden');
  }

  // ==================== QUIZ OPTION GENERATION ====================
  /**
   * Generate 4 options (1 correct + 3 distractors) from DB
   */
  async function generateQuizOptions(tile) {
    // Try to find similar questions from DB as distractors
    const similar = await getAllQuestions({
      subject: tile.subject === 'all' ? undefined : tile.subject,
      showMastered: false,
    });

    // Filter out current question and get wrong answers as distractors
    const others = similar.filter(q =>
      q.id !== tile.id &&
      q.wrongAnswer &&
      q.wrongAnswer.length > 0
    ).slice(0, 3);

    const options = [];

    // Add correct answer
    options.push({
      text: tile.correctAnswer || '（正确答案见解析）',
      isCorrect: true,
    });

    // Add distractors (wrong answers from other students)
    others.forEach(q => {
      options.push({
        text: q.wrongAnswer,
        isCorrect: false,
      });
    });

    // Fill remaining with placeholder
    while (options.length < 4) {
      options.push({
        text: '以上都不对',
        isCorrect: options.length === 3 && !tile.correctAnswer,
      });
    }

    // Shuffle options
    return [...options].sort(() => Math.random() - 0.5);
  }

  // ==================== UI HELPERS ====================
  function updateGameStats() {
    if (!gameState) return;
    const livesEl = document.getElementById('game-lives');
    const coinsEl = document.getElementById('game-coins');
    const progressEl = document.getElementById('game-progress');
    if (livesEl) {
      const hearts = Math.max(0, gameState.lives);
      livesEl.innerHTML = Array(hearts).fill('❤️').join('') + Array(MAX_LIVES - hearts).fill('').join('');
    }
    if (coinsEl) coinsEl.textContent = `💰 ${gameState.coins}`;
    if (progressEl) {
      const answered = gameState.answered.length;
      const total = gameState.board.length;
      const stars = '⭐'.repeat(answered) + '☆'.repeat(total - answered);
      progressEl.textContent = stars;
    }
  }

  function updatePhaseUI() {
    if (!gameState) return;
    const diceBtn = document.getElementById('btn-roll-dice');
    const phaseEl = document.getElementById('game-phase-label');

    if (phaseEl) {
      const labels = {
        ROLL: '\ud83c\udfb2 掷骰子',
        MOVING: '\ud83d\udeb6 移动中...',
        QUIZ: '\u270f\ufe0f 答题时间！',
        RESULT: '\ud83d\udcca 本轮结束',
        END: '\ud83c\udfc1 游戏结束',
      };
      phaseEl.textContent = labels[gameState.phase] || '';
    }

    if (diceBtn) {
      diceBtn.classList.toggle('hidden', gameState.phase !== 'ROLL');
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== SHOP SYSTEM ====================
  function showShopModal() {
    const modal = document.getElementById('game-shop-modal');
    const coinsEl = document.getElementById('shop-coins');
    const itemsEl = document.getElementById('shop-items');

    coinsEl.textContent = `\ud83d\udcb0 ${gameState.coins} 金币`;
    itemsEl.innerHTML = '';

    SHOP_ITEMS.forEach(item => {
      const canAfford = gameState.coins >= item.price;
      const div = document.createElement('div');
      div.className = `shop-item ${canAfford ? '' : 'disabled'}`;
      div.innerHTML = `
        <div class="shop-icon">${item.icon}</div>
        <div class="shop-info">
          <div class="shop-name">${item.name}</div>
          <div class="shop-desc">${item.desc}</div>
        </div>
        <div class="shop-price">${item.price}\ud83d\udcb0</div>
      `;
      if (canAfford) {
        div.addEventListener('click', () => buyItem(item));
      }
      itemsEl.appendChild(div);
    });

    modal.classList.remove('hidden');
  }

  function hideShopModal() {
    document.getElementById('game-shop-modal').classList.add('hidden');
  }

  function buyItem(item) {
    if (gameState.coins < item.price) return;

    gameState.coins -= item.price;

    switch (item.id) {
      case 'hint':
        gameState.powerUps.hint++;
        break;
      case 'life':
        gameState.lives = Math.min(gameState.lives + 1, MAX_LIVES);
        break;
      case 'double':
        gameState.powerUps.double++;
        break;
    }

    // Refresh UI
    updateGameStats();
    hideShopModal();
    showShopModal();
  }

  // Apply hint power-up during quiz (eliminate 2 wrong options)
  function applyHint() {
    if (gameState.powerUps.hint <= 0) return false;

    const optionsEl = document.getElementById('quiz-options');
    const wrongOptions = optionsEl.querySelectorAll('.quiz-option:not([data-correct="true"])');

    let eliminated = 0;
    wrongOptions.forEach(opt => {
      if (eliminated < 2) {
        opt.style.opacity = '0.3';
        opt.style.pointerEvents = 'none';
        opt.textContent = '❌ 已排除';
        eliminated++;
      }
    });

    gameState.powerUps.hint--;
    return true;
  }

  // ==================== INITIALIZATION ====================
  window.startGame = async function (subject, tileCount) {
    // Default values
    subject = subject || 'all';
    tileCount = tileCount || TILE_COUNT;

    // Reset any previous game
    hideQuizModal();
    hideGameEndModal();

    showView('game');
    title.textContent = '错题闯关';

    const boardGrid = document.getElementById('game-board-grid');
    boardGrid.innerHTML = '<div class="game-loading">正在生成地图...</div>';

    try {
      const state = await GameBoard.generateBoard(subject, tileCount);
      state.phase = 'ROLL';
      gameState = state;
      GameRenderer.renderBoard();
      updatePhaseUI();

      // Re-render path lines after layout settles
      setTimeout(() => GameRenderer.renderPathLines(), 100);
      window.addEventListener('resize', () => {
        if (gameState) GameRenderer.renderPathLines();
      });
    } catch (err) {
      console.error('[Game] Error:', err);
      boardGrid.innerHTML = `<div class="game-error">生成失败：${err.message}</div>`;
    }
  };

  // ==================== EVENT BINDINGS ====================
  document.getElementById('btn-roll-dice').addEventListener('click', () => {
    if (gameState && gameState.phase === 'ROLL' && !gameState.diceAnimating) {
      GameEngine.rollDice().catch(err => {
        console.error('Roll dice error:', err);
      });
    }
  });

  document.getElementById('btn-quiz-next').addEventListener('click', () => {
    GameEngine.nextTurn();
  });

  document.getElementById('btn-quiz-close').addEventListener('click', () => {
    hideQuizModal();
  });

  document.getElementById('btn-game-end-close').addEventListener('click', () => {
    hideGameEndModal();
    showView('list');
  });

  document.getElementById('btn-game-restart').addEventListener('click', () => {
    GameEngine.reset();
    startGame(gameState.subject);
  });

  document.getElementById('btn-shop').addEventListener('click', () => {
    if (gameState) showShopModal();
  });

  document.getElementById('btn-shop-close').addEventListener('click', () => {
    hideShopModal();
  });
})();
