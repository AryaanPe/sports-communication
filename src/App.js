import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Upload, Download, Trash2, Volume2, VolumeX } from 'lucide-react';

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
  const [team, setTeam] = useState();
  const [teams, setTeams] = useState(['Team A', 'Team B']);
  const [folderFiles, setFolderFiles] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedOverlay, setProcessedOverlay] = useState(null);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const shotLocations = [
    'Paint', 'Restricted Area', 'Left Corner 3', 'Right Corner 3', 
    'Left Wing 3', 'Right Wing 3', 'Above Break 3', 'Midrange Left', 'Midrange Right', 'Midrange Center'
  ];

  const actionTypes = [
    {
      id: 'Eye Contact',
      label: 'Eye Contact',
      color: 'bg-blue-500',
      definition: 'Visual connection between players to communicate intent, awareness, or coordination',
    },
    {
      id: 'Screen',
      label: 'Screen',
      color: 'bg-green-500',
      definition: 'Non-verbal signal or positioning to set or call for a pick/screen',
    },
    {
      id: 'Direct',
      label: 'Directing',
      color: 'bg-red-500',
      definition: 'Using gestures or body language to guide teammates into position or action',
    },
    {
      id: 'Call for Ball',
      label: 'Call for Ball',
      color: 'bg-purple-500',
      definition: 'Non-verbal signal requesting a pass, such as raising hand or showing target',
    },
    {
      id: 'Move/Cut for Ball',
      label: 'Move/Cut for Ball',
      color: 'bg-yellow-500',
      definition: 'Physical movement or cut signaling readiness to receive the ball',
    },
    {
      id: 'Nod',
      label: 'Nod',
      color: 'bg-indigo-500',
      definition: 'Head gesture indicating acknowledgment, agreement, or confirmation',
    },

    // NEW ACTIONS
    {
      id: 'Asking for Help',
      label: 'Asking for Help',
      color: 'bg-teal-500',
      definition: 'Open-hand gesture calling another player towards oneself for assistance',
    },
    {
      id: 'Recognition',
      label: 'Recognition',
      color: 'bg-emerald-500',
      definition: 'Acknowledging a teammate after a positive play (e.g., pointing, clap, quick gesture)',
    },
    {
      id: 'Frustration',
      label: 'Frustration',
      color: 'bg-rose-500',
      definition: 'Body language showing frustration (e.g., dropping arms, slumping shoulders)',
    },
    {
      id: 'Ball Our Way',
      label: 'Ball Our Way',
      color: 'bg-cyan-500',
      definition: 'Signaling who has possession after a turnover (e.g., pointing direction)',
    },
    {
      id: 'Encouragement',
      label: 'Encouragement',
      color: 'bg-lime-500',
      definition: 'Signaling support/approval for a good play (e.g., clapping, thumbs up)',
    },
    {
      id: 'Question Call',
      label: 'Question Call',
      color: 'bg-amber-500',
      definition: 'Questioning a call (e.g., palms up/raised hands gesture toward officials)',
    },
    {
      id: 'Celebration',
      label: 'Celebration',
      color: 'bg-pink-500',
      definition: 'Celebratory gesture after a play (e.g., fist shake, quick pump)',
    },
    {
      id: 'Point to Referee',
      label: 'Point to Referee',
      color: 'bg-orange-500',
      definition: 'Directing attention to an official or signaling for a stoppage/timeout',
    },
    {
      id: 'Call Play',
      label: 'Call Play',
      color: 'bg-violet-500',
      definition: 'Signaling a specific offensive play/set to teammates',
    },
    {
      id: 'Review Play',
      label: 'Review Play',
      color: 'bg-sky-500',
      definition: 'Hand gesture indicating review (e.g., hand up with finger circling)',
    },
    {
      id: 'Sweeping',
      label: 'Sweeping',
      color: 'bg-stone-500',
      definition: 'Sweeping arm gesture instructing teammates to push/flow up the court',
    },
    {
      id: 'Fake Screen',
      label: 'Fake Screen',
      color: 'bg-fuchsia-500',
      definition: 'Approaching to set a screen, but slipping/leaving before contact is made',
    },
    {
      id: 'Layup',
      label: 'Layup',
      color: 'bg-zinc-500',
      definition: 'Layup shot attempt'
    },
    {
      id: 'Three Pointer',
      label: 'Three Pointer',
      color: 'bg-blue-900',
      definition: 'Three point shot attempt'
    },
    {
      id: 'Mid-range shot',
      label: 'Mid-range shot',
      color: 'bg-red-300',
      definition: 'Mid-range shot attempt'
    },
    {
      id: 'Turnover',
      label: 'Turnover',
      color: 'bg-green-700',
      definition: 'Turnover committed by the offensive player'
    },
    {
      id: 'Pass',
      label: 'Pass',
      color: 'bg-yellow-700',
      definition: 'Pass by an offensive player with the ball'
    },
    {
      id: 'Block',
      label: 'Block',
      color: 'bg-gray-700',
      definition: 'Blocked shot by a defensive player'
    },
    {
      id: 'Offensive Rebound',
      label: 'Offensive Rebound',
      color: 'bg-purple-300',
      definition: 'Rebound by an offensive player'
    },
    {
      id: 'Defensive Rebound',
      label: 'Defensive Rebound',
      color: 'bg-teal-700',
      definition: 'Rebound by a defensive player'
    },
    {
      id: 'Foul',
      label: 'Foul',
      color: 'bg-pink-700',
      definition: 'Foul by any player'
    }
  ];

  const teamColors = {
    Jazz: '#753bbd',
    Hawks: '#e03a3e',
    Magic: '#0077c0',
    Rockets: '#ce1141',
    Nuggets: '#0e2240',
    Kings: '#5a2d81',
    Spurs: '#c4ced4',
    Warriors: '#1d428a',
    Thunder: '#ef3b24',
    Lakers: '#552583',
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
      if (!videoRef.current || e.target.matches('input, textarea')) return;

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
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [seekBy]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setAnnotations([]);
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
    if (parts.length < 2) return ['Team A', 'Team B'];

    const teamA = parts[0].replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
    const teamB = parts[1].replace(/[^a-zA-Z0-9 ]+/g, ' ').trim();
    return [capitalizeWords(teamA), capitalizeWords(teamB)];
  }

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
      setTeam(team1);
    }
  };

  const loadVideoFromFile = (file, index) => {
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setAnnotations([]);
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
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVideoClick = () => handlePlayPause();

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
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
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setProcessedOverlay(null);
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
    // Check if this is a shot-type action
    const shotTypes = ['Layup', 'Mid-range shot', 'Three Pointer'];
    
    if (shotTypes.includes(action.label)) {
      // Pause video while they fill out the form
      if (isPlaying) handlePlayPause(); 
      setActiveShot({ ...action, timestamp: videoRef.current.currentTime });
    } else {
      addAnnotation(action);
    }
  };

  const finalizeShotAnnotation = (location, result) => {
    const newAnnotation = {
      id: Date.now(),
      type: activeShot.id,
      label: `${activeShot.label} (${result}) - ${location}`,
      color: activeShot.color,
      timestamp: activeShot.timestamp,
      formattedTime: formatTime(activeShot.timestamp),
      gameClockTime: gameClockTime || 'N/A',
      team,
      // Store metadata for cleaner data analysis later
      metadata: { location, result, shotType: activeShot.label } 
    };
    
    setAnnotations([newAnnotation, ...annotations]);
    setActiveShot(null);
  };

  const addAnnotation = (actionType) => {
    if (!videoRef.current) return;
    const timestamp = videoRef.current.currentTime;
    const newAnnotation = {
      id: Date.now(),
      type: actionType.id,
      label: actionType.label,
      color: actionType.color,
      timestamp,
      formattedTime: formatTime(timestamp),
      gameClockTime: gameClockTime || 'N/A',
      team,
    };
    setAnnotations([newAnnotation, ...annotations]);
  };

  const addCustomAnnotation = () => {
    if (!videoRef.current || !customAnnotation.trim()) return;
    const timestamp = videoRef.current.currentTime;
    const newAnnotation = {
      id: Date.now(),
      type: 'Other',
      label: customAnnotation.trim(),
      color: 'bg-gray-500',
      timestamp,
      formattedTime: formatTime(timestamp),
      gameClockTime: gameClockTime || 'N/A',
      team,
    };
    setAnnotations([newAnnotation, ...annotations]);
    setCustomAnnotation('');
  };

  const deleteAnnotation = (id) => {
    setAnnotations(annotations.filter((a) => a.id !== id));
  };

  const seekToAnnotation = (timestamp) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = timestamp;
    setCurrentTime(timestamp);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
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
    const headers = ['id', 'type', 'label', 'timestamp', 'formattedTime', 'gameClockTime', 'team'];

    const escape = (value) => {
      if (value === null || value === undefined) return '""';
      const str = String(value).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = cleanAnnotations.map((ann) => headers.map((field) => escape(ann[field])).join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getSafeExportName('csv');
    link.click();
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
      } catch (err) {
        console.error("Frame analysis failed:", err);
      } finally {
        setIsProcessing(false);
      }
    }, 'image/jpeg');
  };

  // const runAiTracking = async () => {
  //   if (!exportName) return alert("Please select a video first.");
    
  //   setIsProcessing(true);
  //   try {
  //     const response = await fetch('http://localhost:5001/run-inference', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       // Note: You must ensure the video file exists in the directory the server expects
  //       body: JSON.stringify({
  //         videoPath: `./videos/${exportName}.mp4`, 
  //         conf: 0.25
  //       }),
  //     });

  //     const data = await response.json();
  //     if (response.ok) {
  //       alert("AI Tracking Complete! Check your 'runs' folder for the processed video.");
  //     } else {
  //       alert("Error: " + data.error);
  //     }
  //   } catch (err) {
  //     console.error(err);
  //   } finally {
  //     setIsProcessing(false);
  //   }
  // };

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

      <div className="max-w-full mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Sports Non Verbal Communication
        </h1>

        {folderFiles.length === 0 && (
          <div className="bg-gray-800 rounded-lg p-12 mb-8 border-2 border-dashed border-gray-600 hover:border-blue-500 transition">
            <button
              onClick={() => folderInputRef.current && folderInputRef.current.click()}
              className="w-full flex flex-col items-center gap-4 text-gray-400 hover:text-blue-400"
            >
              <Upload size={64} />
              <span className="text-xl">Click to select folder</span>
              <span className="text-sm">All files inside the folder will be displayed</span>
            </button>
          </div>
        )}

        {folderFiles.length > 0 && (
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
                    onEnded={() => setIsPlaying(false)}
                  />

                  {processedOverlay && (
                    <img 
                      src={processedOverlay} 
                      alt="AI Analysis"
                      className="absolute top-0 left-0 w-full h-full object-contain z-10 pointer-events-none"
                    />
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

                  {annotations.length === 0 ? (
                    <p className="text-gray-400 text-center py-6 text-sm">No annotations yet.</p>
                  ) : (
                    <div className="space-y-2 overflow-y-auto flex-1 pr-2">
                      {annotations.map((ann) => (
                        <div
                          key={ann.id}
                          className="bg-gray-700 rounded-lg p-3 flex items-center justify-between hover:bg-gray-600 transition group"
                        >
                          <button
                            onClick={() => seekToAnnotation(ann.timestamp)}
                            className="flex items-center gap-2 flex-1 text-left"
                          >
                            <span className={`${ann.color} px-2 py-1 rounded-full text-xs font-semibold`}>
                              {ann.formattedTime}
                            </span>

                            {ann.gameClockTime && ann.gameClockTime !== 'N/A' && (
                              <span className="bg-orange-600 px-2 py-1 rounded-full text-xs font-semibold">
                                {ann.gameClockTime}
                              </span>
                            )}

                            <span className="font-medium text-sm">{ann.label}</span>
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
              {/* TEAM SELECTORS */}
              <div className="mb-4 p-3 bg-gray-700 rounded">
                <h3 className="text-sm font-bold mb-2">Team</h3>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {teams.map((t) => {
                    const color = teamColors[t];
                    const isActive = team === t;

                    return (
                      <button
                        key={t}
                        onClick={() => setTeam(t)}
                        style={{
                          backgroundColor: isActive ? color : '#444',
                          border: `2px solid ${color}`,
                        }}
                        className="px-3 py-2 rounded font-bold text-white hover:opacity-90"
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-3 sticky top-0">
                <h2 className="text-lg font-bold mb-3">Non-Verbal Communication Actions</h2>

                <div className="grid grid-cols-2 gap-2">
                  {actionTypes.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleActionClick(action)}
                      title={action.definition}
                      className={`${action.color} hover:opacity-80 px-3 py-3 text-base rounded font-bold relative group`}
                    >
                      {action.label}
                      <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 text-center z-10 shadow-lg">
                        {action.definition}
                      </span>
                    </button>
                  ))}
                </div>

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
