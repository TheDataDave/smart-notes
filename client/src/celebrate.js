import confetti from 'canvas-confetti';

const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#51cf66', '#339af0', '#cc5de8'];

export function celebrate(rect) {
  const origin = rect
    ? {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      }
    : { x: 0.5, y: 0.6 };

  const base = { origin, colors: COLORS, zIndex: 3000, disableForReducedMotion: true };

  confetti({ ...base, particleCount: 80, spread: 80, startVelocity: 42, ticks: 200 });
  confetti({ ...base, particleCount: 24, spread: 120, startVelocity: 26, shapes: ['star'], scalar: 1.3 });
  setTimeout(
    () => confetti({ ...base, particleCount: 40, spread: 160, startVelocity: 18, gravity: 0.8, scalar: 0.9 }),
    180
  );
}