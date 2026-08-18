'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { Camera, CameraOff, Loader2 } from 'lucide-react';
import Button from './Button';

/**
 * Live camera QR scanner.
 *
 * Two decoders, in order of preference:
 *
 *  1. `BarcodeDetector`, the platform API — native speed, no download. Present
 *     on Android Chrome and some desktop builds.
 *  2. `jsQR`, loaded on demand. iOS Safari has no BarcodeDetector at all, and
 *     that is most of the phones this app runs on, so the fallback is the path
 *     that actually matters. Imported dynamically so its ~30KB stays out of
 *     the main bundle until someone taps Scan.
 *
 * The camera track is stopped on every exit path. A stream left running keeps
 * the hardware light on, which reads as the app spying on you.
 */

const STATES = {
  starting: 'starting',
  scanning: 'scanning',
  denied: 'denied',
  missing: 'missing',
  busy: 'busy',
  unsupported: 'unsupported',
  failed: 'failed',
};

/** getUserMedia only exists in a secure context, so http:// hosts get nothing. */
const cameraAvailable = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/* The check is client-only, so the server renders as if unsupported and the
   client agrees on its hydrating pass. Same shape as CodeBox's share button. */
const subscribeNever = () => () => {};
const onClient = () => true;
const onServer = () => false;

function stateFor(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return STATES.denied;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return STATES.missing;
    case 'NotReadableError':
    case 'AbortError':
      return STATES.busy;
    default:
      return STATES.failed;
  }
}

const MESSAGES = {
  [STATES.denied]: {
    title: 'Camera access blocked',
    body: 'Allow camera for this site in your browser settings, then try again.',
  },
  [STATES.missing]: { title: 'No camera found', body: 'This device has no camera to scan with.' },
  [STATES.busy]: {
    title: 'Camera is busy',
    body: 'Another app or tab is using it. Close that and try again.',
  },
  [STATES.unsupported]: {
    title: 'Scanning needs a secure connection',
    body: 'Cameras only work over HTTPS. Type the code in instead.',
  },
  [STATES.failed]: { title: 'Could not start the camera', body: 'Type the code in instead.' },
};

export default function QrScanner({ active, onResult, onCancel, className = '' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [state, setState] = useState(STATES.starting);
  /** Guards against firing onResult twice for the same scan. */
  const doneRef = useRef(false);
  const [attempt, setAttempt] = useState(0);

  const mounted = useSyncExternalStore(subscribeNever, onClient, onServer);
  const supported = mounted && cameraAvailable();

  useEffect(() => {
    // Derived rather than set: an unsupported browser needs no state change,
    // just a different thing rendered.
    if (!active || !supported) return undefined;

    let stopped = false;
    let stream = null;
    let raf = 0;
    let detector = null;
    let decodeFallback = null;
    doneRef.current = false;

    const release = () => {
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    const succeed = (text) => {
      if (doneRef.current || !text) return;
      doneRef.current = true;
      release();
      onResult?.(text);
    };

    (async () => {
      try {
        // The rear camera is the one pointed at a screen or a poster.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) return release();

        const video = videoRef.current;
        if (!video) return release();

        video.srcObject = stream;
        // muted + playsInline are what let iOS autoplay an inline video.
        await video.play().catch(() => {});
        if (stopped) return release();

        if ('BarcodeDetector' in window) {
          try {
            const formats = await window.BarcodeDetector.getSupportedFormats();
            if (formats.includes('qr_code')) {
              detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            }
          } catch {
            detector = null;
          }
        }
        if (!detector) {
          const mod = await import('jsqr');
          decodeFallback = mod.default || mod;
        }
        if (stopped) return release();

        setState(STATES.scanning);

        let tick = 0;
        const scan = async () => {
          if (stopped || doneRef.current) return;
          raf = requestAnimationFrame(scan);

          // Every third frame is plenty for a code held up to a lens, and it
          // keeps a cheap phone from cooking while the sheet is open.
          if (tick++ % 3 !== 0) return;
          if (video.readyState < 2 || !video.videoWidth) return;

          try {
            if (detector) {
              const found = await detector.detect(video);
              if (found?.length) succeed(found[0].rawValue);
              return;
            }

            const canvas = canvasRef.current;
            if (!canvas) return;
            // Downscaled: jsQR is pure JS, and full sensor resolution costs
            // far more than it finds.
            const w = 320;
            const h = Math.round((video.videoHeight / video.videoWidth) * w) || 320;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, w, h);
            const { data } = ctx.getImageData(0, 0, w, h);
            const hit = decodeFallback(data, w, h, { inversionAttempts: 'dontInvert' });
            if (hit?.data) succeed(hit.data);
          } catch {
            /* a single bad frame is not worth tearing the camera down for */
          }
        };

        raf = requestAnimationFrame(scan);
      } catch (err) {
        if (!stopped) setState(stateFor(err));
        release();
      }
    })();

    return () => {
      stopped = true;
      release();
    };
  }, [active, attempt, onResult, supported]);

  if (!active) return null;

  const shown = mounted && !supported ? STATES.unsupported : state;
  const problem = MESSAGES[shown];

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-[20px] bg-panel" style={{ aspectRatio: '1 / 1' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Camera preview"
          className={`size-full object-cover transition-opacity duration-300
            ${shown === STATES.scanning ? 'opacity-100' : 'opacity-0'}`}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Reticle: four corners, so the frame reads without hiding the view. */}
        {shown === STATES.scanning && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative size-[62%]">
              {[
                'left-0 top-0 border-l-3 border-t-3 rounded-tl-[10px]',
                'right-0 top-0 border-r-3 border-t-3 rounded-tr-[10px]',
                'bottom-0 left-0 border-b-3 border-l-3 rounded-bl-[10px]',
                'bottom-0 right-0 border-b-3 border-r-3 rounded-br-[10px]',
              ].map((pos) => (
                <span key={pos} className={`absolute size-8 border-brand ${pos}`} />
              ))}
              <motion.span
                aria-hidden
                initial={{ top: '4%' }}
                animate={{ top: ['4%', '92%', '4%'] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-x-2 h-0.5 rounded-full bg-brand/70"
              />
            </div>
          </div>
        )}

        {shown === STATES.starting && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="flex flex-col items-center gap-2 text-white/70">
              <Loader2 size={22} className="animate-spin" />
              <span className="newq text-[12.5px]">Starting the camera…</span>
            </span>
          </div>
        )}

        {problem && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <span className="flex flex-col items-center">
              <span className="grid size-12 place-items-center rounded-full bg-white/14 text-white">
                <CameraOff size={22} strokeWidth={2.1} />
              </span>
              <span className="newq mt-3 text-[15px] text-white">{problem.title}</span>
              <span className="newq mt-1 text-[12.5px] text-white/60">{problem.body}</span>
            </span>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex gap-2.5">
        <Button variant="soft" size="sm" className="flex-1" onClick={onCancel}>
          Type it instead
        </Button>
        {problem && shown !== STATES.unsupported && shown !== STATES.missing && (
          <Button
            variant="dark"
            size="sm"
            icon={Camera}
            className="flex-1"
            onClick={() => {
              setState(STATES.starting);
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </Button>
        )}
      </div>

      {shown === STATES.scanning && (
        <p className="newq mt-2 px-1.5 text-center text-[12px]">
          Point it at a Splitta room-code QR
        </p>
      )}
    </div>
  );
}
