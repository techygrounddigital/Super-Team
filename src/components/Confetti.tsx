import confetti from 'canvas-confetti';

export function fireWinnerConfetti() {
  // First burst of gold and purple stars
  confetti({
    particleCount: 80,
    spread: 100,
    origin: { y: 0.6 },
    colors: ['#FFD700', '#FFA500', '#9333EA', '#FFFFFF', '#F59E0B'],
    shapes: ['star', 'circle'],
    scalar: 1.2,
  });

  // Second celebratory burst from left and right
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#FFD700', '#F59E0B', '#C084FC'],
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#FFD700', '#F59E0B', '#C084FC'],
    });
  }, 250);

  // Third sustained gold shower
  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 120,
      origin: { y: 0.4 },
      colors: ['#FFD700', '#FBBF24', '#FFFFFF'],
      ticks: 300,
      gravity: 0.8,
    });
  }, 600);
}
