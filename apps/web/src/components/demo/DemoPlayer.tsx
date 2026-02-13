// components/demo/DemoPlayer.tsx
'use client';

import { useState } from 'react';

interface DemoPlayerProps {
  src: string;
  title: string;
  poster?: string;
}

export function DemoPlayer({ src, title, poster }: DemoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-700 shadow-2xl">
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4 z-10">
        <h3 className="text-white font-semibold text-lg">{title}</h3>
      </div>
      
      <video 
        src={src} 
        controls 
        className="w-full aspect-video"
        poster={poster}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        preload="metadata"
      >
        <p className="text-white text-center p-8">
          Your browser does not support the video tag. 
          <a href={src} className="text-green-400 underline ml-2">Download video</a>
        </p>
      </video>

      {!isPlaying && !poster && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-green-500 border-b-8 border-b-transparent ml-1" />
          </div>
        </div>
      )}
    </div>
  );
}
