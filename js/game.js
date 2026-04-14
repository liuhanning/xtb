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

      // Show fullscreen overlay with big dice
      const overlay = document.getElementById('dice-overlay');
      const bigCube = document.getElementById('dice-overlay-cube');
      if (overlay) overlay.classList.remove('hidden');

      // Wait a frame then pop-in
      await new Promise(r => requestAnimationFrame(r));
      if (bigCube) {
        bigCube.style.transition = 'none';
        bigCube.style.transform = 'scale(0) rotateX(0deg) rotateY(0deg)';
        bigCube.style.opacity = '0';
        // Force reflow
        void bigCube.offsetWidth;
        // Pop in with transition
        bigCube.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
        bigCube.style.transform = 'scale(1) rotateX(0deg) rotateY(0deg)';
        bigCube.style.opacity = '1';
      }
      await delay(350);

      // Remove transition so rolling is instant per frame
      if (bigCube) {
        bigCube.style.transition = 'none';
      }

      // 3D rolling animation on the big dice
      const rollDuration = 1200;
      const rollInterval = 80;
      const rollSteps = rollDuration / rollInterval;

      await new Promise(resolve => {
        let step = 0;
        let currentRotX = 0;
        let currentRotY = 0;
        const timer = setInterval(() => {
          currentRotX += Math.floor(Math.random() * 200) + 100;
          currentRotY += Math.floor(Math.random() * 200) + 100;
          gameState.diceValue = Math.floor(Math.random() * 6) + 1;

          if (bigCube) {
            bigCube.style.transform = `scale(1) rotateX(${currentRotX}deg) rotateY(${currentRotY}deg)`;
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
      if (bigCube) {
        bigCube.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.8, 0.3, 1.2)';
        const final = DICE_ROTATIONS[gameState.diceValue];
        bigCube.style.transform = `scale(1) rotateX(${final.x}deg) rotateY(${final.y}deg)`;
      }

      // Wait for snap animation, then hide overlay
      await delay(900);
      if (overlay) overlay.classList.add('hidden');

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

  // ==================== GAME TILE EMOJIS ====================
  // ==================== GAME TILE SVG ICONS ====================
  // 10 cartoon game elements — inline SVG, colorful, kid-friendly
  const GAME_ICONS = [
    // 0: Treasure chest
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="20" width="32" height="22" rx="4" fill="#d97706"/>
      <rect x="8" y="16" width="32" height="10" rx="4" fill="#f59e0b"/>
      <line x1="8" y1="26" x2="40" y2="26" stroke="#92400e" stroke-width="2"/>
      <rect x="20" y="22" width="8" height="8" rx="2" fill="#fbbf24"/>
      <circle cx="24" cy="26" r="2" fill="#92400e"/>
      <rect x="10" y="28" width="28" height="12" rx="2" fill="#b45309" opacity="0.3"/>
    </svg>`,
    // 1: Star medal
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <polygon points="24,4 28,18 42,18 30,27 34,42 24,33 14,42 18,27 6,18 20,18" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/>
      <circle cx="24" cy="22" r="5" fill="#fef3c7"/>
    </svg>`,
    // 2: Gold coin
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="18" fill="#fbbf24" stroke="#d97706" stroke-width="2"/>
      <circle cx="24" cy="24" r="14" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
      <text x="24" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#d97706">¥</text>
    </svg>`,
    // 3: Crown
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <polygon points="6,32 10,14 16,24 24,8 32,24 38,14 42,32" fill="#f59e0b" stroke="#d97706" stroke-width="1.5"/>
      <rect x="6" y="32" width="36" height="6" rx="2" fill="#d97706"/>
      <circle cx="16" cy="24" r="2" fill="#ef4444"/>
      <circle cx="24" cy="8" r="2" fill="#3b82f6"/>
      <circle cx="32" cy="24" r="2" fill="#22c55e"/>
    </svg>`,
    // 4: Diamond gem
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <polygon points="24,6 42,20 24,42 6,20" fill="#818cf8" stroke="#6366f1" stroke-width="1.5"/>
      <polygon points="24,6 30,20 24,42 18,20" fill="#a5b4fc" opacity="0.6"/>
      <line x1="6" y1="20" x2="42" y2="20" stroke="#6366f1" stroke-width="1"/>
    </svg>`,
    // 5: Target bullseye
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="18" fill="#ef4444"/>
      <circle cx="24" cy="24" r="13" fill="white"/>
      <circle cx="24" cy="24" r="8" fill="#ef4444"/>
      <circle cx="24" cy="24" r="4" fill="#fbbf24"/>
    </svg>`,
    // 6: Open book
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path d="M6,8 C6,8 16,4 24,10 C32,4 42,8 42,8 L42,40 C42,40 32,36 24,42 C16,36 6,40 6,40 Z" fill="#3b82f6"/>
      <path d="M8,10 C8,10 16,7 24,12 L24,40 C16,34 8,38 8,38 Z" fill="#60a5fa"/>
      <path d="M40,10 C40,10 32,7 24,12 L24,40 C32,34 40,38 40,38 Z" fill="#93c5fd"/>
      <line x1="12" y1="18" x2="20" y2="16" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="12" y1="24" x2="20" y2="22" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="28" y1="16" x2="36" y2="18" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="28" y1="22" x2="36" y2="24" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    // 7: Pencil
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <polygon points="10,38 24,10 38,24 24,38" fill="#fbbf24" stroke="#d97706" stroke-width="1"/>
      <polygon points="10,38 16,32 20,36 14,42" fill="#fca5a5"/>
      <polygon points="18,30 24,18 28,22 22,34" fill="#fde68a"/>
      <rect x="26" y="8" width="10" height="8" rx="2" fill="#f472b6" transform="rotate(45, 31, 12)"/>
    </svg>`,
    // 8: Lightbulb
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="18" r="12" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/>
      <rect x="18" y="28" width="12" height="8" rx="2" fill="#d97706"/>
      <rect x="20" y="34" width="8" height="4" rx="1" fill="#92400e"/>
      <line x1="24" y1="6" x2="24" y2="2" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
      <line x1="36" y1="18" x2="40" y2="18" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
      <line x1="12" y1="18" x2="8" y2="18" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
      <line x1="32" y1="10" x2="35" y2="7" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
      <line x1="16" y1="10" x2="13" y2="7" stroke="#fbbf24" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    // 9: Rocket
    `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="24" cy="20" rx="8" ry="16" fill="#ef4444"/>
      <ellipse cx="24" cy="20" rx="5" ry="16" fill="#f87171"/>
      <circle cx="24" cy="18" r="4" fill="#dbeafe" stroke="#3b82f6" stroke-width="1"/>
      <polygon points="16,32 10,42 18,36" fill="#f59e0b"/>
      <polygon points="32,32 38,42 30,36" fill="#f59e0b"/>
      <ellipse cx="24" cy="38" rx="6" ry="8" fill="#fbbf24" opacity="0.8"/>
      <ellipse cx="24" cy="42" rx="3" ry="5" fill="#f97316"/>
    </svg>`,
  ];

  const SUBJECT_ANIMALS = {
    math: { emoji: '\ud83e\udd8a', name: '狐狸' },
    chinese: { emoji: '\ud83d\udc30', name: '兔子' },
    english: { emoji: '\ud83d\udc31', name: '猫咪' },
    other: { emoji: '\ud83d\udc3b', name: '小熊' },
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
        const animal = SUBJECT_ANIMALS[tile.subject] || SUBJECT_ANIMALS.other;
        const iconIdx = index % GAME_ICONS.length;
        const tileIcon = GAME_ICONS[iconIdx];

        html += `<div class="game-tile ${subjectClass} ${isPlayer ? 'player-here' : ''} ${isAnswered ? 'answered' : ''}"
                      data-index="${index}">
          <div class="tile-badge">${index + 1}</div>
          <div class="tile-icon">${isAnswered ? `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><polygon points="24,4 28,18 42,18 30,27 34,42 24,33 14,42 18,27 6,18 20,18" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/><circle cx="24" cy="22" r="5" fill="#fef3c7"/></svg>` : tileIcon}</div>
          <div class="tile-animal">${animal.emoji}</div>
          ${isPlayer ? `<div class="player-piece">${FOX_SVG}</div>` : ''}
          ${isAnswered ? '<div class="answered-badge">\u2713</div>' : ''}
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
      const faceDots = {
        'dice-front':  [5],           // 1
        'dice-back':   [1,3,4,6,7,9], // 6
        'dice-right':  [1,5,9],        // 3
        'dice-left':   [1,3,7,9],      // 4
        'dice-top':    [1,9],          // 2
        'dice-bottom': [1,3,5,7,9],    // 5
      };

      // Update both small and big dice cubes
      ['dice-cube', 'dice-overlay-cube'].forEach(cubeId => {
        const cube = document.getElementById(cubeId);
        if (!cube) return;

        cube.querySelectorAll('.dice-face').forEach(faceEl => {
          const faceClass = faceEl.classList[1];
          const dots = faceDots[faceClass] || [];
          faceEl.querySelectorAll('.dice-dot').forEach(dot => {
            const pos = parseInt(dot.dataset.pos);
            dot.classList.toggle('visible', dots.includes(pos));
          });
        });

        if (gameState.diceAnimating) {
          cube.classList.add('rolling');
          // Only reset transform on the small cube (big cube is handled by rollDice)
          if (cubeId === 'dice-cube') cube.style.transform = '';
        } else {
          cube.classList.remove('rolling');
          // Set the small cube to show the current value
          if (cubeId === 'dice-cube') {
            const rotation = DICE_ROTATIONS[gameState.diceValue] || DICE_ROTATIONS[1];
            cube.style.transform = `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
          }
        }
      });
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
    const skipBtn = document.getElementById('btn-quiz-skip');

    title.textContent = `第 ${index + 1} 格 — ${tile.knowledgePoint}`;
    questionEl.textContent = tile.question || '请根据知识点作答';
    optionsEl.innerHTML = '';
    resultEl.classList.add('hidden');
    nextBtn.classList.add('hidden');
    if (skipBtn) skipBtn.classList.remove('hidden');

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
    const skipBtn = document.getElementById('btn-quiz-skip');

    resultEl.className = `quiz-result ${isCorrect ? 'correct' : 'wrong'}`;
    resultEl.textContent = isCorrect
      ? `✓ 回答正确！+${QUIZ_COIN_GAIN} 金币`
      : `✗ 回答错误！-${QUIZ_LIFE_LOSS} 生命`;
    resultEl.classList.remove('hidden');

    if (skipBtn) skipBtn.classList.add('hidden');

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

  document.getElementById('btn-quiz-skip').addEventListener('click', () => {
    // Skip: mark as wrong, no coin gain
    if (gameState && gameState.phase === 'QUIZ') {
      hideQuizModal();
      gameState.quizResult = 'wrong';
      gameState.lives -= QUIZ_LIFE_LOSS;
      gameState.wrongCount++;
      if (!gameState.answered.includes(gameState.quizTarget)) {
        gameState.answered.push(gameState.quizTarget);
      }
      if (gameState.lives <= 0 || gameState.answered.length >= gameState.board.length) {
        gameState.phase = 'END';
      } else {
        gameState.phase = 'RESULT';
      }
      showQuizResult(false);
    }
  });

  document.getElementById('btn-quiz-close').addEventListener('click', () => {
    hideQuizModal();
    // If quiz was unanswered, reset to ROLL so game doesn't get stuck
    if (gameState && (gameState.phase === 'QUIZ' || gameState.phase === 'RESULT')) {
      gameState.phase = 'ROLL';
      gameState.currentTurn++;
      GameRenderer.renderBoard();
      updatePhaseUI();
    }
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
