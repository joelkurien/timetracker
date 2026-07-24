// Declare Tauri APIs on global window
export {};
declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
      tauri?: {
        invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke;

interface Session {
  start: number;
  end: number;
  duration: number;
}

interface Achievement {
  id: string;
  title: string;
  completed: boolean;
}

interface Task {
  id: string;
  name: string;
  totalSeconds: number;
  running: boolean;
  sessionStart: number | null;
  lastPlayedAt: number | null;
  sessions: Session[];
  achievements: Achievement[];
}

const STORAGE_KEY = 'timelog-tauri-tasks';
let tasks: Task[] = [];
let isMini = false;
let taskToDeleteId: string | null = null;
const expandedSections = new Set<string>();

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rSec = s % 60;
  return [h, m, rSec].map((v) => String(v).padStart(2, '0')).join(':');
}

function currentElapsed(t: Task): number {
  let total = t.totalSeconds;
  if (t.running && t.sessionStart) {
    total += (Date.now() - t.sessionStart) / 1000;
  }
  return total;
}

function loadTasks(): void {
  const data = localStorage.getItem(STORAGE_KEY);
  tasks = data ? (JSON.parse(data) as Task[]) : [];

  tasks.forEach((t) => {
    if (!t.sessions) t.sessions = [];
    if (!t.achievements) t.achievements = [];
    if (t.running && t.sessionStart) {
      stopSession(t);
    }
  });

  saveTasks();
  render();
}

