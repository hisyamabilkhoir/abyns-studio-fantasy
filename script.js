/* ════════════════════════════════════════════════════════════
   ABYNS STUDIO — Scroll-Driven Cinematic Engine
   
   Powered by:
   • Lenis — buttery smooth scroll
   • GSAP ScrollTrigger — scroll-driven animations
   
   Core Concept:
   Videos do NOT autoplay. Instead, each section is PINNED 
   and the video's currentTime is scrubbed by scroll position.
   Scrolling = advancing the video frame by frame.
   It feels like entering the scene, not watching a video.
   
   Features:
   ① Scroll-scrubbed video playback (Apple-style)
   ② Scroll-based zoom (scale transform on video)
   ③ Parallax depth on content panels
   ④ Cinematic dark fade transitions between scenes
   ⑤ Scroll-triggered content reveal animations
   ⑥ 3D tilt hover on portfolio cards
   ⑦ Custom cursor with hover states
   ⑧ Loading screen with preload progress
   ════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Register GSAP plugins
  gsap.registerPlugin(ScrollTrigger);

  // ─── CONFIGURATION ───
  const CONFIG = {
    // Lenis smooth scroll
    lenisDuration: 2.2, // Slower for smoother feel
    lenisEasing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    lenisSmooth: true,
    lenisTouchSmooth: false,

    // Pinned section scroll distances (% of viewport height)
    // Higher = more scroll needed to play through the video
    pinDistances: {
      hero:      '+=250%',   // 2.5× viewport of scroll
      story:     '+=300%',   // 3× viewport — time to read text
      craft:     '+=300%',   // 3× viewport — time to read text
      portfolio: '+=350%',   // 3.5× viewport — browse cards
      contact:   '+=220%',   // 2.2× viewport — closing section
    },

    // Video zoom during pin
    videoZoomStart: 1.0,
    videoZoomEnd: 1.4,

    // 3D Tilt
    tiltMaxAngle: 14,
    tiltPerspective: 1000,

    // Cursor
    cursorLerp: 0.1,
  };

  // Pin distance lookup by scene index
  const PIN_KEYS = ['hero', 'story', 'craft', 'portfolio', 'contact'];

  // ─── DOM CACHE ───
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const DOM = {
    loader:          $('#loader'),
    loaderBar:       $('#loaderBar'),
    loaderVideo:     $('#loaderVideo'),
    navbar:          $('#navbar'),
    navProgress:     $('#navProgress'),
    navLinks:        $$('.navbar__link'),
    scrollIndicator: $('#scrollIndicator'),
    cursor:          $('#cursor'),
    scenes:          $$('.scene'),
    videos:          $$('.scene__video'),
    tiltCards:       $$('[data-tilt]'),
  };

  // ─── STATE ───
  const state = {
    isLoaded: false,
    videoEnded: false,
    transitioning: false,
    isMobile: window.innerWidth <= 768,
    mouseX: window.innerWidth / 2,
    mouseY: window.innerHeight / 2,
    cursorX: window.innerWidth / 2,
    cursorY: window.innerHeight / 2,
    lenis: null,
  };

  // ═══════════════════════════════════════════
  // 1. LENIS SMOOTH SCROLL
  // ═══════════════════════════════════════════

  function initLenis() {
    state.lenis = new Lenis({
      duration: CONFIG.lenisDuration,
      easing: CONFIG.lenisEasing,
      smooth: CONFIG.lenisSmooth,
      smoothTouch: CONFIG.lenisTouchSmooth,
      direction: 'vertical',
    });

    // Connect Lenis → GSAP ScrollTrigger
    state.lenis.on('scroll', ScrollTrigger.update);

    // Drive Lenis via GSAP ticker
    gsap.ticker.add((time) => {
      state.lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  // ═══════════════════════════════════════════
  // 2. VIDEO LOADING SCREEN
  //    scene-loader.mp4 plays once as cinematic intro.
  //    When video ends + all scenes loaded → zoom + flash → home.
  //    Music starts immediately, no delay.
  // ═══════════════════════════════════════════

  function initLoader() {
    const loaderVid = DOM.loaderVideo;

    // ─── START LOADER VIDEO (muted autoplay is always allowed) ───
    if (loaderVid) {
      loaderVid.currentTime = 0;
      loaderVid.play().then(() => {
        loaderVid.classList.add('is-playing');
        // Muted video autoplay succeeded → start music immediately
        startMusic();
      }).catch(() => {});

      // Sync progress bar with video duration
      loaderVid.addEventListener('timeupdate', () => {
        if (loaderVid.duration) {
          const progress = (loaderVid.currentTime / loaderVid.duration) * 100;
          if (DOM.loaderBar) DOM.loaderBar.style.width = progress + '%';
        }
      });

      // When the video finishes playing → auto-transition
      loaderVid.addEventListener('ended', () => {
        state.videoEnded = true;
        tryTransition();
      });
    }

    // ─── PRELOAD SCENE VIDEOS (silently in background) ───
    let loaded = 0;
    const total = DOM.videos.length;

    DOM.videos.forEach((video) => {
      const src = video.getAttribute('data-src');
      if (!src) return;

      video.src = src;
      video.load();

      video.addEventListener('canplaythrough', function onReady() {
        video.removeEventListener('canplaythrough', onReady);
        loaded++;

        // Mark loaded — show first frame (paused)
        video.classList.add('is-loaded');
        video.pause();
        video.currentTime = 0;

        if (loaded >= total) {
          state.isLoaded = true;
          tryTransition();
        }
      });
    });

    // Fallback: if videos take too long, mark as loaded
    setTimeout(() => {
      if (!state.isLoaded) {
        DOM.videos.forEach(v => {
          if (!v.classList.contains('is-loaded')) {
            v.classList.add('is-loaded');
          }
          v.pause();
          v.currentTime = 0;
        });
        state.isLoaded = true;
        tryTransition();
      }
    }, 15000);
  }

  /**
   * Try to transition out of the loader.
   * Only fires when BOTH conditions are met:
   * 1) The intro video finished playing
   * 2) All scene videos are preloaded
   */
  function tryTransition() {
    if (!state.isLoaded || !state.videoEnded || state.transitioning) return;
    state.transitioning = true;

    const flash = document.getElementById('loaderFlash');
    const inner = document.querySelector('.loader__inner');

    // 0. Hide text and progress bar immediately before zooming
    if (inner) {
      inner.style.transition = 'opacity 0.3s ease';
      inner.style.opacity = '0';
    }

    // 1. Trigger the kinclong flash
    if (flash) flash.classList.add('is-flashing');

    // 2. Zoom-in the entire loader
    setTimeout(() => {
      DOM.loader.classList.add('is-zooming');
    }, 200);

    // 3. After the animation completes, remove loader & start experience
    setTimeout(() => {
      DOM.loader.classList.add('is-hidden');
      DOM.loader.style.display = 'none';

      // Free memory
      if (DOM.loaderVideo) {
        DOM.loaderVideo.pause();
        DOM.loaderVideo.removeAttribute('src');
        DOM.loaderVideo.load();
      }

      startMainExperience();
    }, 1500);
  }

  /**
   * Start background music immediately at full volume.
   * Called when the loader video autoplays (user gesture not needed for
   * audio that starts alongside a muted video autoplay).
   */
  function startMusic() {
    const bgMusic = document.getElementById('bgMusic');
    if (!bgMusic) return;

    // Instant full volume — no fade, no delay
    bgMusic.volume = 0.4;
    bgMusic.play().then(() => {
      state.musicStarted = true;
    }).catch(() => {
      // Browser blocked autoplay — will retry on initAudio via user interaction
    });
  }

  function startMainExperience() {
    animateHeroEntrance();
    initScrollDrivenSections();
    initNavbarScroll();
    initScrollIndicatorHide();
    initScrollProgress();
  }

  // ═══════════════════════════════════════════
  // 3. HERO ENTRANCE ANIMATION
  // ═══════════════════════════════════════════

  function animateHeroEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Navbar slides down
    tl.to(DOM.navbar, {
      y: 0,
      opacity: 1,
      duration: 1.4,
    }, 0);

    // Title lines - fade in with blur
    gsap.set('.hero__title-line', { filter: 'blur(12px)', opacity: 0, y: 50 });
    tl.to('.hero__title-line', {
      y: 0,
      opacity: 1,
      filter: 'blur(0px)',
      duration: 2.2,
      stagger: 0.25,
    }, 0.3);

    // Subtitle
    tl.fromTo('.hero__subtitle', 
      { opacity: 0, filter: 'blur(8px)' },
      { opacity: 1, filter: 'blur(0px)', duration: 2.0 },
      1.0
    );

    // Divider
    tl.to('.hero__divider', {
      scaleX: 1,
      duration: 2.0,
    }, 1.3);
  }

  // ═══════════════════════════════════════════
  // 4. SCROLL-DRIVEN SECTIONS
  //    The heart of the experience.
  //
  //    Each section is PINNED in place.
  //    While pinned:
  //    • video.currentTime scrubs with scroll
  //    • video-wrap zooms in (scale 1.0 → 1.3)
  //    • content has parallax depth
  //    • curtain fades in/out for transitions
  //    • text/panels animate into view
  // ═══════════════════════════════════════════

  function initScrollDrivenSections() {
    DOM.scenes.forEach((scene, index) => {
      const video     = scene.querySelector('.scene__video');
      const videoWrap = scene.querySelector('.scene__video-wrap');
      const content   = scene.querySelector('.scene__content');
      const isHero    = index === 0;
      const isLast    = index === DOM.scenes.length - 1;

      if (!video) return;

      // Ensure video is paused — scroll controls everything
      video.pause();

      // Determine scroll distance for this section
      const key = PIN_KEYS[index] || 'story';
      const pinDistance = CONFIG.pinDistances[key] || '+=300%';

      // ─── CREATE MASTER TIMELINE ───
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scene,
          start: 'top top',
          end: pinDistance,
          pin: true,
          anticipatePin: 1,
          scrub: 1.2,  // 1.2s smooth lag for cinematic feel
          invalidateOnRefresh: true,
        }
      });

      // ─── A. VIDEO CURRENTTIME SCRUB ───
      // A proxy object that GSAP tweens from 0→1.
      // On each update, we set video.currentTime.
      const videoProxy = { progress: 0 };
      tl.to(videoProxy, {
        progress: 1,
        duration: 1,
        ease: 'none',
        onUpdate: () => {
          if (video.readyState >= 2 && video.duration && isFinite(video.duration)) {
            video.currentTime = videoProxy.progress * video.duration;
          }
        }
      }, 0);

      // ─── B. CONTINUOUS VIDEO ZOOM ───
      // Animate the actual video element, leaving videoWrap free for heavy transitions!
      if (index === 4) { // Contact (zoom out)
        tl.fromTo(video,
          { scale: 1.15 },
          { scale: 1.0, duration: 1, ease: 'none' },
          0
        );
      } else {
        tl.fromTo(video,
          { scale: 1.0 },
          { scale: 1.15, duration: 1, ease: 'none' },
          0
        );
      }

      // ─── C. CONTENT PARALLAX & HERO FADES ───
      if (content) {
        if (isHero) {
          // Hero: text fades out and moves up, overlay gets darker
          tl.to(content, { yPercent: -15, opacity: 0, duration: 0.4, ease: 'power2.in' }, 0);
          
          const overlay = scene.querySelector('.scene__overlay');
          if (overlay) {
            tl.to(overlay, { opacity: 0.85, duration: 0.6, ease: 'none' }, 0);
          }
        } 
        else if (index === 1) { // Story / Forest
          // Card (glass) muncul dari bawah dengan parallax lambat
          tl.fromTo(content,
            { y: 150, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
            0.05
          );
          // Parallax continued
          tl.to(content, { yPercent: 6, duration: 0.55, ease: 'none' }, 0.45);
        }
        else if (index === 4) { // Contact
          // Text muncul pelan
          tl.fromTo(content,
            { y: 60, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' },
            0.1
          );
        }
        else {
          // Standard parallax
          tl.fromTo(content,
            { yPercent: -6 },
            { yPercent: 6, duration: 1, ease: 'none' },
            0
          );
        }
      }

      // ─── D. CINEMATIC SCENE TRANSITIONS ───
      // Manual transitions between scenes (1->2 Zoom, 2->3 Descend, 3->4 Expand, 4->5 Ascend)
      const enterDur = 0.15; // 15% of scroll pin
      const exitDur = 0.15;

      // === ENTRANCE (Progress 0.0 -> 0.15) ===
      if (index === 1) { 
        // Entering 2 from 1 (Zoom in -> comes from deep inside)
        tl.fromTo(videoWrap, { scale: 0.7, opacity: 0, filter: 'blur(10px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: enterDur, ease: 'power2.out' }, 0);
      } 
      else if (index === 2) { 
        // Entering 3 from 2 (Descend -> Camera descends, so world comes UP from bottom)
        tl.fromTo(videoWrap, { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: enterDur, ease: 'power2.out' }, 0);
      }
      else if (index === 3) { 
        // Entering 4 from 3 (Expand -> Start small and expand to normal)
        tl.fromTo(videoWrap, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: enterDur, ease: 'expo.out' }, 0);
      }
      else if (index === 4) { 
        // Entering 5 from 4 (Ascend -> Camera ascends, so world drops DOWN from top)
        tl.fromTo(videoWrap, { yPercent: -40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: enterDur, ease: 'power2.out' }, 0);
      }

      // === EXIT (Progress 0.85 -> 1.0) ===
      if (index === 0) { 
        // Exiting 1 to 2 (Zoom in -> portal flies past camera)
        tl.to(videoWrap, { scale: 3, opacity: 0, filter: 'blur(15px)', duration: exitDur, ease: 'power2.in' }, 1 - exitDur);
      }
      else if (index === 1) { 
        // Exiting 2 to 3 (Descend -> Camera dives down, so current world flies UP)
        tl.to(videoWrap, { yPercent: -40, opacity: 0, duration: exitDur, ease: 'power2.in' }, 1 - exitDur);
      }
      else if (index === 2) { 
        // Exiting 3 to 4 (Expand -> Explode out)
        tl.to(videoWrap, { scale: 2.5, opacity: 0, filter: 'brightness(1.5)', duration: exitDur, ease: 'power2.in' }, 1 - exitDur);
      }
      else if (index === 3) { 
        // Exiting 4 to 5 (Fade + Ascend -> Camera flies up, so current world drops DOWN)
        tl.to(videoWrap, { yPercent: 40, opacity: 0, duration: exitDur, ease: 'power2.in' }, 1 - exitDur);
      }

      // Hide HTML content completely BEFORE the exit transition starts
      // This ensures clean camera movements without overlapping text
      if (!isHero && content) {
        tl.to(content, { opacity: 0, duration: 0.1, ease: 'power2.inOut' }, 1 - exitDur - 0.1);
      }

      // ─── E. CONTENT REVEAL ANIMATIONS ───
      // Non-hero sections: animate text/panels into view
      if (!isHero) {
        const animEls = scene.querySelectorAll('[data-anim]');
        animEls.forEach((el, i) => {
          const type = el.dataset.anim;
          const from = { opacity: 0 };
          const to   = { opacity: 1, duration: 0.2, ease: 'expo.out' };

          switch (type) {
            case 'slide-right': from.x = -80;  to.x = 0; break;
            case 'slide-left':  from.x = 80;   to.x = 0; break;
            case 'fade-up':     from.y = 60;   to.y = 0; break;
            case 'scale-x':     from.scaleX = 0; to.scaleX = 1; break;
            default:            from.y = 50;   to.y = 0;
          }

          // Check if this element requests a specific manual start time
          const showAt = el.getAttribute('data-show-at');
          const startTime = showAt ? parseFloat(showAt) : enterDur + 0.02 + (i * 0.04);

          // Reveal at the calculated time
          tl.fromTo(el, from, to, startTime);

          // Check if this element should vanish before the scene exits
          const hideAt = el.getAttribute('data-hide-at');
          if (hideAt) {
            tl.to(el, { opacity: 0, x: (type === 'slide-right' ? -50 : 50), duration: 0.1, ease: 'power2.inOut' }, parseFloat(hideAt));
          }
        });

        // Stagger portfolio cards specifically based on their phase
        if (scene.classList.contains('scene--portfolio')) {
          const phases = scene.querySelectorAll('.story-phase-wrapper');
          if (phases.length > 0) {
            phases.forEach((phase) => {
              const phaseShowAt = phase.getAttribute('data-show-at') ? parseFloat(phase.getAttribute('data-show-at')) : 0.10;
              const cards = phase.querySelectorAll('.portfolio-card');
              cards.forEach((card, i) => {
                tl.fromTo(card,
                  { opacity: 0, y: 80, rotateX: 6 },
                  { opacity: 1, y: 0, rotateX: 0, duration: 0.15, ease: 'expo.out' },
                  phaseShowAt + 0.05 + (i * 0.04)
                );
              });
            });
          } else {
            const cards = scene.querySelectorAll('.portfolio-card');
            cards.forEach((card, i) => {
              tl.fromTo(card,
                { opacity: 0, y: 80, rotateX: 6 },
                { opacity: 1, y: 0, rotateX: 0, duration: 0.15, ease: 'expo.out' },
                0.10 + i * 0.04
              );
            });
          }
        }
      }
    });
  }

  // ═══════════════════════════════════════════
  // 5. NAVBAR SCROLL STATE
  // ═══════════════════════════════════════════

  function initNavbarScroll() {
    // Toggle glass background
    ScrollTrigger.create({
      start: 80,
      onUpdate: () => {
        if (window.scrollY > 80) {
          DOM.navbar.classList.add('is-scrolled');
        } else {
          DOM.navbar.classList.remove('is-scrolled');
        }
      },
    });

    // Track active nav link per section
    DOM.scenes.forEach((scene, index) => {
      if (index === 0) return;

      ScrollTrigger.create({
        trigger: scene,
        start: 'top top',
        endTrigger: scene,
        end: 'bottom top',
        onEnter:     () => setActiveNav(index - 1),
        onEnterBack: () => setActiveNav(index - 1),
      });
    });

    // Reset when back at hero
    ScrollTrigger.create({
      trigger: DOM.scenes[0],
      start: 'top top',
      end: 'bottom top',
      onEnter:     () => clearActiveNav(),
      onEnterBack: () => clearActiveNav(),
    });
  }

  function setActiveNav(index) {
    DOM.navLinks.forEach((link, i) => {
      link.classList.toggle('is-active', i === index);
    });
  }

  function clearActiveNav() {
    DOM.navLinks.forEach(link => link.classList.remove('is-active'));
  }

  // ═══════════════════════════════════════════
  // 6. SCROLL INDICATOR
  // ═══════════════════════════════════════════

  function initScrollIndicatorHide() {
    ScrollTrigger.create({
      start: window.innerHeight * 0.08,
      onUpdate: () => {
        if (window.scrollY > window.innerHeight * 0.08) {
          DOM.scrollIndicator.classList.add('is-hidden');
        } else {
          DOM.scrollIndicator.classList.remove('is-hidden');
        }
      },
    });
  }

  // ═══════════════════════════════════════════
  // 7. SCROLL PROGRESS BAR
  // ═══════════════════════════════════════════

  function initScrollProgress() {
    gsap.to(DOM.navProgress, {
      width: '100%',
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.3,
      },
    });
  }

  // ═══════════════════════════════════════════
  // 8. 3D TILT HOVER — Portfolio Cards
  // ═══════════════════════════════════════════

  function initTiltCards() {
    if (state.isMobile) return;

    DOM.tiltCards.forEach((card) => {
      const inner = card.querySelector('.portfolio-card__inner');

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateY = ((x - centerX) / centerX) * CONFIG.tiltMaxAngle;
        const rotateX = ((centerY - y) / centerY) * CONFIG.tiltMaxAngle;

        gsap.to(inner, {
          rotateX,
          rotateY,
          scale: 1.04,
          duration: 0.6,
          ease: 'power2.out',
          transformPerspective: CONFIG.tiltPerspective,
        });

        const px = (x / rect.width) * 100;
        const py = (y / rect.height) * 100;
        card.style.setProperty('--mouse-x', px + '%');
        card.style.setProperty('--mouse-y', py + '%');
      });

      card.addEventListener('mouseleave', () => {
        gsap.to(inner, {
          rotateX: 0,
          rotateY: 0,
          scale: 1,
          duration: 0.9,
          ease: 'elastic.out(1, 0.4)',
          transformPerspective: CONFIG.tiltPerspective,
        });
      });
    });
  }

  // ═══════════════════════════════════════════
  // 9. CUSTOM CURSOR
  // ═══════════════════════════════════════════

  function initCursor() {
    if (state.isMobile) return;

    document.addEventListener('mousemove', (e) => {
      state.mouseX = e.clientX;
      state.mouseY = e.clientY;
    });

    $$('a, button, .portfolio-card, .cta-button').forEach((el) => {
      el.addEventListener('mouseenter', () => DOM.cursor.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => DOM.cursor.classList.remove('is-hover'));
    });
  }

  function updateCursor() {
    if (state.isMobile || !DOM.cursor) return;

    state.cursorX += (state.mouseX - state.cursorX) * CONFIG.cursorLerp;
    state.cursorY += (state.mouseY - state.cursorY) * CONFIG.cursorLerp;

    gsap.set(DOM.cursor, {
      x: state.cursorX,
      y: state.cursorY,
    });
  }

  // ═══════════════════════════════════════════
  // 10. SMOOTH SCROLL NAV LINKS
  // ═══════════════════════════════════════════

  function initNavLinks() {
    $$('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = $(link.getAttribute('href'));
        if (!target || !state.lenis) return;

        state.lenis.scrollTo(target, {
          duration: 2.5,
          offset: 0,
        });
      });
    });
  }

  // ═══════════════════════════════════════════
  // 11. GRAIN OVERLAY ANIMATION
  // ═══════════════════════════════════════════

  function initGrain() {
    const grain = $('.grain-overlay');
    if (!grain) return;

    let frame = 0;
    function animateGrain() {
      frame++;
      if (frame % 3 === 0) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        grain.style.backgroundPosition = `${x}px ${y}px`;
      }
      requestAnimationFrame(animateGrain);
    }
    animateGrain();
  }

  // ═══════════════════════════════════════════
  // 12. KEYBOARD ACCESSIBILITY
  // ═══════════════════════════════════════════

  function initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        document.body.style.cursor = 'auto';
        if (DOM.cursor) DOM.cursor.style.display = 'none';
      }
    });

    document.addEventListener('mousemove', () => {
      if (!state.isMobile) {
        document.body.style.cursor = 'none';
        if (DOM.cursor) DOM.cursor.style.display = '';
      }
    }, { once: true });
  }

  // ═══════════════════════════════════════════
  // 13. RESIZE HANDLER
  // ═══════════════════════════════════════════

  function onResize() {
    state.isMobile = window.innerWidth <= 768;
    ScrollTrigger.refresh();
  }

  // ═══════════════════════════════════════════
  // 14. BACKGROUND AUDIO
  // ═══════════════════════════════════════════

  function initAudio() {
    const bgMusic = document.getElementById('bgMusic');
    if (!bgMusic) return;

    bgMusic.volume = 0.4;

    let isPlayingAttempt = false;

    const forcePlay = () => {
      if (state.musicStarted || isPlayingAttempt) return;
      
      isPlayingAttempt = true;
      const playPromise = bgMusic.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          state.musicStarted = true;
          // Hide hint
          const hint = document.getElementById('audioHint');
          if (hint) {
            gsap.to(hint, { opacity: 0, y: 10, duration: 0.6, ease: 'power2.inOut', onComplete: () => hint.style.display = 'none' });
          }
          // Remove listener once successfully played
          ['click', 'touchstart', 'keydown', 'pointerdown', 'wheel'].forEach(evt => {
            window.removeEventListener(evt, forcePlay);
          });
        }).catch((err) => {
          // Playback failed (usually no user gesture)
          isPlayingAttempt = false;
        });
      }
    };

    // Try immediately
    forcePlay();

    // Fallback bindings: require true interaction gestures (mousemove is ignored by browsers)
    ['click', 'touchstart', 'keydown', 'pointerdown', 'wheel'].forEach(evt => {
      window.addEventListener(evt, forcePlay, { passive: true });
    });
  }

  // ═══════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════

  function init() {
    // Lenis drives the scroll
    initLenis();

    // Load videos (paused — no autoplay)
    initLoader();

    // Non-loading-dependent features
    initTiltCards();
    initCursor();
    initNavLinks();
    initGrain();
    initKeyboardNav();
    initAudio();

    // Cursor on GSAP ticker
    gsap.ticker.add(updateCursor);

    // Resize
    window.addEventListener('resize', onResize, { passive: true });
  }

  // ─── BOOT ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
