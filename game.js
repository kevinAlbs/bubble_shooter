const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const scoreEl = document.querySelector('#score');
const shotsEl = document.querySelector('#shots');
const missesEl = document.querySelector('#misses');
const overlay = document.querySelector('#overlay');
const resultLabel = document.querySelector('#result-label');
const resultTitle = document.querySelector('#result-title');
const resultCopy = document.querySelector('#result-copy');

const W = canvas.width;
const H = canvas.height;
const R = 23;
const DIAMETER = R * 2;
const ROW_HEIGHT = 40;
const COLS = 11;
const TOP = 34;
const SHOOTER = { x: W / 2, y: H - 55 };
const SHOT_SPEED = 720;
const DANGER_Y = H - 145;
const MISSES_PER_ROUND = 5;
const BOUNCE_CHANCE = .1;
const COLORS = ['#ff5d73', '#f7b731', '#20bf8f', '#4285f4', '#8b5cf6'];
const POP_DURATION = 180;
const POP_STAGGER = 45;

let grid;
let activeColors;
let current;
let nextColor;
let nextBounce;
let pointer;
let score;
let shots;
let missesLeft;
let gameOver;
let popAnimations;
let forceBounceBubbles = false;
let isTouchAiming = false;
let lastFrameTime;

function cellPosition(row, col) {
  const rowWidth = COLS * DIAMETER;
  const left = (W - rowWidth) / 2;
  const offset = row % 2 ? R : 0;
  return { x: left + R + col * DIAMETER + offset, y: TOP + row * ROW_HEIGHT };
}

function key(row, col) { return `${row},${col}`; }

function resetGame() {
  grid = new Map();
  activeColors = new Set(COLORS);
  popAnimations = [];
  for (let row = 0; row < 6; row++) {
    const maxCols = row % 2 ? COLS - 1 : COLS;
    for (let col = 0; col < maxCols; col++) {
      if (row < 4 || Math.random() > .25) addBubble(row, col, randomColor());
    }
  }
  pruneClearedColors();
  score = 0;
  shots = 0;
  missesLeft = MISSES_PER_ROUND;
  gameOver = false;
  isTouchAiming = false;
  pointer = { x: SHOOTER.x, y: 200 };
  nextColor = randomActiveColor();
  nextBounce = isBounceBubble();
  loadShot();
  overlay.classList.add('hidden');
  updateStats();
}

function addBubble(row, col, color) {
  const pos = cellPosition(row, col);
  grid.set(key(row, col), { row, col, color, x: pos.x, y: pos.y });
}

