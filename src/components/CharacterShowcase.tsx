import { useEffect, useRef, useState } from 'react';
import type { Character } from '@/types';
import { getCharacterVideos } from '@/lib/characterVideos';

interface CharacterShowcaseProps {
  character: Character;
  isSpeaking?: boolean;
}

export default function CharacterShowcase({ character, isSpeaking = false }: CharacterShowcaseProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { idle: idleVideo, speaking: speakingVideo } = getCharacterVideos(character.slug);
  const activeVideo = (isSpeaking && speakingVideo) || idleVideo;
  const hasVideo = !!activeVideo;
  const [videoError, setVideoError] = useState(false);

  // When the active source changes, load and play it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideo) return;

    if (video.src !== activeVideo) {
      video.src = activeVideo;
      video.load();
    }

    const play = () => {
      video.play().catch(() => {
        // Autoplay can be blocked until user interaction; that's fine.
      });
    };

    play();
  }, [activeVideo]);

  if (!hasVideo || videoError) {
    return (
      <div className="relative w-64 h-80 mx-auto rounded-2xl overflow-hidden bg-black shadow-lg">
        <img
          src={character.portrait}
          alt={character.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="relative w-64 h-80 mx-auto rounded-2xl overflow-hidden bg-black shadow-lg">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setVideoError(true)}
      />
    </div>
  );
}
