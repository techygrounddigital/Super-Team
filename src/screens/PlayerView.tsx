import React, { useState, useEffect, useRef } from 'react';
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, auth, ensureAuth, handleFirestoreError, OperationType } from '../firebase';
import { QuizState, Question, AnswerKey, WinnerRecord } from '../types';
import { SuperTeamLogo } from '../components/SuperTeamLogo';
import { BRAND_ASSETS } from '../assets';
import { checkAnswerMatch, formatResponseTime } from '../utils/helpers';
import {
  Trophy,
  Award,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  UserCheck,
} from 'lucide-react';

export const PlayerView: React.FC = () => {
  // Stored player profile in localStorage
  const [playerId, setPlayerId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [joinError, setJoinError] = useState<string>('');
  const [isJoining, setIsJoining] = useState<boolean>(false);

  // Real-time quiz state & question
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [typedInput, setTypedInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [clientSubmitTimeMs, setClientSubmitTimeMs] = useState<number | null>(null);
  const [myWinnerRecord, setMyWinnerRecord] = useState<WinnerRecord | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Question appearance timestamp for local performance measurement
  const questionMountTimeRef = useRef<number | null>(null);
  const currentQIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // Monitor network connectivity for mobile resilience
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOfflineSafe();
    const setIsOfflineSafe = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Restore session from localStorage & authenticate anonymously
  useEffect(() => {
    const initPlayer = async () => {
      try {
        const user = await ensureAuth();
        setPlayerId(user.uid);

        const savedName = localStorage.getItem('st_player_name');
        const savedPhone = localStorage.getItem('st_player_phone');
        const savedJoined = localStorage.getItem('st_player_joined');

        if (savedName && savedPhone && savedJoined === 'true') {
          setName(savedName);
          setPhone(savedPhone);
          setIsJoined(true);
        }
      } catch (err) {
        console.error('Player auth initialization error:', err);
      }
    };
    initPlayer();
  }, []);

  // Subscribe to global Quiz State
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'quiz', 'state'),
      snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.data() as QuizState;
          setQuizState(data);

          // Reset local submission state when session changes or returns to lobby
          if (
            (data.sessionId && data.sessionId !== currentSessionIdRef.current) ||
            data.status === 'lobby'
          ) {
            currentSessionIdRef.current = data.sessionId || null;
            setMyAnswer(null);
            setTypedInput('');
            setClientSubmitTimeMs(null);
            setMyWinnerRecord(null);
          }

          // Reset local submission state when new question begins
          if (data.currentQuestionId !== currentQIdRef.current) {
            currentQIdRef.current = data.currentQuestionId;
            setMyAnswer(null);
            setTypedInput('');
            setClientSubmitTimeMs(null);
            setMyWinnerRecord(null);
            questionMountTimeRef.current = performance.now();
          }
        }
      },
      err => handleFirestoreError(err, OperationType.GET, 'quiz/state')
    );
    return () => unsub();
  }, []);

  // Subscribe to current question details
  useEffect(() => {
    if (!quizState?.currentQuestionId || quizState.status === 'lobby') {
      setActiveQuestion(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'questions', quizState.currentQuestionId),
      snapshot => {
        if (snapshot.exists()) {
          setActiveQuestion({ id: snapshot.id, ...snapshot.data() } as Question);
          if (!questionMountTimeRef.current) {
            questionMountTimeRef.current = performance.now();
          }
        }
      },
      err => handleFirestoreError(err, OperationType.GET, `questions/${quizState.currentQuestionId}`)
    );
    return () => unsub();
  }, [quizState?.currentQuestionId, quizState?.status]);

  // Check if player has already submitted for the current question (persists across refresh)
  useEffect(() => {
    if (!quizState?.currentQuestionId || !playerId) return;

    const checkExistingAnswer = async () => {
      try {
        const ansDoc = await getDoc(
          doc(db, 'answers', quizState.currentQuestionId!, 'entries', playerId)
        );
        if (ansDoc.exists()) {
          const data = ansDoc.data();
          setMyAnswer(data.answer);
          if (data.clientMs) {
            setClientSubmitTimeMs(data.clientMs);
          }
        }
      } catch {
        // Silently continue
      }
    };
    checkExistingAnswer();
  }, [quizState?.currentQuestionId, playerId]);

  // Check if current player is a confirmed winner for this question
  useEffect(() => {
    if (!quizState?.currentQuestionId || !playerId || quizState.status !== 'reveal') return;

    const checkWinner = async () => {
      try {
        const q = query(
          collection(db, 'winners'),
          where('questionId', '==', quizState.currentQuestionId),
          where('playerId', '==', playerId),
          where('disqualified', '!=', true)
        );
        const snaps = await getDocs(q);
        if (!snaps.empty) {
          const winData = snaps.docs[0].data() as WinnerRecord;
          setMyWinnerRecord(winData);
        }
      } catch {
        // Silently continue
      }
    };
    checkWinner();
  }, [quizState?.currentQuestionId, quizState?.status, playerId]);

  // Handle Joining Quiz
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');

    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/\s+/g, '');

    if (!cleanName || cleanName.length < 2) {
      setJoinError('Please provide your full real name');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 8) {
      setJoinError('Please enter a valid phone number for prize collection');
      return;
    }

    setIsJoining(true);
    try {
      const user = await ensureAuth();
      const currentUid = user.uid;
      setPlayerId(currentUid);

      // Enforce: Prevent same phone number joining twice from different devices
      const phoneQuery = query(collection(db, 'players'), where('phone', '==', cleanPhone));
      const phoneSnap = await getDocs(phoneQuery);

      if (!phoneSnap.empty && phoneSnap.docs[0].id !== currentUid) {
        setJoinError('This phone number is already registered on another device');
        setIsJoining(false);
        return;
      }

      // Save player document
      await setDoc(doc(db, 'players', currentUid), {
        playerId: currentUid,
        name: cleanName,
        phone: cleanPhone,
        joinedAt: serverTimestamp(),
        hasWon: false,
        banned: false,
      });

      // Persist in localStorage
      localStorage.setItem('st_player_name', cleanName);
      localStorage.setItem('st_player_phone', cleanPhone);
      localStorage.setItem('st_player_joined', 'true');
      setIsJoined(true);
    } catch (err) {
      console.error(err);
      setJoinError('Connection error. Please try joining again.');
    } finally {
      setIsJoining(false);
    }
  };

  // Handle Submitting Answer
  const submitAnswer = async (selectedOption: string) => {
    if (isSubmitting || myAnswer || !quizState?.currentQuestionId || quizState.status !== 'question') {
      return;
    }

    const trimmedAnswer = selectedOption.trim();
    if (!trimmedAnswer) return;

    setIsSubmitting(true);
    const clientElapsedMs = questionMountTimeRef.current
      ? Math.round(performance.now() - questionMountTimeRef.current)
      : 0;

    setMyAnswer(trimmedAnswer);
    setClientSubmitTimeMs(clientElapsedMs);

    try {
      const currentQId = quizState.currentQuestionId;

      // Fetch answer key to evaluate isCorrect locally for speed and fairness
      let isAnswerCorrect = false;
      try {
        const keySnap = await getDoc(doc(db, 'answerKeys', currentQId));
        if (keySnap.exists()) {
          const keyData = keySnap.data() as AnswerKey;
          isAnswerCorrect = checkAnswerMatch(
            trimmedAnswer,
            keyData.correctAnswer,
            keyData.acceptedAlternatives
          );
        }
      } catch {
        // Fallback: Host will verify
      }

      // Save answer entry using official serverTimestamp()
      await setDoc(doc(db, 'answers', currentQId, 'entries', playerId), {
        playerId,
        name,
        phone,
        answer: trimmedAnswer,
        submittedAt: serverTimestamp(),
        clientMs: clientElapsedMs,
        isCorrect: isAnswerCorrect,
      });
    } catch (err) {
      console.error('Answer submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine correct answer state during reveal
  const isMyAnswerCorrect =
    quizState?.revealedAnswer && myAnswer
      ? checkAnswerMatch(myAnswer, quizState.revealedAnswer)
      : false;

  return (
    <div
      className="min-h-screen w-full text-white flex flex-col justify-between p-4 selection:bg-amber-400 selection:text-black"
      style={{
        backgroundImage: `url(${BRAND_ASSETS.BACKGROUND})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Top Header Bar */}
      <header className="flex items-center justify-between py-2 border-b border-purple-800/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-slate-950 text-sm shadow">
            ST
          </div>
          <div>
            <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">Super Team 2026</div>
            <div className="text-[10px] text-yellow-100/70">Raising Stars, Building Leaders</div>
          </div>
        </div>

        {/* Network & Player status pill */}
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <span className="flex items-center gap-1 text-[11px] text-red-400 bg-red-950/60 px-2.5 py-1 rounded-full border border-red-500/40">
              <WifiOff className="w-3.5 h-3.5" /> Reconnecting
            </span>
          ) : isJoined ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/40 font-medium">
              <Wifi className="w-3 h-3 text-emerald-400" /> {name.split(' ')[0]}
            </span>
          ) : null}
        </div>
      </header>

      {/* Main Screen Router for Player */}
      <main className="flex-1 flex flex-col justify-center my-4 max-w-md mx-auto w-full">
        {/* STEP 1: JOIN SCREEN */}
        {!isJoined ? (
          <div className="bg-purple-950/70 border border-amber-400/40 rounded-3xl p-5 shadow-2xl backdrop-blur-md text-center animate-fade-in">
            <SuperTeamLogo size="sm" showSubtitle={true} className="mb-3" />

            <h2 className="text-xl font-black text-white mt-2">
              Enter To Win Live Gifts
            </h2>
            <p className="text-xs text-yellow-100/80 mt-1 mb-6">
              First correct tap wins the gift for each question.
            </p>

            {joinError && (
              <div className="mb-4 p-3 rounded-xl bg-red-900/60 border border-red-500 text-red-200 text-xs font-medium text-left">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Babatunde Adeyemi"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-purple-900/50 border border-amber-400/30 text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 text-base"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 08012345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-purple-900/50 border border-amber-400/30 text-white placeholder-slate-400 focus:outline-none focus:border-amber-400 text-base"
                />
                <span className="text-[10px] text-slate-300 mt-1 block">
                  Used exclusively to verify your prize at the desk.
                </span>
              </div>

              <button
                type="submit"
                disabled={isJoining}
                className="w-full mt-2 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-base tracking-wider uppercase shadow-xl transition-all active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isJoining ? (
                  <span>Connecting...</span>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Join The Live Quiz
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* STEP 2: ACTIVE GAMEPLAY STATES */
          <div className="w-full">
            {/* 2A: WINNER MODAL / CLAIM SCREEN */}
            {myWinnerRecord && quizState?.status === 'reveal' ? (
              <div className="bg-gradient-to-b from-[#2a1359] to-[#120736] border-2 border-amber-400 rounded-3xl p-6 shadow-2xl text-center animate-bounce-short">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider mb-2">
                  <Trophy className="w-4 h-4" />
                  Prize Winner
                </div>

                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 font-['Cinzel',serif] mt-1">
                  YOU WON!
                </h1>

                <p className="text-sm text-yellow-100 font-semibold mt-1">
                  Fastest correct answer for this round!
                </p>

                {/* Star Trophy Image */}
                <div className="relative my-3 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-amber-400/30 blur-xl transform scale-110" />
                  <img
                    src={BRAND_ASSETS.STAR_TROPHY}
                    alt="Star Leadership Award Trophy"
                    className="relative h-36 object-contain drop-shadow-[0_8px_20px_rgba(234,179,8,0.5)] transform -rotate-1"
                  />
                </div>

                <div className="my-3 p-4 rounded-2xl bg-purple-950/80 border border-amber-400/40">
                  <div className="text-xs uppercase text-amber-300 font-bold">Prize</div>
                  <div className="text-xl font-extrabold text-white mt-0.5">{myWinnerRecord.prize}</div>

                  <div className="mt-4 pt-3 border-t border-purple-800/80">
                    <div className="text-[11px] uppercase tracking-wider text-slate-300">
                      Show this 4 character claim code at the prize desk
                    </div>
                    <div className="text-4xl font-black tracking-widest font-mono text-amber-400 bg-black/40 py-2 px-4 rounded-xl mt-1.5 border border-amber-400/50 inline-block shadow-inner">
                      {myWinnerRecord.claimCode}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-amber-200/90 font-medium">
                  Response Time: {formatResponseTime(myWinnerRecord.timeMs)}
                </div>
              </div>
            ) : /* 2B: LOBBY / WAITING SCREEN */
            quizState?.status === 'lobby' ? (
              <div className="bg-purple-950/70 border border-amber-400/30 rounded-3xl p-8 shadow-2xl text-center backdrop-blur-md">
                <SuperTeamLogo size="sm" showSubtitle={false} className="mb-4" />

                <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto mb-4 border border-amber-400/30 animate-pulse">
                  <Clock className="w-8 h-8" />
                </div>

                <h3 className="text-2xl font-black text-white">Get Ready!</h3>
                <p className="text-sm text-yellow-100/90 mt-2">
                  {quizState?.sessionName
                    ? `${quizState.sessionName} is live. The host will launch the next question shortly.`
                    : 'The host will launch the next question shortly.'}
                </p>

                <div className="mt-6 p-4 rounded-2xl bg-purple-900/40 border border-purple-800 text-left">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    Player Connected
                  </div>
                  <div className="font-extrabold text-white text-base">{name}</div>
                  <div className="text-xs text-slate-300">{phone}</div>
                </div>
              </div>
            ) : /* 2C: ACTIVE QUESTION: ANSWER SUBMISSION */
            quizState?.status === 'question' && activeQuestion ? (
              <div className="flex flex-col gap-4">
                {/* Prize Banner */}
                <div className="bg-purple-950/80 border border-amber-400/30 rounded-2xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400 shrink-0" />
                    <div className="text-xs text-amber-200 font-semibold truncate">
                      Prize: <span className="text-white font-bold">{activeQuestion.prizeName}</span>
                    </div>
                  </div>
                  {activeQuestion.practice && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/40">
                      Practice
                    </span>
                  )}
                </div>

                {/* Question Prompt */}
                <div className="bg-purple-950/90 border border-amber-400/40 rounded-2xl p-5 shadow-xl text-center">
                  <div className="text-[11px] font-bold text-amber-400 uppercase tracking-widest mb-1">
                    Question {activeQuestion.order}
                  </div>
                  <h2 className="text-lg md:text-xl font-bold text-white leading-snug">
                    {activeQuestion.text}
                  </h2>
                </div>

                {/* SUBMITTED STATE: Lock choices */}
                {myAnswer ? (
                  <div className="bg-purple-950/80 border-2 border-amber-400 rounded-2xl p-6 text-center shadow-xl">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                    <div className="text-xl font-black text-white">Answer Received!</div>
                    <div className="text-xs text-slate-300 mt-1">
                      Submitted in {formatResponseTime(clientSubmitTimeMs || 0)}. Watch the screen!
                    </div>

                    <div className="mt-4 p-3 rounded-xl bg-purple-900/60 border border-purple-800 text-left">
                      <span className="text-[10px] uppercase text-amber-300 font-semibold block">
                        Your Selection
                      </span>
                      <span className="text-base font-bold text-amber-200">{myAnswer}</span>
                    </div>
                  </div>
                ) : activeQuestion.type === 'multiple_choice' ? (
                  /* MULTIPLE CHOICE OPTIONS */
                  <div className="grid grid-cols-1 gap-3">
                    {activeQuestion.options.map((opt, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => submitAnswer(opt)}
                          disabled={isSubmitting}
                          className="w-full p-4 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:to-amber-600 active:scale-97 text-slate-950 font-bold text-base shadow-xl flex items-center gap-3 transition-transform text-left border border-amber-300"
                        >
                          <span className="w-9 h-9 rounded-xl bg-slate-950 text-amber-400 font-black text-base flex items-center justify-center shrink-0 shadow">
                            {letter}
                          </span>
                          <span className="flex-1 font-extrabold text-white drop-shadow-sm leading-tight">
                            {opt}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* TYPED ANSWER INPUT */
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      submitAnswer(typedInput);
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <input
                        type="text"
                        autoFocus
                        required
                        placeholder="Type your exact answer here..."
                        value={typedInput}
                        onChange={e => setTypedInput(e.target.value)}
                        className="w-full px-4 py-4 rounded-xl bg-purple-900/60 border-2 border-amber-400 text-white placeholder-slate-400 focus:outline-none text-lg font-bold"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!typedInput.trim() || isSubmitting}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 font-black text-lg uppercase tracking-wider shadow-xl disabled:opacity-50"
                    >
                      Submit Answer Now
                    </button>
                  </form>
                )}
              </div>
            ) : /* 2D: QUESTION CLOSED BUT NOT YET REVEALED */
            quizState?.status === 'closed' ? (
              <div className="bg-purple-950/80 border border-orange-500 rounded-3xl p-8 text-center shadow-2xl">
                <Clock className="w-14 h-14 text-orange-400 mx-auto mb-3 animate-spin" />
                <h3 className="text-xl font-black text-white">Time Is Up!</h3>
                <p className="text-sm text-yellow-100/90 mt-2">
                  Answers are locked. Host is checking results and fastest times now!
                </p>
                {myAnswer && (
                  <div className="mt-4 text-xs text-amber-300">
                    Your response: <span className="font-bold text-white">{myAnswer}</span>
                  </div>
                )}
              </div>
            ) : /* 2E: REVEAL STATUS (NON-WINNER VIEW) */
            quizState?.status === 'reveal' ? (
              <div className="bg-purple-950/80 border border-amber-400/40 rounded-3xl p-6 text-center shadow-2xl">
                {isMyAnswerCorrect ? (
                  <div>
                    <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-2" />
                    <h3 className="text-2xl font-black text-emerald-300">You Answered Correctly!</h3>
                    <p className="text-sm text-yellow-100 mt-1">
                      Great speed! Another star was a fraction of a second faster to take the prize.
                    </p>
                  </div>
                ) : (
                  <div>
                    <XCircle className="w-14 h-14 text-red-400 mx-auto mb-2" />
                    <h3 className="text-2xl font-black text-white">Good Effort!</h3>
                    <p className="text-sm text-slate-300 mt-1">
                      Keep your eyes sharp for the next question!
                    </p>
                  </div>
                )}

                <div className="mt-5 p-4 rounded-2xl bg-purple-900/50 border border-purple-800 text-left">
                  <div className="text-[11px] text-amber-300 uppercase font-bold">Official Answer</div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">
                    {quizState.revealedAnswer || 'Verified by Host'}
                  </div>

                  {myAnswer && (
                    <div className="mt-3 text-xs text-slate-300">
                      Your answer: <span className="text-white font-semibold">{myAnswer}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* 2F: ENDED */
              <div className="bg-purple-950/80 border border-amber-400 rounded-3xl p-8 text-center shadow-xl">
                <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-2" />
                <h3 className="text-2xl font-black text-white">
                  {quizState?.sessionName ? `${quizState.sessionName} Concluded` : 'Celebration Concluded'}
                </h3>
                <p className="text-sm text-yellow-100 mt-2">
                  Thank you for participating in Super Team 2026!
                </p>
                <div className="mt-4 p-3 rounded-xl bg-purple-900/50 border border-purple-800 text-xs text-amber-300">
                  Stay on this screen if the host begins a new quiz session!
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-2 text-[10px] text-amber-300/60 font-medium">
        Super Team Live Quiz ★ Event &amp; Award Celebration 2026
      </footer>
    </div>
  );
};
