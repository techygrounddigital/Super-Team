import React from 'react';
import { BRAND_ASSETS } from '../assets';

interface SuperTeamLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
  badgeBackground?: boolean;
}

export const SuperTeamLogo: React.FC<SuperTeamLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  className = '',
  badgeBackground = true,
}) => {
  const scaleMap = {
    xs: { img: 'h-6', pad: 'p-1 rounded-lg', title: 'text-[10px]', subtitle: 'text-[9px]' },
    sm: { img: 'h-9', pad: 'p-1.5 rounded-xl', title: 'text-xs', subtitle: 'text-[10px]' },
    md: { img: 'h-12 md:h-14', pad: 'p-2 rounded-2xl', title: 'text-xs md:text-sm', subtitle: 'text-[11px]' },
    lg: { img: 'h-16 md:h-20', pad: 'p-2.5 md:p-3 rounded-2xl', title: 'text-sm md:text-base', subtitle: 'text-xs' },
    xl: { img: 'h-20 md:h-24', pad: 'p-3 rounded-2xl md:rounded-3xl', title: 'text-base md:text-lg', subtitle: 'text-xs md:text-sm' },
  };

  const currentScale = scaleMap[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
      {/* Official Super Team Logo Container */}
      <div className="relative flex items-center justify-center mb-2">
        {/* Soft Golden Glow behind the logo */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-400/30 via-yellow-200/40 to-orange-500/20 blur-xl transform scale-110" />

        {/* Compact Badge Frame ensuring crisp contrast */}
        <div
          className={`relative inline-flex items-center justify-center ${
            badgeBackground
              ? `bg-gradient-to-b from-white via-slate-50 to-amber-50/95 ${currentScale.pad} border border-amber-400/70 shadow-[0_4px_20px_rgba(234,179,8,0.3)]`
              : ''
          }`}
        >
          <img
            src={BRAND_ASSETS.LOGO}
            alt="Super Team Logo"
            className={`${currentScale.img} w-auto object-contain drop-shadow-sm`}
          />
        </div>
      </div>

      {/* Event Title */}
      <div className={`tracking-widest text-amber-300 font-extrabold uppercase font-['Outfit',sans-serif] ${currentScale.title} drop-shadow-sm`}>
        EVENT &amp; AWARD CELEBRATION 2026
      </div>

      {/* Theme Ribbon */}
      {showSubtitle && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 via-purple-500/25 to-amber-500/20 border border-amber-400/40 shadow-sm backdrop-blur-md">
          <span className="text-amber-400 text-[10px]">★</span>
          <span className={`font-semibold tracking-wide text-yellow-100 ${currentScale.subtitle}`}>
            Raising Stars, Building Leaders
          </span>
          <span className="text-amber-400 text-[10px]">★</span>
        </div>
      )}
    </div>
  );
};
