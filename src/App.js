import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Upload, Download, Trash2, Volume2, VolumeX, Pencil, BarChart3 } from 'lucide-react';
import {
  COLOR_PALETTE,
  colorProps,
  uid,
  csvCell,
  formatTime,
  downloadFile,
  normalizeAction,
  actionType,
  makePanel,
  loadPanels,
  savePanels,
  defaultActionsCopy,
  buildPanelExport,
  parseImportedPanels,
  loadAnnotations,
  saveAnnotations,
  loadClockKeys,
  saveClockKeys,
  loadScoreBoxes,
  saveScoreBoxes,
  loadScoreArea,
  saveScoreArea,
} from './panelUtils';
import Timeline from './components/Timeline';
import RegionSelector from './components/RegionSelector';
import { createScoreReader, createCellReader } from './scoreboard';
import { detectScoreboard } from './scoreboardLayout';
import { ReadingGuard } from './readingGuard';
import { recognizeText, cropToCanvas, contentRect, parseClock, regionAt, findClockInCanvas, seekVideo } from './ocr';
import {
  ActionEditModal,
  BulkAddModal,
  DescriptorModal,
  AnnotationEditModal,
  SummaryModal,
  summaryToCSV,
} from './components/Modals';

export default function VideoAnnotator() {
  const [videoSrc, setVideoSrc] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [activeShot, setActiveShot] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [gameClockTime, setGameClockTime] = useState('');
  const [playbackSpeed, setPlaybackSpeed] = useState(0.5);
  const [customAnnotation, setCustomAnnotation] = useState('');
  const [volume, setVolume] = useState(1);
  const [prevVolume, setPrevVolume] = useState(1);
  const [exportName, setExportName] = useState('annotations');
  const [teams, setTeams] = useState([
    { id: 'team-a', name: 'Team A', color: '#2563eb' },
    { id: 'team-b', name: 'Team B', color: '#dc2626' }
  ]);
  const [activeTeamId, setActiveTeamId] = useState('team-a');
  const [folderFiles, setFolderFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedOverlay, setProcessedOverlay] = useState(null);
  const [currentBoxes, setCurrentBoxes] = useState([]);
  const [newActionLabel, setNewActionLabel] = useState('');

  // buttons of the current panel
  const [initialPanelData] = useState(loadPanels);
  const [panels, setPanels] = useState(initialPanelData.panels);
  const [activePanelId, setActivePanelId] = useState(initialPanelData.activePanelId);
  const activePanel = panels.find((p) => p.id === activePanelId) || panels[0];
  const actions = activePanel.actions;

  const updatePanelActions = (panelId, updater) =>
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId ? { ...p, actions: typeof updater === 'function' ? updater(p.actions) : updater } : p
      )
    );
  const setActions = (updater) => updatePanelActions(activePanel.id, updater);

  const [editingAction, setEditingAction] = useState(null);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [descriptorPrompt, setDescriptorPrompt] = useState(null);
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [toast, setToast] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [clipMode, setClipMode] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [dragActionId, setDragActionId] = useState(null);
  const [videoKey, setVideoKey] = useState(null);
  const [clockKeys, setClockKeys] = useState([]);
  const clockRegion = regionAt(clockKeys, currentTime);
  const [selectingRegion, setSelectingRegion] = useState(false); // false, 'clock', 'scoreA', 'scoreB' or 'scoreArea'
  const [clockStatic, setClockStatic] = useState(true);
  const [scoreBoxes, setScoreBoxes] = useState({ a: null, b: null });
  const [scoreValues, setScoreValues] = useState(null);
  const [scoreArea, setScoreArea] = useState(null);
  const [detectBusy, setDetectBusy] = useState(false);
  const [scoreText, setScoreText] = useState('');
  const [scoreBusy, setScoreBusy] = useState(false);
  const [liveRead, setLiveRead] = useState(true);
  const [autoClock, setAutoClock] = useState(false);
  const [period, setPeriod] = useState('');
  const [clockBusy, setClockBusy] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const panelImportRef = useRef(null);
  const clipRef = useRef(null);
  const hotkeyRef = useRef(null);
  const modalOpenRef = useRef(false);
  const lastIdRef = useRef(0);
  const liveBusyRef = useRef(false);
  const seekEpochRef = useRef(0);
  const rerunRef = useRef(false);
  const liveReadRef = useRef(null);
  const guardRef = useRef(null);
  const scoreReaderRef = useRef(null);
  if (!guardRef.current) guardRef.current = new ReadingGuard();

  const nextId = () => {
    const id = Math.max(Date.now(), lastIdRef.current + 1);
    lastIdRef.current = id;
    return id;
  };

  modalOpenRef.current = !!(
    selectingRegion || activeShot || editingAction || showBulkAdd || descriptorPrompt || editingAnnotation || showSummary
  );

  useEffect(() => {
    savePanels(panels, activePanelId);
  }, [panels, activePanelId]);

  useEffect(() => {
    if (videoKey) saveClockKeys(videoKey, clockKeys);
  }, [videoKey, clockKeys]);

  useEffect(() => {
    if (videoKey) saveScoreBoxes(videoKey, scoreBoxes);
  }, [videoKey, scoreBoxes]);

  useEffect(() => {
    if (videoKey) saveScoreArea(videoKey, scoreArea);
  }, [videoKey, scoreArea]);

  useEffect(() => {
    if (!liveRead) return undefined;
    if (!isPlaying) {
      const once = setTimeout(() => liveReadRef.current && liveReadRef.current(), 300);
      return () => clearTimeout(once);
    }
    const timer = setInterval(() => liveReadRef.current && liveReadRef.current(), 1500);
    return () => clearInterval(timer);
  }, [liveRead, isPlaying]);

  useEffect(() => {
    if (videoKey) saveAnnotations(videoKey, annotations);
  }, [videoKey, annotations]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const shotLocations = [
    'Paint', 'Restricted Area', 'Left Corner 3', 'Right Corner 3', 
    'Left Wing 3', 'Right Wing 3', 'Above Break 3', 'Midrange Left', 'Midrange Right', 'Midrange Center'
  ];

  const teamColors = {
    'Jazz': '#753bbd',
    'Hawks': '#e03a3e',
    'Magic': '#0077c0',
    'Rockets': '#ce1141',
    'Nuggets': '#0e2240',
    'Kings': '#5a2d81',
    'Spurs': '#c4ced4',
    'Warriors': '#1d428a',
    'Thunder': '#ef3b24',
    'Lakers': '#552583',
    'Northwestern': '#4E2A84',
    'Illinois': '#13294b',
    'Indiana': '#990000',
    'Iowa': '#FFCD00',
    'Maryland': '#E03a3e',
    'Michigan': '#00274c',
    'Michigan State': '#18453B',
    'Minnesota': '#7A0019',
    'Nebraska': '#e41c38',
    'Ohio State': '#BB0000',
    'Penn State': '#041E42',
    'Purdue': '#ceb888',
    'Rutgers': '#cc0033',
    'Wisconsin': '#c5050c'
  };

  const seekBy = useCallback(
    (delta) => {
      if (!videoRef.current) return;
      const newTime = Math.min(Math.max(videoRef.current.currentTime + delta, 0), duration || 0);
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (!videoRef.current || e.target.matches('input, textarea, select') || modalOpenRef.current) return;

      if (e.code === 'Space') {
        e.preventDefault();
        videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        setIsPlaying(!videoRef.current.paused);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekBy(3);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-3);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && hotkeyRef.current) {
        hotkeyRef.current(e);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [seekBy]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      stopClips(false);
      setVideoSrc(url);
      setVideoKey(file.name);
      setAnnotations(loadAnnotations(file.name));
      setClockKeys(loadClockKeys(file.name));
      setScoreBoxes(loadScoreBoxes(file.name));
      setScoreArea(loadScoreArea(file.name));
      setScoreText('');
      setScoreValues(null);
      guardRef.current.reset();
      setCurrentBoxes([]);
      setProcessedOverlay(null);
      setCurrentTime(0);
      setPlaybackSpeed(0.5);
      setVolume(1);
      setPrevVolume(1);
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setExportName(baseName);
      setCurrentFileIndex(null);
    }
  };

  function extractTeamsFromFolderName(folderName) {
    const parts = folderName.split('_');
    if (parts.length < 2) {
      return [
        { id: 'team-a', name: 'Team A', color: '#2563eb' },
        { id: 'team-b', name: 'Team B', color: '#dc2626' }
      ];
    }

    const teamA = parts[0].replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
    const teamB = parts[1].replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
    const teamACap = capitalizeWords(teamA)
    const teamBCap = capitalizeWords(teamB)
    return [
      {
        id: teamACap, 
        name: teamACap, 
        color: teamColors[teamACap] || '#2563eb' // Fallback to blue if not in teamColors
      }, 
      {
        id: teamBCap,
        name: teamBCap,
        color: teamColors[teamBCap] || '#dc2626' // Fallback to red if not in teamColors
      }
    ];
  }

const handleTeamRightClick = (e, teamId) => {
  e.preventDefault();
  const currentTeam = teams.find(t => t.id === teamId);
  
  const newName = prompt("Enter new team name:", currentTeam.name);
  if (!newName) return;

  const newColor = prompt("Enter color name or hex code (e.g. #2563eb):", currentTeam.color);
  if (!newColor) return;

  setTeams(teams.map(t => 
    t.id === teamId ? { ...t, name: newName, color: newColor } : t
  ));
};

  function capitalizeWords(str) {
    return str
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  function sortFiles(files) {
    return [...files].sort((a, b) => {
      const parse = (file) => {
        const name = file.name.replace(/\.[^/.]+$/, '');
        const parts = name.split('_');

        const quarterPart = parts[0];
        const timePart = parts[2];

        const quarterMatch = quarterPart.match(/Q(\d+)/i);
        const quarter = quarterMatch ? parseInt(quarterMatch[1], 10) : 99;
        const time = parseInt(timePart, 10) || 0;

        return { quarter, time };
      };

      const A = parse(a);
      const B = parse(b);

      if (A.quarter !== B.quarter) return A.quarter - B.quarter;
      return B.time - A.time;
    });
  }

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files);
    setFolderFiles(sortFiles(files));
    setCurrentFileIndex(null);

    if (files.length > 0) {
      const folderName = files[0].webkitRelativePath.split('/')[0];
      const [team1, team2] = extractTeamsFromFolderName(folderName);
      setTeams([team1, team2]);
      setActiveTeamId(team1.id);
    }
  };

  const loadVideoFromFile = (file, index) => {
    const url = URL.createObjectURL(file);
    const key = file.webkitRelativePath || file.name;
    stopClips(false);
    setVideoSrc(url);
    setVideoKey(key);
    setAnnotations(loadAnnotations(key));
    setClockKeys(loadClockKeys(key));
    setScoreBoxes(loadScoreBoxes(key));
    setScoreArea(loadScoreArea(key));
    setScoreText('');
    setScoreValues(null);
    guardRef.current.reset();
    setCurrentBoxes([]);
    setProcessedOverlay(null);
    setCurrentTime(0);
    setPlaybackSpeed(0.5);
    setVolume(1);
    setPrevVolume(1);
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setExportName(baseName);
    setCurrentFileIndex(index);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else {
      setProcessedOverlay(null); // clear the tracker view
      setCurrentBoxes([]); // old boxes don't match the new frame
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const clipRange = (a) => {
    const start = a.startTime !== undefined ? a.startTime : a.timestamp;
    const end = a.endTime !== undefined ? a.endTime : a.timestamp;
    return end > start ? { start, end } : { start: Math.max(0, a.timestamp - 1), end: a.timestamp + 3 };
  };

  const playClip = (index) => {
    const clip = clipRef.current;
    if (!clip || !videoRef.current) return;
    const { start } = clip.list[index];
    videoRef.current.currentTime = start;
    setCurrentTime(start);
    setProcessedOverlay(null);
    const p = videoRef.current.play();
    if (p && p.catch) p.catch(() => {});
    setIsPlaying(true);
  };

  const stopClips = (pause = true) => {
    clipRef.current = null;
    setClipMode(false);
    if (pause && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const advanceClip = () => {
    const clip = clipRef.current;
    if (!clip) return false;
    if (clip.idx + 1 < clip.list.length) {
      clip.idx += 1;
      playClip(clip.idx);
    } else {
      stopClips();
    }
    return true;
  };

  const startClips = () => {
    if (!videoRef.current) return;
    const list = [...visibleAnnotations].sort((a, b) => a.timestamp - b.timestamp).map(clipRange);
    if (list.length === 0) return;
    clipRef.current = { list, idx: 0 };
    setClipMode(true);
    playClip(0);
  };

  const handleVideoEnded = () => {
    if (advanceClip()) return;
    setIsPlaying(false);
  };

  const handleVideoClick = () => handlePlayPause();

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    const clip = clipRef.current;
    if (clip && t >= clip.list[clip.idx].end) advanceClip();
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.playbackRate = playbackSpeed;
      videoRef.current.volume = volume;
      videoRef.current.muted = volume === 0;
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    stopClips(false);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setProcessedOverlay(null);
    setCurrentBoxes([]);
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    if (newVolume > 0) setPrevVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
  };

  const toggleMute = () => {
    if (volume === 0) handleVolumeChange(prevVolume || 1);
    else {
      setPrevVolume(volume);
      handleVolumeChange(0);
    }
  };

  const handleActionClick = (action) => {
    if (!videoRef.current) return;
    const timestamp = videoRef.current.currentTime;

    if (action.kind === 'shot') {
      // Pause video while they fill out the form
      if (isPlaying) handlePlayPause();
      setActiveShot({ ...action, timestamp });
    } else if (action.descriptors && action.descriptors.length > 0) {
      setDescriptorPrompt({ action, timestamp });
    } else {
      addAnnotation(action, { timestamp });
    }
  };

  // hotkeys
  hotkeyRef.current = (e) => {
    if (e.key.length !== 1) return;
    const key = e.key.toLowerCase();
    const action = actions.find((a) => a.hotkey === key);
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) handleActionClick(action);
  };

  const handleRightClick = (e, actionId) => {
    e.preventDefault(); // Stop the default browser menu from appearing
    const action = actions.find((a) => a.id === actionId);
    if (action) setEditingAction(action);
  };

  const buildAnnotation = (action, { timestamp, label, descriptor, metadata } = {}) => {
    const ts = timestamp !== undefined ? timestamp : videoRef.current ? videoRef.current.currentTime : 0;
    const lead = Number(action.lead) || 0;
    const lag = Number(action.lag) || 0;
    const team = teams.find((t) => t.id === activeTeamId);
    const players = currentBoxes.filter((b) => b.playerName).map((b) => b.playerName);
    return {
      id: nextId(),
      type: actionType(action),
      label: label !== undefined ? label : action.label,
      color: action.color,
      timestamp: ts,
      formattedTime: formatTime(ts),
      startTime: Math.max(0, ts - lead),
      endTime: duration ? Math.min(duration, ts + lag) : ts + lag,
      gameClockTime: gameClockTime || 'N/A',
      ...(scoreText ? { scoreboard: scoreText } : {}),
      ...(scoreText && scoreValues ? { scores: scoreValues } : {}),
      activeTeamName: team ? team.name : '',
      ...(descriptor ? { descriptor } : {}),
      players,
      note: '',
      metadata: { ...(metadata || {}), frameDetections: currentBoxes },
    };
  };

  const finalizeShotAnnotation = (location, result) => {
    const newAnnotation = buildAnnotation(activeShot, {
      timestamp: activeShot.timestamp,
      label: `${activeShot.label} (${result}) - ${location}`,
      // Store metadata for cleaner data analysis later
      metadata: { location, result, shotType: activeShot.label },
    });

    setAnnotations([newAnnotation, ...annotations]);
    setActiveShot(null);
    autoReadClock(newAnnotation.id);
  };

  const addAnnotation = (action, options) => {
    if (!videoRef.current) return;
    const newAnnotation = buildAnnotation(action, options);
    setAnnotations((prev) => [newAnnotation, ...prev]);
    autoReadClock(newAnnotation.id);
  };

  const addCustomAnnotation = () => {
    if (!videoRef.current || !customAnnotation.trim()) return;
    const newAnnotation = buildAnnotation(
      { id: 'Other', label: customAnnotation.trim(), color: 'bg-gray-500' },
      { timestamp: videoRef.current.currentTime }
    );
    setAnnotations([newAnnotation, ...annotations]);
    setCustomAnnotation('');
    autoReadClock(newAnnotation.id);
  };

  const addNewActionButton = () => {
    const label = newActionLabel.trim();
    if (!label) return;
    if (actions.some((a) => a.label.toLowerCase() === label.toLowerCase())) {
      setToast({ message: `A button named "${label}" already exists` });
      return;
    }

    const newBtn = normalizeAction({
      id: uid('btn'),
      label,
      color: COLOR_PALETTE[actions.length % COLOR_PALETTE.length],
      definition: 'User created action',
    });

    setActions([...actions, newBtn]);
    setNewActionLabel('');
  };

  const addBulkActions = (labels, group) => {
    const newBtns = labels.map((label, i) =>
      normalizeAction({
        id: uid('btn'),
        label,
        group,
        color: COLOR_PALETTE[(actions.length + i) % COLOR_PALETTE.length],
        definition: 'User created action',
      })
    );
    setActions((prev) => [...prev, ...newBtns]);
    setShowBulkAdd(false);
    setToast({ message: `Added ${newBtns.length} button${newBtns.length === 1 ? '' : 's'}` });
  };

  const saveActionEdit = (updated) => {
    const clean = normalizeAction(updated);
    setActions((prev) => {
      // built in buttons use the label as id, keep that unless it clashes
      const canRename =
        !String(updated.id).startsWith('btn-') &&
        clean.label !== updated.id &&
        !prev.some((a) => a.id === clean.label);
      const finalAction = canRename ? { ...clean, id: clean.label } : clean;
      return prev.map((a) => (a.id === updated.id ? finalAction : a));
    });
    setEditingAction(null);
  };

  const deleteAction = (id) => {
    const index = actions.findIndex((a) => a.id === id);
    if (index < 0) return;
    const removed = actions[index];
    const panelId = activePanel.id;
    updatePanelActions(panelId, (prev) => prev.filter((a) => a.id !== id));
    setEditingAction(null);
    setToast({
      message: `Deleted button "${removed.label}"`,
      undo: () =>
        updatePanelActions(panelId, (prev) => {
          const copy = [...prev];
          copy.splice(Math.min(index, copy.length), 0, removed);
          return copy;
        }),
    });
  };

  const moveAction = (dragId, targetId, groupOverride) => {
    if (!dragId || dragId === targetId) return;
    setActions((prev) => {
      const from = prev.findIndex((a) => a.id === dragId);
      if (from < 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      const target = copy.find((a) => a.id === targetId);
      const moved = { ...item, group: groupOverride !== undefined ? groupOverride : target ? target.group : item.group };
      if (target) copy.splice(copy.indexOf(target), 0, moved);
      else copy.push(moved);
      return copy;
    });
  };

  const newPanel = () => {
    const name = prompt('Name for the new panel:');
    if (!name || !name.trim()) return;
    const panel = makePanel(name.trim(), []);
    setPanels((prev) => [...prev, panel]);
    setActivePanelId(panel.id);
  };

  const renamePanel = () => {
    const name = prompt('Rename panel to:', activePanel.name);
    if (!name || !name.trim()) return;
    setPanels((prev) => prev.map((p) => (p.id === activePanel.id ? { ...p, name: name.trim() } : p)));
  };

  const duplicatePanel = () => {
    const copy = makePanel(`${activePanel.name} copy`, activePanel.actions);
    setPanels((prev) => [...prev, copy]);
    setActivePanelId(copy.id);
  };

  const deletePanel = () => {
    if (panels.length <= 1) {
      setToast({ message: 'You need at least one panel' });
      return;
    }
    if (!window.confirm(`Delete panel "${activePanel.name}" and its ${actions.length} buttons?`)) return;
    const remaining = panels.filter((p) => p.id !== activePanel.id);
    setPanels(remaining);
    setActivePanelId(remaining[0].id);
  };

  const resetPanel = () => {
    if (!window.confirm(`Replace all buttons in "${activePanel.name}" with the built-in defaults?`)) return;
    setActions(defaultActionsCopy());
  };

  const exportPanels = (all) => {
    const list = all ? panels : [activePanel];
    const name = all ? 'tagging-panels' : activePanel.name.replace(/[^a-z0-9-_]+/gi, '_') || 'tagging-panel';
    downloadFile(`${name}.json`, JSON.stringify(buildPanelExport(list), null, 2), 'application/json');
  };

  const importPanels = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseImportedPanels(String(reader.result));
        const names = new Set(panels.map((p) => p.name));
        const renamed = imported.map((p) => {
          let name = p.name;
          if (names.has(name)) name = `${name} (imported)`;
          names.add(name);
          return { ...p, name };
        });
        setPanels((prev) => [...prev, ...renamed]);
        setActivePanelId(renamed[0].id);
        setToast({ message: `Imported ${renamed.length} panel${renamed.length === 1 ? '' : 's'}` });
      } catch (err) {
        setToast({ message: `Import failed: ${err.message}` });
      }
    };
    reader.readAsText(file);
  };

  const deleteAnnotation = (id) => {
    const index = annotations.findIndex((a) => a.id === id);
    if (index < 0) return;
    const removed = annotations[index];
    setAnnotations(annotations.filter((a) => a.id !== id));
    setToast({
      message: 'Annotation deleted',
      undo: () =>
        setAnnotations((prev) => {
          const copy = [...prev];
          copy.splice(Math.min(index, copy.length), 0, removed);
          return copy;
        }),
    });
  };

  const saveAnnotationEdit = (id, changes) => {
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const delta = changes.timestamp - a.timestamp;
        return {
          ...a,
          ...changes,
          formattedTime: formatTime(changes.timestamp),
          startTime: Math.max(0, (a.startTime !== undefined ? a.startTime : a.timestamp) + delta),
          endTime: (a.endTime !== undefined ? a.endTime : a.timestamp) + delta,
        };
      })
    );
    setEditingAnnotation(null);
  };

  const seekToAnnotation = (timestamp) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = timestamp;
    setCurrentTime(timestamp);
  };


  const getSafeExportName = (ext) => {
    const base = exportName.trim() !== '' ? exportName.trim() : 'annotations';
    return `${base}.${ext}`;
  };

  const getCleanAnnotations = () => annotations.map(({ color, ...rest }) => rest);

  const exportAnnotationsJSON = () => {
    const cleanAnnotations = getCleanAnnotations();
    const dataStr = JSON.stringify(cleanAnnotations, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getSafeExportName('json');
    link.click();
  };

  const exportAnnotationsCSV = () => {
    const cleanAnnotations = getCleanAnnotations();
    // new columns go at the end
    const headers = ['Timestamp', 'Game Clock', 'Team', 'Action', 'Label', 'Start', 'End', 'Descriptor', 'Players', 'Note', 'Scoreboard'];

    const csvRows = cleanAnnotations.map((ann) => {
      const meta = ann.metadata || {};
      const players = ann.players && ann.players.length
        ? ann.players
        : (meta.frameDetections || []).filter((d) => d.playerName).map((d) => d.playerName);

      return [
        ann.formattedTime,
        ann.gameClockTime || '',
        ann.activeTeamName || '',
        ann.type,
        `"${ann.label.replace(/"/g, '""')}"`, // Wrap in quotes to handle commas
        ann.startTime !== undefined ? ann.startTime.toFixed(2) : '',
        ann.endTime !== undefined ? ann.endTime.toFixed(2) : '',
        csvCell(ann.descriptor || ''),
        csvCell(players.join('; ')),
        csvCell(ann.note || ''),
        csvCell(ann.scoreboard || ''),
      ].join(',');
    });

    downloadFile(getSafeExportName('csv'), [headers.join(','), ...csvRows].join('\n'), 'text/csv;charset=utf-8;');
  };

  const exportSummaryCSV = (summary) => {
    downloadFile(getSafeExportName('summary.csv'), summaryToCSV(summary), 'text/csv;charset=utf-8;');
  };

  const visibleAnnotations = annotations.filter(
    (a) => (filterType === 'all' || a.type === filterType) && (filterTeam === 'all' || a.activeTeamName === filterTeam)
  );
  const annotationTypes = [...new Set(annotations.map((a) => a.type))];
  const annotationTeams = [...new Set(annotations.map((a) => a.activeTeamName).filter(Boolean))];

  const formatClock = (t) => (period.trim() ? `${t} ${period.trim()}` : t);

  const addClockKey = (region, atTime) => {
    const t = atTime !== undefined ? atTime : videoRef.current ? videoRef.current.currentTime : 0;
    const key = { t: clockStatic ? 0 : t, x: region.x, y: region.y, w: region.w, h: region.h };
    setClockKeys((prev) =>
      clockStatic ? [key] : [...prev.filter((k) => Math.abs(k.t - t) > 0.5), key].sort((a, b) => a.t - b.t)
    );
    try {
      localStorage.setItem('tc_clock_region_v1', JSON.stringify(region));
    } catch (e) {
      // ignore
    }
  };

  // the clock area as a few differently processed pictures, in case the first one can't be read
  const captureClock = () => {
    const video = videoRef.current;
    const region = video ? regionAt(clockKeys, video.currentTime) : null;
    if (!region) return null;
    return ['auto', true, false].map((invert) => cropToCanvas(video, region, { minHeight: 120, invert }));
  };

  const captureFrame = (invert = 'auto') =>
    videoRef.current
      ? cropToCanvas(videoRef.current, { x: 0, y: 0, w: 1, h: 1 }, { minHeight: 0, maxWidth: 1600, invert })
      : null;

  const readClockText = async (canvases) => {
    for (const canvas of [].concat(canvases)) {
      if (!canvas) continue;
      const text = parseClock(await recognizeText(canvas, { whitelist: '0123456789:.', psm: '7' }));
      if (text) return text;
    }
    return '';
  };

  // looks for the clock anywhere in the frame
  const findClock = async () => {
    if (!videoRef.current) return;
    setClockBusy(true);
    try {
      for (const invert of [true, false]) {
        const canvas = captureFrame(invert);
        const hit = canvas ? await findClockInCanvas(canvas) : null;
        if (hit) {
          addClockKey(hit.region);
          setGameClockTime(formatClock(hit.text));
          return;
        }
      }
      setToast({ message: 'No clock found in this frame. Try a frame where the scoreboard is clearly visible, or draw the region by hand.' });
    } catch (err) {
      setToast({ message: `OCR failed: ${err.message}` });
    } finally {
      setClockBusy(false);
    }
  };

  const readGameClock = async () => {
    if (clockKeys.length === 0) {
      await findClock();
      return;
    }
    const canvas = captureClock();
    if (!canvas) return;
    setClockBusy(true);
    try {
      const t = await readClockText(canvas);
      if (t) setGameClockTime(formatClock(t));
      else setToast({ message: 'Could not read the clock here. Try "Find clock", or set the region again at this point in the video.' });
    } catch (err) {
      setToast({ message: `OCR failed: ${err.message}` });
    } finally {
      setClockBusy(false);
    }
  };

  const getScoreReader = () => {
    if (!scoreReaderRef.current) scoreReaderRef.current = createScoreReader({ text: recognizeText });
    return scoreReaderRef.current;
  };

  const captureBox = (region) =>
    region && videoRef.current ? cropToCanvas(videoRef.current, region, { minHeight: 0, raw: true }) : null;

  // the number in each score box, or null where the box is missing or unclear
  const readScoreBoxes = async (canvases) => {
    const reader = getScoreReader();
    const values = [];
    for (const canvas of canvases) {
      const read = canvas ? await reader(canvas) : null;
      values.push(read ? read.value : null);
    }
    return values;
  };

  const scoreLine = (values) =>
    values
      .map((v, i) => (v === null ? null : `${teams[i] ? teams[i].name : 'Team ' + (i + 1)} ${v}`))
      .filter(Boolean)
      .join(' - ');

  // runs the readings through the guard. gives the accepted scores, or null if a box has none yet
  const settleScores = (values, canvases) => {
    const guard = guardRef.current;
    const accepted = values.map((v, i) => {
      if (!canvases[i]) return null;
      if (v === null) return guard.scores[i] ? guard.scores[i].value : null;
      return guard.acceptScore(i, v);
    });
    const ready = canvases.every((c, i) => !c || accepted[i] !== null);
    return ready && accepted.some((v) => v !== null) ? accepted : null;
  };

  // looks at the tagged scoreboard in a few moments of the video and works out where the names, scores and clock are
  const autoDetectScoreboard = async () => {
    const video = videoRef.current;
    if (!video || !scoreArea) {
      setSelectingRegion('scoreArea');
      return;
    }
    setDetectBusy(true);
    const hidden = document.createElement('video');
    try {
      hidden.muted = true;
      hidden.preload = 'auto';
      hidden.src = videoSrc;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The video took too long to open')), 20000);
        hidden.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        hidden.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Could not open the video'));
        };
      });

      // pictures from different moments, the last one is the current moment
      const start = video.currentTime;
      const limit = (video.duration || start + 60) - 0.5;
      const offsets = [36, 26, 18, 12, 8, 4, 0];
      const ahead = offsets.map((o) => start + o).filter((t) => t <= limit);
      const times = ahead.length >= 4 ? ahead : offsets.map((o) => start - o).filter((t) => t >= 0);
      const pictures = [];
      for (const t of times) {
        await seekVideo(hidden, t);
        const picture = cropToCanvas(hidden, scoreArea, { minHeight: 0, raw: true });
        if (picture) pictures.push(picture);
      }
      if (pictures.length < 3) throw new Error('Not enough of the video to look at');

      const result = await detectScoreboard(pictures, { text: recognizeText }, createCellReader);
      if (!result.found) {
        setToast({ message: "Couldn't work out the scoreboard. Draw the score boxes yourself with Set score A and Set score B." });
        return;
      }

      const place = (box) => ({
        x: scoreArea.x + ((box.x0 - 1) / result.w) * scoreArea.w,
        y: scoreArea.y + ((box.y0 - 1) / result.h) * scoreArea.h,
        w: ((box.x1 - box.x0 + 3) / result.w) * scoreArea.w,
        h: ((box.y1 - box.y0 + 3) / result.h) * scoreArea.h,
      });
      const [first, second] = result.teams;
      if (first || second) {
        setScoreBoxes({ a: first ? place(first.scoreBox) : null, b: second ? place(second.scoreBox) : null });
        setTeams((prev) => prev.map((t, i) => (result.teams[i] ? { ...t, name: result.teams[i].name } : t)));
      }
      if (result.clockBox) addClockKey(place(result.clockBox));

      guardRef.current.reset();
      if (result.teams.length) {
        const values = [first ? first.score : null, second ? second.score : null];
        setScoreValues(values);
        setScoreText(result.teams.map((t) => `${t.name} ${t.score}`).join(' - '));
      }

      const parts = [];
      if (result.teams.length) parts.push(result.teams.map((t) => t.name).join(' and '));
      if (result.clockBox) parts.push('the clock');
      const missing =
        result.teams.length < 2 ? ' Only found ' + result.teams.length + ' team, draw the other score box with Set score A or B.' : '';
      setToast({ message: `Found ${parts.join(' and ')}. Check the dashed boxes on the video.${missing}` });
    } catch (err) {
      setToast({ message: `Auto-detect failed: ${err.message}. You can draw the boxes yourself.` });
    } finally {
      hidden.removeAttribute('src');
      hidden.load();
      setDetectBusy(false);
    }
  };

  const readScoreboard = async () => {
    const canvases = [captureBox(scoreBoxes.a), captureBox(scoreBoxes.b)];
    if (!canvases[0] && !canvases[1]) {
      setSelectingRegion('scoreA');
      return;
    }
    setScoreBusy(true);
    try {
      const values = await readScoreBoxes(canvases);
      guardRef.current.resetScores();
      const accepted = settleScores(values, canvases);
      if (accepted) {
        setScoreValues(accepted);
        setScoreText(scoreLine(accepted));
      } else {
        setToast({ message: 'Could not read the scores. Draw a tighter box around each number.' });
      }
    } catch (err) {
      setToast({ message: `OCR failed: ${err.message}` });
    } finally {
      setScoreBusy(false);
    }
  };

  // auto mode reads the clock and scores for each new tag, and searches the whole frame if the clock region misses
  const autoReadClock = (annotationId) => {
    if (!autoClock || !videoRef.current) return;
    const video = videoRef.current;
    const crop = captureClock();
    const frame = captureFrame();
    const boxes = [captureBox(scoreBoxes.a), captureBox(scoreBoxes.b)];
    const at = video.currentTime;
    const speed = video.playbackRate;
    const patch = (changes) =>
      setAnnotations((prev) => prev.map((a) => (a.id === annotationId ? { ...a, ...changes } : a)));
    (async () => {
      let t = crop ? await readClockText(crop) : '';
      if (!t && frame) {
        const hit = await findClockInCanvas(frame);
        if (hit) {
          t = hit.text;
          addClockKey(hit.region, at);
        }
      }
      if (t) patch({ gameClockTime: formatClock(guardRef.current.acceptClock(t, at, speed) || t) });
      if (boxes[0] || boxes[1]) {
        const accepted = settleScores(await readScoreBoxes(boxes), boxes);
        if (accepted) patch({ scoreboard: scoreLine(accepted), scores: accepted });
      }
    })().catch(() => {});
  };

  // fills the clock and score boxes from the video, only keeping readings that make sense
  liveReadRef.current = async (force) => {
    const video = videoRef.current;
    if (!video) return;
    if (liveBusyRef.current) {
      // a seek while a read is running: read again as soon as it finishes
      if (force) rerunRef.current = true;
      return;
    }
    const clock = captureClock();
    const boxes = [captureBox(scoreBoxes.a), captureBox(scoreBoxes.b)];
    if (!clock && !boxes[0] && !boxes[1]) return;
    const at = video.currentTime;
    const speed = video.playbackRate;
    const epoch = seekEpochRef.current;
    liveBusyRef.current = true;
    try {
      const guard = guardRef.current;
      if (guard.seen(at)) {
        setGameClockTime('');
        setScoreText('');
        setScoreValues(null);
      }
      if (clock) {
        const text = await readClockText(clock);
        if (epoch !== seekEpochRef.current) return;
        const accepted = text ? guard.acceptClock(text, at, speed) : null;
        if (accepted) setGameClockTime(formatClock(accepted));
      }
      if (boxes[0] || boxes[1]) {
        const values = await readScoreBoxes(boxes);
        if (epoch !== seekEpochRef.current) return;
        const accepted = settleScores(values, boxes);
        if (accepted) {
          setScoreValues(accepted);
          setScoreText(scoreLine(accepted));
        }
      }
    } catch (err) {
      // ignore
    } finally {
      liveBusyRef.current = false;
      if (rerunRef.current || epoch !== seekEpochRef.current) {
        rerunRef.current = false;
        setTimeout(() => liveReadRef.current && liveReadRef.current(), 0);
      }
    }
  };

  const analyzeCurrentFrame = async () => {
    if (!videoRef.current) return;

    // 1. Capture the current frame to a canvas
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // 2. Convert to a Blob (image file)
    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append('image', blob, 'frame.jpg');
      formData.append('conf', '0.25');

      setIsProcessing(true);
      try {
        const response = await fetch('http://localhost:5001/run-inference-frame', {
          method: 'POST',
          body: formData, // Send as multi-part form data
        });

        const data = await response.json();
        if (data.processedImageUrl) {
          setProcessedOverlay(`${data.processedImageUrl}?t=${Date.now()}`);
        }
        if (data.boxes) {
          setCurrentBoxes(data.boxes || [])
        }
      } catch (err) {
        console.error("Frame analysis failed:", err);
      } finally {
        setIsProcessing(false);
      }
    }, 'image/jpeg');
  };

  const savePlayerTag = (index, name) => {
    setCurrentBoxes(prevBoxes => {
      // Create a deep copy of the boxes array
      const newBoxes = [...prevBoxes];
      
      // Update exactly the one at the index clicked
      newBoxes[index] = { 
        ...newBoxes[index], 
        playerName: name 
      };
      
      return newBoxes;
      }); 
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="video/*"
        style={{ display: 'none' }}
      />

      <input
        type="file"
        webkitdirectory="true"
        directory="true"
        multiple
        ref={folderInputRef}
        onChange={handleFolderSelect}
        style={{ display: 'none' }}
      />

      <input
        type="file"
        ref={panelImportRef}
        onChange={importPanels}
        accept=".json,application/json"
        style={{ display: 'none' }}
      />

      <div className="max-w-full mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Sports Non Verbal Communication
        </h1>

        {folderFiles.length === 0 && !videoSrc && (
          <div className="bg-gray-800 rounded-lg p-12 mb-8 border-2 border-dashed border-gray-600 hover:border-blue-500 transition">
            <button
              onClick={() => folderInputRef.current && folderInputRef.current.click()}
              className="w-full flex flex-col items-center gap-4 text-gray-400 hover:text-blue-400"
            >
              <Upload size={64} />
              <span className="text-xl">Click to select folder</span>
              <span className="text-sm">All files inside the folder will be displayed</span>
            </button>
            <div className="mt-6 text-center text-gray-400 text-sm">
              or{' '}
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                upload a single video
              </button>
            </div>
          </div>
        )}

        {(folderFiles.length > 0 || videoSrc) && (
          <div className="flex gap-4">
            {/* LEFT SIDE */}
            <div className="flex-[7] flex flex-col gap-3">
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="relative w-full overflow-hidden rounded-lg bg-black group">
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={handleVideoClick}
                    className={`w-full rounded-lg cursor-pointer ${processedOverlay ? 'opacity-0' : 'opacity-100'}`}
                    style={{ maxHeight: '60vh' }}
                    onEnded={handleVideoEnded}
                    onSeeked={() => {
                      seekEpochRef.current += 1;
                      const hasAreas = clockKeys.length > 0 || scoreBoxes.a || scoreBoxes.b;
                      // a big jump in the video makes the old clock and score wrong, so clear them right away
                      if (liveRead && hasAreas && videoRef.current && guardRef.current.seen(videoRef.current.currentTime)) {
                        setGameClockTime('');
                        setScoreText('');
                        setScoreValues(null);
                      }
                      if (liveRead && liveReadRef.current) liveReadRef.current(true);
                    }}
                  />

                  {selectingRegion && (
                    <RegionSelector
                      videoRef={videoRef}
                      label={
                        selectingRegion === 'scoreA'
                          ? 'Drag a box around the first score (just the number)'
                          : selectingRegion === 'scoreB'
                          ? 'Drag a box around the second score (just the number)'
                          : selectingRegion === 'scoreArea'
                          ? 'Drag a box around the whole scoreboard'
                          : undefined
                      }
                      onDone={(region) => {
                        if (selectingRegion === 'scoreA') setScoreBoxes((prev) => ({ ...prev, a: region }));
                        else if (selectingRegion === 'scoreB') setScoreBoxes((prev) => ({ ...prev, b: region }));
                        else if (selectingRegion === 'scoreArea') setScoreArea(region);
                        else addClockKey(region);
                        setSelectingRegion(false);
                      }}
                      onCancel={() => setSelectingRegion(false)}
                    />
                  )}

                  {clockRegion && !selectingRegion && !isPlaying && !processedOverlay && videoRef.current && (() => {
                    const c = contentRect(videoRef.current);
                    return (
                      <div
                        className="absolute border border-dashed border-yellow-400/70 pointer-events-none z-10"
                        title="Game clock region"
                        style={{
                          left: c.left + clockRegion.x * c.width,
                          top: c.top + clockRegion.y * c.height,
                          width: clockRegion.w * c.width,
                          height: clockRegion.h * c.height,
                        }}
                      />
                    );
                  })()}

                  {scoreArea && !selectingRegion && !isPlaying && !processedOverlay && videoRef.current && (() => {
                    const c = contentRect(videoRef.current);
                    return (
                      <div
                        className="absolute border border-dashed border-purple-400/70 pointer-events-none z-10"
                        title="Scoreboard area"
                        style={{
                          left: c.left + scoreArea.x * c.width,
                          top: c.top + scoreArea.y * c.height,
                          width: scoreArea.w * c.width,
                          height: scoreArea.h * c.height,
                        }}
                      />
                    );
                  })()}

                  {!selectingRegion && !isPlaying && !processedOverlay && videoRef.current &&
                    ['a', 'b'].map((key) => {
                      const box = scoreBoxes[key];
                      if (!box) return null;
                      const c = contentRect(videoRef.current);
                      return (
                        <div
                          key={key}
                          className="absolute border border-dashed border-sky-400/80 pointer-events-none z-10"
                          title={`Score box ${key.toUpperCase()}`}
                          style={{
                            left: c.left + box.x * c.width,
                            top: c.top + box.y * c.height,
                            width: box.w * c.width,
                            height: box.h * c.height,
                          }}
                        />
                      );
                    })}

                  {processedOverlay && (
                    <div className="absolute inset-0 z-10">
                      <img
                        alt=""
                        src={processedOverlay}
                        className="w-full h-full object-fill pointer-events-none"
                      />

                      {currentBoxes.map((box, index) => {
                        const isTagged = !!box.playerName;
                        
                        return (
                          <div
                            key={index}
                            // MOVE THE CLICK HANDLER HERE
                            onClick={(e) => {
                              e.stopPropagation(); // Prevents clicking "through" to the video
                              const name = prompt(`Tag player for box #${index + 1}:`);
                              if (name) {
                                savePlayerTag(index, name);
                              }
                            }}
                            className={`absolute border-2 transition-all duration-200 cursor-pointer ${
                              isTagged ? 'border-green-500 bg-green-500/20' : 'border-transparent hover:border-yellow-400'
                            }`}
                            style={{
                              left: `${(box.x1 / (videoRef.current?.videoWidth || 1)) * 100}%`,
                              top: `${(box.y1 / (videoRef.current?.videoHeight || 1)) * 100}%`,
                              width: `${((box.x2 - box.x1) / (videoRef.current?.videoWidth || 1)) * 100}%`,
                              height: `${((box.y2 - box.y1) / (videoRef.current?.videoHeight || 1)) * 100}%`,
                              zIndex: 20 // Ensure boxes are above the image
                            }}
                          >
                            {isTagged && (
                              <span className="absolute -top-6 left-0 bg-green-500 text-black text-[10px] font-bold px-1 rounded whitespace-nowrap">
                                {box.playerName}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!videoSrc && (
                    <div className="text-gray-400 text-lg text-center">
                      No file selected.
                      <br />
                      <span className="text-lg text-gray-400">
                        Please choose a file from the folder window or upload a file.
                      </span>
                    </div>
                  )}
                </div>

                {/* PLAYER CONTROLS */}
                <div className="mt-2 space-y-2">
                  <div
                    className="relative h-2 bg-gray-700 rounded-full cursor-pointer group"
                    onClick={handleSeek}
                  >
                    <div
                      className="absolute h-full bg-red-600 rounded-full transition-all"
                      style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePlayPause}
                      className="bg-blue-600 hover:bg-blue-700 p-2 rounded-full"
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </button>

                    <span className="text-sm font-mono">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>

                    {/* SPEED */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Speed:</span>
                      <select
                        value={playbackSpeed}
                        onChange={(e) => handleSpeedChange(Number(e.target.value))}
                        className="bg-gray-700 text-white px-2 py-1 text-sm rounded border-2 border-gray-600 focus:border-blue-500"
                      >
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                          <option key={s} value={s}>
                            {s}x
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* VOLUME */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleMute}
                        className="bg-gray-700 hover:bg-gray-600 p-2 rounded-full"
                      >
                        {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>

                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={volume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="w-24 accent-blue-400"
                      />
                    </div>

                    <button
                      onClick={analyzeCurrentFrame}
                      disabled={isProcessing || !videoSrc}
                      className={`px-3 py-1 rounded-lg font-bold flex items-center gap-2 ${
                        isProcessing 
                          ? 'bg-gray-700 cursor-wait' 
                          : 'bg-gray-600 hover:bg-green-700 shadow-lg shadow-green-700/20'
                      }`}
                    >
                      {isProcessing ? (
                        <span className="animate-pulse">Processing Video...</span>
                      ) : (
                        <>
                          <Play size={16} fill="currentColor" />
                          Run Tracking Model
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      className="ml-auto bg-gray-700 hover:bg-gray-600 px-3 py-1 text-sm rounded flex items-center gap-2"
                    >
                      <Upload size={16} />
                      Upload
                    </button>
                  </div>

                  <Timeline
                    annotations={visibleAnnotations}
                    duration={duration}
                    currentTime={currentTime}
                    onSeek={seekToAnnotation}
                  />
                </div>
              </div>

              {/* ANNOTATIONS + FOLDER CONTENTS under video */}
              <div className="flex gap-3">
                {/* ANNOTATIONS */}
                <div className="bg-gray-800 rounded-lg p-3 flex flex-col min-h-[260px] max-h-[360px] flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold">Annotations ({annotations.length})</h2>

                    {annotations.length > 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowSummary(true)}
                          className="bg-gray-600 hover:bg-gray-500 px-3 py-1 text-xs rounded flex items-center gap-1"
                        >
                          <BarChart3 size={14} />
                          Summary
                        </button>
                        <button
                          onClick={exportAnnotationsJSON}
                          className="bg-green-600 hover:bg-green-700 px-3 py-1 text-xs rounded flex items-center gap-1"
                        >
                          <Download size={14} />
                          JSON
                        </button>
                        <button
                          onClick={exportAnnotationsCSV}
                          className="bg-yellow-500 hover:bg-yellow-600 px-3 py-1 text-xs rounded flex items-center gap-1 text-black font-semibold"
                        >
                          <Download size={14} />
                          CSV
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs text-gray-300">Export name:</label>
                    <input
                      type="text"
                      value={exportName}
                      onChange={(e) => setExportName(e.target.value)}
                      placeholder="e.g., hawks-jazz-q1"
                      className="bg-gray-700 text-white px-2 py-1 text-xs rounded border border-gray-600 focus:border-blue-500 flex-1"
                    />
                  </div>

                  {annotations.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-gray-700 text-white px-1 py-1 rounded border border-gray-600 min-w-0 flex-1"
                      >
                        <option value="all">All actions</option>
                        {annotationTypes.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <select
                        value={filterTeam}
                        onChange={(e) => setFilterTeam(e.target.value)}
                        className="bg-gray-700 text-white px-1 py-1 rounded border border-gray-600 min-w-0 flex-1"
                      >
                        <option value="all">All teams</option>
                        {annotationTeams.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        onClick={clipMode ? () => stopClips() : startClips}
                        disabled={!clipMode && visibleAnnotations.length === 0}
                        className={`px-2 py-1 rounded font-semibold whitespace-nowrap ${
                          clipMode ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600'
                        }`}
                      >
                        {clipMode ? 'Stop clips' : `Play clips (${visibleAnnotations.length})`}
                      </button>
                    </div>
                  )}

                  {annotations.length === 0 ? (
                    <p className="text-gray-400 text-center py-6 text-sm">No annotations yet.</p>
                  ) : visibleAnnotations.length === 0 ? (
                    <p className="text-gray-400 text-center py-6 text-sm">No annotations match the filters.</p>
                  ) : (
                    <div className="space-y-2 overflow-y-auto flex-1 pr-2">
                      {visibleAnnotations.map((ann) => (
                        <div
                          key={ann.id}
                          className="bg-gray-700 rounded-lg p-3 flex items-center justify-between hover:bg-gray-600 transition group"
                        >
                          <button
                            onClick={() => seekToAnnotation(ann.timestamp)}
                            className="flex items-center gap-2 flex-1 text-left"
                          >
                            <span {...colorProps(ann.color, 'px-2 py-1 rounded-full text-xs font-semibold')}>
                              {ann.formattedTime}
                            </span>

                            {ann.gameClockTime && ann.gameClockTime !== 'N/A' && (
                              <span className="bg-orange-600 px-2 py-1 rounded-full text-xs font-semibold">
                                {ann.gameClockTime}
                              </span>
                            )}

                            <span className="font-medium text-sm">
                              {ann.label}
                              {ann.descriptor && <span className="text-gray-300"> ({ann.descriptor})</span>}
                              {ann.activeTeamName && (
                                <span className="text-gray-400 text-xs font-normal"> · {ann.activeTeamName}</span>
                              )}
                              {ann.note && <span className="block text-xs text-gray-400 font-normal">{ann.note}</span>}
                            </span>
                          </button>

                          <button
                            onClick={() => setEditingAnnotation(ann)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-white mr-2"
                            title="Edit annotation"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            onClick={() => deleteAnnotation(ann.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* FOLDER CONTENTS */}
                <div className="bg-gray-800 rounded-lg p-3 flex flex-col min-h-[260px] max-h-[360px] flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold">Folder Contents</h2>
                    <button
                      onClick={() => folderInputRef.current && folderInputRef.current.click()}
                      className="bg-gray-700 hover:bg-gray-600 px-3 py-1 text-sm rounded flex items-center gap-2"
                    >
                      Choose Folder
                    </button>
                  </div>

                  {folderFiles.length === 0 ? (
                    <p className="text-gray-400 text-sm">No folder selected.</p>
                  ) : (
                    <ul className="text-sm overflow-y-auto space-y-1 flex-1">
                      {folderFiles.map((file, idx) => (
                        <li
                          key={idx}
                          onClick={() => loadVideoFromFile(file, idx)}
                          className={`${
                            currentFileIndex === idx
                              ? 'text-blue-400 bg-blue-900/30 font-semibold'
                              : 'text-gray-300 hover:text-blue-400'
                          } cursor-pointer px-2 py-1 rounded transition`}
                        >
                          {file.webkitRelativePath || file.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT SIDE — ACTION BUTTONS */}
            <div className="flex-[3] overflow-y-auto">
              {/* GAME CLOCK */}
              <div className="mb-4 p-3 bg-gray-700 rounded">
                <h3 className="text-sm font-bold mb-2">Game Clock</h3>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={gameClockTime}
                    onChange={(e) => setGameClockTime(e.target.value)}
                    placeholder="e.g. 10:45 Q2"
                    className="flex-1 min-w-0 bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="Q2"
                    title="Period added to clocks read by OCR"
                    className="w-14 bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <button
                    onClick={readGameClock}
                    disabled={clockBusy || !videoSrc}
                    className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                  >
                    {clockBusy ? 'Reading...' : 'Read from video'}
                  </button>
                  <button
                    onClick={findClock}
                    disabled={clockBusy || !videoSrc}
                    className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                    title="Search the whole frame for the clock and remember where it is at this moment"
                  >
                    Find clock
                  </button>
                  <button
                    onClick={() => setSelectingRegion('clock')}
                    disabled={!videoSrc}
                    className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                    title="Draw a box around the game clock"
                  >
                    Set clock area
                  </button>
                  <button
                    onClick={() => setClockKeys([])}
                    disabled={clockKeys.length === 0}
                    className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                  >
                    Clear clock area
                  </button>
                  <button
                    onClick={() => setGameClockTime('')}
                    disabled={!gameClockTime}
                    className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                  >
                    Clear text
                  </button>
                  <label className="flex items-center gap-1 text-gray-300" title="Turn on if the clock moves around the screen, then set the area at a few points">
                    <input type="checkbox" checked={!clockStatic} onChange={(e) => setClockStatic(!e.target.checked)} />
                    Camera moves
                  </label>
                  <label className="flex items-center gap-1 text-gray-300" title="Keep the clock and scoreboard boxes up to date while the video plays">
                    <input type="checkbox" checked={liveRead} onChange={(e) => setLiveRead(e.target.checked)} />
                    Live read
                  </label>
                  <label className="flex items-center gap-1 ml-auto text-gray-300" title="Read the clock and scoreboard for every new tag">
                    <input type="checkbox" checked={autoClock} onChange={(e) => setAutoClock(e.target.checked)} />
                    Auto on tag
                  </label>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                  {clockKeys.length === 0
                    ? 'No clock area yet. "Find clock" finds it, or draw it with "Set clock area".'
                    : clockStatic
                    ? 'The clock area is fixed for the whole video.'
                    : `${clockKeys.length} point${clockKeys.length === 1 ? '' : 's'}. Set the area again at a few places and it moves between them.`}
                </p>

                <div className="mt-3 pt-3 border-t border-gray-600">
                  <h3 className="text-sm font-bold mb-2">Scoreboard</h3>
                  <input
                    type="text"
                    value={scoreText}
                    onChange={(e) => {
                      setScoreText(e.target.value);
                      setScoreValues(null);
                    }}
                    placeholder="e.g. LAL 88 - BOS 84"
                    className="w-full bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:border-blue-500"
                  />
                  <div className="flex flex-wrap items-center gap-1 text-xs mt-2">
                    <span className="text-gray-400 w-full">Automatic</span>
                    <button
                      onClick={() => setSelectingRegion('scoreArea')}
                      disabled={!videoSrc}
                      className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                      title="Draw a box around the whole scoreboard"
                    >
                      {scoreArea ? 'Redraw scoreboard area' : 'Set scoreboard area'}
                    </button>
                    <button
                      onClick={autoDetectScoreboard}
                      disabled={detectBusy || !videoSrc || !scoreArea}
                      className="bg-blue-700 hover:bg-blue-600 disabled:opacity-60 px-2 py-1 rounded font-semibold"
                      title="Finds the team names, the score boxes and the clock inside the scoreboard area"
                    >
                      {detectBusy ? 'Looking...' : 'Auto-detect'}
                    </button>
                    <button
                      onClick={() => setScoreArea(null)}
                      disabled={!scoreArea}
                      className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                    >
                      Clear area
                    </button>
                    <span className="text-gray-400 w-full mt-1">Manual</span>
                    <button
                      onClick={() => setSelectingRegion('scoreA')}
                      disabled={!videoSrc}
                      className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                      title="Draw a box around the number of the first team's score"
                    >
                      {scoreBoxes.a ? 'Redraw score A' : 'Set score A'}
                    </button>
                    <button
                      onClick={() => setSelectingRegion('scoreB')}
                      disabled={!videoSrc}
                      className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                      title="Draw a box around the number of the second team's score"
                    >
                      {scoreBoxes.b ? 'Redraw score B' : 'Set score B'}
                    </button>
                    <button
                      onClick={() => setScoreBoxes({ a: null, b: null })}
                      disabled={!scoreBoxes.a && !scoreBoxes.b}
                      className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                    >
                      Clear boxes
                    </button>
                    <span className="text-gray-400 w-full mt-1">Reading</span>
                    <button
                      onClick={readScoreboard}
                      disabled={scoreBusy || !videoSrc}
                      className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                    >
                      {scoreBusy ? 'Reading...' : 'Read scoreboard'}
                    </button>
                    <button
                      onClick={() => {
                        setScoreText('');
                        setScoreValues(null);
                      }}
                      disabled={!scoreText}
                      className="bg-gray-800 hover:bg-gray-600 disabled:opacity-60 px-2 py-1 rounded"
                    >
                      Clear text
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Automatic: draw a box around the whole scoreboard, then Auto-detect. It finds the team names, the score boxes and the clock. Manual: if that doesn't work, draw a tight box around each score number yourself, and the clock with Set clock area.
                  </p>
                </div>
              </div>

              {/* TAGGING PANELS */}
              <div className="mb-4 p-3 bg-gray-700 rounded">
                <h3 className="text-sm font-bold mb-2">Tagging Panel</h3>
                <select
                  value={activePanel.id}
                  onChange={(e) => setActivePanelId(e.target.value)}
                  className="w-full bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600 mb-2"
                >
                  {panels.map((pn) => (
                    <option key={pn.id} value={pn.id}>
                      {pn.name} ({pn.actions.length})
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1 text-xs">
                  {[
                    ['New', newPanel],
                    ['Rename', renamePanel],
                    ['Duplicate', duplicatePanel],
                    ['Delete', deletePanel],
                    ['Export', () => exportPanels(false)],
                    ['Export all', () => exportPanels(true)],
                    ['Import', () => panelImportRef.current && panelImportRef.current.click()],
                    ['Reset', resetPanel],
                  ].map(([text, fn]) => (
                    <button key={text} onClick={fn} className="bg-gray-800 hover:bg-gray-600 px-2 py-1 rounded">
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              {/* TEAM SELECTORS */}
              <div className="mb-4 p-3 bg-gray-700 rounded">
                <h3 className="text-sm font-bold mb-2">Team</h3>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {teams.map((t) => {
                    const isActive = activeTeamId === t.id;

                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveTeamId(t.id)}
                        onContextMenu={(e) => handleTeamRightClick(e, t.id)}
                        style={{
                          backgroundColor: isActive ? t.color : '#444',
                          border: `2px solid ${t.color}`,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        className="px-1 py-2 rounded font-bold text-white hover:opacity-90 transition-all"
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

                <div className="space-y-4">
                  {/* NEW BUTTON CREATOR */}
                  <div className="p-3 bg-gray-900 rounded-lg border border-gray-700">
                    <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Create New Button</h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newActionLabel}
                        onChange={(e) => setNewActionLabel(e.target.value)}
                        placeholder="Button Name"
                        className="flex-1 bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600"
                      />
                      <button
                        onClick={addNewActionButton}
                        className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm font-bold"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => setShowBulkAdd(true)}
                      className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                    >
                      Bulk add (comma separated)...
                    </button>
                  </div>

                  {/* ACTION BUTTONS GRID */}
                  {actions.length === 0 && (
                    <p className="text-gray-400 text-sm text-center">No buttons in this panel yet.</p>
                  )}
                  {[...new Set(actions.map((a) => a.group || ''))]
                    .sort((x, y) => (x === '' ? -1 : y === '' ? 1 : 0))
                    .map((groupName) => (
                      <div key={groupName || '__ungrouped'}>
                        {groupName && (
                          <button
                            onClick={() => setCollapsedGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                            onDragOver={(e) => dragActionId && e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              moveAction(dragActionId, null, groupName);
                              setDragActionId(null);
                            }}
                            className="w-full flex items-center gap-1 text-xs font-bold text-gray-400 uppercase mb-1 hover:text-white"
                          >
                            <span>{collapsedGroups[groupName] ? '▸' : '▾'}</span>
                            {groupName}
                            <span className="text-gray-500">({actions.filter((a) => (a.group || '') === groupName).length})</span>
                          </button>
                        )}
                        {!(groupName && collapsedGroups[groupName]) && (
                          <div className="grid grid-cols-2 gap-2">
                            {actions
                              .filter((a) => (a.group || '') === groupName)
                              .map((action) => (
                                <div
                                  key={action.id}
                                  draggable
                                  onDragStart={() => setDragActionId(action.id)}
                                  onDragOver={(e) => dragActionId && e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    moveAction(dragActionId, action.id);
                                    setDragActionId(null);
                                  }}
                                  onDragEnd={() => setDragActionId(null)}
                                  className={`group relative ${dragActionId === action.id ? 'opacity-40' : ''}`}
                                >
                                  <button
                                    onClick={() => handleActionClick(action)}
                                    onContextMenu={(e) => handleRightClick(e, action.id)} // RIGHT CLICK TO EDIT
                                    title={action.definition || action.label}
                                    {...colorProps(
                                      action.color,
                                      'relative w-full h-full p-3 rounded-lg text-white font-bold text-sm transition-all active:scale-95 hover:brightness-110 shadow-lg'
                                    )}
                                  >
                                    {action.label}
                                    {action.hotkey && (
                                      <span className="absolute bottom-0.5 left-1.5 text-[9px] font-mono uppercase opacity-70">
                                        {action.hotkey}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setEditingAction(action)}
                                    className="absolute top-1 right-1 p-0.5 rounded bg-black/30 text-white opacity-0 group-hover:opacity-90"
                                    title="Edit button"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                {/* </div> */}

                {/* CUSTOM ANNOTATION */}
                <div className="mt-3 p-2 bg-gray-700 rounded">
                  <h3 className="text-sm font-bold mb-2">Custom Annotation</h3>
                  <input
                    type="text"
                    value={customAnnotation}
                    onChange={(e) => setCustomAnnotation(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCustomAnnotation()}
                    placeholder="Type custom action"
                    className="bg-gray-600 text-white px-2 py-2 text-sm rounded w-full mb-2 border border-gray-500 focus:border-purple-500"
                  />
                  <button
                    onClick={addCustomAnnotation}
                    disabled={!customAnnotation.trim()}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-3 py-2 text-sm rounded font-bold"
                  >
                    Add Other
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
        {editingAction && (
          <ActionEditModal
            key={editingAction.id}
            action={editingAction}
            groups={[...new Set(actions.map((a) => a.group || ''))]}
            takenHotkeys={Object.fromEntries(
              actions.filter((a) => a.hotkey && a.id !== editingAction.id).map((a) => [a.hotkey, a.label])
            )}
            onSave={saveActionEdit}
            onDelete={deleteAction}
            onClose={() => setEditingAction(null)}
          />
        )}

        {showBulkAdd && (
          <BulkAddModal
            existingLabels={actions.map((a) => a.label)}
            groups={[...new Set(actions.map((a) => a.group || ''))]}
            onAdd={addBulkActions}
            onClose={() => setShowBulkAdd(false)}
          />
        )}

        {descriptorPrompt && (
          <DescriptorModal
            action={descriptorPrompt.action}
            onPick={(descriptor) => {
              addAnnotation(descriptorPrompt.action, { timestamp: descriptorPrompt.timestamp, descriptor });
              setDescriptorPrompt(null);
            }}
            onClose={() => setDescriptorPrompt(null)}
          />
        )}

        {editingAnnotation && (
          <AnnotationEditModal
            key={editingAnnotation.id}
            annotation={editingAnnotation}
            onSave={saveAnnotationEdit}
            onClose={() => setEditingAnnotation(null)}
          />
        )}

        {showSummary && (
          <SummaryModal
            annotations={annotations}
            teamNames={teams.map((t) => t.name)}
            onExport={exportSummaryCSV}
            onClose={() => setShowSummary(false)}
          />
        )}

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 shadow-2xl flex items-center gap-3 text-sm">
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo();
                  setToast(null);
                }}
                className="text-blue-400 hover:text-blue-300 font-bold"
              >
                Undo
              </button>
            )}
            <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white">
              ×
            </button>
          </div>
        )}

        {activeShot && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-600 w-96 shadow-2xl">
        <h2 className="text-xl font-bold mb-4 text-center">
          Details for {activeShot.label}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-2">Location</label>
            <select 
              id="shotLocation"
              className="w-full bg-gray-700 p-2 rounded border border-gray-600"
            >
              {shotLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-2">Result</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => finalizeShotAnnotation(document.getElementById('shotLocation').value, 'Made')}
                className="bg-green-600 hover:bg-green-500 py-3 rounded font-bold"
              >
                MADE
              </button>
              <button 
                onClick={() => finalizeShotAnnotation(document.getElementById('shotLocation').value, 'Missed')}
                className="bg-red-600 hover:bg-red-500 py-3 rounded font-bold"
              >
                MISSED
              </button>
            </div>
          </div>
          
          <button 
            onClick={() => setActiveShot(null)}
            className="w-full mt-2 text-gray-400 hover:text-white text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )}
    </div>
  );
}
