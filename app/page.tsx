'use client';

import React, { useState, useEffect, useCallback } from 'react';

type Habit = {
  id: string;
  text: string;
  completed: boolean;
  lastCompletedDate: string;
};

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  important?: boolean;
  backburner?: boolean;
  activeTab?: boolean;  // true = in the "Active" middle tab
  activeSince?: string; // ISO date string (YYYY-MM-DD) when moved to Active
  dueDate?: string;     // ISO date string (YYYY-MM-DD)
};

const DEFAULT_HABITS: Habit[] = [];

const getTodayStr = () => new Date().toLocaleDateString('en-CA');

export default function Home() {
  const [hour, setHour] = useState<number | null>(null);
  
  // App State (To-Dos)
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  
  // Habitica State
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [newHabitText, setNewHabitText] = useState('');

  // Editing State
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editingHabitText, setEditingHabitText] = useState('');
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [editingTodoDate, setEditingTodoDate] = useState('');

  // Timer State
  const [focusDuration, setFocusDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [timeLeft, setTimeLeft] = useState(25 * 60); 
  const [isRunning, setIsRunning] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus');
  
  // Edit State
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editInputValue, setEditInputValue] = useState("");
  
  // Prevent hydration mismatch
  const [mounted, setMounted] = useState(false);

  const getTodayStr = () => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    console.log('Due Date System Active. Today is:', today);
    return today;
  };

  // DND Reminder State
  const [showDndReminder, setShowDndReminder] = useState(false);

  // Drag and Drop State
  const [draggedTodoIndex, setDraggedTodoIndex] = useState<number | null>(null);
  const [dragOverTodoIndex, setDragOverTodoIndex] = useState<number | null>(null);

  // Swipe State (sidebar only)
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Todo view tab
  const [todoView, setTodoView] = useState<'today' | 'active' | 'backburner'>('today');
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Standby / Media Session State
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [wakeLock, setWakeLock] = useState<any>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    
    // Register PWA Service Worker
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(function(err) {
          console.error('ServiceWorker registration failed: ', err);
        });
      });
    }

    // Calculate current Focus Day (Resets at 3:00 AM EST)
    const getFocusDayStr = () => {
      const estString = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const estNow = new Date(estString);
      if (estNow.getHours() < 3) estNow.setDate(estNow.getDate() - 1);
      return `${estNow.getFullYear()}-${estNow.getMonth() + 1}-${estNow.getDate()}`;
    };
    const focusDayStr = getFocusDayStr();
    const savedFocusDayStr = localStorage.getItem('focus-day-str');
    const shouldPurge = savedFocusDayStr && savedFocusDayStr !== focusDayStr;
    localStorage.setItem('focus-day-str', focusDayStr);

    // Core Focus
    const savedTodos = localStorage.getItem('focus-todos');
    const savedFocus = localStorage.getItem('focus-duration');
    const savedBreak = localStorage.getItem('break-duration');
    
    // Habitica Stats
    const savedHabits = localStorage.getItem('focus-habits');
    const savedDailies = localStorage.getItem('focus-dailies');
    
    if (savedTodos) {
      let parsedTodos = JSON.parse(savedTodos);
      if (shouldPurge) {
        parsedTodos = parsedTodos.filter((t: any) => !t.completed);
      }
      setTodos(parsedTodos);
    } else {
      // Migrate from old "One Big Thing" structure if it exists
      const savedThing = localStorage.getItem('focus-big-thing');
      const savedDone = localStorage.getItem('focus-is-done');
      if (savedThing) {
        const initialTodos = [{ id: Date.now().toString(), text: savedThing, completed: savedDone === 'true', important: false }];
        setTodos(shouldPurge ? initialTodos.filter(t => !t.completed) : initialTodos);
      }
    }
    
    // Parse Habits (combining old habits and old dailies to preserve data)
    let initialHabits: Habit[] = [];
    if (savedDailies) {
      initialHabits = [...initialHabits, ...JSON.parse(savedDailies)];
    }
    if (savedHabits) {
      try {
        const parsed = JSON.parse(savedHabits);
        // Map old habits (+/-) to new schema if they don't have completed flag
        const migrated = parsed.filter((h: any) => h.score !== undefined).map((h: any) => ({
          id: h.id, text: h.text, completed: false, lastCompletedDate: ''
        }));
        // If it's already the new schema (e.g. page reload after this update), just use it
        const current = parsed.filter((h: any) => h.score === undefined);
        initialHabits = [...initialHabits, ...migrated, ...current];
      } catch (e) {}
    }

    // Deduplicate by ID just in case
    const uniqueHabits = Array.from(new Map(initialHabits.map(h => [h.id, h])).values());

    // Check Rhythm Resets
    const today = getTodayStr();
    const validatedHabits = uniqueHabits.map(h => {
      if (h.completed && h.lastCompletedDate !== today) {
        return { ...h, completed: false };
      }
      return h;
    });
    setHabits(validatedHabits);

    // Load durations
    let initialFocus = 25;
    if (savedFocus) {
      initialFocus = parseInt(savedFocus, 10);
      setFocusDuration(initialFocus);
    }
    if (savedBreak) {
      setBreakDuration(parseInt(savedBreak, 10));
    }
    
    setTimeLeft(initialFocus * 60);
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('focus-todos', JSON.stringify(todos));
      localStorage.setItem('focus-duration', focusDuration.toString());
      localStorage.setItem('break-duration', breakDuration.toString());
      localStorage.setItem('focus-habits', JSON.stringify(habits));
      if (activeTaskId) localStorage.setItem('focus-active-id', activeTaskId);
    }
  }, [todos, focusDuration, breakDuration, habits, activeTaskId, mounted]);

  // Background color logic
  useEffect(() => {
    setHour(new Date().getHours());
    const interval = setInterval(() => {
      setHour(new Date().getHours());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Midnight task promotion: Today → Active, and Sunday demotion: Active (7d+) → Backburner
  useEffect(() => {
    if (!mounted) return;

    const runMidnightLogic = () => {
      const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      const lastReset = localStorage.getItem('last-midnight-reset') ?? '';
      if (lastReset === todayStr) return; // already ran today

      setTodos(prev => prev.map(t => {
        // Skip completed or already-categorized tasks
        if (t.completed || t.backburner || t.activeTab) return t;
        // Today tasks → Active
        return { ...t, activeTab: true, activeSince: todayStr };
      }));

      // On Sunday (day 0), demote Active tasks older than 7 days to Backburner
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0) {
        setTodos(prev => prev.map(t => {
          if (!t.activeTab || t.backburner) return t;
          if (!t.activeSince) return { ...t, backburner: true, activeTab: false };
          const msInDay = 86400000;
          const daysSince = Math.floor((Date.now() - new Date(t.activeSince).getTime()) / msInDay);
          if (daysSince >= 7) {
            return { ...t, backburner: true, activeTab: false };
          }
          return t;
        }));
      }

      localStorage.setItem('last-midnight-reset', todayStr);
    };

    // Run once on mount (catches any missed midnight resets)
    runMidnightLogic();

    // Watch the clock — fires the check every minute
    const clockInterval = setInterval(runMidnightLogic, 60000);
    return () => clearInterval(clockInterval);
  }, [mounted]);

  // Auto-collapse sidebar in focus mode
  useEffect(() => {
    if (isRunning) setIsSidebarOpen(false);
  }, [isRunning]);

  // Audio Cue (Zen Chime using Web Audio API)
  const playChime = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 1.5);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 3);
    } catch (e) {
      // Silently ignore if audio context is not supported or allowed
    }
  }, []);

  // Screen Wake Lock & Media Session Logic
  useEffect(() => {
    if (!mounted) return;

    let audio: HTMLAudioElement | null = null;
    
    try {
      // Create a hidden silent audio element to keep Media Session active
      audio = new Audio('/silence.wav');
      audio.loop = true;
      audioRef.current = audio;

      if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Lock In',
          artist: 'Daily Lock In',
          album: 'Zen Productivity',
          artwork: [
            { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }
          ]
        });
      }
    } catch (e) {
      console.error('Media setup failed:', e);
    }

    return () => {
      if (audio) audio.pause();
    };
  }, [mounted]);

  // Request Wake Lock
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
      }
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
    }
  };

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && timeLeft > 0) {
      try {
        // Manage Silence
        const audio = audioRef.current;
        if (audio && audio.paused) {
          audio.play().catch(() => {});
        }
        
        // requestWakeLock can only be called from a user gesture usually, 
        // so we call it here and hope the previous play() start counts as one or it just fails silently.
        requestWakeLock();

        // Sync to Media Session
        if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
          const activeTaskText = todos.find(t => t.id === activeTaskId)?.text || "Lock In Session";
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `${formatTime(timeLeft)} — ${activeTaskText}`,
            artist: timerMode === 'focus' ? '🎯 Locked In' : '☕ Take a Break',
            album: 'Daily Lock In',
            artwork: [
              { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }
            ]
          });
          navigator.mediaSession.playbackState = 'playing';
        }
      } catch (e) {
        console.warn('Timer sync issue:', e);
      }

      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else {
      // Pause Silence & Release Wake Lock if not running
      try {
        const audio = audioRef.current;
        if (audio) audio.pause();
        if (wakeLock) {
          (wakeLock as any).release().then(() => setWakeLock(null)).catch(() => setWakeLock(null));
        }
        
        if (timeLeft === 0 && isRunning) {
          playChime();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
          }
          
          if (timerMode === 'focus') {
            setTimerMode('break');
            setTimeLeft(breakDuration * 60);
          } else {
            setTimerMode('focus');
            setTimeLeft(focusDuration * 60);
            setIsRunning(false); 
            setActiveTaskId(null); // Clear active task on complete
          }
        }
      } catch (e) {}
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, timerMode, playChime, focusDuration, breakDuration, wakeLock]);

  const getBackgroundClass = () => {
    if (isRunning && timerMode === 'focus') return 'from-indigo-950 to-violet-950 shadow-[inset_0_0_100px_rgba(0,0,0,0.4)]';
    if (timerMode === 'break') return 'from-emerald-800 to-teal-950';
    if (hour === null) return 'from-slate-900 to-indigo-950'; 
    if (hour >= 5 && hour < 12) return 'from-slate-800 to-indigo-900';
    if (hour >= 12 && hour < 17) return 'from-slate-800 to-indigo-950';
    if (hour >= 17 && hour < 21) return 'from-slate-900 to-purple-950';
    return 'from-slate-900 to-indigo-950';
  };



  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTimerColorClass = () => {
    if (timerMode === 'break' || !isRunning) return 'text-white/80';
    
    const totalSeconds = focusDuration * 60;
    const thirdMark = totalSeconds / 3;
    
    if (timeLeft <= 60) {
      return 'text-red-500 font-bold drop-shadow-[0_0_15px_rgba(239,68,68,0.5)] scale-110';
    } else if (timeLeft <= thirdMark) {
      return 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)] scale-105';
    }
    return 'text-white/80';
  };
  
  const handleTimeSubmit = () => {
    setIsEditingTime(false);
    let newMins = parseInt(editInputValue, 10);
    
    if (isNaN(newMins)) newMins = timerMode === 'focus' ? focusDuration : breakDuration;
    if (newMins < 1) newMins = 1;
    if (newMins > 120) newMins = 120;
    
    if (timerMode === 'focus') {
      setFocusDuration(newMins);
    } else {
      setBreakDuration(newMins);
    }
    
    const currentSeconds = timeLeft % 60;
    setTimeLeft(newMins * 60 + currentSeconds);
  };

  // Update document body background to fix iOS Safari overscroll color mismatch
  useEffect(() => {
    const getHexColor = () => {
      if (isRunning && timerMode === 'focus') return '#2e1065';
      if (timerMode === 'break') return '#065f46';
      if (hour === null) return '#0f172a';
      if (hour >= 5 && hour < 12) return '#1e293b';
      if (hour >= 12 && hour < 17) return '#1e293b';
      if (hour >= 17 && hour < 21) return '#0f172a';
      return '#0f172a';
    };

    if (typeof document !== 'undefined') {
      document.body.style.backgroundColor = getHexColor();
    }
  }, [timerMode, isRunning, hour]);

  const toggleTimer = () => {
    if (isEditingTime) handleTimeSubmit();
    
    // Trigger immersive DND reminder specifically when STARTING a Focus block
    if (!isRunning && timerMode === 'focus') {
      setShowDndReminder(true);
      setTimeout(() => {
        setShowDndReminder(false);
      }, 5000); // fade out after 5 seconds
    }
    
    setIsRunning(!isRunning);
  };
  
  const resetTimer = () => {
    setIsRunning(false);
    setIsEditingTime(false);
    setTimerMode('focus');
    setTimeLeft(focusDuration * 60);
    setActiveTaskId(null);
  };



  const handleSaveHabit = (id: string) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, text: editingHabitText.trim() || h.text } : h));
    setEditingHabitId(null);
  };

  const handleSaveTodo = (id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text: editingTodoText.trim() || t.text, dueDate: editingTodoDate || undefined } : t));
    setEditingTodoId(null);
    setEditingTodoDate('');
  };

  const sortTodos = (list: Todo[]) =>
    [...list].sort((a, b) => {
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      if (!a.completed && !b.completed) {
        if (a.important && !b.important) return -1;
        if (!a.important && b.important) return 1;
      }
      return 0;
    });

  const handleToggleTodo = (id: string) => {
    setTodos(prev => {
      const toggled = prev.find(t => t.id === id);
      if (!toggled) return prev;
      const isNowCompleted = !toggled.completed;
      const others = prev.filter(t => t.id !== id);
      let newList: Todo[];
      if (isNowCompleted) {
        newList = [...others, { ...toggled, completed: true }];
      } else {
        const firstCompletedIndex = others.findIndex(t => t.completed);
        const insertIndex = firstCompletedIndex === -1 ? others.length : firstCompletedIndex;
        newList = [
          ...others.slice(0, insertIndex),
          { ...toggled, completed: false },
          ...others.slice(insertIndex)
        ];
      }
      return sortTodos(newList);
    });
  };

  const handleToggleStar = (id: string) => {
    setTodos(prev => sortTodos(prev.map(t => t.id === id ? { ...t, important: !t.important } : t)));
  };

  const moveTodo = (id: string, dir: 'up' | 'down') => {
    setTodos(prev => {
      const currentViewTodos = prev.filter(t => todoView === 'backburner' ? !!t.backburner : !t.backburner);
      const visIdx = currentViewTodos.findIndex(t => t.id === id);
      const targetVisIdx = dir === 'up' ? visIdx - 1 : visIdx + 1;
      if (targetVisIdx < 0 || targetVisIdx >= currentViewTodos.length) return prev;
      const srcId = currentViewTodos[visIdx].id;
      const tgtId = currentViewTodos[targetVisIdx].id;
      const srcAbsIdx = prev.findIndex(t => t.id === srcId);
      const tgtAbsIdx = prev.findIndex(t => t.id === tgtId);
      const newTodos = [...prev];
      [newTodos[srcAbsIdx], newTodos[tgtAbsIdx]] = [newTodos[tgtAbsIdx], newTodos[srcAbsIdx]];
      return newTodos;
    });
  };

  const handleAddTodo = () => {
    const textToSubmit = newTodoText.trim();
    if (!textToSubmit) return;
    
    setTodos(prev => {
      const newTodo = { id: Date.now().toString(), text: textToSubmit, completed: false, important: false, backburner: todoView === 'backburner' };
      const firstCompletedIndex = prev.findIndex(t => t.completed);
      
      let insertedList = [];
      if (firstCompletedIndex === -1) {
        insertedList = [...prev, newTodo];
      } else {
        insertedList = [
          ...prev.slice(0, firstCompletedIndex),
          newTodo,
          ...prev.slice(firstCompletedIndex)
        ];
      }
      
      return insertedList.sort((a, b) => {
        if (a.completed && !b.completed) return 1;
        if (!a.completed && b.completed) return -1;
        if (!a.completed && !b.completed) {
          if (a.important && !b.important) return -1;
          if (!a.important && b.important) return 1;
        }
        return 0;
      });
    });
    
    setNewTodoText('');
  };

  const handleAddHabit = () => {
    const textToSubmit = newHabitText.trim();
    if (!textToSubmit) return;
    setHabits(p => [...p, { id: Date.now().toString(), text: textToSubmit, completed: false, lastCompletedDate: '' }]); 
    setNewHabitText(''); 
  };

  // Touch Handlers for Swipe to Close sidebar
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchCurrentX = e.targetTouches[0].clientX;
    const diff = touchStartX - touchCurrentX;
    
    // Swipe left (diff > 40px) to close sidebar
    if (diff > 40) {
      setIsSidebarOpen(false);
      setTouchStartX(null);
    }
  };

  const handleTouchEnd = () => {
    setTouchStartX(null);
  };

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedTodoIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Use a small delay to make the element semi-transparent while dragging
    setTimeout(() => {
      const target = e.target as HTMLElement;
      if (target) target.classList.add('opacity-40');
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverTodoIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedTodoIndex === null || draggedTodoIndex === dropIndex) {
      setDraggedTodoIndex(null);
      setDragOverTodoIndex(null);
      return;
    }

    const newTodos = [...todos];
    // Filter visible todos based on current view (to handle index mapping correctly)
    const currentViewTodos = todos.filter(t => todoView === 'backburner' ? !!t.backburner : !t.backburner);
    const draggedTodo = currentViewTodos[draggedTodoIndex];
    const targetTodo = currentViewTodos[dropIndex];
    
    if (!draggedTodo || !targetTodo) return;

    // Find absolute indices in the main todos array
    const absoluteDraggedIndex = todos.findIndex(t => t.id === draggedTodo.id);
    const absoluteTargetIndex = todos.findIndex(t => t.id === targetTodo.id);

    // Swap / Splice
    newTodos.splice(absoluteDraggedIndex, 1);
    newTodos.splice(absoluteTargetIndex, 0, draggedTodo);

    setTodos(newTodos);
    setDraggedTodoIndex(null);
    setDragOverTodoIndex(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove('opacity-40');
    setDraggedTodoIndex(null);
    setDragOverTodoIndex(null);
  };

  if (!mounted) return null;

  const isAllDone = todos.length > 0 && todos.every(t => t.completed);
  const totalTodos = todos.length;
  const completedTodos = todos.filter(t => t.completed).length;
  const todoPercent = totalTodos === 0 ? 0 : (completedTodos / totalTodos) * 100;
  const ringRadius = 36;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (todoPercent / 100) * ringCircumference;

  const visibleTodos = todos.filter(t => {
    if (todoView === 'backburner') return !!t.backburner;
    if (todoView === 'active') return !t.backburner && !!t.activeTab;
    return !t.backburner && !t.activeTab;
  });
  const visibleCount = visibleTodos.length;

  const todoListSection = visibleCount === 0 ? null : (
    <div 
      className="flex flex-col gap-2 items-start w-full max-w-2xl mx-auto pr-1"
      style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
    >
      {visibleTodos.map((todo, index) => (
        <div 
          key={todo.id} 
          className={`w-full rounded-xl transition-all duration-300 ${selectedTodoId === todo.id ? 'relative z-[45] bg-white/10 shadow-2xl scale-[1.02] py-1 px-2' : ''}`}
        >
          <div className="flex items-center gap-3 w-full py-2">
            <input
              type="checkbox"
              checked={todo.completed}
              onClick={(e) => e.stopPropagation()}
              onChange={() => handleToggleTodo(todo.id)}
              className="check-input w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white/30 hover:scale-110 active:scale-95 shrink-0"
            />
            {editingTodoId === todo.id ? (
              <div className="flex-1 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={editingTodoText}
                  onChange={(e) => setEditingTodoText(e.target.value)}
                  onBlur={() => handleSaveTodo(todo.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTodo(todo.id);
                    if (e.key === 'Escape') setEditingTodoId(null);
                  }}
                  autoFocus
                  className="flex-1 bg-transparent border-b-2 border-white/50 outline-none text-lg sm:text-2xl font-sans font-medium text-white min-w-0"
                />
                <input
                  type="date"
                  value={editingTodoDate}
                  onChange={(e) => setEditingTodoDate(e.target.value)}
                  className="bg-white/10 border-none rounded-lg px-2 py-1 text-xs text-white outline-none focus:bg-white/20 transition-all font-sans"
                />
              </div>
            ) : (
              <button 
                onClick={() => {
                  if (selectedTodoId === todo.id) {
                    setSelectedTodoId(null);
                  } else {
                    setSelectedTodoId(todo.id);
                  }
                }}
                className={`flex-1 text-left transition-all duration-300 min-w-0 outline-none group/text ${activeTaskId === todo.id ? 'scale-[1.03] origin-left' : ''}`}
              >
                <span className={`text-base sm:text-xl font-sans font-bold transition-all leading-tight select-none block ${todo.completed ? 'line-through text-white/40' : todo.dueDate === getTodayStr() ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]' : todo.important ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' : 'text-white'} ${activeTaskId === todo.id ? 'text-indigo-300 drop-shadow-[0_0_12px_rgba(129,140,248,0.4)]' : 'group-hover/text:text-white/90'}`}>
                  {todo.text}
                </span>
              </button>
            )}
            {todo.dueDate && editingTodoId !== todo.id && (
              <span className={`px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-bold tracking-tight shrink-0 transition-all flex items-center gap-1 ${todo.dueDate === getTodayStr() ? 'bg-red-500/30 text-red-500 border border-red-500/50 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {todo.dueDate === getTodayStr() ? 'Due Today' : todo.dueDate}
              </span>
            )}
            {activeTaskId === todo.id && isRunning && (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-200 text-[10px] font-bold tracking-widest uppercase animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.3)] shrink-0">
                Focusing
              </div>
            )}
            {todo.important && selectedTodoId !== todo.id && activeTaskId !== todo.id && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
            )}
            {/* Tap target — opens action bar without requiring a full-row press */}
            <button
              onClick={() => setSelectedTodoId(selectedTodoId === todo.id ? null : todo.id)}
              className={`ml-auto px-2 py-1 rounded-full text-xs transition-all shrink-0 ${
                selectedTodoId === todo.id
                  ? 'bg-white/15 text-white/80'
                  : 'bg-white/5 text-white/20 hover:text-white/50'
              }`}
            >···</button>
          </div>
          {/* COMPACT Action Drawer: Horizontal Icon Bar */}
          {selectedTodoId === todo.id && (
            <div 
              className="w-full mt-3 p-2 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-around animate-slide-down relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Focus Icon Action */}
              <button 
                onClick={() => {
                  setActiveTaskId(activeTaskId === todo.id ? null : todo.id);
                  if (activeTaskId !== todo.id && !isRunning) toggleTimer();
                  setSelectedTodoId(null);
                }}
                className={`p-3 rounded-xl transition-all active:scale-90 ${activeTaskId === todo.id ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10'}`}
                title={activeTaskId === todo.id ? 'Stop Focus' : 'Start Focus'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
              
              {/* Star Icon Action */}
              <button 
                onClick={() => handleToggleStar(todo.id)} 
                className={`p-3 rounded-xl transition-all active:scale-90 ${todo.important ? 'text-amber-400 bg-amber-400/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'text-white/40 hover:text-amber-300 hover:bg-amber-400/10'}`}
                title={todo.important ? 'Remove Priority' : 'Mark Priority'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              </button>

              {/* Backburner Icon Toggle */}
              <button 
                onClick={() => { setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, backburner: !t.backburner } : t)); setSelectedTodoId(null); }} 
                className={`p-3 rounded-xl transition-all active:scale-90 ${todo.backburner ? 'text-orange-400 bg-orange-400/10 shadow-[0_0_15px_rgba(251,146,60,0.3)]' : 'text-white/40 hover:text-orange-400 hover:bg-orange-500/10'}`}
                title={todo.backburner ? 'Move to Today' : 'Move to Later'}
              >
                <div className="text-xl leading-none grayscale-[0.5] hover:grayscale-0 transition-all">🔥</div>
              </button>

              {/* Rename Icon Action */}
              <button 
                onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text); setEditingTodoDate(todo.dueDate || ''); setSelectedTodoId(null); }} 
                className="p-3 rounded-xl transition-all active:scale-90 text-white/40 hover:text-white hover:bg-white/10"
                title="Rename Task"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                </svg>
              </button>

              {/* Move Up/Down Buttons */}
              {!todo.completed && (
                <>
                  <button
                    onClick={() => { moveTodo(todo.id, 'up'); }}
                    className="p-3 rounded-xl transition-all active:scale-90 text-white/40 hover:text-white hover:bg-white/10"
                    title="Move Up"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { moveTodo(todo.id, 'down'); }}
                    className="p-3 rounded-xl transition-all active:scale-90 text-white/40 hover:text-white hover:bg-white/10"
                    title="Move Down"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Move Between Today/Active buttons */}
                  {todoView === 'today' ? (
                    <button 
                      onClick={() => {
                        setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, activeTab: true, activeSince: new Date().toLocaleDateString('en-CA') } : t));
                        setSelectedTodoId(null);
                      }}
                      className="p-3 rounded-xl transition-all active:scale-90 text-indigo-400 hover:text-white hover:bg-indigo-500/20"
                      title="Move to Active"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : todoView === 'active' ? (
                    <button 
                      onClick={() => {
                        setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, activeTab: false } : t));
                        setSelectedTodoId(null);
                      }}
                      className="p-3 rounded-xl transition-all active:scale-90 text-indigo-400 hover:text-white hover:bg-indigo-500/20"
                      title="Move back to Today"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                      </svg>
                    </button>
                  ) : null}
                </>
              )}

              {/* Delete Icon Action */}
              <button 
                onClick={() => { setTodos(prev => prev.filter(t => t.id !== todo.id)); setSelectedTodoId(null); }} 
                className="p-3 rounded-xl transition-all active:scale-90 text-white/20 hover:text-red-400 hover:bg-red-500/10"
                title="Delete forever"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <main className={`flex min-h-screen flex-col items-center p-4 sm:p-24 transition-colors duration-1000 ease-in-out bg-gradient-to-br ${getBackgroundClass()} relative overflow-x-hidden`} style={{ paddingTop: 'var(--safe-top)' }}>
      
      {/* Immersive DND Reminder Toast */}
      <div 
        className={`fixed top-12 sm:top-20 z-50 px-6 py-4 rounded-full bg-slate-950/40 backdrop-blur-md border border-white/10 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] flex items-center gap-3 transition-all duration-1000 transform pointer-events-none ${showDndReminder ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-12 opacity-0 scale-95'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-300" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
        <span className="text-sm font-medium text-white/90 tracking-wide font-sans">
          Silence your world for {focusDuration} minutes.
        </span>
      </div>

      {/* Global Click-Outside Handler for To-do Actions */}
      {selectedTodoId && (
        <div 
          className="fixed inset-0 z-[40]" 
          onClick={() => setSelectedTodoId(null)}
          onWheel={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
        />
      )}

      {/* Sidebar Toggle Button - High Z-index to stay above sticky header */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{ top: 'calc(1.5rem + var(--safe-top))' }}
        className={`fixed left-6 z-[100] p-3 rounded-2xl text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition-all ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        title="Toggle Habitica Sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Main App Overlay (Invisible swipe area / Dimmed click area) */}
      {/* Main App Overlay (Invisible swipe area / Dimmed click area) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-md cursor-pointer transition-opacity duration-500"
          onClick={() => setIsSidebarOpen(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-label="Close Sidebar"
        />
      )}

      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ paddingTop: 'calc(4rem + var(--safe-top))' }}
        className={`fixed top-0 left-0 h-[100dvh] w-80 max-w-[85vw] bg-slate-950/95 backdrop-blur-3xl border-r border-white/10 shadow-2xl z-[90] transform transition-transform duration-500 ease-out flex flex-col pb-8 px-6 overflow-y-auto ${isSidebarOpen ? 'translate-x-0 shadow-[0_0_50px_rgba(0,0,0,1)]' : '-translate-x-full shadow-none'}`}
      >
        {/* Close Button Inside Sidebar */}
        <button 
          onClick={() => setIsSidebarOpen(false)}
          style={{ top: 'calc(1.5rem + var(--safe-top))' }}
          className="absolute right-6 p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
          aria-label="Close Sidebar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* To-Do Progress Ring */}
        <div className="flex flex-col gap-4 mb-8">
          <h2 className="text-xl font-bold text-white/80 tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            Locked In
          </h2>
          <div className="flex flex-col items-center justify-center gap-4 p-6 rounded-xl border border-white/10 bg-white/5 shadow-inner">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Track */}
                <circle 
                  cx="50" cy="50" r={ringRadius} 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  className="text-white/10" 
                />
                {/* Progress Ring */}
                <circle 
                  cx="50" cy="50" r={ringRadius} 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  strokeLinecap="round"
                  className="text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)] transition-all duration-1000 ease-out"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-white/90">{Math.round(todoPercent)}%</span>
              </div>
            </div>
            <p className="text-xs text-white/50">{completedTodos} of {totalTodos} completed</p>
          </div>
        </div>
        {/* Habits Section */}
        <div className="flex flex-col gap-4 mb-8">
          <h2 className="text-xl font-bold text-white/80 tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Habits
          </h2>
          
          <div className="flex flex-col gap-3">
            {habits.map(habit => {
              const isDue = !habit.completed;
              return (
                <div key={habit.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 group ${isDue ? 'bg-white/5 border-white/10' : 'bg-white/[0.02] border-white/5 opacity-50'}`}>
                  {/* Radio Style Completed Button */}
                  <button 
                    onClick={() => {
                      setHabits(prev => prev.map(h => 
                        h.id === habit.id ? { ...h, completed: !h.completed, lastCompletedDate: getTodayStr() } : h
                      ));
                    }}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${habit.completed ? 'bg-indigo-500/40 border-indigo-400' : 'bg-transparent border-white/20 hover:border-white/40'}`}
                  >
                    {habit.completed && <div className="w-2 h-2 rounded-full bg-white animate-scale-in" />}
                  </button>

                  {editingHabitId === habit.id ? (
                    <input 
                      type="text"
                      value={editingHabitText}
                      onChange={(e) => setEditingHabitText(e.target.value)}
                      onBlur={() => handleSaveHabit(habit.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveHabit(habit.id);
                        if (e.key === 'Escape') setEditingHabitId(null);
                      }}
                      autoFocus
                      className="flex-1 bg-transparent border-b border-white/30 outline-none text-base font-sans font-medium text-white min-w-0"
                    />
                  ) : (
                    <>
                      <span 
                        onDoubleClick={() => {
                          setEditingHabitId(habit.id);
                          setEditingHabitText(habit.text);
                        }}
                        className={`text-base font-sans font-semibold text-white/90 flex-1 truncate cursor-text select-none ${habit.completed ? 'line-through text-white/40' : ''}`}
                      >
                        {habit.text}
                      </span>
                      <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setEditingHabitId(habit.id);
                            setEditingHabitText(habit.text);
                          }}
                          className="p-1.5 rounded-lg text-white/20 hover:text-white hover:bg-white/5 transition-all"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button 
                          onClick={() => setHabits(prev => prev.filter(h => h.id !== habit.id))}
                          className="p-1.5 rounded-lg text-white/10 hover:text-red-400/70 hover:bg-red-500/5 transition-all"
                          title="Delete"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleAddHabit(); }}>
            <input 
              type="text" 
              value={newHabitText} 
              onChange={e => setNewHabitText(e.target.value)} 
              onBlur={handleAddHabit}
              enterKeyHint="done"
              placeholder="Add a Habit..." 
              className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/30 transition-all font-medium hover:bg-white/5" 
            />
          </form>
        </div>

      </div>

      {/* Sticky Header Layer - Increased Z-index to stay on top */}
      <div className="sticky top-0 z-[60] w-full flex flex-col items-center gap-4 bg-transparent pb-4" style={{ paddingTop: 'var(--safe-top)' }}>
        {/* Top Timer Card - COMPLETELY TRANSPARENT */}
        <div className="w-full max-w-xl p-4 sm:p-6 flex flex-col items-center justify-center relative group">
          {/* Pomodoro Timer */}
          <div className="flex flex-col items-center transition-opacity duration-300 opacity-100">
            <div 
              className={`text-6xl sm:text-8xl md:text-9xl font-mono font-light tracking-widest transition-all duration-500 ${getTimerColorClass()} ${!isRunning && !isAllDone ? 'cursor-pointer hover:text-white' : ''}`}
              onClick={() => {
                if (!isRunning && !isEditingTime) {
                  setIsEditingTime(true);
                  setEditInputValue(Math.floor(timeLeft / 60).toString());
                }
              }}
              title={!isRunning ? "Click to edit minutes" : ""}
            >
              {isEditingTime ? (
                <div className="flex items-center justify-center">
                  <input 
                    type="number"
                    value={editInputValue}
                    onChange={(e) => setEditInputValue(e.target.value)}
                    onBlur={handleTimeSubmit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTimeSubmit();
                      if (e.key === 'Escape') {
                        setIsEditingTime(false);
                        setEditInputValue(""); // revert
                      }
                    }}
                    className="bg-transparent border-b-2 border-white/30 text-right text-white outline-none w-20 sm:w-28 focus:border-white transition-all [-moz-appearance:_textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none"
                    autoFocus
                    min={1}
                    max={120}
                  />
                  <span className="ml-[0.1em]">:</span>
                  <span>{(timeLeft % 60).toString().padStart(2, '0')}</span>
                </div>
              ) : (
                formatTime(timeLeft)
              )}
            </div>
            <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-2 transition-colors h-4">
              {timerMode === 'break' ? 'Break Time' : 'Focus Time'}
            </div>

            {/* Active Task Indicator with Pressure */}
            {timerMode === 'focus' && isRunning ? (
              <div className="flex flex-col items-center mb-8 sm:mb-10 min-h-[3rem] justify-center text-center relative group/objective w-full max-w-xs">
                {activeTaskId && (
                  <button 
                    onClick={() => setActiveTaskId(null)}
                    className="absolute -right-4 top-0 p-1 opacity-0 group-hover/objective:opacity-40 hover:!opacity-100 transition-all text-white/50"
                    title="Clear objective"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <span className="text-[10px] uppercase tracking-[0.3em] text-indigo-400 font-bold mb-1 opacity-70">Current Objective</span>
                <span className="text-lg sm:text-2xl font-sans font-bold text-white tracking-tight drop-shadow-[0_4px_12px_rgba(255,255,255,0.2)] animate-pulse">
                  {todos.find(t => t.id === activeTaskId)?.text || "Choose a task to crush"}
                </span>
              </div>
            ) : (
              <div className="mb-8 sm:mb-10 h-[3rem]" />
            )}
            
            <div className="flex gap-4 sm:gap-6">
              <button 
                onClick={toggleTimer}
                className="px-8 py-3 sm:px-10 sm:py-4 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 hover:scale-105 active:scale-95 transition-all text-sm sm:text-base uppercase tracking-wider font-semibold"
              >
                {isRunning ? 'Pause' : 'Start'}
              </button>
              <button 
                onClick={resetTimer}
                className="px-8 py-3 sm:px-10 sm:py-4 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 hover:scale-105 active:scale-95 transition-all text-sm sm:text-base uppercase tracking-wider font-semibold"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* HERO CARD: Task Input */}
        <div className="w-full max-w-2xl rounded-3xl bg-white/5 backdrop-blur-3xl border border-indigo-400/20 shadow-[0_8px_40px_0_rgba(99,102,241,0.15)] px-6 py-6 sm:px-10 flex flex-col items-center relative overflow-hidden">
          {/* subtle gradient glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none rounded-3xl" />
          <form onSubmit={(e) => { e.preventDefault(); handleAddTodo(); }} className="w-full relative">
            <input 
              type="text" 
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              onBlur={handleAddTodo}
              enterKeyHint="done"
              placeholder={todoView === 'backburner' ? "What do you kinda need to do?" : "What do you need to do today?"} 
              className="w-full bg-transparent border-none outline-none text-2xl sm:text-4xl font-sans font-bold text-white placeholder:text-white/30 text-center tracking-tight transition-all duration-300"
            />
          </form>
        </div>

        {/* Tab Switcher: Today / Backburner (Now Sticky too!) */}
        <div className="w-full max-w-2xl px-2 flex justify-between gap-2 mt-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setTodoView('today')}
            className={`flex-1 min-w-[30%] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold tracking-wide transition-all ${
              todoView === 'today'
                ? 'bg-indigo-500/40 text-white border border-indigo-400/50 shadow-lg scale-[1.02]'
                : 'bg-white/5 text-white/30 hover:text-white/50 border border-white/5'
            }`}
          >
            TODAY
          </button>
          <button
            onClick={() => setTodoView('active')}
            className={`flex-1 min-w-[30%] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold tracking-wide transition-all ${
              todoView === 'active'
                ? 'bg-indigo-500/80 text-white border border-indigo-400 shadow-lg scale-[1.02]'
                : 'bg-white/5 text-white/30 hover:text-white/50 border border-white/5'
            }`}
          >
            ACTIVE {todos.filter(t => !t.backburner && t.activeTab).length > 0 && `(${todos.filter(t => !t.backburner && t.activeTab).length})`}
          </button>
          <button
            onClick={() => setTodoView('backburner')}
            className={`flex-1 min-w-[30%] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold tracking-wide transition-all ${
              todoView === 'backburner'
                ? 'bg-orange-500/40 text-white border border-orange-400/50 shadow-lg scale-[1.02]'
                : 'bg-white/5 text-white/30 hover:text-white/50 border border-white/5'
            }`}
          >
            🔥 BACKBURNER {todos.filter(t => t.backburner).length > 0 && `(${todos.filter(t => t.backburner).length})`}
          </button>
        </div>
      </div>

      {/* Scrollable To-Do List Content */}
      <div className={`w-full max-w-2xl flex flex-col items-center transition-all duration-500 relative ${selectedTodoId ? 'z-[55]' : 'z-10'} ${isAllDone ? 'opacity-50' : 'opacity-100'}`}>
        <div className="w-full py-4 flex flex-col items-center relative overflow-hidden">
          {/* List of To-Dos */}
          {todoListSection}
        </div>
      </div>
    </main>
  );
}
