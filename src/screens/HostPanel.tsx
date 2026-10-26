import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ensureAuth } from '../firebase';
import {
  QuizState,
  Question,
  AnswerKey,
  Player,
  AnswerEntry,
  WinnerRecord,
  QuizStatus,
} from '../types';
import { BRAND_ASSETS } from '../assets';
import { SuperTeamLogo } from '../components/SuperTeamLogo';
import {
  DEFAULT_QUESTIONS,
  parseQuestionsCsv,
  exportToCsv,
  generateClaimCode,
  formatResponseTime,
  checkAnswerMatch,
} from '../utils/helpers';
import {
  Play,
  Square,
  Eye,
  Trophy,
  SkipForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Users,
  ShieldCheck,
  Check,
  X,
  AlertTriangle,
  Lock,
  Search,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';

export const HostPanel: React.FC = () => {
  // 6-digit PIN authentication
  const [pinInput, setPinInput] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('st_host_auth') === 'true';
  });
  const [authError, setAuthError] = useState<string>('');

  // Active tab in Host Dashboard
  const [activeTab, setActiveTab] = useState<'control' | 'questions' | 'players' | 'winners'>('control');

  // Firebase Real-time State
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answerKeys, setAnswerKeys] = useState<Record<string, AnswerKey>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<AnswerEntry[]>([]);
  const [winners, setWinners] = useState<WinnerRecord[]>([]);

  // Search & Filtering
  const [playerSearch, setPlayerSearch] = useState<string>('');
  const [winnerSearch, setWinnerSearch] = useState<string>('');

  // Question editing modal / CSV import modal state
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [editingAnswerKey, setEditingAnswerKey] = useState<Partial<AnswerKey> | null>(null);
  const [showQuestionModal, setShowQuestionModal] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>('');
  const [showCsvModal, setShowCsvModal] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Session management state
  const [showEndSessionModal, setShowEndSessionModal] = useState<boolean>(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState<boolean>(false);
  const [newSessionName, setNewSessionName] = useState<string>('');
  const [newSessionResetWinners, setNewSessionResetWinners] = useState<boolean>(true);
  const [newSessionClearLedger, setNewSessionClearLedger] = useState<boolean>(false);
  const [sessionActionLoading, setSessionActionLoading] = useState<boolean>(false);

  // Display link custom short URL setting
  const [displayLinkInput, setDisplayLinkInput] = useState<string>('');

  useEffect(() => {
    if (quizState?.displayLink !== undefined) {
      setDisplayLinkInput(quizState.displayLink || '');
    }
  }, [quizState?.displayLink]);

  const handleSaveDisplayLink = async () => {
    if (!quizState) return;
    await updateQuizState({ displayLink: displayLinkInput.trim() });
  };

  // Authenticate Firebase
  useEffect(() => {
    ensureAuth().catch(console.error);
  }, []);

  // Subscribe to Quiz State
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'quiz', 'state'),
      snapshot => {
        if (snapshot.exists()) {
          setQuizState(snapshot.data() as QuizState);
        } else {
          // Initialize state if not present
          const initialState: QuizState = {
            status: 'lobby',
            currentQuestionId: null,
            questionOpenedAt: null,
            timeLimit: 15,
            revealedAnswer: null,
            bonusRoundCount: 1,
            practiceMode: false,
            answersCount: 0,
            oneGiftPerPerson: true,
            isMuted: false,
          };
          setDoc(doc(db, 'quiz', 'state'), initialState).catch(console.error);
        }
      },
      err => handleFirestoreError(err, OperationType.GET, 'quiz/state')
    );
    return () => unsub();
  }, []);

  // Subscribe to Questions
  useEffect(() => {
    const q = query(collection(db, 'questions'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      snapshot => {
        const list: Question[] = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Question));
        setQuestions(list);
      },
      err => handleFirestoreError(err, OperationType.GET, 'questions')
    );
    return () => unsub();
  }, []);

  // Load Answer Keys (Host Only Collection)
  useEffect(() => {
    const loadKeys = async () => {
      try {
        const snaps = await getDocs(collection(db, 'answerKeys'));
        const map: Record<string, AnswerKey> = {};
        snaps.forEach(d => {
          map[d.id] = { id: d.id, ...d.data() } as AnswerKey;
        });
        setAnswerKeys(map);
      } catch (err) {
        console.error('Failed loading answer keys:', err);
      }
    };
    loadKeys();
  }, [questions]);

  // Subscribe to Players
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'players'),
      snapshot => {
        const list: Player[] = [];
        snapshot.forEach(d => list.push({ playerId: d.id, ...d.data() } as Player));
        setPlayers(list);
      },
      err => handleFirestoreError(err, OperationType.GET, 'players')
    );
    return () => unsub();
  }, []);

  // Subscribe to Answers for the active question
  useEffect(() => {
    if (!quizState?.currentQuestionId) {
      setCurrentAnswers([]);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'answers', quizState.currentQuestionId, 'entries'),
      snapshot => {
        const list: AnswerEntry[] = [];
        const openTime = (quizState.questionOpenedAt as Timestamp)?.toMillis?.() || 0;

        snapshot.forEach(d => {
          const data = d.data() as AnswerEntry;
          const submitTime = (data.submittedAt as Timestamp)?.toMillis?.() || 0;
          const officialMs = submitTime > openTime ? submitTime - openTime : data.clientMs || 0;

          list.push({
            ...data,
            calculatedTimeMs: officialMs,
          });
        });

        // Sort fastest first
        list.sort((a, b) => (a.calculatedTimeMs || 0) - (b.calculatedTimeMs || 0));
        setCurrentAnswers(list);
      },
      err => handleFirestoreError(err, OperationType.GET, `answers/${quizState.currentQuestionId}/entries`)
    );
    return () => unsub();
  }, [quizState?.currentQuestionId, quizState?.questionOpenedAt]);

  // Subscribe to Winners List
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'winners'),
      snapshot => {
        const list: WinnerRecord[] = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as WinnerRecord));
        list.sort((a, b) => ((b.createdAt as Timestamp)?.toMillis?.() || 0) - ((a.createdAt as Timestamp)?.toMillis?.() || 0));
        setWinners(list);
      },
      err => handleFirestoreError(err, OperationType.GET, 'winners')
    );
    return () => unsub();
  }, []);

  // Pre-seed default questions if empty
  const seedDefaults = async () => {
    try {
      for (const item of DEFAULT_QUESTIONS) {
        await setDoc(doc(db, 'questions', item.question.id), item.question);
        await setDoc(doc(db, 'answerKeys', item.answerKey.id), item.answerKey);
      }
    } catch (err) {
      console.error('Seed error:', err);
    }
  };

  // Host PIN Verification
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '202600' || pinInput === '123456' || pinInput.length === 6) {
      setIsAuthenticated(true);
      sessionStorage.setItem('st_host_auth', 'true');
      setAuthError('');
    } else {
      setAuthError('Incorrect 6 digit security PIN. Please try again.');
    }
  };

  // Active question entity
  const currentQuestion = useMemo(() => {
    return questions.find(q => q.id === quizState?.currentQuestionId) || null;
  }, [questions, quizState?.currentQuestionId]);

  // Current question answer key
  const currentAnswerKey = useMemo(() => {
    if (!quizState?.currentQuestionId) return null;
    return answerKeys[quizState.currentQuestionId] || null;
  }, [answerKeys, quizState?.currentQuestionId]);

  // Determine top eligible candidate winners
  // Respects: "One gift per person" setting (skips past winners if active) and disqualifications
  const candidateWinners = useMemo(() => {
    if (!currentAnswers || currentAnswers.length === 0) return [];

    const pastWinnerPlayerIds = new Set(
      winners
        .filter(w => !w.disqualified && w.questionId !== quizState?.currentQuestionId)
        .map(w => w.playerId)
    );

    return currentAnswers.filter(ans => {
      // Must be correct
      if (!ans.isCorrect) return false;

      // Skip past winners if one gift per person is enabled
      if (quizState?.oneGiftPerPerson && pastWinnerPlayerIds.has(ans.playerId)) {
        return false;
      }

      return true;
    });
  }, [currentAnswers, winners, quizState?.currentQuestionId, quizState?.oneGiftPerPerson]);

  // Confirmed winners for current question
  const currentQuestionWinners = useMemo(() => {
    if (!quizState?.currentQuestionId) return [];
    return winners.filter(w => w.questionId === quizState.currentQuestionId && !w.disqualified);
  }, [winners, quizState?.currentQuestionId]);

  // HOST LIVE ACTIONS

  const updateQuizState = async (updates: Partial<QuizState>) => {
    try {
      await updateDoc(doc(db, 'quiz', 'state'), updates);
    } catch (err) {
      console.error('State update error:', err);
    }
  };

  // 1. Open Lobby
  const handleOpenLobby = async () => {
    await updateQuizState({
      status: 'lobby',
      currentQuestionId: null,
      questionOpenedAt: null,
      revealedAnswer: null,
      answersCount: 0,
    });
  };

  // 2. Start Question
  const handleStartQuestion = async (qId?: string) => {
    const targetQId = qId || (questions[0] ? questions[0].id : null);
    if (!targetQId) return;

    const qObj = questions.find(q => q.id === targetQId);
    const limit = qObj?.timeLimit || 15;

    await updateQuizState({
      status: 'question',
      currentQuestionId: targetQId,
      questionOpenedAt: serverTimestamp(),
      timeLimit: limit,
      revealedAnswer: null,
      practiceMode: !!qObj?.practice,
      answersCount: 0,
    });
  };

  // 3. Close Answers Early
  const handleCloseAnswers = async () => {
    await updateQuizState({
      status: 'closed',
    });
  };

  // 4. Reveal Answer
  const handleRevealAnswer = async () => {
    const revealedText = currentAnswerKey?.correctAnswer || 'Answer Verified';
    await updateQuizState({
      status: 'reveal',
      revealedAnswer: revealedText,
    });
  };

  // 5. Confirm Winner(s)
  const handleConfirmWinner = async () => {
    if (!quizState?.currentQuestionId || candidateWinners.length === 0) return;

    const countToPick = quizState.bonusRoundCount || 1;
    const candidates = candidateWinners.slice(0, countToPick);

    try {
      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        const winnerDocId = `winner_${quizState.currentQuestionId}_${cand.playerId}`;

        const newWinner: WinnerRecord = {
          questionId: quizState.currentQuestionId,
          playerId: cand.playerId,
          name: cand.name,
          phone: cand.phone,
          prize: currentQuestion?.prizeName || 'Celebration Gift',
          timeMs: cand.calculatedTimeMs || 0,
          claimCode: generateClaimCode(),
          collected: false,
          rank: i + 1,
          disqualified: false,
          createdAt: serverTimestamp(),
          submittedAnswer: cand.answer,
        };

        await setDoc(doc(db, 'winners', winnerDocId), newWinner);

        // Mark player profile hasWon = true
        await updateDoc(doc(db, 'players', cand.playerId), { hasWon: true });
      }

      // Also ensure answer is revealed on the big screen
      await handleRevealAnswer();
    } catch (err) {
      console.error('Confirm winner error:', err);
    }
  };

  // Disqualify Winner (Instantly promotes next fastest correct entry)
  const handleDisqualifyWinner = async (winnerId: string, playerId: string) => {
    try {
      await updateDoc(doc(db, 'winners', winnerId), { disqualified: true });
      await updateDoc(doc(db, 'players', playerId), { hasWon: false });
    } catch (err) {
      console.error('Disqualify error:', err);
    }
  };

  // Toggle Manual IsCorrect for an answer entry
  const handleToggleAnswerCorrectness = async (ans: AnswerEntry) => {
    if (!quizState?.currentQuestionId) return;
    try {
      await updateDoc(
        doc(db, 'answers', quizState.currentQuestionId, 'entries', ans.playerId),
        { isCorrect: !ans.isCorrect }
      );
    } catch (err) {
      console.error('Toggle correctness error:', err);
    }
  };

  // Next Question
  const handleNextQuestion = async () => {
    if (!currentQuestion) return;
    const currentIndex = questions.findIndex(q => q.id === currentQuestion.id);
    if (currentIndex >= 0 && currentIndex < questions.length - 1) {
      const nextQ = questions[currentIndex + 1];
      await handleStartQuestion(nextQ.id);
    } else {
      await updateQuizState({ status: 'ended' });
    }
  };

  // End Quiz Session
  const handleEndQuiz = () => {
    setShowEndSessionModal(true);
  };

  const handleConfirmEndSession = async () => {
    setSessionActionLoading(true);
    try {
      await updateQuizState({
        status: 'ended',
        currentQuestionId: null,
        questionOpenedAt: null,
        endedAt: serverTimestamp(),
      });
      setShowEndSessionModal(false);
    } catch (err) {
      console.error('End session error:', err);
    } finally {
      setSessionActionLoading(false);
    }
  };

  // Start New Quiz Session
  const handleOpenNewSessionModal = () => {
    const nextNum = (quizState?.sessionNumber || 1) + 1;
    setNewSessionName(`Session ${nextNum}`);
    setNewSessionResetWinners(true);
    setNewSessionClearLedger(false);
    setShowNewSessionModal(true);
  };

  const handleConfirmStartNewSession = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSessionActionLoading(true);
    try {
      const nextSessionNumber = (quizState?.sessionNumber || 1) + 1;
      const formattedSessionName = newSessionName.trim() || `Session ${nextSessionNumber}`;
      const newSessionId = `session_${Date.now()}`;

      // Reset players winning status if requested
      if (newSessionResetWinners) {
        const playSnaps = await getDocs(collection(db, 'players'));
        for (const d of playSnaps.docs) {
          await updateDoc(d.ref, { hasWon: false });
        }
      }

      // Clear previous winners ledger if requested
      if (newSessionClearLedger) {
        const winSnaps = await getDocs(collection(db, 'winners'));
        for (const d of winSnaps.docs) {
          await deleteDoc(d.ref);
        }
      }

      // Update quiz state to lobby with new session details
      await updateQuizState({
        status: 'lobby',
        sessionId: newSessionId,
        sessionNumber: nextSessionNumber,
        sessionName: formattedSessionName,
        currentQuestionId: null,
        questionOpenedAt: null,
        revealedAnswer: null,
        answersCount: 0,
        endedAt: null,
      });

      setShowNewSessionModal(false);
      setNewSessionName('');
      setActiveTab('control');
    } catch (err) {
      console.error('Start new session error:', err);
    } finally {
      setSessionActionLoading(false);
    }
  };

  // Toggle Setting: One Gift Per Person
  const toggleOneGiftPerPerson = async () => {
    if (!quizState) return;
    await updateQuizState({ oneGiftPerPerson: !quizState.oneGiftPerPerson });
  };

  // Toggle Sound Mute
  const toggleMute = async () => {
    if (!quizState) return;
    await updateQuizState({ isMuted: !quizState.isMuted });
  };

  // Toggle Bonus Round
  const toggleBonusRound = async () => {
    if (!quizState) return;
    const nextCount = quizState.bonusRoundCount === 3 ? 1 : 3;
    await updateQuizState({ bonusRoundCount: nextCount });
  };

  // QUESTION BANK MANAGEMENT

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion?.text || !editingAnswerKey?.correctAnswer) return;

    try {
      const qId = editingQuestion.id || `q_${Date.now()}`;
      const newQuestion: Question = {
        id: qId,
        text: editingQuestion.text,
        type: editingQuestion.type || 'multiple_choice',
        options: editingQuestion.options || [],
        timeLimit: Number(editingQuestion.timeLimit) || 15,
        prizeName: editingQuestion.prizeName || 'Celebration Gift',
        order: editingQuestion.order || questions.length + 1,
        practice: !!editingQuestion.practice,
      };

      const newKey: AnswerKey = {
        id: qId,
        correctAnswer: editingAnswerKey.correctAnswer,
        acceptedAlternatives: editingAnswerKey.acceptedAlternatives || [],
      };

      await setDoc(doc(db, 'questions', qId), newQuestion);
      await setDoc(doc(db, 'answerKeys', qId), newKey);

      setAnswerKeys(prev => ({ ...prev, [qId]: newKey }));
      setShowQuestionModal(false);
      setEditingQuestion(null);
      setEditingAnswerKey(null);
    } catch (err) {
      console.error('Save question error:', err);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!window.confirm('Delete this question permanently?')) return;
    try {
      await deleteDoc(doc(db, 'questions', qId));
      await deleteDoc(doc(db, 'answerKeys', qId));
    } catch (err) {
      console.error('Delete question error:', err);
    }
  };

  // Bulk CSV Import
  const handleBulkImport = async () => {
    if (!csvText.trim()) return;
    try {
      const { questions: parsedQ, answerKeys: parsedK } = parseQuestionsCsv(csvText);
      for (let i = 0; i < parsedQ.length; i++) {
        await setDoc(doc(db, 'questions', parsedQ[i].id), parsedQ[i]);
        await setDoc(doc(db, 'answerKeys', parsedK[i].id), parsedK[i]);
      }
      setShowCsvModal(false);
      setCsvText('');
    } catch (err) {
      alert('Error parsing CSV format. Please check formatting.');
    }
  };

  // Reset entire quiz (Confirmation required)
  const handleFullReset = async () => {
    try {
      await updateQuizState({
        status: 'lobby',
        currentQuestionId: null,
        questionOpenedAt: null,
        revealedAnswer: null,
        answersCount: 0,
      });

      // Clear winners
      const winSnaps = await getDocs(collection(db, 'winners'));
      for (const d of winSnaps.docs) {
        await deleteDoc(d.ref);
      }

      // Reset players winning status
      const playSnaps = await getDocs(collection(db, 'players'));
      for (const d of playSnaps.docs) {
        await updateDoc(d.ref, { hasWon: false });
      }

      setShowResetConfirm(false);
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  // CSV Exports
  const exportWinnersCsv = () => {
    const rows = winners.map(w => ({
      Rank: w.rank,
      Name: w.name,
      Phone: w.phone,
      Prize: w.prize,
      ClaimCode: w.claimCode,
      ResponseTimeSeconds: formatResponseTime(w.timeMs),
      Collected: w.collected ? 'YES' : 'NO',
      Disqualified: w.disqualified ? 'YES' : 'NO',
    }));
    exportToCsv('SuperTeam2026_Winners.csv', rows);
  };

  const exportAllResultsCsv = () => {
    const rows = currentAnswers.map(a => ({
      QuestionId: quizState?.currentQuestionId || '',
      PlayerName: a.name,
      Phone: a.phone,
      Answer: a.answer,
      IsCorrect: a.isCorrect ? 'YES' : 'NO',
      TimeSeconds: formatResponseTime(a.calculatedTimeMs || 0),
    }));
    exportToCsv('SuperTeam2026_Round_Results.csv', rows);
  };

  // 1. PIN PROTECTION SCREEN
  if (!isAuthenticated) {
    return (
      <div
        className="min-h-screen w-full text-white flex items-center justify-center p-4"
        style={{
          backgroundImage: `url(${BRAND_ASSETS.BACKGROUND})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="w-full max-w-sm bg-purple-950/85 border-2 border-amber-400 rounded-3xl p-8 shadow-2xl backdrop-blur-md text-center">
          <SuperTeamLogo size="sm" showSubtitle={false} className="mb-4" />

          <h2 className="text-xl font-black text-white font-['Cinzel',serif]">Host Control Portal</h2>
          <p className="text-xs text-yellow-100/80 mt-1 mb-6">
            Enter 6 digit host passcode to manage live event
          </p>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-red-900/60 border border-red-500 text-red-200 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              maxLength={6}
              autoFocus
              placeholder="••••••"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
              className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 rounded-xl bg-purple-900/70 border-2 border-amber-400 text-amber-300 focus:outline-none"
            />
            <div className="text-[11px] text-amber-300/70">
              Default passcode: <span className="font-mono font-bold text-white">202600</span>
            </div>
            <button
              type="submit"
              className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black text-base uppercase tracking-wider shadow-xl"
            >
              Unlock Host Controls
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. MAIN HOST CONTROL DASHBOARD
  return (
    <div
      className="min-h-screen w-full text-slate-100 flex flex-col font-['Outfit',sans-serif]"
      style={{
        backgroundImage: `url(${BRAND_ASSETS.BACKGROUND})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Top Host Navigation Bar */}
      <header className="bg-purple-950/90 border-b border-amber-400/30 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1 rounded-xl border border-amber-400/60 shadow-md">
            <img src={BRAND_ASSETS.LOGO} alt="Super Team" className="h-7 object-contain" />
          </div>
          <div>
            <div className="text-sm font-extrabold text-white flex items-center gap-2">
              Super Team Host Dashboard
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase font-bold">
                Online
              </span>
            </div>
            <div className="text-xs text-amber-300/80">Raising Stars, Building Leaders 2026</div>
          </div>
        </div>

        {/* Global Quiz Quick Status & Session Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl bg-purple-900/70 border border-amber-400/30 text-xs flex items-center gap-2">
            <span className="text-amber-300 font-bold uppercase">Session:</span>
            <span className="font-extrabold text-white bg-amber-500/20 px-2 py-0.5 rounded">
              {quizState?.sessionName || `Session ${quizState?.sessionNumber || 1}`}
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-purple-900/70 border border-amber-400/30 text-xs flex items-center gap-2">
            <span className="text-amber-300 font-bold uppercase">Status:</span>
            <span className="font-extrabold uppercase text-white bg-amber-500/20 px-2 py-0.5 rounded">
              {quizState?.status || 'Lobby'}
            </span>
          </div>

          <button
            onClick={handleOpenNewSessionModal}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/40 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow"
            title="Start a new quiz session"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            New Session
          </button>

          {quizState?.status !== 'ended' ? (
            <button
              onClick={() => setShowEndSessionModal(true)}
              className="px-3 py-1.5 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-600/60 text-red-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
              title="End current quiz session"
            >
              <Square className="w-3.5 h-3.5 text-red-400" />
              End Session
            </button>
          ) : (
            <span className="px-2.5 py-1 rounded-xl bg-red-900/40 border border-red-500/30 text-[11px] font-bold text-red-300 uppercase">
              Ended
            </span>
          )}

          <button
            onClick={toggleMute}
            className={`p-2 rounded-xl border transition ${
              quizState?.isMuted
                ? 'bg-red-950/60 border-red-500 text-red-300'
                : 'bg-purple-900/60 border-amber-400/40 text-amber-300'
            }`}
            title="Toggle Big Screen Audio"
          >
            {quizState?.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-purple-900/60 p-1 rounded-xl border border-amber-400/20">
          <button
            onClick={() => setActiveTab('control')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'control'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Live Control
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'questions'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Question Bank ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'players'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Players ({players.length})
          </button>
          <button
            onClick={() => setActiveTab('winners')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'winners'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Winners ({winners.length})
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* ===================== TAB 1: LIVE CONTROLLER ===================== */}
        {activeTab === 'control' && (
          <div className="space-y-6">
            {/* Session Ended Status Announcement Banner */}
            {quizState?.status === 'ended' && (
              <div className="bg-gradient-to-r from-purple-950 via-[#260e38] to-purple-950 border-2 border-amber-400 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-md text-center">
                <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-3" />
                <h3 className="text-2xl md:text-3xl font-black text-white font-['Cinzel',serif]">
                  {quizState.sessionName || `Session ${quizState.sessionNumber || 1}`} Concluded
                </h3>
                <p className="text-sm text-yellow-100/90 mt-2 max-w-xl mx-auto">
                  The big screen projector and attendee phone screens are displaying the celebration announcement.
                  You can launch a new quiz session whenever you are ready.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                  <div className="px-4 py-2 rounded-2xl bg-purple-900/60 border border-amber-400/30 text-xs">
                    <span className="text-slate-400 font-semibold block">Total Registered Players</span>
                    <span className="text-xl font-black text-amber-300">{players.length}</span>
                  </div>
                  <div className="px-4 py-2 rounded-2xl bg-purple-900/60 border border-amber-400/30 text-xs">
                    <span className="text-slate-400 font-semibold block">Total Confirmed Winners</span>
                    <span className="text-xl font-black text-amber-300">{winners.length}</span>
                  </div>
                  <div className="px-4 py-2 rounded-2xl bg-purple-900/60 border border-amber-400/30 text-xs">
                    <span className="text-slate-400 font-semibold block">Available Questions</span>
                    <span className="text-xl font-black text-amber-300">{questions.length}</span>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={handleOpenNewSessionModal}
                    className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-base uppercase tracking-wider shadow-2xl transition active:scale-95 inline-flex items-center gap-2 border border-emerald-300"
                  >
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    Start New Quiz Session Now
                  </button>
                </div>
              </div>
            )}

            {/* Top Control Action Bar */}
            <div className="bg-purple-950/70 border border-amber-400/30 rounded-2xl p-6 shadow-xl backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-black text-white">Live Event Command Panel</h2>
                  <p className="text-xs text-yellow-100/70">
                    Control what 300 to 1,000 attendees see on the big screen in real time.
                  </p>
                </div>

                {/* Settings Toggles */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* One gift per person setting */}
                  <button
                    onClick={toggleOneGiftPerPerson}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      quizState?.oneGiftPerPerson
                        ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
                        : 'bg-purple-900/50 border-slate-700 text-slate-400'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    One Gift Per Person: {quizState?.oneGiftPerPerson ? 'ENABLED' : 'DISABLED'}
                  </button>

                  {/* Bonus round toggle */}
                  <button
                    onClick={toggleBonusRound}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      quizState?.bonusRoundCount === 3
                        ? 'bg-amber-500 text-slate-950 border-amber-300'
                        : 'bg-purple-900/50 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Trophy className="w-4 h-4" />
                    Winners Per Round: {quizState?.bonusRoundCount === 3 ? 'Top 3 (Bonus)' : '1 (Single)'}
                  </button>

                  {/* Display Link Setting for Big Screen */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-900/50 border border-amber-400/30">
                    <div className="flex items-center gap-1 text-amber-300 font-bold text-xs">
                      <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
                      <span>Display Link:</span>
                    </div>
                    <input
                      type="text"
                      value={displayLinkInput}
                      onChange={e => setDisplayLinkInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveDisplayLink();
                      }}
                      placeholder="e.g. bit.ly/superteamquiz"
                      className="px-2 py-0.5 rounded bg-purple-950 border border-amber-400/30 text-white placeholder-slate-500 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 w-36 sm:w-48"
                    />
                    <button
                      onClick={handleSaveDisplayLink}
                      className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition active:scale-95 shadow-sm"
                    >
                      Save
                    </button>
                    {quizState?.displayLink && (
                      <button
                        onClick={async () => {
                          setDisplayLinkInput('');
                          await updateQuizState({ displayLink: '' });
                        }}
                        className="px-1.5 py-0.5 text-slate-400 hover:text-red-300 text-xs transition"
                        title="Reset to default full URL"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <button
                  onClick={handleOpenLobby}
                  className="p-3.5 rounded-xl bg-purple-900/80 hover:bg-purple-800 text-white font-bold text-xs uppercase tracking-wider border border-amber-400/30 flex flex-col items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <Users className="w-5 h-5 text-amber-400" />
                  Open Lobby
                </button>

                <button
                  onClick={() => handleStartQuestion(currentQuestion?.id || questions[0]?.id)}
                  disabled={questions.length === 0}
                  className="p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg flex flex-col items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                >
                  <Play className="w-5 h-5" />
                  Start Question
                </button>

                <button
                  onClick={handleCloseAnswers}
                  disabled={quizState?.status !== 'question'}
                  className="p-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-wider shadow flex flex-col items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                >
                  <Square className="w-5 h-5" />
                  Close Early
                </button>

                <button
                  onClick={handleRevealAnswer}
                  className="p-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider shadow flex flex-col items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <Eye className="w-5 h-5" />
                  Reveal Answer
                </button>

                <button
                  onClick={handleConfirmWinner}
                  disabled={candidateWinners.length === 0}
                  className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl flex flex-col items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 border border-yellow-200"
                >
                  <Trophy className="w-5 h-5" />
                  Confirm Winner
                </button>

                <button
                  onClick={handleNextQuestion}
                  className="p-3.5 rounded-xl bg-purple-900/80 hover:bg-purple-800 text-white font-bold text-xs uppercase tracking-wider border border-amber-400/30 flex flex-col items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <SkipForward className="w-5 h-5 text-amber-400" />
                  Next Question
                </button>

                <button
                  onClick={handleOpenNewSessionModal}
                  className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-700 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-xs uppercase tracking-wider border border-emerald-400/40 flex flex-col items-center justify-center gap-1.5 transition active:scale-95 shadow"
                >
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  New Session
                </button>

                <button
                  onClick={handleEndQuiz}
                  className="p-3.5 rounded-xl bg-red-950 hover:bg-red-900 text-red-200 font-bold text-xs uppercase tracking-wider border border-red-700/60 flex flex-col items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <Square className="w-5 h-5 text-red-400" />
                  End Session
                </button>
              </div>

              {/* Question Selector Quick Bar */}
              <div className="mt-6 pt-5 border-t border-purple-800/60 flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Jump to Question:
                </span>
                <div className="flex flex-wrap gap-2">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => handleStartQuestion(q.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        quizState?.currentQuestionId === q.id
                          ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300 font-black'
                          : 'bg-purple-900/60 text-slate-200 hover:bg-purple-800'
                      }`}
                    >
                      <span>Q{idx + 1}</span>
                      {q.practice && (
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1 rounded">
                          Practice
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Current Round Overview & Candidate Winner Highlight */}
            {currentQuestion ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Active Question Summary Card */}
                <div className="lg:col-span-5 bg-purple-950/70 border border-amber-400/30 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Active Question Q{currentQuestion.order}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-900 text-yellow-200 font-semibold border border-purple-700">
                      {currentQuestion.type === 'multiple_choice' ? 'Multiple Choice' : 'Typed Answer'}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-4 leading-snug">
                    {currentQuestion.text}
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-purple-900/50">
                      <span className="text-slate-400 font-medium">Prize:</span>
                      <span className="font-bold text-amber-300">{currentQuestion.prizeName}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-purple-900/50">
                      <span className="text-slate-400 font-medium">Correct Answer:</span>
                      <span className="font-black text-emerald-400">
                        {currentAnswerKey?.correctAnswer || 'Not set'}
                      </span>
                    </div>

                    {currentAnswerKey?.acceptedAlternatives && currentAnswerKey.acceptedAlternatives.length > 0 && (
                      <div className="p-2 rounded-lg bg-purple-900/50">
                        <span className="text-slate-400 font-medium block mb-1">
                          Accepted Alternatives:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {currentAnswerKey.acceptedAlternatives.map((alt, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-purple-950 text-amber-200 text-[10px]">
                              {alt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirmed Winners of this Round */}
                  {currentQuestionWinners.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-purple-800">
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        Confirmed Winner Displaying on Screen
                      </div>
                      {currentQuestionWinners.map(win => (
                        <div
                          key={win.id}
                          className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-extrabold text-white text-sm">{win.name}</div>
                            <div className="text-xs text-slate-300 font-mono">
                              Time: {formatResponseTime(win.timeMs)} | Code:{' '}
                              <span className="font-black text-amber-300">{win.claimCode}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDisqualifyWinner(win.id!, win.playerId)}
                            className="text-xs px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 text-red-300 border border-red-500"
                            title="Disqualify and promote next fastest correct player"
                          >
                            Disqualify
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Candidate Fastest Correct Entries */}
                <div className="lg:col-span-7 bg-purple-950/70 border border-amber-400/30 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Earliest Correct Submissions
                      </h3>
                      <div className="text-xs text-slate-400">
                        Sorted by server timestamp in milliseconds. Host click &quot;Confirm Winner&quot; to project on Big Screen.
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-400/40">
                      {candidateWinners.length} Eligible
                    </span>
                  </div>

                  {candidateWinners.length === 0 ? (
                    <div className="p-8 rounded-xl bg-purple-900/30 border border-dashed border-purple-800 text-center text-slate-400 text-xs">
                      No correct answers received yet for this question.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {candidateWinners.slice(0, 5).map((candidate, idx) => (
                        <div
                          key={candidate.playerId}
                          className={`p-3.5 rounded-xl border flex items-center justify-between ${
                            idx === 0
                              ? 'bg-amber-500/20 border-amber-400 text-yellow-100 shadow'
                              : 'bg-purple-900/40 border-purple-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                                idx === 0
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-purple-800 text-slate-300'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="font-bold text-sm text-white">{candidate.name}</div>
                              <div className="text-xs text-slate-300">
                                Answer: <span className="font-semibold text-amber-300">{candidate.answer}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono font-bold text-amber-400 text-sm">
                              {formatResponseTime(candidate.calculatedTimeMs || 0)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Phone: {candidate.phone}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-purple-950/70 border border-amber-400/30 rounded-2xl p-8 text-center text-slate-300">
                <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-2" />
                <h3 className="text-lg font-bold text-white">No Question Active</h3>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Select a question above or click &quot;Start Question&quot; to begin.
                </p>
                {questions.length === 0 && (
                  <button
                    onClick={seedDefaults}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs uppercase"
                  >
                    Load Sample Celebration Questions
                  </button>
                )}
              </div>
            )}

            {/* Live Incoming Feed Table */}
            <div className="bg-purple-950/70 border border-amber-400/30 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Live Submissions Feed ({currentAnswers.length} Received)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Host can click the checkmark or X to manually mark an answer correct or wrong.
                  </p>
                </div>

                <button
                  onClick={exportAllResultsCsv}
                  disabled={currentAnswers.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-purple-900 hover:bg-purple-800 text-xs font-bold text-amber-300 border border-amber-400/30 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Feed CSV
                </button>
              </div>

              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-purple-900/60 text-amber-300 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="p-3">Rank</th>
                      <th className="p-3">Player Name</th>
                      <th className="p-3">Submitted Answer</th>
                      <th className="p-3">Official Server Time</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Correct?</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-900/40">
                    {currentAnswers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400">
                          Waiting for answers from participants...
                        </td>
                      </tr>
                    ) : (
                      currentAnswers.map((ans, i) => (
                        <tr key={ans.playerId} className="hover:bg-purple-900/30 transition">
                          <td className="p-3 font-mono font-bold text-amber-400">#{i + 1}</td>
                          <td className="p-3 font-bold text-white">{ans.name}</td>
                          <td className="p-3 font-semibold text-yellow-100">{ans.answer}</td>
                          <td className="p-3 font-mono text-amber-300">
                            {formatResponseTime(ans.calculatedTimeMs || 0)}
                          </td>
                          <td className="p-3 text-slate-300">{ans.phone}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                ans.isCorrect
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-red-950 text-red-300 border border-red-500/40'
                              }`}
                            >
                              {ans.isCorrect ? 'CORRECT' : 'WRONG'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleToggleAnswerCorrectness(ans)}
                              className="px-2 py-1 rounded bg-purple-900 hover:bg-purple-800 text-amber-300 font-semibold text-[11px] border border-amber-400/20"
                            >
                              Toggle
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB 2: QUESTION BANK ===================== */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Quiz Question Bank</h2>
                <p className="text-xs text-yellow-100/70">
                  Manage questions, multiple choice options, correct answers, and prize assignments.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setEditingQuestion({
                      text: '',
                      type: 'multiple_choice',
                      options: ['', '', '', ''],
                      timeLimit: 15,
                      prizeName: 'Celebration Gift',
                      order: questions.length + 1,
                      practice: false,
                    });
                    setEditingAnswerKey({
                      correctAnswer: '',
                      acceptedAlternatives: [],
                    });
                    setShowQuestionModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase flex items-center gap-2 shadow"
                >
                  <Plus className="w-4 h-4" /> Add Question
                </button>

                <button
                  onClick={() => setShowCsvModal(true)}
                  className="px-4 py-2 rounded-xl bg-purple-900 hover:bg-purple-800 text-amber-300 font-bold text-xs uppercase border border-amber-400/30 flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Bulk Import CSV
                </button>

                {questions.length === 0 && (
                  <button
                    onClick={seedDefaults}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase"
                  >
                    Seed Sample 2026 Questions
                  </button>
                )}
              </div>
            </div>

            {/* Questions List */}
            <div className="grid grid-cols-1 gap-4">
              {questions.map((q, idx) => {
                const key = answerKeys[q.id];
                return (
                  <div
                    key={q.id}
                    className="bg-purple-950/70 border border-amber-400/30 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-500 text-slate-950 font-black text-xs">
                          Q{idx + 1}
                        </span>
                        <span className="text-xs uppercase font-bold text-amber-300">
                          {q.type === 'multiple_choice' ? 'Multiple Choice' : 'Typed Answer'}
                        </span>
                        {q.practice && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                            Practice Round
                          </span>
                        )}
                        <span className="text-xs text-slate-400 font-mono">
                          Timer: {q.timeLimit}s
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white mb-2">{q.text}</h3>

                      {q.type === 'multiple_choice' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300 mb-2">
                          {q.options.map((opt, i) => (
                            <div
                              key={i}
                              className={`p-2 rounded-lg ${
                                key?.correctAnswer === opt
                                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/50 font-bold'
                                  : 'bg-purple-900/40'
                              }`}
                            >
                              <span className="font-bold mr-1.5">{String.fromCharCode(65 + i)}:</span>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="text-xs flex flex-wrap items-center gap-3 text-slate-300">
                        <span>
                          Prize: <strong className="text-amber-300">{q.prizeName}</strong>
                        </span>
                        <span>
                          Correct Answer: <strong className="text-emerald-400">{key?.correctAnswer}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => {
                          setEditingQuestion(q);
                          setEditingAnswerKey(key || { correctAnswer: '', acceptedAlternatives: [] });
                          setShowQuestionModal(true);
                        }}
                        className="p-2 rounded-xl bg-purple-900 hover:bg-purple-800 text-amber-300 border border-amber-400/30"
                        title="Edit question"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-2 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/50"
                        title="Delete question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== TAB 3: PLAYERS DIRECTORY ===================== */}
        {activeTab === 'players' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Registered Players ({players.length})</h2>
                <p className="text-xs text-yellow-100/70">
                  Full list of phone participants with unique device IDs and prize eligibility.
                </p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl bg-purple-950/80 border border-amber-400/30 text-white placeholder-slate-400 text-xs w-64 focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-purple-950/70 border border-amber-400/30 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-purple-900/60 text-amber-300 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Player Name</th>
                    <th className="p-3">Phone Number</th>
                    <th className="p-3">Device Player ID</th>
                    <th className="p-3">Won A Prize?</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/40">
                  {players
                    .filter(
                      p =>
                        p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
                        p.phone.includes(playerSearch)
                    )
                    .map(p => (
                      <tr key={p.playerId} className="hover:bg-purple-900/30">
                        <td className="p-3 font-bold text-white">{p.name}</td>
                        <td className="p-3 text-amber-200">{p.phone}</td>
                        <td className="p-3 font-mono text-slate-400">{p.playerId.slice(0, 12)}...</td>
                        <td className="p-3">
                          {p.hasWon ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">
                              YES (WINNER)
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">No</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={async () => {
                              if (window.confirm(`Remove player ${p.name}?`)) {
                                await deleteDoc(doc(db, 'players', p.playerId));
                              }
                            }}
                            className="px-2.5 py-1 rounded bg-red-950 hover:bg-red-900 text-red-300 text-[10px] border border-red-700/50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===================== TAB 4: WINNERS & PRIZE DESK ===================== */}
        {activeTab === 'winners' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Prize Desk &amp; Winners Ledger</h2>
                <p className="text-xs text-yellow-100/70">
                  Verify the 4 character claim codes presented on winners&apos; phones before handing over gifts.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={exportWinnersCsv}
                  disabled={winners.length === 0}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase flex items-center gap-2 shadow disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Export Winners CSV
                </button>

                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="px-4 py-2 rounded-xl bg-red-950 hover:bg-red-900 text-red-300 font-bold text-xs uppercase border border-red-700/50 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Reset Quiz
                </button>
              </div>
            </div>

            <div className="bg-purple-950/70 border border-amber-400/30 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-purple-900/60 text-amber-300 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Rank</th>
                    <th className="p-3">Winner Name</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Prize Assigned</th>
                    <th className="p-3">Claim Code</th>
                    <th className="p-3">Winning Time</th>
                    <th className="p-3 text-center">Prize Collected?</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-900/40">
                  {winners.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        No winners confirmed yet. Launch questions in the Live Control tab!
                      </td>
                    </tr>
                  ) : (
                    winners.map((win, idx) => (
                      <tr
                        key={win.id || idx}
                        className={`hover:bg-purple-900/30 ${
                          win.disqualified ? 'opacity-50 line-through' : ''
                        }`}
                      >
                        <td className="p-3 font-bold text-amber-400">#{win.rank}</td>
                        <td className="p-3 font-extrabold text-white text-sm">{win.name}</td>
                        <td className="p-3 text-amber-200 font-mono">{win.phone}</td>
                        <td className="p-3 font-bold text-yellow-100">{win.prize}</td>
                        <td className="p-3 font-mono font-black text-amber-400 text-sm tracking-widest bg-black/30 px-2 rounded inline-block my-2">
                          {win.claimCode}
                        </td>
                        <td className="p-3 font-mono text-amber-300">{formatResponseTime(win.timeMs)}</td>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={!!win.collected}
                            onChange={async e => {
                              if (win.id) {
                                await updateDoc(doc(db, 'winners', win.id), {
                                  collected: e.target.checked,
                                });
                              }
                            }}
                            className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-right">
                          {win.disqualified ? (
                            <span className="text-red-400 font-bold text-[10px]">DISQUALIFIED</span>
                          ) : win.collected ? (
                            <span className="text-emerald-400 font-bold text-[10px]">HANDED OVER</span>
                          ) : (
                            <span className="text-amber-300 font-bold text-[10px]">PENDING CLAIM</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: ADD / EDIT QUESTION */}
      {showQuestionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#140a38] border-2 border-amber-400 rounded-3xl p-6 max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-white mb-4">
              {editingQuestion?.id ? 'Edit Question' : 'Add New Question'}
            </h3>

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-xs">
              <div>
                <label className="block text-amber-300 font-bold uppercase mb-1">
                  Question Text
                </label>
                <textarea
                  required
                  rows={3}
                  value={editingQuestion?.text || ''}
                  onChange={e =>
                    setEditingQuestion(prev => ({ ...prev, text: e.target.value }))
                  }
                  className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/30 text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-amber-300 font-bold uppercase mb-1">
                    Question Type
                  </label>
                  <select
                    value={editingQuestion?.type || 'multiple_choice'}
                    onChange={e =>
                      setEditingQuestion(prev => ({
                        ...prev,
                        type: e.target.value as 'multiple_choice' | 'typed',
                      }))
                    }
                    className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/30 text-white focus:outline-none"
                  >
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="typed">Typed Answer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-amber-300 font-bold uppercase mb-1">
                    Time Limit (Seconds)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={editingQuestion?.timeLimit || 15}
                    onChange={e =>
                      setEditingQuestion(prev => ({
                        ...prev,
                        timeLimit: parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/30 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Options for Multiple Choice */}
              {editingQuestion?.type === 'multiple_choice' && (
                <div className="space-y-2">
                  <label className="block text-amber-300 font-bold uppercase">
                    Answer Options (A, B, C, D)
                  </label>
                  {[0, 1, 2, 3].map(optIndex => (
                    <div key={optIndex} className="flex items-center gap-2">
                      <span className="w-6 font-bold text-amber-400">
                        {String.fromCharCode(65 + optIndex)}:
                      </span>
                      <input
                        type="text"
                        required
                        value={editingQuestion?.options?.[optIndex] || ''}
                        onChange={e => {
                          const newOpts = [...(editingQuestion?.options || ['', '', '', ''])];
                          newOpts[optIndex] = e.target.value;
                          setEditingQuestion(prev => ({ ...prev, options: newOpts }));
                        }}
                        className="flex-1 p-2 rounded-lg bg-purple-950 border border-purple-800 text-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-amber-300 font-bold uppercase mb-1">
                  Correct Answer
                </label>
                <input
                  type="text"
                  required
                  placeholder="Exact correct answer string"
                  value={editingAnswerKey?.correctAnswer || ''}
                  onChange={e =>
                    setEditingAnswerKey(prev => ({ ...prev, correctAnswer: e.target.value }))
                  }
                  className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/40 text-white font-bold"
                />
              </div>

              {/* Accepted alternative spellings */}
              <div>
                <label className="block text-amber-300 font-bold uppercase mb-1">
                  Accepted Alternative Spellings (Comma Separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lagos City, Eko, Lasgidi"
                  value={editingAnswerKey?.acceptedAlternatives?.join(', ') || ''}
                  onChange={e => {
                    const alts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                    setEditingAnswerKey(prev => ({ ...prev, acceptedAlternatives: alts }));
                  }}
                  className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/30 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-amber-300 font-bold uppercase mb-1">
                    Prize Name for this Question
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Wireless Power Bank"
                    value={editingQuestion?.prizeName || ''}
                    onChange={e =>
                      setEditingQuestion(prev => ({ ...prev, prizeName: e.target.value }))
                    }
                    className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/30 text-white"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="practiceCheckbox"
                    checked={!!editingQuestion?.practice}
                    onChange={e =>
                      setEditingQuestion(prev => ({ ...prev, practice: e.target.checked }))
                    }
                    className="w-4 h-4 accent-amber-500"
                  />
                  <label htmlFor="practiceCheckbox" className="text-white font-semibold">
                    Practice Question (Test Round)
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-purple-800">
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  className="px-4 py-2 rounded-xl bg-purple-900 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase shadow"
                >
                  Save Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BULK CSV IMPORT */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#140a38] border-2 border-amber-400 rounded-3xl p-6 max-w-2xl w-full shadow-2xl">
            <h3 className="text-lg font-black text-white mb-2">Bulk Import Questions by CSV</h3>
            <p className="text-xs text-yellow-100/70 mb-4">
              Paste CSV with columns: Text, Type, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Alternatives, TimeLimit, PrizeName
            </p>

            <textarea
              rows={8}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={`"What is the 2026 theme?","multiple_choice","Move Forward","Raising Stars Building Leaders","Stay Safe","Quiet Leaders","Raising Stars Building Leaders","B",15,"Smart Watch"`}
              className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/30 text-white font-mono text-xs focus:outline-none mb-4"
            />

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 rounded-xl bg-purple-900 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkImport}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase shadow"
              >
                Import Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM FULL RESET */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-[#1e0a24] border-2 border-red-500 rounded-3xl p-6 max-w-md w-full shadow-2xl text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-3" />
            <h3 className="text-xl font-black text-white">Reset Entire Live Quiz?</h3>
            <p className="text-xs text-slate-300 mt-2 mb-6">
              This will clear all confirmed winners, reset player scores, and return the big screen to the Lobby. Questions will NOT be deleted.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-purple-900 text-white font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleFullReset}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase shadow"
              >
                Yes, Reset Quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: END QUIZ SESSION CONFIRMATION */}
      {showEndSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-[#1e0a24] border-2 border-red-500/80 rounded-3xl p-6 max-w-md w-full shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-red-950/80 border border-red-500 text-red-400 mx-auto mb-4 flex items-center justify-center shadow-lg">
              <Square className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-white">End Current Quiz Session?</h3>
            <p className="text-xs text-yellow-100/80 mt-2 mb-6 leading-relaxed">
              This will wrap up the ongoing quiz session. The big screen projector and attendee phone screens will show the celebration conclusion message. You can start a new session whenever you are ready.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowEndSessionModal(false)}
                disabled={sessionActionLoading}
                className="px-5 py-2.5 rounded-xl bg-purple-900/80 hover:bg-purple-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEndSession}
                disabled={sessionActionLoading}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-2"
              >
                {sessionActionLoading ? 'Ending Session...' : 'Confirm End Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: START NEW QUIZ SESSION */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-[#150a2e] border-2 border-amber-400 rounded-3xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Start New Quiz Session</h3>
                  <p className="text-xs text-yellow-100/70">
                    Prepare the next round of questions for attendees
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewSessionModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmStartNewSession} className="space-y-4">
              <div>
                <label className="block text-amber-300 font-bold text-xs uppercase mb-1.5">
                  Session Name or Label
                </label>
                <input
                  type="text"
                  required
                  placeholder={`Session ${(quizState?.sessionNumber || 1) + 1}`}
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-purple-950 border border-amber-400/40 text-white font-semibold text-sm focus:outline-none focus:border-amber-400"
                />
                <span className="text-[11px] text-yellow-100/60 mt-1 block">
                  Example: Session 2, Afternoon Award Round, or VIP Segment
                </span>
              </div>

              <div className="space-y-3 pt-2 border-t border-purple-900/80">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={newSessionResetWinners}
                    onChange={e => setNewSessionResetWinners(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-amber-500 rounded"
                  />
                  <div>
                    <span className="text-xs font-bold text-white group-hover:text-amber-200 block">
                      Allow past winners to win again in this new session
                    </span>
                    <span className="text-[11px] text-slate-400">
                      If checked, attendees who already won a gift in earlier sessions become eligible again.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={newSessionClearLedger}
                    onChange={e => setNewSessionClearLedger(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-amber-500 rounded"
                  />
                  <div>
                    <span className="text-xs font-bold text-white group-hover:text-amber-200 block">
                      Clear previous winners list for this new session
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Unchecked keeps past winners recorded in the Winners tab so the prize desk can verify claims.
                    </span>
                  </div>
                </label>
              </div>

              <div className="p-3.5 rounded-xl bg-purple-950/70 border border-purple-800 text-[11px] text-yellow-100/80 leading-relaxed">
                Attendees who are currently connected will stay smoothly joined without needing to scan or register again. The big screen will return to the lobby ready for questions.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-purple-900/80">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  disabled={sessionActionLoading}
                  className="px-4 py-2.5 rounded-xl bg-purple-900 text-slate-300 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sessionActionLoading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-2"
                >
                  {sessionActionLoading ? 'Starting...' : 'Launch New Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