function saveTasks(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function stopSession(t: Task): void {
  if (!t.sessionStart) return;
  const end = Date.now();
  const durationSec = (end - t.sessionStart) / 1000;
  t.totalSeconds += durationSec;
  t.sessions.unshift({ start: t.sessionStart, end: end, duration: durationSec });
  t.sessionStart = null;
  t.running = false;
  t.lastPlayedAt = end;
}

function addTask(name: string): void {
  tasks.unshift({
    id: 't_' + Date.now(),
    name: name,
    totalSeconds: 0,
    running: false,
    sessionStart: null,
    lastPlayedAt: null,
    sessions: [],
    achievements: [],
  });
  saveTasks();
  render();
}

function toggleTask(id: string): void {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  if (t.running) {
    stopSession(t);
  } else {
    tasks.forEach((x) => {
      if (x.running) stopSession(x);
    });
    t.running = true;
    t.sessionStart = Date.now();
  }
  saveTasks();
  render();
}

function deleteTask(id: string): void {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
}

// Modal Control Functions
function showDeleteModal(id: string): void {
  taskToDeleteId = id;
  const modal = document.getElementById('confirmModal');
  modal?.classList.remove('hidden');
}

function hideDeleteModal(): void {
  taskToDeleteId = null;
  const modal = document.getElementById('confirmModal');
  modal?.classList.add('hidden');
}

function addAchievement(taskId: string, title: string): void {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.achievements.push({
    id: 'a_' + Date.now(),
    title,
    completed: false,
  });
  saveTasks();
  render();
}

function toggleAchievement(taskId: string, achId: string): void {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  const ach = task.achievements.find((a) => a.id === achId);
  if (ach) {
    ach.completed = !ach.completed;
    saveTasks();
    render();
  }
}

function deleteAchievement(taskId: string, achId: string): void {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.achievements = task.achievements.filter((a) => a.id !== achId);
  saveTasks();
  render();
}

function updateMiniBar(): void {
  const activeTask = tasks.find((t) => t.running);
  const dot = document.getElementById('blinkerDot');
  const label = document.getElementById('miniTaskName');

  if (dot) {
    if (activeTask) dot.classList.add('active');
    else dot.classList.remove('active');
  }

  if (label) {
    label.textContent = activeTask ? activeTask.name : 'Paused';
  }
}

function render(): void {
  const grid = document.getElementById('grid');
  if (!grid) return;

  if (tasks.length === 0) {
    grid.innerHTML = `<div style="text-align:center; padding:40px 10px; color:var(--text-faint); font-size:12px;">No tasks yet. Add one above to start tracking.</div>`;
    updateMiniBar();
    return;
  }

  grid.innerHTML = tasks
    .map((t) => {
      const achievements = t.achievements || [];
      const sessions = t.sessions || [];
      const isAchOpen = expandedSections.has('ach_' + t.id);
      const isHistOpen = expandedSections.has('hist_' + t.id);
      const doneAchCount = achievements.filter((a) => a.completed).length;

      const achievementRows = achievements.length
        ? achievements
            .map(
              (a) => `
            <div class="ach-item ${a.completed ? 'completed' : ''}">
              <input type="checkbox" ${a.completed ? 'checked' : ''} data-action="toggle-ach" data-taskid="${t.id}" data-achid="${a.id}" />
              <span style="flex:1;">${escapeHtml(a.title)}</span>
              <button class="btn-del-ach" data-action="del-ach" data-taskid="${t.id}" data-achid="${a.id}">✕</button>
            </div>
          `
            )
            .join('')
        : `<div style="font-size:11px; color:var(--text-faint); font-style:italic;">No milestones added.</div>`;

      const historyRows = sessions.length
        ? sessions
            .map(
              (s) => `
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-dim);">
              <span>${new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span style="font-family:'JetBrains Mono'; color:var(--text);">${fmt(s.duration)}</span>
            </div>
          `
            )
            .join('')
        : `<div style="font-size:11px; color:var(--text-faint); font-style:italic;">No history recorded yet.</div>`;

      return `
      <div class="card ${t.running ? 'running' : ''}" data-id="${t.id}">
        <div class="card-top">
          <span class="card-name">${escapeHtml(t.name)}</span>
          <button class="btn btn-sec" data-action="delete-task" data-id="${t.id}" title="Delete task">✕</button>
        </div>
        <div class="odometer" id="odo_${t.id}">${fmt(currentElapsed(t))}</div>
        
        <div class="btn-row" style="justify-content: space-between;">
          <button class="btn ${t.running ? 'btn-pause' : 'btn-play'}" data-action="toggle-task" data-id="${t.id}">
            ${t.running ? '❚❚ Pause' : '► Play'}
          </button>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-sec" data-action="open-ach" data-id="${t.id}">
              🏆 (${doneAchCount}/${achievements.length})
            </button>
            <button class="btn btn-sec" data-action="open-hist" data-id="${t.id}">
              Log (${sessions.length})
            </button>
          </div>
        </div>

        <div class="drawer ${isAchOpen ? 'open' : ''}">
          <div style="font-size:10px; font-weight:700; color:var(--text-faint); text-transform:uppercase;">Milestones</div>
          ${achievementRows}
          <form class="add-ach-form" data-action="add-ach" data-id="${t.id}" style="display:flex; gap:4px; margin-top:4px;">
            <input type="text" placeholder="New milestone..." maxlength="40" required style="flex:1; background:var(--surface-2); border:1px solid var(--surface-border); color:var(--text); padding:4px 8px; border-radius:4px; font-size:11px; outline:none;" />
            <button type="submit" style="background:var(--surface-border); color:var(--text); border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">+</button>
          </form>
        </div>

        <div class="drawer ${isHistOpen ? 'open' : ''}">
          <div style="font-size:10px; font-weight:700; color:var(--text-faint); text-transform:uppercase;">Session History</div>
          ${historyRows}
        </div>
      </div>
    `;
    })
    .join('');

  updateMiniBar();
}

function escapeHtml(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Timer Loop
setInterval(() => {
  tasks.forEach((t) => {
    if (t.running) {
      const el = document.getElementById(`odo_${t.id}`);
      if (el) el.textContent = fmt(currentElapsed(t));
    }
  });
}, 1000);

// Window Mini Mode Toggle
async function setMiniMode(mini: boolean): Promise<void> {
  isMini = mini;
  if (invoke) {
    await invoke('toggle_mini_mode', { mini });
  }

  const mainView = document.getElementById('mainView');
  const miniBar = document.getElementById('miniBar');

  if (mini) {
    mainView?.classList.add('hidden');
    miniBar?.classList.add('active');
  } else {
    mainView?.classList.remove('hidden');
    miniBar?.classList.remove('active');
  }
}

// Grid Event Delegation Listener
document.getElementById('grid')?.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  const btn = target.closest('[data-action]') as HTMLElement | null;
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'toggle-task' && id) toggleTask(id);
  
  // Custom Modal Trigger replaces native confirm()
  if (action === 'delete-task' && id) {
    showDeleteModal(id);
  }

  if (action === 'open-ach' && id) {
    const key = 'ach_' + id;
    expandedSections.has(key) ? expandedSections.delete(key) : expandedSections.add(key);
    render();
  }
  if (action === 'open-hist' && id) {
    const key = 'hist_' + id;
    expandedSections.has(key) ? expandedSections.delete(key) : expandedSections.add(key);
    render();
  }
  if (action === 'toggle-ach') {
    const taskId = btn.dataset.taskid;
    const achId = btn.dataset.achid;
    if (taskId && achId) toggleAchievement(taskId, achId);
  }
  if (action === 'del-ach') {
    const taskId = btn.dataset.taskid;
    const achId = btn.dataset.achid;
    if (taskId && achId) deleteAchievement(taskId, achId);
  }
});

// Modal Actions Listeners
document.getElementById('modalCancelBtn')?.addEventListener('click', () => {
  hideDeleteModal();
});

document.getElementById('modalConfirmBtn')?.addEventListener('click', () => {
  if (taskToDeleteId) {
    deleteTask(taskToDeleteId);
    hideDeleteModal();
  }
});

// Event Listener for Adding Achievements
document.getElementById('grid')?.addEventListener('submit', (e: SubmitEvent) => {
  const target = e.target as HTMLElement;
  if (target.dataset.action === 'add-ach') {
    e.preventDefault();
    const taskId = target.dataset.id;
    const input = target.querySelector('input') as HTMLInputElement | null;
    if (taskId && input && input.value.trim()) {
      addAchievement(taskId, input.value.trim());
      input.value = '';
    }
  }
});

// Window Action Listeners
document.getElementById('minimizeBtn')?.addEventListener('click', () => {
  void setMiniMode(true);
});

document.getElementById('restoreBtn')?.addEventListener('click', () => {
  void setMiniMode(false);
});

document.getElementById('addForm')?.addEventListener('submit', (e: SubmitEvent) => {
  e.preventDefault();
  const input = document.getElementById('taskInput') as HTMLInputElement | null;
  if (input && input.value.trim()) {
    addTask(input.value.trim());
    input.value = '';
  }
});

// Initial Load
loadTasks();