function randomColor() {
  const pool = [...activeColors];
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomActiveColor() {
  const active = [...new Set([...grid.values()].map(b => b.color))];
  const pool = active.length ? active : COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function isBounceBubble() {
  return forceBounceBubbles || Math.random() < BOUNCE_CHANCE;
}

function pruneClearedColors() {
  const colorsOnBoard = new Set([...grid.values()].map(bubble => bubble.color));
  activeColors.forEach(color => {
    if (!colorsOnBoard.has(color)) activeColors.delete(color);
  });
}

function loadShot() {
  if (!activeColors.has(nextColor)) nextColor = randomActiveColor();
  current = {
    x: SHOOTER.x,
    y: SHOOTER.y,
    vx: 0,
    vy: 0,
    color: nextColor,
    bounceReady: nextBounce,
    moving: false,
    settling: false
  };
  nextColor = randomActiveColor();
  nextBounce = isBounceBubble();
}

function updateStats() {
  scoreEl.textContent = score.toLocaleString();
  shotsEl.textContent = shots;
  missesEl.textContent = missesLeft;
}

function aimAngle() {
  return Math.max(-Math.PI + .18, Math.min(-.18, Math.atan2(pointer.y - SHOOTER.y, pointer.x - SHOOTER.x)));
}

function shoot() {
  if (current.moving || current.settling || gameOver) return;
  const angle = aimAngle();
  current.vx = Math.cos(angle) * SHOT_SPEED;
  current.vy = Math.sin(angle) * SHOT_SPEED;
  current.moving = true;
  shots++;
  updateStats();
}

function update(deltaSeconds) {
  if (current.moving) {
    current.x += current.vx * deltaSeconds;
    current.y += current.vy * deltaSeconds;
    if (current.x <= R || current.x >= W - R) {
      current.x = Math.max(R, Math.min(W - R, current.x));
      current.vx *= -1;
      current.bounceReady = false;
    }
    if (current.y >= H - R) {
      current.y = H - R;
      current.vy = -Math.abs(current.vy);
      current.bounceReady = false;
    }
    if (current.y <= TOP) {
      attachShot();
    } else {
      const hitBubble = collisionBubble();
      if (hitBubble && current.bounceReady) bounceOffBubble(hitBubble);
      else if (hitBubble) attachShot(hitBubble);
    }
  }
  if (current.settling) {
    const settleAmount = 1 - Math.pow(.65, deltaSeconds * 60);
    current.x += (current.targetX - current.x) * settleAmount;
    current.y += (current.targetY - current.y) * settleAmount;
    if (Math.hypot(current.targetX - current.x, current.targetY - current.y) < .7) finishAttach();
  }
}

function collisionBubble() {
  for (const bubble of grid.values()) {
    if (Math.hypot(current.x - bubble.x, current.y - bubble.y) < DIAMETER - 3) return bubble;
  }
  return null;
}

function bounceOffBubble(bubble) {
  const dx = current.x - bubble.x;
  const dy = current.y - bubble.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;
  const velocityAlongNormal = current.vx * nx + current.vy * ny;

  current.x = bubble.x + nx * (DIAMETER - 2);
  current.y = bubble.y + ny * (DIAMETER - 2);
  current.vx -= 2 * velocityAlongNormal * nx;
  current.vy -= 2 * velocityAlongNormal * ny;
  current.bounceReady = false;
}

function nearestCell(x, y) {
  let best = null;
  let bestDistance = Infinity;
  const approxRow = Math.max(0, Math.round((y - TOP) / ROW_HEIGHT));
  for (let row = Math.max(0, approxRow - 2); row <= approxRow + 2; row++) {
    const maxCols = row % 2 ? COLS - 1 : COLS;
    for (let col = 0; col < maxCols; col++) {
      if (grid.has(key(row, col))) continue;
      const pos = cellPosition(row, col);
      const distance = Math.hypot(x - pos.x, y - pos.y);
      if (distance < bestDistance) { best = { row, col }; bestDistance = distance; }
    }
  }
  return best;
}

function emptyNeighbors(bubble) {
  const even = bubble.row % 2 === 0;
  const directions = even
    ? [[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]]
    : [[0,-1],[0,1],[-1,0],[-1,1],[1,0],[1,1]];

  return directions
    .map(([dr, dc]) => ({ row: bubble.row + dr, col: bubble.col + dc }))
    .filter(cell => {
      const maxCols = cell.row % 2 ? COLS - 1 : COLS;
      return cell.row >= 0 && cell.col >= 0 && cell.col < maxCols && !grid.has(key(cell.row, cell.col));
    });
}

function attachShot(hitBubble = null) {
  let target;
  if (hitBubble) {
    target = emptyNeighbors(hitBubble).sort((a, b) => {
      const aPos = cellPosition(a.row, a.col);
      const bPos = cellPosition(b.row, b.col);
      return Math.hypot(current.x - aPos.x, current.y - aPos.y)
        - Math.hypot(current.x - bPos.x, current.y - bPos.y);
    })[0];
  }
  target ||= nearestCell(current.x, current.y);
  if (!target) return finish(false);
  const position = cellPosition(target.row, target.col);
  current.moving = false;
  current.settling = true;
  current.target = target;
  current.targetX = position.x;
  current.targetY = position.y;
}

function finishAttach() {
  const target = current.target;
  current.x = current.targetX;
  current.y = current.targetY;
  current.settling = false;
  addBubble(target.row, target.col, current.color);
  const bubble = grid.get(key(target.row, target.col));
  const match = connected(bubble, true);

  if (match.length >= 3) {
    removeBubbles(match);
    dropFloating();
  } else {
    missesLeft--;
    if (missesLeft === 0) {
      addRows(2);
      missesLeft = MISSES_PER_ROUND;
    }
    updateStats();
  }

  if (grid.size === 0) return finish(true);
  if ([...grid.values()].some(b => b.y + R >= DANGER_Y)) return finish(false);
  loadShot();
}

function addRows(count) {
  const oldBubbles = [...grid.values()];
  grid.clear();
  oldBubbles.forEach(bubble => addBubble(bubble.row + count, bubble.col, bubble.color));
  for (let row = 0; row < count; row++) {
    const maxCols = row % 2 ? COLS - 1 : COLS;
    for (let col = 0; col < maxCols; col++) addBubble(row, col, randomColor());
  }
}

function neighbors(bubble) {
  const even = bubble.row % 2 === 0;
  const directions = even
    ? [[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]]
    : [[0,-1],[0,1],[-1,0],[-1,1],[1,0],[1,1]];
  return directions.map(([dr, dc]) => grid.get(key(bubble.row + dr, bubble.col + dc))).filter(Boolean);
}

function connected(start, sameColor = false) {
  const found = [];
  const seen = new Set([key(start.row, start.col)]);
  const queue = [start];
  while (queue.length) {
    const bubble = queue.shift();
    found.push(bubble);
    for (const neighbor of neighbors(bubble)) {
      const id = key(neighbor.row, neighbor.col);
      if (!seen.has(id) && (!sameColor || neighbor.color === start.color)) {
        seen.add(id);
        queue.push(neighbor);
      }
    }
  }
  return found;
}

function removeBubbles(bubbles) {
  const startedAt = performance.now();
  bubbles.forEach((b, index) => {
    popAnimations.push({ x: b.x, y: b.y, color: b.color, startedAt: startedAt + index * POP_STAGGER });
    grid.delete(key(b.row, b.col));
  });
  pruneClearedColors();
  score += bubbles.length;
  updateStats();
}

function dropFloating() {
  const anchored = new Set();
  const queue = [...grid.values()].filter(b => b.row === 0);
  queue.forEach(b => anchored.add(key(b.row, b.col)));
  while (queue.length) {
    const bubble = queue.shift();
    neighbors(bubble).forEach(n => {
      const id = key(n.row, n.col);
      if (!anchored.has(id)) { anchored.add(id); queue.push(n); }
    });
  }
  const floating = [...grid.values()].filter(b => !anchored.has(key(b.row, b.col)));
  if (floating.length) removeBubbles(floating);
}

function finish(won) {
  gameOver = true;
  resultLabel.hidden = !won;
  resultLabel.textContent = 'BOARD CLEARED';
  resultTitle.textContent = won ? 'You did it!' : 'Game Over';
  resultCopy.textContent = `${score.toLocaleString()} ${score === 1 ? 'bubble' : 'bubbles'} popped in ${shots} shots.`;
  overlay.classList.remove('hidden');
}

function drawBubble(x, y, color, radius = R, outlined = false) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.fill();
  if (outlined) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 7;
    ctx.stroke();
  }
}

