import { useCallback, useEffect, useState } from 'react';
import { curatorAreaLabel, type CuratorArea } from '../../lib/curatorAreas.ts';

type Task = { id: string; area: CuratorArea | null; title: string; description: string | null; due_at: string | null; status: string; done_note: string | null };
const day = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

/** «Мои задачи куратора» on the player's home screen (owner, 2026-10-01); hidden for everyone without tasks. */
export default function CuratorTasksCard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [noteFor, setNoteFor] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/player/curator-tasks', { credentials: 'include', cache: 'no-store' });
      if (response.ok) setTasks((await response.json()).tasks || []);
    } catch { /* optional block */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const done = async (task: Task) => {
    if (busy) return;
    setBusy(task.id);
    try {
      const response = await fetch(`/api/player/curator-tasks/${encodeURIComponent(task.id)}/done`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (response.ok) { setNoteFor(''); setNote(''); await load(); }
    } finally { setBusy(''); }
  };

  if (!tasks.length) return null;
  const open = tasks.filter((task) => task.status === 'todo');
  return (
    <section data-testid="player-curator-tasks" className="rounded-[28px] border border-sky-300/20 bg-sky-300/[0.06] p-4">
      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-100/70">Мои задачи куратора{open.length ? ` · ${open.length}` : ''}</div>
      <div className="mt-3 space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-2xl bg-black/20 p-3">
            <strong className={`block text-[14px] ${task.status === 'done' ? 'text-white/45 line-through' : 'text-white'}`}>{task.title}</strong>
            <span className="mt-0.5 block text-[12px] text-white/50">{task.area ? curatorAreaLabel(task.area) : 'Клуб'}{task.due_at ? ` · срок ${day(task.due_at)}` : ''}{task.status === 'done' ? ' · сделано' : ''}</span>
            {task.description ? <p className="mt-1 text-[12px] leading-5 text-white/60">{task.description}</p> : null}
            {task.status === 'todo' ? (noteFor === task.id ? <div className="mt-2 space-y-2">
              <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Коротко, что сделано — необязательно" className="min-h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-[14px] text-white outline-none placeholder:text-white/30" />
              <button type="button" disabled={Boolean(busy)} onClick={() => void done(task)} className="min-h-11 w-full rounded-xl bg-white text-[14px] font-semibold text-black disabled:opacity-50">{busy === task.id ? 'Сохраняем…' : 'Готово'}</button>
            </div> : <button type="button" onClick={() => { setNoteFor(task.id); setNote(''); }} className="mt-2 min-h-11 w-full rounded-xl bg-white/10 text-[14px] font-semibold text-white">Сделано</button>) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
