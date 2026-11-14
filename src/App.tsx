import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initHeroCanvas } from './webgl/heroCanvas';
import { initSpecsCanvas } from './webgl/specsCanvas';
import {
  initHeroBottle3D,
  type HeroBottleController,
} from './webgl/heroBottle3D';

gsap.registerPlugin(ScrollTrigger);

type FinishId = 'sage' | 'basalt' | 'glacier';
type SizeLabel = '750 ml' | '950 ml' | '1.2 L';

interface BagItem {
  finish: FinishId;
  size: SizeLabel;
  price: number;
  qty: number;
}

const FINISH_ORDER: FinishId[] = ['sage', 'basalt', 'glacier'];

const FINISH_META: Record<
  FinishId,
  { name: string; subtitle: string; dot: string }
> = {
  sage: {
    name: 'Alpine Sage',
    subtitle: 'Matte Powder Coat',
    dot: '#48634B',
  },
  basalt: {
    name: 'Basalt Black',
    subtitle: 'Textured Obsidian',
    dot: '#222624',
  },
  glacier: {
    name: 'Glacier Silver',
    subtitle: 'Brushed 18/8 Steel',
    dot: '#B4BDB8',
  },
};

const SIZE_OPTIONS: { size: SizeLabel; price: number; scale: number }[] = [
  { size: '750 ml', price: 42, scale: 0.94 },
  { size: '950 ml', price: 48, scale: 1.0 },
  { size: '1.2 L', price: 54, scale: 1.06 },
];

const SHOWCASE_STAGES = [
  {
    src: 'https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-showcase-studio.webp',
    alt: 'Material Flask standing on honed dark basalt slate in an architectural studio',
    title: 'Alpine Sage Matte',
    sub: 'Powder-coated 18/8 stainless steel',
  },
  {
    src: 'https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-showcase-river.webp',
    alt: 'Material Flask on a sunlit cedar picnic table beside a clear mountain river',
    title: 'Made for the Outside',
    sub: 'Zero condensation from morning trails to sunny riverbanks',
  },
  {
    src: 'https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-showcase-trail.webp',
    alt: 'Material Flask resting on a sunlit granite boulder overlooking golden alpine meadows',
    title: 'Machined Steel Collar',
    sub: 'Leakproof chug lid built to take a knock',
  },
  {
    src: 'https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-showcase-lake.webp',
    alt: 'Material Flask on a stone lakeside dock at dusk overlooking calm alpine water',
    title: 'All-Day Carry',
    sub: 'Built to go from sunny ridge hikes to quiet evening camp',
  },
];

