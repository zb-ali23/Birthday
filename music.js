/**
 * Global Background Music System for Khizra's Birthday Website
 * Manages continuous music playback across page transitions using localStorage.
 */

(function () {
  // ── ANIMATION & TIMER TRACKING FOR SMOOTH TRANSITIONS ──
  const activeFrames = new Set();
  const originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    const id = originalRAF(function (time) {
      activeFrames.delete(id);
      cb(time);
    });
    activeFrames.add(id);
    return id;
  };
  const originalCAF = window.cancelAnimationFrame;
  window.cancelAnimationFrame = function (id) {
    activeFrames.delete(id);
    originalCAF(id);
  };

  const activeIntervals = new Set();
  const originalSI = window.setInterval;
  window.setInterval = function (cb, delay) {
    const id = originalSI(cb, delay);
    activeIntervals.add(id);
    return id;
  };
  const originalCI = window.clearInterval;
  window.clearInterval = function (id) {
    activeIntervals.delete(id);
    originalCI(id);
  };

  function cleanupBeforeNavigation() {
    // Cancel all animation frames to stop canvas calculations
    for (const id of activeFrames) {
      originalCAF(id);
    }
    activeFrames.clear();

    // Clear all intervals
    for (const id of activeIntervals) {
      originalCI(id);
    }
    activeIntervals.clear();
  }

  const LOCAL_STORAGE_TIME_KEY = 'khizra_bday_music_time';
  const LOCAL_STORAGE_PAUSED_KEY = 'khizra_bday_music_paused';
  
  const LOCAL_MUSIC_PATH = 'music.mp3';
  // Indila - Love Story (Mini World Album)
  const FALLBACK_MUSIC_URL = 'https://archive.org/download/indila-mini-world/03%20-%20Love%20Story.mp3';
  
  let audio = null;
  let floatWidget = null;
  let isPage2 = window.location.pathname.includes('page2.html');
  let isPage8 = window.location.pathname.includes('page8.html');

  // 1. Inject Stylesheets
  const style = document.createElement('style');
  style.textContent = `
    /* Floating Music Widget */
    .g-music-widget {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 110, 180, 0.25);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(181, 0, 91, 0.25), inset 0 0 10px rgba(255, 110, 180, 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 99999;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .g-music-widget:hover {
      transform: scale(1.08) translateY(-2px);
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 110, 180, 0.5);
      box-shadow: 0 12px 40px rgba(181, 0, 91, 0.4);
    }
    .g-music-widget:active {
      transform: scale(0.95);
    }
    
    /* EQ Animation inside widget */
    .g-music-eq {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 18px;
    }
    .g-music-bar {
      width: 3px;
      background: #e91e8c;
      border-radius: 9px;
      height: 3px;
      transition: height 0.2s ease;
    }
    .g-music-widget.playing .g-music-bar {
      animation: g-eq-bounce var(--g-es, 0.6s) ease-in-out infinite alternate var(--g-esdel, 0s);
    }
    @keyframes g-eq-bounce {
      0% { height: 3px; }
      100% { height: var(--g-eh, 18px); }
    }
    
    /* Mute line indicator */
    .g-music-mute-line {
      position: absolute;
      width: 26px;
      height: 2px;
      background: rgba(255, 110, 180, 0.85);
      transform: rotate(-45deg);
      transition: transform 0.3s ease, opacity 0.3s ease;
      opacity: 1;
      pointer-events: none;
      box-shadow: 0 0 4px rgba(0,0,0,0.3);
    }
    .g-music-widget.playing .g-music-mute-line {
      opacity: 0;
      transform: rotate(-45deg) scale(0);
    }
    
    /* Unmute hint popup */
    .g-music-tooltip {
      position: absolute;
      bottom: 64px;
      right: 0;
      background: rgba(13, 0, 16, 0.85);
      border: 1px solid rgba(255, 110, 180, 0.2);
      color: #fff;
      font-size: 0.65rem;
      font-family: 'Poppins', sans-serif;
      padding: 6px 12px;
      border-radius: 20px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      letter-spacing: 0.05em;
    }
    .g-music-widget.hint .g-music-tooltip {
      opacity: 1;
      transform: translateY(0);
    }

    /* Snappy hardware-accelerated global page fade styles */
    .g-global-fade, #pageFade {
      position: fixed !important;
      inset: 0 !important;
      background: #0d0010 !important;
      z-index: 999999 !important;
      opacity: 1;
      pointer-events: none;
      transition: opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
      will-change: opacity;
      transform: translate3d(0, 0, 0);
    }
    .g-global-fade.gone, #pageFade.gone {
      opacity: 0 !important;
    }
    .g-global-fade.out, #pageFade.out {
      opacity: 1 !important;
      pointer-events: all !important;
    }
  `;
  document.head.appendChild(style);

  // 2. Initialize Audio Element
  function initAudio() {
    audio = document.getElementById('bgMusic');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'bgMusic';
      audio.loop = true;
      document.body.appendChild(audio);
    }
    
    // Set source to local MP3, listen for errors to load fallback CDN
    audio.src = LOCAL_MUSIC_PATH;
    audio.addEventListener('error', handleAudioError);
    
    // Listen to play/pause events to keep state in sync
    audio.addEventListener('play', () => {
      localStorage.setItem(LOCAL_STORAGE_PAUSED_KEY, 'false');
      updateUI(true);
    });
    
    audio.addEventListener('pause', () => {
      localStorage.setItem(LOCAL_STORAGE_PAUSED_KEY, 'true');
      updateUI(false);
    });

    // Save currentTime periodically
    audio.addEventListener('timeupdate', () => {
      if (!audio.paused) {
        localStorage.setItem(LOCAL_STORAGE_TIME_KEY, audio.currentTime.toString());
      }
    });

    // Save state when page is hidden or navigating away
    window.addEventListener('pagehide', savePlaybackState);
    window.addEventListener('beforeunload', savePlaybackState);
  }

  function handleAudioError() {
    // If local file fails, switch to fallback URL (Chopin's Nocturne)
    if (audio && audio.src !== FALLBACK_MUSIC_URL) {
      console.warn("Local music file not found or failed to load. Falling back to Chopin's Nocturne.");
      const savedTime = audio.currentTime;
      const isPaused = localStorage.getItem(LOCAL_STORAGE_PAUSED_KEY) !== 'false';
      
      audio.src = FALLBACK_MUSIC_URL;
      audio.currentTime = savedTime;
      
      if (!isPaused) {
        audio.play().catch(err => console.log("Autoplay blocked on fallback load:", err));
      }
    }
  }

  function savePlaybackState() {
    if (audio) {
      localStorage.setItem(LOCAL_STORAGE_TIME_KEY, audio.currentTime.toString());
      localStorage.setItem(LOCAL_STORAGE_PAUSED_KEY, audio.paused.toString());
    }
  }

  // 3. Initialize UI Floating Widget
  function initFloatingWidget() {
    // If we are on Page 2, we do NOT render the floating widget because it has its own center player
    if (isPage2) return;

    floatWidget = document.createElement('div');
    floatWidget.className = 'g-music-widget';
    floatWidget.innerHTML = `
      <div class="g-music-eq">
        <div class="g-music-bar" style="--g-es:0.5s;--g-esdel:0s;--g-eh:18px;"></div>
        <div class="g-music-bar" style="--g-es:0.7s;--g-esdel:0.1s;--g-eh:14px;"></div>
        <div class="g-music-bar" style="--g-es:0.4s;--g-esdel:0.2s;--g-eh:16px;"></div>
      </div>
      <div class="g-music-mute-line"></div>
      <div class="g-music-tooltip">Tap to play music ♪</div>
    `;
    
    floatWidget.addEventListener('click', toggleGlobalMusic);
    document.body.appendChild(floatWidget);
  }

  // 4. Update UI states (sync float widget and page-specific buttons)
  function updateUI(playing) {
    // Sync floating widget classes
    if (floatWidget) {
      if (playing) {
        floatWidget.classList.add('playing');
        floatWidget.classList.remove('hint');
      } else {
        floatWidget.classList.remove('playing');
      }
    }

    // Sync Page 2 Center Player
    if (isPage2) {
      const playBtn = document.getElementById('playBtn');
      const albumArt = document.getElementById('albumArt');
      if (playBtn) playBtn.textContent = playing ? '⏸' : '▶';
      if (albumArt) albumArt.classList.toggle('playing', playing);
    }
  }

  // 5. Toggle Playback
  function toggleGlobalMusic() {
    if (!audio) return;
    
    if (audio.paused) {
      // Fade in volume for smoothness
      audio.volume = 0;
      audio.play()
        .then(() => fadeInVolume())
        .catch(err => {
          console.warn("Music play blocked by browser:", err);
          // Show hint tooltip if blocked
          if (floatWidget) {
            floatWidget.classList.add('hint');
            setTimeout(() => floatWidget.classList.remove('hint'), 3000);
          }
        });
    } else {
      fadeOutVolume(() => audio.pause());
    }
  }

  function fadeInVolume() {
    let vol = 0;
    audio.volume = 0;
    const interval = setInterval(() => {
      vol += 0.05;
      if (vol >= 0.7) {
        audio.volume = 0.7;
        clearInterval(interval);
      } else {
        audio.volume = vol;
      }
    }, 30);
  }

  function fadeOutVolume(callback) {
    let vol = audio.volume;
    const interval = setInterval(() => {
      vol -= 0.05;
      if (vol <= 0) {
        audio.volume = 0;
        clearInterval(interval);
        if (callback) callback();
      } else {
        audio.volume = vol;
      }
    }, 30);
  }

  // 6. Resume saved state on load
  function resumeState() {
    const isIndexPage = window.location.pathname === '/' ||
      window.location.pathname.endsWith('index.html') ||
      window.location.pathname.endsWith('/');

    // On the lock screen (index.html), NEVER autoplay.
    // Music only starts when she enters the correct passcode via startGlobalMusic().
    if (isIndexPage) {
      updateUI(false);
      return;
    }

    const isPaused = localStorage.getItem(LOCAL_STORAGE_PAUSED_KEY) === 'true';
    const savedTime = parseFloat(localStorage.getItem(LOCAL_STORAGE_TIME_KEY) || 0);

    // If music was never started at all (null = first visit / before code entry), don't play.
    if (localStorage.getItem(LOCAL_STORAGE_PAUSED_KEY) === null) {
      updateUI(false);
      return;
    }

    audio.currentTime = savedTime;
    audio.volume = 0.7;

    // Resume only if it wasn't manually paused
    if (!isPaused) {
      audio.play()
        .then(() => {
          updateUI(true);
        })
        .catch(err => {
          console.log("Autoplay blocked by browser, waiting for interaction:", err);
          updateUI(false);
          // Show gentle floating widget hint
          if (floatWidget) {
            setTimeout(() => {
              if (audio && audio.paused) {
                floatWidget.classList.add('hint');
                setTimeout(() => floatWidget.classList.remove('hint'), 4000);
              }
            }, 800);
          }
        });
    } else {
      updateUI(false);
    }
  }

  // 7. Page-Specific Hooks
  function setupPageHooks() {
    // --- PAGE 2 HOOK ---
    if (isPage2) {
      // Overwrite the local toggleMusic function in page2.html
      window.toggleMusic = function () {
        toggleGlobalMusic();
      };
    }

    // --- PAGE 8 HOOK ---
    if (isPage8) {
      // Intercept the click on the voice note player button
      const voicePlayBtn = document.getElementById('play-btn');
      if (voicePlayBtn) {
        voicePlayBtn.addEventListener('click', () => {
          // Check if voice note is now playing
          setTimeout(() => {
            const voicePlayerCard = document.getElementById('voice-player');
            const voiceNoteActive = voicePlayerCard && voicePlayerCard.classList.contains('playing');
            
            if (voiceNoteActive) {
              // Voice note chime started! Fade out background music.
              if (audio && !audio.paused) {
                fadeOutVolume(() => {
                  audio.pause();
                  // Temporarily store that we were playing, so we can resume later
                  localStorage.setItem('g_music_was_playing', 'true');
                });
              }
            } else {
              // Voice note paused/stopped. Resume background music if it was playing.
              if (localStorage.getItem('g_music_was_playing') === 'true') {
                localStorage.removeItem('g_music_was_playing');
                if (audio) {
                  audio.play().then(() => fadeInVolume());
                }
              }
            }
          }, 50);
        });
      }

      // Check every 500ms if the voice note finished (timer expired after 8 seconds)
      let checkInterval = setInterval(() => {
        const voicePlayerCard = document.getElementById('voice-player');
        if (voicePlayerCard && !voicePlayerCard.classList.contains('playing')) {
          if (localStorage.getItem('g_music_was_playing') === 'true') {
            localStorage.removeItem('g_music_was_playing');
            if (audio && audio.paused) {
              audio.play().then(() => fadeInVolume());
            }
          }
        }
      }, 500);
    }
  }

  // 8. Public API for index.html passcode unlock
  window.startGlobalMusic = function () {
    if (audio) {
      localStorage.setItem(LOCAL_STORAGE_PAUSED_KEY, 'false');
      audio.volume = 0;
      audio.play()
        .then(() => fadeInVolume())
        .catch(err => console.log("Play failed:", err));
    }
  };

  // 9. Smooth Page Fade and Snappy Transition Interceptor
  function initPageFade() {
    let fade = document.getElementById('pageFade');
    if (!fade) {
      fade = document.createElement('div');
      fade.id = 'pageFade';
      fade.className = 'g-global-fade';
      document.body.appendChild(fade);
    }
    // Remove out class and add gone class to fade in on load
    setTimeout(() => {
      fade.classList.add('gone');
      fade.classList.remove('out');
    }, 20);
  }

  function hookNavigation() {
    document.addEventListener('click', (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      // Handle relative page navigation
      if (href.endsWith('.html') || href.includes('page') || href === '/' || href.includes('index')) {
        e.preventDefault();

        // 1. Immediately clean up intensive JS loops and animations to prevent transition lag
        cleanupBeforeNavigation();

        // 2. Play fast fade-out animation
        const fade = document.getElementById('pageFade') || getOrCreateFade();
        fade.classList.remove('gone');
        fade.classList.add('out');

        // 3. Snappy navigate after 250ms (instead of 650ms/800ms)
        setTimeout(() => {
          window.location.href = anchor.href;
        }, 250);
      }
    });

    // Clean up active frame loops on unload just in case of programmatic navigation
    window.addEventListener('beforeunload', cleanupBeforeNavigation);
  }

  function getOrCreateFade() {
    let fade = document.getElementById('pageFade');
    if (!fade) {
      fade = document.createElement('div');
      fade.id = 'pageFade';
      fade.className = 'g-global-fade';
      document.body.appendChild(fade);
    }
    return fade;
  }

  // Run on load
  window.addEventListener('DOMContentLoaded', () => {
    initAudio();
    initFloatingWidget();
    setupPageHooks();
    resumeState();
    initPageFade();
    hookNavigation();
  });
})();
