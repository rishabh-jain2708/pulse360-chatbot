import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

export default function SplashScreen({ onComplete }) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // 4 seconds of animation, then trigger the fade out
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 4000);

    // After 1 second of fading, completely unmount the splash screen
    const unmountTimer = setTimeout(() => {
      onComplete();
    }, 5000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete]);

  return (
    <div className={`splash-container ${isFadingOut ? 'fade-out' : ''}`}>
      <div className="glow-core">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      <h1 className="splash-text">Welcome to Pulse 360 Chatbot</h1>
    </div>
  );
}
