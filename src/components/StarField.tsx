import React, { useMemo } from 'react';
import { BRAND_ASSETS } from '../assets';

export const StarField: React.FC<{
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}> = ({
  children,
  className = '',
  contentClassName = '',
}) => {
  // Delicate twinkling gold and silver stars overlaying the attached background
  const stars = useMemo(() => {
    return Array.from({ length: 42 }).map((_, i) => ({
      id: i,
      x: (i * 19.3) % 100,
      y: (i * 27.7) % 100,
      size: i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1.5,
      color: i % 4 === 0 ? '#FFD700' : i % 3 === 0 ? '#FDE047' : '#FFFFFF',
      opacity: 0.35 + (i % 5) * 0.15,
      duration: 3 + (i % 4) * 1.5,
      delay: (i % 5) * 0.8,
    }));
  }, []);

  return (
    <div
      className={`relative w-full overflow-hidden text-white ${className || 'min-h-screen'}`}
      style={{
        backgroundImage: `url(${BRAND_ASSETS.BACKGROUND})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Floating and Twinkling Silver and Gold Stars */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {stars.map(star => (
          <div
            key={star.id}
            className="absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: star.size > 2 ? `0 0 8px ${star.color}` : 'none',
              animation: `pulse ${star.duration}s infinite ease-in-out ${star.delay}s`,
            }}
          />
        ))}

        {/* Decorative 4-pointed accent stars */}
        <div className="absolute top-10 left-[8%] text-amber-300/60 text-xl animate-pulse">✦</div>
        <div className="absolute top-28 right-[12%] text-amber-200/70 text-2xl animate-pulse" style={{ animationDelay: '1.2s' }}>★</div>
        <div className="absolute bottom-24 left-[15%] text-white/50 text-lg animate-pulse" style={{ animationDelay: '2.1s' }}>✦</div>
        <div className="absolute bottom-16 right-[20%] text-amber-400/60 text-2xl animate-pulse" style={{ animationDelay: '0.7s' }}>★</div>
      </div>

      {/* Main Content */}
      <div className={`relative z-10 w-full ${contentClassName || 'min-h-screen flex flex-col'}`}>{children}</div>
    </div>
  );
};
