import React, { useState, useEffect } from 'react';
import { BigScreen } from './screens/BigScreen';
import { PlayerView } from './screens/PlayerView';
import { HostPanel } from './screens/HostPanel';
import { SuperTeamLogo } from './components/SuperTeamLogo';
import { StarField } from './components/StarField';
import { Monitor, Smartphone, Shield, ArrowRight, Sparkles } from 'lucide-react';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (typeof window === 'undefined') return '/';
    const path = window.location.pathname;
    const hash = window.location.hash.replace('#', '');
    if (path.includes('/screen') || hash.includes('/screen')) return '/screen';
    if (path.includes('/play') || hash.includes('/play')) return '/play';
    if (path.includes('/host') || hash.includes('/host')) return '/host';
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const hash = window.location.hash.replace('#', '');
      if (path.includes('/screen') || hash.includes('/screen')) setCurrentRoute('/screen');
      else if (path.includes('/play') || hash.includes('/play')) setCurrentRoute('/play');
      else if (path.includes('/host') || hash.includes('/host')) setCurrentRoute('/host');
      else setCurrentRoute('/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (route: string) => {
    setCurrentRoute(route);
    window.history.pushState({}, '', route);
  };

  // Specific Screen Renderers
  if (currentRoute === '/screen') {
    return <BigScreen />;
  }

  if (currentRoute === '/play') {
    return (
      <div className="relative">
        <PlayerView />
        {/* Quick Nav Bar Float */}
        <div className="fixed bottom-1 right-2 z-50 opacity-20 hover:opacity-100 transition-opacity flex items-center gap-2 bg-black/80 px-2 py-1 rounded-lg border border-purple-800 text-[10px]">
          <button onClick={() => navigateTo('/')} className="text-amber-300 hover:underline">
            Home
          </button>
          <span className="text-amber-400">★</span>
          <button onClick={() => navigateTo('/screen')} className="text-slate-300 hover:text-white">
            Big Screen
          </button>
          <span className="text-amber-400">★</span>
          <button onClick={() => navigateTo('/host')} className="text-slate-300 hover:text-white">
            Host
          </button>
        </div>
      </div>
    );
  }

  if (currentRoute === '/host') {
    return (
      <div className="relative">
        <HostPanel />
        {/* Quick Nav Bar Float */}
        <div className="fixed bottom-3 right-3 z-50 opacity-20 hover:opacity-100 transition-opacity flex items-center gap-2 bg-black/80 px-3 py-1.5 rounded-xl border border-amber-400/30 text-xs">
          <button onClick={() => navigateTo('/')} className="text-amber-300 hover:underline">
            Home
          </button>
          <span className="text-amber-400">★</span>
          <button onClick={() => navigateTo('/screen')} className="text-slate-300 hover:text-white">
            Big Screen
          </button>
          <span className="text-amber-400">★</span>
          <button onClick={() => navigateTo('/play')} className="text-slate-300 hover:text-white">
            Phone View
          </button>
        </div>
      </div>
    );
  }

  // PORTAL / LANDING SCREEN
  return (
    <StarField className="p-6 md:p-12 flex flex-col justify-between items-center text-center">
      {/* Brand Header */}
      <div className="max-w-3xl mx-auto w-full pt-4">
        <SuperTeamLogo size="md" showSubtitle={true} />
        <h2 className="text-2xl md:text-3xl font-extrabold text-white mt-4 font-['Outfit',sans-serif]">
          Super Team Live Quiz
        </h2>
        <p className="mt-2 text-sm md:text-base text-yellow-100/80 max-w-xl mx-auto">
          Interactive real time quiz replacing the raffle draw. The first person to submit the correct answer wins an immediate gift.
        </p>
      </div>

      {/* Select Portal Screen Cards */}
      <div className="max-w-4xl w-full my-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
        {/* 1. Big Screen Option */}
        <div
          onClick={() => navigateTo('/screen')}
          className="group cursor-pointer bg-gradient-to-b from-[#21114d] to-[#120736] border-2 border-amber-400/40 hover:border-amber-400 rounded-3xl p-6 shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(250,204,21,0.25)] flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Monitor className="w-7 h-7" />
            </div>
            <div className="text-xs uppercase tracking-widest text-amber-400 font-bold mb-1">
              Projector / LED View
            </div>
            <h3 className="text-xl font-black text-white group-hover:text-yellow-300 transition-colors">
              Big Screen (/screen)
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Show this on the event stage LED screen. Displays QR code lobby, live countdown timer, and grand winner celebration cards.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform">
            <span>Open Big Screen</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* 2. Player Mobile View Option */}
        <div
          onClick={() => navigateTo('/play')}
          className="group cursor-pointer bg-gradient-to-b from-[#21114d] to-[#120736] border-2 border-orange-500/40 hover:border-orange-400 rounded-3xl p-6 shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(249,115,22,0.25)] flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Smartphone className="w-7 h-7" />
            </div>
            <div className="text-xs uppercase tracking-widest text-orange-400 font-bold mb-1">
              Attendee Mobile View
            </div>
            <h3 className="text-xl font-black text-white group-hover:text-orange-300 transition-colors">
              Player View (/play)
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Attendees scan the QR code to join on their phones. Super light, single tap answering, and unique claim codes for winners.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-orange-400 group-hover:translate-x-1 transition-transform">
            <span>Open Player View</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* 3. Host Control Panel Option */}
        <div
          onClick={() => navigateTo('/host')}
          className="group cursor-pointer bg-gradient-to-b from-[#21114d] to-[#120736] border-2 border-purple-500/40 hover:border-purple-400 rounded-3xl p-6 shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(168,85,247,0.25)] flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-400/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Shield className="w-7 h-7" />
            </div>
            <div className="text-xs uppercase tracking-widest text-purple-300 font-bold mb-1">
              Host / Stage Director
            </div>
            <h3 className="text-xl font-black text-white group-hover:text-purple-200 transition-colors">
              Host Panel (/host)
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Protected by 6 digit PIN. Launch questions, review live response feeds, confirm winners, manage questions, and export CSV logs.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-purple-300 group-hover:translate-x-1 transition-transform">
            <span>Open Host Panel</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <footer className="text-xs text-amber-300/70 font-medium">
        Super Team Event &amp; Award Celebration 2026 ★ Raising Stars, Building Leaders
      </footer>
    </StarField>
  );
}