function drawPopAnimations(now) {
  popAnimations = popAnimations.filter(pop => {
    const progress = Math.max(0, Math.min((now - pop.startedAt) / POP_DURATION, 1));
    if (progress >= 1) return false;

    ctx.fillStyle = pop.color;
    ctx.beginPath();
    ctx.arc(pop.x, pop.y, (R - 2) * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
    return true;
  });
}

function draw(now) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.setLineDash([8, 9]);
  ctx.strokeStyle = 'rgba(255, 93, 115, .45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, DANGER_Y);
  ctx.lineTo(W, DANGER_Y);
  ctx.stroke();
  ctx.restore();

  grid.forEach(b => drawBubble(b.x, b.y, b.color));
  drawPopAnimations(now);

  if (!current.moving && !current.settling && !gameOver) {
    const angle = aimAngle();
    ctx.save();
    ctx.setLineDash([5, 10]);
    ctx.strokeStyle = isTouchAiming ? 'rgba(17, 24, 39, .75)' : 'rgba(31, 41, 55, .35)';
    ctx.lineWidth = isTouchAiming ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(SHOOTER.x, SHOOTER.y);
    ctx.lineTo(SHOOTER.x + Math.cos(angle) * 155, SHOOTER.y + Math.sin(angle) * 155);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#e9edf5';
  ctx.beginPath();
  ctx.arc(SHOOTER.x, H + 15, 90, Math.PI, Math.PI * 2);
  ctx.fill();
  drawBubble(current.x, current.y, current.color, R, current.bounceReady);
  if (current.bounceReady && !current.moving && !current.settling) {
    ctx.fillStyle = '#111827';
    ctx.font = '700 13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Bounces once', SHOOTER.x, SHOOTER.y - 36);
    ctx.textAlign = 'start';
  }
  drawBubble(72, H - 42, nextColor, 15, nextBounce);
  for (let i = 0; i < missesLeft; i++) {
    ctx.fillStyle = '#aeb5c4';
    ctx.beginPath();
    ctx.arc(103 + i * 15, H - 42, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#687086';
  ctx.font = '700 12px system-ui';
  ctx.fillText('NEXT', 23, H - 38);

}

function loop(now) {
  const deltaSeconds = Math.min((now - (lastFrameTime ?? now)) / 1000, .033);
  lastFrameTime = now;
  update(deltaSeconds);
  draw(now);
  requestAnimationFrame(loop);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
}

canvas.addEventListener('pointermove', event => { pointer = pointFromEvent(event); });
canvas.addEventListener('contextmenu', event => { event.preventDefault(); });
canvas.addEventListener('pointerdown', event => {
  pointer = pointFromEvent(event);
  if (event.pointerType === 'touch') {
    isTouchAiming = true;
    canvas.setPointerCapture(event.pointerId);
  } else {
    shoot();
  }
});
canvas.addEventListener('pointerup', event => {
  if (!isTouchAiming) return;
  pointer = pointFromEvent(event);
  isTouchAiming = false;
  shoot();
});
canvas.addEventListener('pointercancel', () => { isTouchAiming = false; });
document.querySelector('#play-again').addEventListener('click', resetGame);

window.setAllBounceBubbles = enabled => {
  forceBounceBubbles = Boolean(enabled);
  nextBounce = isBounceBubble();
  if (forceBounceBubbles) {
    if (current && !current.settling) current.bounceReady = true;
  }
  console.info(`Bounce bubble test mode ${forceBounceBubbles ? 'enabled' : 'disabled'}.`);
  return forceBounceBubbles;
};

resetGame();
loop();
