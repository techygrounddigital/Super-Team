import { Question, AnswerKey } from '../types';

/**
 * Normalizes text for comparing typed answers.
 * Removes extra spaces, punctuation, symbols, and transforms to lower case.
 */
export function normalizeAnswer(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a player answer matches the correct answer or accepted alternatives
 */
export function checkAnswerMatch(playerAnswer: string, correctAnswer: string, alternatives: string[] = []): boolean {
  const normPlayer = normalizeAnswer(playerAnswer);
  if (!normPlayer) return false;

  const normCorrect = normalizeAnswer(correctAnswer);
  if (normPlayer === normCorrect) return true;

  return alternatives.some(alt => normalizeAnswer(alt) === normPlayer);
}

/**
 * Formats milliseconds into seconds with 3 decimal places (e.g. 2.347s)
 */
export function formatResponseTime(ms: number): string {
  if (ms < 0 || isNaN(ms)) return '0.000s';
  const seconds = ms / 1000;
  return `${seconds.toFixed(3)}s`;
}

/**
 * Generates an uppercase 4 character claim code for winner verification at the prize desk
 */
export function generateClaimCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes confusing 0/O, 1/I
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Default sample questions for the Super Team Event & Award Celebration 2026
 * Theme: "Raising Stars, Building Leaders"
 */
export const DEFAULT_QUESTIONS: { question: Question; answerKey: AnswerKey }[] = [
  {
    question: {
      id: 'q1_theme',
      text: 'What is the official theme of the Super Team Event and Award Celebration 2026?',
      type: 'multiple_choice',
      options: [
        'Rising Higher, Moving Stronger',
        'Raising Stars, Building Leaders',
        'Empowering Youth, Unlocking Greatness',
        'Shining Together, Leading Forever',
      ],
      timeLimit: 15,
      prizeName: 'Premium Wireless Power Bank',
      order: 1,
      practice: true,
    },
    answerKey: {
      id: 'q1_theme',
      correctAnswer: 'Raising Stars, Building Leaders',
      acceptedAlternatives: ['Raising Stars Building Leaders', 'B', 'Option B'],
    },
  },
  {
    question: {
      id: 'q2_value',
      text: 'In the Super Team leadership playbook, which core pillar drives excellence in all endeavors?',
      type: 'multiple_choice',
      options: [
        'Procrastination and Delay',
        'Integrity and Relentless Execution',
        'Working Alone in Isolation',
        'Waiting for Instructions',
      ],
      timeLimit: 15,
      prizeName: 'Smart Fitness Tracker Watch',
      order: 2,
    },
    answerKey: {
      id: 'q2_value',
      correctAnswer: 'Integrity and Relentless Execution',
      acceptedAlternatives: ['Integrity & Relentless Execution', 'B', 'Option B'],
    },
  },
  {
    question: {
      id: 'q3_typed_capital',
      text: 'What is the vibrant commercial capital of Nigeria where tech innovations and stars shine bright?',
      type: 'typed',
      options: [],
      timeLimit: 20,
      prizeName: 'Portable Bluetooth Stereo Speaker',
      order: 3,
    },
    answerKey: {
      id: 'q3_typed_capital',
      correctAnswer: 'Lagos',
      acceptedAlternatives: ['Lagos City', 'Eko', 'Lasgidi'],
    },
  },
  {
    question: {
      id: 'q4_superteam',
      text: 'Complete this motto: When stars align and leaders rise, what does Super Team build?',
      type: 'multiple_choice',
      options: [
        'A brighter future for everyone',
        'Temporary solutions',
        'More excuses',
        'Quiet spectators',
      ],
      timeLimit: 15,
      prizeName: 'Executive Noise Canceling Earbuds',
      order: 4,
    },
    answerKey: {
      id: 'q4_superteam',
      correctAnswer: 'A brighter future for everyone',
      acceptedAlternatives: ['A', 'Option A', 'Brighter future'],
    },
  },
  {
    question: {
      id: 'q5_bonus_typed',
      text: 'Bonus round! Type the name of the golden celestial object that illuminates the night sky and inspires our stars.',
      type: 'typed',
      options: [],
      timeLimit: 15,
      prizeName: 'Exclusive Grand Celebration Gift Hamper',
      order: 5,
    },
    answerKey: {
      id: 'q5_bonus_typed',
      correctAnswer: 'Star',
      acceptedAlternatives: ['Stars', 'Moon', 'Sun', 'Shooting Star'],
    },
  },
];

/**
 * Parses CSV text to Questions and AnswerKeys.
 * Expected CSV columns:
 * Text, Type, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Alternatives, TimeLimit, PrizeName
 */
export function parseQuestionsCsv(csvText: string): { questions: Question[]; answerKeys: AnswerKey[] } {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { questions: [], answerKeys: [] };

  const questions: Question[] = [];
  const answerKeys: AnswerKey[] = [];

  // Parse lines considering quotes
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const startIndex = lines[0].toLowerCase().includes('text') || lines[0].toLowerCase().includes('question') ? 1 : 0;

  for (let idx = startIndex; idx < lines.length; idx++) {
    const cols = parseLine(lines[idx]);
    if (cols.length < 3) continue;

    const qText = cols[0] || 'Untitled Question';
    const rawType = (cols[1] || '').toLowerCase();
    const type = rawType.includes('type') ? 'typed' : 'multiple_choice';

    const optA = cols[2] || '';
    const optB = cols[3] || '';
    const optC = cols[4] || '';
    const optD = cols[5] || '';
    const options = type === 'multiple_choice' ? [optA, optB, optC, optD].filter(Boolean) : [];

    const correctAnswer = cols[6] || optA || 'Answer';
    const altRaw = cols[7] || '';
    const alternatives = altRaw.split(';').map(s => s.trim()).filter(Boolean);

    const timeLimit = parseInt(cols[8] || '15', 10) || 15;
    const prizeName = cols[9] || 'Celebration Gift';

    const id = `q_${Date.now()}_${idx}`;

    questions.push({
      id,
      text: qText,
      type,
      options,
      timeLimit,
      prizeName,
      order: questions.length + 1,
      practice: false,
    });

    answerKeys.push({
      id,
      correctAnswer,
      acceptedAlternatives: alternatives,
    });
  }

  return { questions, answerKeys };
}

/**
 * Exports data to CSV string
 */
export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      headers
        .map(h => {
          const val = row[h] === undefined || row[h] === null ? '' : String(row[h]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
