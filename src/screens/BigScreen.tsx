import React, { useEffect, useState, useRef } from 'react';
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import QRCode from 'qrcode';
import { db, handleFirestoreError, OperationType, ensureAuth } from '../firebase';
import { QuizState, Question, WinnerRecord, AnswerEntry } from '../types';
import { StarField } from '../components/StarField';
import { SuperTeamLogo } from '../components/SuperTeamLogo';
import { BRAND_ASSETS } from '../assets';
import { soundEffects } from '../utils/audio';
import { fireWinnerConfetti } from '../components/Confetti';
import { formatResponseTime } from '../utils/helpers';
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sparkles,
  Users,
  Trophy,
  Award,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export const BigScreen: React.FC = () => {
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [recentPlayers, setRecentPlayers] = useState<string[]>([]);
  const [winnerRecords, setWinnerRecords] = useState<WinnerRecord[]>([]);
  const [topCorrectAnswers, setTopCorrectAnswers] = useState<AnswerEntry[]>([]);
  const [answersCount, setAnswersCount] = useState<number>(0);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);

  const prevStatusRef = useRef<string>('lobby');
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fanfarePlayedRef = useRef<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/play`
    : 'https://superteam.live/play';

  // Handle fading top-right controls on inactivity
  useEffect(() => {
    const handleMouseMove = () => {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    // Initial 3s fade timeout
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Generate QR Code on mount (pure black on pure white for reliable scanning from distance)
  useEffect(() => {
    QRCode.toDataURL(
      joinUrl,
      {
        width: 800,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      },
      (err, url) => {
        if (!err && url) {
          setQrCodeDataUrl(url);
        }
      }
    );
  }, [joinUrl]);

  // Ensure authentication for read permissions
  useEffect(() => {
    ensureAuth().catch(console.error);
  }, []);

  // Subscribe to quiz state
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'quiz', 'state'),
      snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.data() as QuizState;
          setQuizState(data);
          if (data.isMuted !== undefined) {
            setIsMuted(data.isMuted);
          }
        }
      },
      err => handleFirestoreError(err, OperationType.GET, 'quiz/state')
    );
    return () => unsub();
  }, []);

  // Subscribe to active question
  useEffect(() => {
    if (!quizState?.currentQuestionId) {
      setCurrentQuestion(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'questions', quizState.currentQuestionId),
      snapshot => {
        if (snapshot.exists()) {
          setCurrentQuestion({ id: snapshot.id, ...snapshot.data() } as Question);
        }
      },
      err => handleFirestoreError(err, OperationType.GET, `questions/${quizState.currentQuestionId}`)
    );
    return () => unsub();
  }, [quizState?.currentQuestionId]);

  // Subscribe to players joined in lobby
  useEffect(() => {
    const q = query(collection(db, 'players'), orderBy('joinedAt', 'desc'), limit(12));
    const unsub = onSnapshot(
      q,
      snapshot => {
        setPlayerCount(snapshot.size);
        const names = snapshot.docs.map(doc => doc.data().name as string).filter(Boolean);
        setRecentPlayers(names);
      },
      err => handleFirestoreError(err, OperationType.GET, 'players')
    );
    return () => unsub();
  }, []);

  // Subscribe to answers count during active question
  useEffect(() => {
    if (!quizState?.currentQuestionId || quizState.status === 'lobby') {
      setAnswersCount(0);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'answers', quizState.currentQuestionId, 'entries'),
      snapshot => {
        setAnswersCount(snapshot.size);
      },
      err => handleFirestoreError(err, OperationType.GET, `answers/${quizState.currentQuestionId}/entries`)
    );
    return () => unsub();
  }, [quizState?.currentQuestionId, quizState?.status]);

  // Subscribe to winners of current question
  useEffect(() => {
    if (!quizState?.currentQuestionId) {
      setWinnerRecords([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'winners'),
      snapshot => {
        const records: WinnerRecord[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as WinnerRecord;
          if (data.questionId === quizState.currentQuestionId && !data.disqualified) {
            records.push({ id: docSnap.id, ...data });
          }
        });
        records.sort((a, b) => a.rank - b.rank);
        setWinnerRecords(records);
      },
      err => handleFirestoreError(err, OperationType.GET, 'winners')
    );
    return () => unsub();
  }, [quizState?.currentQuestionId]);

  // Subscribe to top correct answers for current question during reveal
  useEffect(() => {
    if (!quizState?.currentQuestionId || quizState.status !== 'reveal') {
      setTopCorrectAnswers([]);
      return;
    }

    const q = query(
      collection(db, 'answers', quizState.currentQuestionId, 'entries'),
      limit(25)
    );

    const unsub = onSnapshot(
      q,
      snapshot => {
        const correctList: AnswerEntry[] = [];
        const openTime = (quizState.questionOpenedAt as Timestamp)?.toMillis?.() || 0;

        snapshot.forEach(docSnap => {
          const data = docSnap.data() as AnswerEntry;
          if (data.isCorrect) {
            const submitTime = (data.submittedAt as Timestamp)?.toMillis?.() || 0;
            const officialMs = submitTime > openTime ? submitTime - openTime : data.clientMs || 0;
            correctList.push({
              ...data,
              calculatedTimeMs: officialMs,
            });
          }
        });

        correctList.sort((a, b) => (a.calculatedTimeMs || 0) - (b.calculatedTimeMs || 0));
        setTopCorrectAnswers(correctList.slice(0, 5));
      },
      err => handleFirestoreError(err, OperationType.GET, `answers/${quizState.currentQuestionId}/entries`)
    );
    return () => unsub();
  }, [quizState?.currentQuestionId, quizState?.status, quizState?.questionOpenedAt]);

  // Real-time Countdown timer calculation synchronized with questionOpenedAt
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (quizState?.status === 'question' && quizState.questionOpenedAt) {
      const durationSeconds = quizState.timeLimit || currentQuestion?.timeLimit || 15;
      const openedAtMs = (quizState.questionOpenedAt as Timestamp)?.toMillis?.() || Date.now();

      const updateTimer = () => {
        const nowMs = Date.now();
        const elapsedSec = Math.floor((nowMs - openedAtMs) / 1000);
        const left = Math.max(0, durationSeconds - elapsedSec);
        setRemainingSeconds(left);

        if (left <= 3 && left > 0) {
          soundEffects.playUrgentTick(isMuted);
        } else if (left > 3) {
          soundEffects.playTick(isMuted);
        } else if (left === 0) {
          soundEffects.playBuzzer(isMuted);
        }
      };

      updateTimer();
      timerIntervalRef.current = setInterval(updateTimer, 1000);
    } else {
      setRemainingSeconds(quizState?.timeLimit || 15);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [quizState?.status, quizState?.questionOpenedAt, quizState?.timeLimit, currentQuestion?.timeLimit, isMuted]);

  // Handle Winner Reveal effects (sound fanfare & confetti)
  useEffect(() => {
    if (quizState?.status === 'reveal' && winnerRecords.length > 0) {
      if (!fanfarePlayedRef.current) {
        fanfarePlayedRef.current = true;
        soundEffects.playWinnerFanfare(isMuted);
        fireWinnerConfetti();
      }
    } else {
      fanfarePlayedRef.current = false;
    }
  }, [quizState?.status, winnerRecords.length, isMuted]);

  // Fullscreen toggle helper
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const status = quizState?.status || 'lobby';

  return (
    <StarField
      className={
        status === 'lobby'
          ? 'h-screen h-[100dvh] max-h-[100dvh] w-screen overflow-hidden select-none'
          : 'p-4 md:p-8 select-none'
      }
      contentClassName={
        status === 'lobby'
          ? 'h-screen h-[100dvh] max-h-[100dvh] w-screen overflow-hidden flex flex-col items-center justify-center p-2 sm:p-4'
          : undefined
      }
    >
      {/* Top Floating Controls - Tiny icons that fade out after 3s of inactivity */}
      <div
        className={`fixed top-3 right-3 z-50 flex items-center gap-2 transition-opacity duration-500 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={() => setIsMuted(prev => !prev)}
          className="p-1.5 rounded-lg bg-black/40 hover:bg-black/70 border border-amber-400/30 text-amber-300/80 hover:text-amber-300 backdrop-blur-md transition-all shadow-md active:scale-95"
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg bg-black/40 hover:bg-black/70 border border-amber-400/30 text-amber-300/80 hover:text-amber-300 backdrop-blur-md transition-all shadow-md active:scale-95"
          title="Toggle Fullscreen"
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* 1. LOBBY SCREEN (Single Centered Column, Vertically Centered, No Scrolling) */}
      {status === 'lobby' && (
        <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-center text-center overflow-hidden px-4 select-none">
          {/* 1. Super Team logo (top, centered, small to medium size) */}
          <div className="shrink-0 flex items-center justify-center">
            <div className="relative inline-flex items-center justify-center p-[clamp(5px,0.9vh,10px)] rounded-xl sm:rounded-2xl bg-gradient-to-b from-white via-slate-50 to-amber-50 border border-amber-400/80 shadow-[0_4px_20px_rgba(234,179,8,0.25)]">
              <img
                src={BRAND_ASSETS.LOGO}
                alt="Super Team"
                className="h-[clamp(26px,4.5vh,48px)] w-auto object-contain"
              />
            </div>
          </div>

          {/* 2. Event theme: "Raising Stars, Building Leaders" */}
          <h1 className="mt-[clamp(6px,1.2vh,14px)] shrink-0 font-['Outfit',sans-serif] font-black tracking-wider uppercase text-[clamp(16px,2.6vh,34px)] leading-tight bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(245,158,11,0.4)]">
            Raising Stars, Building Leaders
          </h1>

          {/* 3. QR code (taking about 50 to 60 percent of the screen height, square, pure white background with thick quiet zone, soft gold glow border, pure black on pure white) */}
          <div className="relative my-[clamp(8px,1.8vh,22px)] shrink-0 flex items-center justify-center">
            {/* Soft gold glow border around the white QR card */}
            <div className="absolute -inset-2.5 sm:-inset-3.5 rounded-3xl bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 opacity-60 blur-xl shadow-[0_0_40px_rgba(245,158,11,0.35)] pointer-events-none" />

            <div className="relative bg-white p-[clamp(12px,2vh,24px)] rounded-2xl sm:rounded-3xl shadow-2xl border-4 border-amber-300 flex items-center justify-center">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="Scan to Join the Quiz"
                  className="w-[clamp(170px,50vh,520px)] h-[clamp(170px,50vh,520px)] max-h-[52vh] max-w-[80vw] aspect-square object-contain block bg-white"
                />
              ) : (
                <div className="w-[clamp(170px,50vh,520px)] h-[clamp(170px,50vh,520px)] max-h-[52vh] max-w-[80vw] aspect-square flex items-center justify-center bg-white text-slate-900 font-bold">
                  Loading QR Code...
                </div>
              )}
            </div>
          </div>

          {/* 4. One call to action line: "Scan to Join the Quiz" */}
          <div className="shrink-0 text-white font-extrabold uppercase tracking-widest text-[clamp(15px,2.3vh,28px)] animate-pulse drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
            Scan to Join the Quiz
          </div>

          {/* 5. Join link under the call to action in a clean pill, large monospace or bold font, on ONE line. Never let it wrap. */}
          <div className="mt-[clamp(6px,1.2vh,12px)] shrink-0 max-w-[92vw]">
            <div className="inline-flex items-center justify-center px-[clamp(16px,2vw,28px)] py-[clamp(5px,0.9vh,10px)] rounded-full bg-slate-950/80 border border-amber-400/50 shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md">
              <span className="font-mono font-bold tracking-wider text-amber-300 text-[clamp(11px,1.7vh,20px)] whitespace-nowrap overflow-hidden text-ellipsis select-all">
                {quizState?.displayLink?.trim() || joinUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. QUESTION ACTIVE OR CLOSED SCREEN */}
      {(status === 'question' || status === 'closed') && currentQuestion && (
        <div className="flex-1 flex flex-col justify-between max-w-6xl mx-auto w-full py-4">
          {/* Top Bar: Question Info & Live Counters */}
          <div className="flex items-center justify-between bg-purple-950/70 border border-amber-400/30 rounded-2xl p-4 md:p-6 backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xl shadow-md">
                Q{currentQuestion.order}
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-amber-300 font-semibold flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  Prize for this Question
                </div>
                <div className="text-xl md:text-2xl font-bold text-white tracking-wide">
                  {currentQuestion.prizeName}
                </div>
              </div>
            </div>

            {/* Practice round banner if applicable */}
            {currentQuestion.practice && (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-sm font-semibold">
                <span>✦ Practice Question</span>
              </div>
            )}

            {/* Live Submissions Counter */}
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs uppercase tracking-widest text-amber-300/80 font-medium">Answers In</div>
                <div className="text-2xl md:text-3xl font-extrabold text-white flex items-center justify-end gap-2">
                  <span className="text-amber-400">{answersCount}</span>
                  <span className="text-xs font-normal text-slate-300">submitted</span>
                </div>
              </div>

              {/* Large Circular Countdown Timer */}
              <div className="relative flex items-center justify-center">
                <div
                  className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center font-black text-2xl md:text-3xl border-4 transition-all duration-300 shadow-xl ${
                    remainingSeconds <= 3
                      ? 'border-red-500 bg-red-950/80 text-red-300 animate-pulse'
                      : remainingSeconds <= 5
                      ? 'border-orange-500 bg-orange-950/80 text-orange-300'
                      : 'border-amber-400 bg-purple-900/80 text-yellow-300'
                  }`}
                >
                  {status === 'closed' ? 0 : remainingSeconds}
                </div>
              </div>
            </div>
          </div>

          {/* Center: Question Prompt */}
          <div className="my-8 text-center px-4">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-black text-white leading-tight font-['Outfit',sans-serif] drop-shadow-md">
              {currentQuestion.text}
            </h2>
          </div>

          {/* Bottom: Options (or Typed Answer notice) */}
          {currentQuestion.type === 'multiple_choice' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">
              {currentQuestion.options.map((optText, index) => {
                const letter = String.fromCharCode(65 + index); // A, B, C, D
                const letterColors = [
                  'from-amber-500 to-yellow-600',
                  'from-purple-600 to-indigo-700',
                  'from-blue-600 to-cyan-700',
                  'from-emerald-600 to-teal-700',
                ];
                return (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-5 md:p-6 rounded-2xl bg-gradient-to-r from-purple-950/90 to-[#1e1045]/90 border-2 border-amber-400/30 shadow-xl"
                  >
                    <div
                      className={`w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br ${
                        letterColors[index % letterColors.length]
                      } text-white font-black text-xl md:text-2xl flex items-center justify-center shadow-lg border border-white/20`}
                    >
                      {letter}
                    </div>
                    <div className="text-xl md:text-2xl font-bold text-white tracking-wide flex-1 text-left">
                      {optText}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-purple-950/80 border-2 border-dashed border-amber-400/50 rounded-2xl p-8 text-center shadow-xl">
              <div className="text-2xl md:text-3xl font-bold text-amber-300">
                Type Your Answer On Your Phone Screen
              </div>
              <div className="mt-2 text-slate-300 text-lg">
                First accurate response with correct spelling takes the prize!
              </div>
            </div>
          )}

          {/* Status Alert if closed */}
          {status === 'closed' && (
            <div className="mt-6 py-3 px-6 rounded-xl bg-orange-600/90 text-white font-black text-xl text-center shadow-2xl animate-pulse">
              Time is up! Answers are locked. Checking fastest correct entries...
            </div>
          )}
        </div>
      )}

      {/* 3. REVEAL & WINNER MODE */}
      {status === 'reveal' && currentQuestion && (
        <div className="flex-1 flex flex-col justify-between max-w-6xl mx-auto w-full py-4 text-center">
          {/* Top banner: Correct Answer Revealed */}
          <div className="bg-gradient-to-r from-purple-950/90 via-indigo-950/90 to-purple-950/90 border-2 border-amber-400/40 rounded-2xl p-5 shadow-2xl">
            <div className="text-sm uppercase tracking-widest text-amber-300 font-bold mb-1">
              Correct Answer
            </div>
            <div className="text-2xl md:text-4xl font-black text-emerald-400 flex items-center justify-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              <span>{quizState?.revealedAnswer || 'Verified by Host'}</span>
            </div>
          </div>

          {/* Main Stage Winner Presentation Card */}
          {winnerRecords.length > 0 ? (
            <div className="my-6 relative">
              {/* Grand Award Glow Effect */}
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 opacity-60 blur-2xl animate-pulse" />

              <div className="relative bg-gradient-to-b from-[#261559] to-[#120736] p-8 md:p-12 rounded-3xl border-3 border-amber-400 shadow-2xl">
                <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-14">
                  {/* Official Leadership Award Star Trophy */}
                  <div className="relative shrink-0 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-t from-amber-400/50 via-yellow-300/60 to-transparent blur-3xl transform scale-125 animate-pulse" />
                    <img
                      src={BRAND_ASSETS.STAR_TROPHY}
                      alt="Super Team Leadership Star Trophy"
                      className="relative h-64 md:h-80 lg:h-96 object-contain drop-shadow-[0_12px_32px_rgba(250,204,21,0.6)] transform -rotate-2"
                    />
                  </div>

                  {/* Winner Information */}
                  <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-400 text-slate-950 font-black text-sm md:text-base tracking-wider uppercase shadow-md mb-4">
                      <Trophy className="w-5 h-5" />
                      Winner Celebration
                    </div>

                    {/* Primary Winner Name */}
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white font-['Outfit',sans-serif] tracking-tight">
                      <span className="bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_4px_16px_rgba(250,204,21,0.6)]">
                        {winnerRecords[0].name}
                      </span>
                    </h1>

                    {/* Prize won */}
                    <div className="mt-4 text-xl md:text-3xl font-extrabold text-white flex items-center gap-2">
                      <span className="text-amber-300 font-normal">Won:</span>
                      <span>{winnerRecords[0].prize || currentQuestion.prizeName}</span>
                    </div>

                    {/* Response Time with milliseconds */}
                    <div className="mt-4 inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-purple-900/80 border border-amber-400/40 text-yellow-200 shadow-lg">
                      <Clock className="w-6 h-6 text-amber-400" />
                      <span className="text-base text-slate-300">Official Winning Time:</span>
                      <span className="text-2xl md:text-3xl font-black font-mono text-amber-400">
                        {formatResponseTime(winnerRecords[0].timeMs)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* If bonus round with multiple winners (Rank 2 and 3) */}
                {winnerRecords.length > 1 && (
                  <div className="mt-8 pt-6 border-t border-purple-800/80">
                    <div className="text-xs uppercase tracking-widest text-amber-300 font-bold mb-3">
                      Bonus Round Podium Winners
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                      {winnerRecords.slice(1).map((w, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-4 rounded-xl bg-purple-950/70 border border-amber-400/30"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center font-bold text-sm">
                              #{w.rank}
                            </span>
                            <div className="text-left font-bold text-white text-lg">{w.name}</div>
                          </div>
                          <div className="font-mono text-amber-400 font-bold text-lg">
                            {formatResponseTime(w.timeMs)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="my-10 bg-purple-950/80 border border-amber-400/30 rounded-3xl p-10 text-center">
              <Clock className="w-16 h-16 text-amber-400 mx-auto animate-spin" />
              <div className="text-2xl md:text-3xl font-bold text-white mt-4">
                Host is reviewing and confirming the winner
              </div>
              <p className="text-slate-300 mt-2">The verified winner will appear here shortly!</p>
            </div>
          )}

          {/* Top 5 Fastest Correct Answers Leaderboard */}
          {topCorrectAnswers.length > 0 && (
            <div className="w-full bg-purple-950/70 border border-amber-400/30 rounded-2xl p-4 md:p-5 backdrop-blur-md shadow-xl text-left">
              <div className="text-xs uppercase tracking-widest text-amber-300 font-bold mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                Top Fastest Correct Responses
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {topCorrectAnswers.map((entry, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-xl border flex flex-col justify-between ${
                      index === 0
                        ? 'bg-amber-500/20 border-amber-400 text-yellow-100 shadow-md'
                        : 'bg-purple-900/40 border-purple-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-amber-400">#{index + 1}</span>
                      <span className="font-mono font-bold text-amber-300">
                        {formatResponseTime(entry.calculatedTimeMs || 0)}
                      </span>
                    </div>
                    <div className="font-bold text-sm truncate mt-1 text-white">{entry.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. QUIZ ENDED SCREEN */}
      {status === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full text-center py-12">
          <SuperTeamLogo size="md" showSubtitle={true} />
          <div className="mt-8 p-10 rounded-3xl bg-purple-950/80 border-2 border-amber-400 shadow-2xl max-w-2xl">
            <Trophy className="w-20 h-20 text-amber-400 mx-auto" />
            <h2 className="text-4xl md:text-5xl font-black text-white mt-4 font-['Cinzel',serif]">
              {quizState?.sessionName ? `${quizState.sessionName} Concluded` : 'Celebration Quiz Concluded'}
            </h2>
            <p className="text-lg md:text-xl text-yellow-100/90 mt-3">
              Congratulations to all our brilliant winners and leaders! Please proceed to the Prize Desk with your phone claim codes.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-900/60 border border-amber-400/30 text-amber-300 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Stay tuned on your phone screens for upcoming quiz rounds
            </div>
          </div>
        </div>
      )}
    </StarField>
  );
};
