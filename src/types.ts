import { Timestamp, FieldValue } from 'firebase/firestore';

export type QuizStatus = 'lobby' | 'question' | 'closed' | 'reveal' | 'ended';

export type QuestionType = 'multiple_choice' | 'typed';

export interface QuizState {
  status: QuizStatus;
  currentQuestionId: string | null;
  questionOpenedAt: Timestamp | FieldValue | null;
  timeLimit: number;
  revealedAnswer?: string | null;
  bonusRoundCount: number; // 1 or 3
  practiceMode: boolean;
  answersCount: number;
  oneGiftPerPerson: boolean;
  isMuted?: boolean;
  sessionId?: string;
  sessionNumber?: number;
  sessionName?: string;
  endedAt?: Timestamp | FieldValue | null;
  displayLink?: string;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options: string[]; // for multiple_choice e.g. ["A", "B", "C", "D"]
  timeLimit: number; // in seconds, default 15
  prizeName: string;
  order: number;
  practice?: boolean;
}

export interface AnswerKey {
  id: string; // questionId
  correctAnswer: string;
  acceptedAlternatives: string[]; // for typed answers
}

export interface Player {
  playerId: string;
  name: string;
  phone: string;
  joinedAt?: Timestamp | FieldValue | null;
  hasWon?: boolean;
  banned?: boolean;
}

export interface AnswerEntry {
  playerId: string;
  name: string;
  phone: string;
  answer: string;
  submittedAt: Timestamp | FieldValue | null;
  clientMs?: number;
  isCorrect?: boolean;
  calculatedTimeMs?: number;
}

export interface WinnerRecord {
  id?: string;
  questionId: string;
  playerId: string;
  name: string;
  phone: string;
  prize: string;
  timeMs: number;
  claimCode: string;
  collected: boolean;
  rank: number; // 1 for first winner, 2 or 3 for bonus winners
  disqualified?: boolean;
  createdAt?: Timestamp | FieldValue | null;
  submittedAnswer?: string;
}