export default function App() {
  // Always open in light mode regardless of browser dark-mode preference
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [finish, setFinish] = useState<FinishId>('sage');
  const [size, setSize] = useState<SizeLabel>('950 ml');
  const [price, setPrice] = useState<number>(48);
  const [activeStage, setActiveStage] = useState<number>(0);
  const [captionBlur, setCaptionBlur] = useState<boolean>(false);
  const [splitPct, setSplitPct] = useState<number>(50);
  const [splitAnimate, setSplitAnimate] = useState<boolean>(false);
  const [bag, setBag] = useState<BagItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [checkedOut, setCheckedOut] = useState<boolean>(false);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [webglFallback, setWebglFallback] = useState<boolean>(false);

  const heroCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const specsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bottleMountRef = useRef<HTMLDivElement | null>(null);
  const bottle3DRef = useRef<HeroBottleController | null>(null);
  const showcaseRef = useRef<HTMLElement | null>(null);
  const frameRefs = useRef<(HTMLElement | null)[]>([]);
  const bentoGridRef = useRef<HTMLDivElement | null>(null);
  const compWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollProgressRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const stageIdxRef = useRef<number>(0);
  const stageTimerRef = useRef<number | null>(null);
  const checkoutTimerRef = useRef<number | null>(null);
  const selectedConfigRef = useRef<{
    finish: FinishId;
    size: SizeLabel;
    price: number;
  }>({ finish: 'sage', size: '950 ml', price: 48 });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    bottle3DRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const cleanupHeroGl = initHeroCanvas(heroCanvasRef.current);
    const cleanupSpecsGl = initSpecsCanvas(specsCanvasRef.current);

    const updateScrollProgress = () => {
      if (!scrollProgressRef.current) return;
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      scrollProgressRef.current.style.transform = `scaleX(${progress})`;
    };

    let lenis: InstanceType<typeof Lenis> | null = null;
    let lenisTicker: ((time: number) => void) | null = null;
    if (!prefersReduced) {
      lenis = new Lenis({
        duration: 1.05,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      lenis.on('scroll', () => {
        ScrollTrigger.update();
        updateScrollProgress();
      });
      lenisTicker = (time: number) => {
        lenis?.raf(time * 1000);
      };
      gsap.ticker.add(lenisTicker);
      gsap.ticker.lagSmoothing(0);
    }

    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress, { passive: true });
    ScrollTrigger.addEventListener('refresh', updateScrollProgress);
    updateScrollProgress();

    if (bottleMountRef.current) {
      bottle3DRef.current = initHeroBottle3D(bottleMountRef.current, {
        initialVariantIndex: FINISH_ORDER.indexOf(selectedConfigRef.current.finish),
        initialTheme: theme,
        onSelectVariant: (idx) => {
          const next = FINISH_ORDER[idx];
          if (next) {
            selectedConfigRef.current.finish = next;
            setFinish(next);
            setSliderValue(idx);
          }
        },
        onWebGLUnavailable: () => {
          setWebglFallback(true);
        },
      });
    }

    const gsapCtx = gsap.context(() => {
      if (prefersReduced) return;

      const frames = frameRefs.current.filter(
        (el): el is HTMLElement => el !== null
      );
      if (showcaseRef.current && frames.length === 4) {
        // Explicit dwell + wipe cadence: caption advances only once incoming image is >= 90% revealed
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: showcaseRef.current,
            start: 'top top',
            end: '+=280%',
            pin: true,
            scrub: 0.65,
            onUpdate: (self: { progress: number }) => {
              const t = self.progress * 3.5;
              let nextIdx = 0;
              if (t >= 3.07) nextIdx = 3;
              else if (t >= 2.02) nextIdx = 2;
              else if (t >= 0.97) nextIdx = 1;

              if (nextIdx !== stageIdxRef.current) {
                stageIdxRef.current = nextIdx;
                setCaptionBlur(true);
                if (stageTimerRef.current !== null) {
                  window.clearTimeout(stageTimerRef.current);
                }
                stageTimerRef.current = window.setTimeout(() => {
                  stageTimerRef.current = null;
                  setActiveStage(nextIdx);
                  setCaptionBlur(false);
                }, 100);
              }
            },
          },
        });

        const wipeStarts = [0.25, 1.3, 2.35];
        frames.forEach((frame, i) => {
          if (i === 0) return;
          tl.fromTo(
            frame,
            { clipPath: 'inset(0 0 0 100%)' },
            { clipPath: 'inset(0 0 0 0%)', ease: 'none', duration: 0.8 },
            wipeStarts[i - 1]
          );
        });
        tl.set({}, {}, 3.5);
      }

      if (bentoGridRef.current) {
        gsap.from('.reveal-tile', {
          y: 28,
          scale: 0.96,
          opacity: 0,
          duration: 0.65,
          stagger: 0.08,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: bentoGridRef.current,
            start: 'top 82%',
            once: true,
          },
        });
      }
    });

    return () => {
      if (stageTimerRef.current !== null) {
        window.clearTimeout(stageTimerRef.current);
        stageTimerRef.current = null;
      }
      if (checkoutTimerRef.current !== null) {
        window.clearTimeout(checkoutTimerRef.current);
        checkoutTimerRef.current = null;
      }
      cleanupHeroGl();
      cleanupSpecsGl();
      bottle3DRef.current?.dispose();
      bottle3DRef.current = null;
      gsapCtx.revert();
      if (lenisTicker) gsap.ticker.remove(lenisTicker);
      lenis?.destroy();
      window.removeEventListener('scroll', updateScrollProgress);
      window.removeEventListener('resize', updateScrollProgress);
      ScrollTrigger.removeEventListener('refresh', updateScrollProgress);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const selectStage = (idx: number) => {
    stageIdxRef.current = idx;
    setCaptionBlur(true);
    if (stageTimerRef.current !== null) {
      window.clearTimeout(stageTimerRef.current);
    }
    stageTimerRef.current = window.setTimeout(() => {
      stageTimerRef.current = null;
      setActiveStage(idx);
      setCaptionBlur(false);
    }, 110);
    frameRefs.current.forEach((frame, i) => {
      if (!frame) return;
      frame.style.clipPath =
        i <= idx ? 'inset(0 0 0 0%)' : 'inset(0 0 0 100%)';
    });
  };

  const updateSplit = (pct: number, animate: boolean) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setSplitAnimate(animate);
    setSplitPct(clamped);
  };

  const handleCompPointerDown = (e: {
    currentTarget: HTMLDivElement;
    pointerId: number;
    clientX: number;
  }) => {
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    updateSplit(((e.clientX - rect.left) / rect.width) * 100, false);
  };

  const handleCompPointerMove = (e: {
    currentTarget: HTMLDivElement;
    clientX: number;
  }) => {
    if (!isDraggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    updateSplit(((e.clientX - rect.left) / rect.width) * 100, false);
  };

  const handleCompPointerUp = () => {
    isDraggingRef.current = false;
  };

  const selectFinish = (nextFinish: FinishId) => {
    selectedConfigRef.current.finish = nextFinish;
    setFinish(nextFinish);
    const idx = FINISH_ORDER.indexOf(nextFinish);
    if (idx >= 0) {
      setSliderValue(idx);
      bottle3DRef.current?.setSliderProgress(idx);
    }
  };

  const handleSliderChange = (nextVal: number) => {
    const clamped = Math.max(0, Math.min(FINISH_ORDER.length - 1, nextVal));
    setSliderValue(clamped);
    bottle3DRef.current?.setSliderProgress(clamped);
    const nearestIdx = Math.round(clamped);
    const nearestFinish = FINISH_ORDER[nearestIdx];
    if (nearestFinish && nearestFinish !== selectedConfigRef.current.finish) {
      selectedConfigRef.current.finish = nearestFinish;
      setFinish(nearestFinish);
    }
  };

  const commitSliderSnap = (currentVal: number) => {
    const snappedIdx = Math.max(
      0,
      Math.min(FINISH_ORDER.length - 1, Math.round(currentVal))
    );
    const nextFinish = FINISH_ORDER[snappedIdx];
    setSliderValue(snappedIdx);
    bottle3DRef.current?.setSliderProgress(snappedIdx);
    if (nextFinish) {
      selectedConfigRef.current.finish = nextFinish;
      setFinish(nextFinish);
    }
  };

  const stepVariant = (delta: number) => {
    const currentIdx = FINISH_ORDER.indexOf(finish);
    const nextIdx =
      (currentIdx + delta + FINISH_ORDER.length) % FINISH_ORDER.length;
    selectFinish(FINISH_ORDER[nextIdx]);
  };

  const selectSize = (nextSize: SizeLabel, nextPrice: number) => {
    selectedConfigRef.current.size = nextSize;
    selectedConfigRef.current.price = nextPrice;
    setSize(nextSize);
    setPrice(nextPrice);
    const opt = SIZE_OPTIONS.find((s) => s.size === nextSize);
    if (opt) {
      bottle3DRef.current?.setCapacityScale(opt.scale);
    }
  };

  const cancelPendingCheckout = () => {
    if (checkoutTimerRef.current !== null) {
      window.clearTimeout(checkoutTimerRef.current);
      checkoutTimerRef.current = null;
      setCheckedOut(false);
    }
  };

  const addToBag = () => {
    cancelPendingCheckout();
    const activeCfg = selectedConfigRef.current;
    setBag((prev) => {
      const idx = prev.findIndex(
        (item) =>
          item.finish === activeCfg.finish && item.size === activeCfg.size
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          finish: activeCfg.finish,
          size: activeCfg.size,
          price: activeCfg.price,
          qty: 1,
        },
      ];
    });
    setDrawerOpen(true);
  };

  const updateBagQty = (idx: number, delta: number) => {
    cancelPendingCheckout();
    setBag((prev) => {
      const next = [...prev];
      const updatedQty = next[idx].qty + delta;
      if (updatedQty <= 0) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...next[idx], qty: updatedQty };
      }
      return next;
    });
  };

  const handleCheckout = () => {
    if (checkedOut) return;
    if (checkoutTimerRef.current !== null) {
      window.clearTimeout(checkoutTimerRef.current);
    }
    setCheckedOut(true);
    checkoutTimerRef.current = window.setTimeout(() => {
      checkoutTimerRef.current = null;
      setBag([]);
      setCheckedOut(false);
      setDrawerOpen(false);
    }, 1100);
  };

  const totalQty = bag.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = bag.reduce((sum, item) => sum + item.price * item.qty, 0);
  const activeScale =
    SIZE_OPTIONS.find((s) => s.size === size)?.scale ?? 1.0;

  return (
    <>
      <div className="scroll-progress-track" aria-hidden="true">
        <div className="scroll-progress-bar" ref={scrollProgressRef} />
      </div>
      <div className="grain-overlay" aria-hidden="true" />

      <header className="site-header" id="site-header">
        <div className="container header-inner">
          <a href="#hero" className="brand-lockup" aria-label="Material Flask Home">
            <svg
              className="brand-mark"
              width="24"
              height="15"
              viewBox="0 0 28 18"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 16L10.5 3L16 11.5L19.5 6.5L26 16H2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="brand-wordmark">Material</span>
          </a>

          <nav className="header-nav" aria-label="Primary">
            <a href="#showcase" className="nav-link">
              Showcase
            </a>
            <a href="#craft" className="nav-link">
              Specs
            </a>
            <button
              type="button"
              className="icon-btn theme-toggle"
              id="theme-toggle"
              aria-label="Toggle color theme"
              title="Switch light or dark theme"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              <svg
                id="theme-icon-sun"
                width="19"
                height="19"
                viewBox="0 0 256 256"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="128" cy="128" r="56" stroke="currentColor" strokeWidth="18" />
                <line x1="128" y1="24" x2="128" y2="44" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
                <line x1="128" y1="212" x2="128" y2="232" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
                <line x1="24" y1="128" x2="44" y2="128" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
                <line x1="212" y1="128" x2="232" y2="128" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
                <line x1="54" y1="54" x2="68" y2="68" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
                <line x1="188" y1="188" x2="202" y2="202" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
                <line x1="54" y1="202" x2="68" y2="188" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
                <line x1="188" y1="68" x2="202" y2="54" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
              </svg>
              <svg
                id="theme-icon-moon"
                width="19"
                height="19"
                viewBox="0 0 256 256"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M210.69 158.18A96.78 96.78 0 0 1 192 160 96.11 96.11 0 0 1 96 64a96.78 96.78 0 0 1 1.82-18.69A96.04 96.04 0 1 0 210.69 158.18Z"
                  stroke="currentColor"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="icon-btn bag-trigger"
              id="bag-trigger"
              aria-label="Open order bag"
              onClick={() => setDrawerOpen(true)}
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 256 256"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="32"
                  y="72"
                  width="192"
                  height="144"
                  rx="16"
                  stroke="currentColor"
                  strokeWidth="18"
                />
                <path
                  d="M88 72V64a40 40 0 0 1 80 0v8"
                  stroke="currentColor"
                  strokeWidth="18"
                  strokeLinecap="round"
                />
              </svg>
              <span className="bag-count" id="bag-count">
                {totalQty}
              </span>
            </button>
          </nav>
        </div>
      </header>

      <main>
        {/* SECTION 1: Asymmetric Split Hero */}
        <section id="hero" className="hero">
          <canvas
            ref={heroCanvasRef}
            id="hero-gl-canvas"
            className="hero-canvas"
            aria-hidden="true"
          />

          <div className="container hero-grid">
            <div className="hero-copy">
              <h1 className="hero-title">Built for altitude.</h1>
              <p className="hero-sub">
                A sturdy stainless steel bottle made for long trail days and
                everyday commutes, keeping drinks cold or steaming without ever
                sweating in your bag.
              </p>

              <div className="hero-actions">
                <a href="#order" className="btn btn-primary magnetic-btn">
                  Shop Flask
                </a>
                <a href="#showcase" className="btn btn-ghost">
                  Explore
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 256 256"
                    fill="none"
                    aria-hidden="true"
                  >
                    <line
                      x1="64"
                      y1="64"
                      x2="192"
                      y2="192"
                      stroke="currentColor"
                      strokeWidth="20"
                      strokeLinecap="round"
                    />
                    <polyline
                      points="88 192 192 192 192 88"
                      stroke="currentColor"
                      strokeWidth="20"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
            </div>

            <div className="hero-stage" id="hero-stage">
              <div className="hero-3d-viewport">
                {webglFallback ? (
                  <div className="hero-3d-fallback">
                    <img
                      src="https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-cutout.webp"
                      alt={`Material Flask 950 ml in ${FINISH_META[finish].name}`}
                      className="flask-hero-img"
                      id="hero-flask-img"
                      data-finish={finish}
                      width={519}
                      height={940}
                    />
                  </div>
                ) : (
                  <div
                    ref={bottleMountRef}
                    className="hero-3d-canvas-wrap"
                    aria-label={`Interactive 3D model of Material Flask in ${FINISH_META[finish].name}. Drag to rotate 360 degrees.`}
                  />
                )}

                <button
                  type="button"
                  className="hero-slide-nav is-prev"
                  aria-label="Previous bottle variant"
                  onClick={() => stepVariant(-1)}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <polyline
                      points="15 18 9 12 15 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  className="hero-slide-nav is-next"
                  aria-label="Next bottle variant"
                  onClick={() => stepVariant(1)}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <polyline
                      points="9 18 15 12 9 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="hero-variant-slider">
                <div className="variant-slider-meta">
                  <div className="variant-slider-title">
                    <span className="variant-active-name">
                      {FINISH_META[finish].name}
                    </span>
                    <span className="variant-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="variant-active-sub">
                      {FINISH_META[finish].subtitle}
                    </span>
                  </div>
                  <span className="variant-index" aria-live="polite">
                    0{FINISH_ORDER.indexOf(finish) + 1} / 0
                    {FINISH_ORDER.length}
                  </span>
                </div>

                <div className="variant-range-wrap">
                  <div
                    className="variant-range-fill"
                    style={{
                      width: `${(sliderValue / (FINISH_ORDER.length - 1)) * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                  <input
                    type="range"
                    min={0}
                    max={FINISH_ORDER.length - 1}
                    step={0.01}
                    value={sliderValue}
                    aria-label="Slide to preview bottle variants"
                    className="variant-range-input"
                    onChange={(e) =>
                      handleSliderChange(parseFloat(e.target.value))
                    }
                    onPointerUp={() => commitSliderSnap(sliderValue)}
                    onBlur={() => commitSliderSnap(sliderValue)}
                  />
                </div>

                <div
                  className="variant-stops"
                  role="radiogroup"
                  aria-label="Select flask finish"
                >
                  {FINISH_ORDER.map((key) => {
                    const meta = FINISH_META[key];
                    const isActive = finish === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        className={`swatch-btn${isActive ? ' is-active' : ''}`}
                        data-finish={key}
                        aria-checked={isActive}
                        aria-label={`${meta.name} finish`}
                        onClick={() => selectFinish(key)}
                      >
                        <span
                          className="swatch-dot"
                          style={{ background: meta.dot }}
                        />
                        <span className="swatch-label">{meta.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Pinned 4-Angle Environmental Showcase */}
        <section id="showcase" ref={showcaseRef} className="showcase-pin">
          <div className="showcase-viewport" id="showcase-viewport">
            <div className="showcase-frames" id="showcase-frames">
              {SHOWCASE_STAGES.map((stage, i) => (
                <figure
                  key={stage.src}
                  ref={(el: HTMLElement | null) => {
                    frameRefs.current[i] = el;
                  }}
                  className={`showcase-frame${i === 0 ? ' is-active' : ''}`}
                  data-index={i}
                >
                  <img
                    src={stage.src}
                    alt={stage.alt}
                    className="showcase-img"
                  />
                </figure>
              ))}
            </div>

            <div className="showcase-hud">
              <div
                className={`showcase-caption${captionBlur ? ' is-blurring' : ''}`}
                id="showcase-caption"
              >
                <h2 className="caption-title" id="caption-title">
                  {SHOWCASE_STAGES[activeStage].title}
                </h2>
                <p className="caption-sub" id="caption-sub">
                  {SHOWCASE_STAGES[activeStage].sub}
                </p>
              </div>

              <div
                className="showcase-dots"
                role="tablist"
                aria-label="Showcase angles"
              >
                {SHOWCASE_STAGES.map((stage, i) => (
                  <button
                    key={stage.title}
                    type="button"
                    role="tab"
                    aria-selected={activeStage === i}
                    className={`stage-dot${activeStage === i ? ' is-active' : ''}`}
                    aria-label={`Angle ${i + 1}`}
                    onClick={() => selectStage(i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: Interactive Thermal Comparison Slider */}
        <section id="thermal" className="thermal-section">
          <div className="container thermal-grid">
            <div
              className="comparison-wrap"
              ref={compWrapRef}
              id="comparison-wrap"
              onPointerDown={handleCompPointerDown}
              onPointerMove={handleCompPointerMove}
              onPointerUp={handleCompPointerUp}
              onPointerCancel={handleCompPointerUp}
            >
              <div className="comparison-layer comparison-hot">
                <img
                  src="https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-thermal-hot.webp"
                  alt="Material Flask in warm alpine sunrise light"
                  className="comparison-img"
                />
              </div>

              <div
                className="comparison-layer comparison-cold"
                id="comparison-cold"
                style={{
                  clipPath: `inset(0 ${100 - splitPct}% 0 0)`,
                  transition: splitAnimate
                    ? 'clip-path 380ms var(--ease-out)'
                    : 'none',
                }}
              >
                <img
                  src="https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-thermal-cold.webp"
                  alt="Material Flask dry on frost-covered alpine ledge in sub-zero air"
                  className="comparison-img"
                />
              </div>

              <div
                className={`comparison-handle${
                  splitPct <= 2 || splitPct >= 98 ? ' is-edge' : ''
                }`}
                id="comparison-handle"
                role="slider"
                tabIndex={0}
                aria-label="Compare cold and hot insulation"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(splitPct)}
                style={{
                  left: `clamp(22px, ${splitPct}%, calc(100% - 22px))`,
                  transition: splitAnimate
                    ? 'left 380ms var(--ease-out)'
                    : 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') updateSplit(splitPct - 8, true);
                  if (e.key === 'ArrowRight') updateSplit(splitPct + 8, true);
                }}
              >
                <div className="handle-line" />
                <div className="handle-knob">
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 256 256"
                    fill="none"
                    aria-hidden="true"
                  >
                    <polyline
                      points="176 144 208 176 176 208"
                      stroke="currentColor"
                      strokeWidth="20"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <line
                      x1="48"
                      y1="176"
                      x2="208"
                      y2="176"
                      stroke="currentColor"
                      strokeWidth="20"
                      strokeLinecap="round"
                    />
                    <polyline
                      points="80 112 48 80 80 48"
                      stroke="currentColor"
                      strokeWidth="20"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <line
                      x1="208"
                      y1="80"
                      x2="48"
                      y2="80"
                      stroke="currentColor"
                      strokeWidth="20"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="thermal-copy">
              <h2 className="section-title">Icy cold or piping hot.</h2>
              <p className="section-sub">
                Thick double-wall steel keeps water icy for 24 hours and morning
                coffee steaming for 12, while the outside stays completely dry.
              </p>

              <div
                className="segmented-control"
                role="tablist"
                aria-label="Thermal performance"
              >
                <button
                  type="button"
                  role="tab"
                  className={`seg-btn${splitPct >= 98 ? ' is-active' : ''}`}
                  aria-selected={splitPct >= 98}
                  onClick={() => updateSplit(100, true)}
                >
                  24h Cold
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`seg-btn${splitPct <= 2 ? ' is-active' : ''}`}
                  aria-selected={splitPct <= 2}
                  onClick={() => updateSplit(0, true)}
                >
                  12h Hot
                </button>
              </div>

              <div className="thermal-metrics">
                <div className="metric-item">
                  <span className="metric-value">4°C</span>
                  <span className="metric-label">Cold retention</span>
                </div>
                <div className="metric-item">
                  <span className="metric-value">85°C</span>
                  <span className="metric-label">Heat retention</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: Asymmetric 3-Tile Editorial Bento */}
        <section id="craft" className="bento-section">
          <div className="container">
            <div className="section-header-stack">
              <h2 className="section-title">Engineered to endure.</h2>
            </div>

            <div className="bento-grid" ref={bentoGridRef}>
              <article className="bento-tile bento-tall reveal-tile">
                <img
                  src="https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-bento-lid.webp"
                  alt="Close-up of threaded black chug cap and brushed steel neck"
                  className="bento-img"
                />
                <div className="bento-footer">
                  <h3 className="bento-title">Leakproof Chug Lid</h3>
                  <p className="bento-sub">
                    Dual-threaded seal with integrated carry loop
                  </p>
                </div>
              </article>

              <article className="bento-tile bento-top reveal-tile">
                <img
                  src="https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-bento-sunny.webp"
                  alt="Matte olive-sage green powder coat resting on sunlit trail timber"
                  className="bento-img"
                />
                <div className="bento-footer">
                  <h3 className="bento-title">Powder Coat</h3>
                  <p className="bento-sub">
                    Tactile matte grip that never slips wet
                  </p>
                </div>
              </article>

              <article className="bento-tile bento-bottom reveal-tile">
                <canvas
                  ref={specsCanvasRef}
                  id="specs-gl-canvas"
                  className="specs-canvas"
                  aria-hidden="true"
                />
                <div className="bento-footer bento-footer-specs">
                  <div>
                    <h3 className="bento-title">950 ml</h3>
                    <p className="bento-sub">520 g empty weight</p>
                  </div>
                  <span className="spec-badge">18/8 Steel</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* SECTION 5: Interactive Finish & Size Configurator + Order */}
        <section id="order" className="order-section">
          <div className="container order-grid">
            <div className="order-preview" id="order-preview">
              <div className="order-plinth" aria-hidden="true" />
              <img
                src="https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-order-cutout.webp"
                alt="Configured Material Flask three-quarter preview"
                className="order-flask-img"
                id="order-flask-img"
                data-finish={finish}
                width={519}
                height={940}
                style={{ transform: `scale(${activeScale})` }}
              />
            </div>

            <div className="order-panel">
              <h2 className="section-title">Material Flask</h2>
              <p className="order-price" id="order-price">
                ${price}
              </p>

              <div className="config-group">
                <span className="config-label">Finish</span>
                <div className="option-row" id="order-finish-row">
                  {(Object.keys(FINISH_META) as FinishId[]).map((key) => {
                    const meta = FINISH_META[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`pill-option${
                          finish === key ? ' is-active' : ''
                        }`}
                        onClick={() => selectFinish(key)}
                      >
                        <span
                          className="dot"
                          style={{ background: meta.dot }}
                        />
                        {meta.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="config-group">
                <span className="config-label">Capacity</span>
                <div className="option-row" id="order-size-row">
                  {SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.size}
                      type="button"
                      className={`pill-option${
                        size === opt.size ? ' is-active' : ''
                      }`}
                      onClick={() => {
                        selectSize(opt.size, opt.price);
                      }}
                    >
                      {opt.size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="spec-list">
                <div className="spec-row">
                  <span className="spec-key">Insulation</span>
                  <span className="spec-val">24h cold, 12h hot</span>
                </div>
                <div className="spec-row">
                  <span className="spec-key">Steel</span>
                  <span className="spec-val">18/8 pro-grade double wall</span>
                </div>
                <div className="spec-row">
                  <span className="spec-key">Warranty</span>
                  <span className="spec-val">Lifetime replacement</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-full magnetic-btn"
                id="add-to-bag-btn"
                onClick={addToBag}
              >
                <span className="btn-label" id="add-to-bag-label">
                  Add to Bag - ${price}
                </span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <span className="footer-brand">Material</span>
          <span className="footer-tag">Built for altitude.</span>
          <span className="footer-copy">© 2026 Material</span>
        </div>
      </footer>

      {/* Slide-Over Order Bag Drawer */}
      <div
        className="drawer-backdrop"
        id="drawer-backdrop"
        hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        className="bag-drawer"
        id="bag-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        hidden={!drawerOpen}
      >
        <div className="drawer-header">
          <h2 id="drawer-title" className="drawer-title">
            Bag
          </h2>
          <button
            type="button"
            className="icon-btn"
            id="drawer-close"
            aria-label="Close bag"
            onClick={() => setDrawerOpen(false)}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 256 256"
              fill="none"
              aria-hidden="true"
            >
              <line
                x1="200"
                y1="56"
                x2="56"
                y2="200"
                stroke="currentColor"
                strokeWidth="20"
                strokeLinecap="round"
              />
              <line
                x1="200"
                y1="200"
                x2="56"
                y2="56"
                stroke="currentColor"
                strokeWidth="20"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="drawer-body" id="drawer-body">
          <div className="drawer-empty" id="drawer-empty" hidden={bag.length > 0}>
            <p>Your bag is empty.</p>
            <a
              href="#order"
              className="btn btn-primary btn-sm"
              id="drawer-empty-cta"
              onClick={() => setDrawerOpen(false)}
            >
              Select Flask
            </a>
          </div>

          <div className="drawer-items" id="drawer-items" hidden={bag.length === 0}>
            {bag.map((item, idx) => (
              <div key={`${item.finish}-${item.size}`} className="bag-item">
                <img
                  src="https://www.gstatic.com/aistudio/starter-apps/flask-applet/flask-order-cutout.webp"
                  alt="Material Flask"
                  className="bag-item-thumb"
                  data-finish={item.finish}
                />
                <div className="bag-item-info">
                  <div className="bag-item-name">Material Flask</div>
                  <div className="bag-item-meta">
                    {FINISH_META[item.finish].name} - {item.size} (${item.price})
                  </div>
                  <div className="bag-qty-row">
                    <button
                      type="button"
                      className="qty-btn"
                      aria-label="Decrease quantity"
                      onClick={() => updateBagQty(idx, -1)}
                    >
                      -
                    </button>
                    <span className="bag-qty">{item.qty}</span>
                    <button
                      type="button"
                      className="qty-btn"
                      aria-label="Increase quantity"
                      onClick={() => updateBagQty(idx, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-footer" id="drawer-footer" hidden={bag.length === 0}>
          <div className="drawer-total-row">
            <span>Total</span>
            <span className="drawer-total" id="drawer-total">
              ${totalPrice}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-full"
            id="checkout-btn"
            disabled={checkedOut}
            onClick={handleCheckout}
          >
            {checkedOut ? 'Order Confirmed' : 'Checkout'}
          </button>
        </div>
      </aside>
    </>
  );
}
