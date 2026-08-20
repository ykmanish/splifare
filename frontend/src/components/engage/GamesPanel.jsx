'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Coffee, Dices, Info, Plus, Scale, Sparkles, Trophy, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Field';
import { Badge, Card, EmptyState } from '@/components/ui/Bits';
import { Pills } from '@/components/ui/Controls';
import { ConfettiLayer, useConfetti } from '@/lib/confetti';
import { money, firstName } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

/**
 * Three games, and deliberately three *different* games.
 *
 * What was here before was one mechanic — pick a random name — behind three
 * buttons with different labels. Relabelling randomness is not a second game;
 * everybody works that out on the third tap and stops pressing.
 *
 * So each of these decides something differently:
 *
 *  · **Spin** is flat chance. Everyone equal, no memory, no maths. The wheel
 *    is the point.
 *  · **Fair pick** is weighted by who is behind — the person the ledger says
 *    has been fronting least is likeliest to be picked. The odds are shown
 *    *before* the spin, because a weighted draw that hides its weights is
 *    just a rigged one.
 *  · **Roulette** picks two things at once — who, and what — so it produces a
 *    decision rather than a name.
 */

const EASE_OUT = [0.12, 0.72, 0.16, 1];

/**
 * The wheel carries its own palette instead of the theme's.
 *
 * Two things went wrong when it used tokens. In dark mode the pastels are
 * 25%-alpha washes — they exist to tint a dark *surface*, and as opaque pie
 * fills they came out as mud. And `var(--ink)` is not a variable at all:
 * Tailwind v4 exposes `--color-ink`, so the SVG `fill` silently fell back to
 * black, which is invisible on those dark segments.
 *
 * A game board should look the same whichever theme you are in, so these are
 * fixed values with a fixed ink chosen to contrast against them — the same
 * reasoning as `--hero-card`, which is deliberately light in both themes and
 * carries its own dark text.
 */
const WHEEL_COLORS = ['#d9cff8', '#c2e7d4', '#f8e5a2', '#c9ddfb', '#f9d2dd', '#fad5b7'];
const WHEEL_INK = '#0b0c0d';
const WHEEL_EDGE = '#ffffff';

const DEFAULT_TREATS = ['coffee', 'dessert', 'the tip', 'chai', 'ice cream', 'the cab home'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Resolve when the animation finishes, or when its time is up — whichever
 * comes first.
 *
 * The winner is drawn before the wheel starts moving, so the announcement is
 * never waiting on a decision, only on a flourish. Without this the flourish
 * can hold it hostage: animation frames stop entirely in a background tab, so
 * switching away mid-spin leaves the button reading "Deciding" indefinitely.
 */
const noLaterThan = (animation, ms) =>
  Promise.race([animation, new Promise((resolve) => setTimeout(resolve, ms))]);

/* ------------------------------------------------------------------ wheel */

const point = (angle, r) => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
};

/** A pie slice from `a1` to `a2` degrees, clockwise from twelve o'clock. */
function slicePath(a1, a2, r) {
  const [x1, y1] = point(a1, r);
  const [x2, y2] = point(a2, r);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M 0 0 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

function Wheel({ people, controls, size = 240 }) {
  const r = size / 2 - 6;
  const seg = 360 / Math.max(1, people.length);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {/*
       * The pointer sits outside the rotating group so it stays at the top.
       *
       * Drawn rather than built from CSS borders because it needs an outline:
       * it was `var(--panel)`, which is near-black in *both* themes, so in dark
       * mode it was a black arrow on a black card. Dark fill plus a light
       * stroke reads against the pastel wheel and either background.
       */}
      <svg
        aria-hidden
        width="20"
        height="17"
        viewBox="0 0 20 17"
        className="absolute left-1/2 top-[-3px] z-10 -translate-x-1/2"
      >
        <path
          d="M10 16 L1.5 1.5 L18.5 1.5 Z"
          fill={WHEEL_INK}
          stroke={WHEEL_EDGE}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      <motion.svg
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        width={size}
        height={size}
        animate={controls}
        style={{ originX: '50%', originY: '50%' }}
        className="drop-shadow-[0_6px_20px_rgba(0,0,0,0.10)]"
      >
        {people.map((p, i) => {
          const a1 = i * seg;
          const a2 = (i + 1) * seg;
          const mid = a1 + seg / 2;
          const [tx, ty] = point(mid, r * 0.62);
          return (
            <g key={p.id}>
              <path
                d={slicePath(a1, a2, r)}
                fill={WHEEL_COLORS[i % WHEEL_COLORS.length]}
                stroke={WHEEL_EDGE}
                strokeWidth="1.5"
              />
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid} ${tx} ${ty})`}
                className="newq"
                style={{ fontSize: people.length > 6 ? 9 : 11, fill: WHEEL_INK }}
              >
                {firstName(p.name).slice(0, 9)}
              </text>
            </g>
          );
        })}
        <circle r="17" fill={WHEEL_EDGE} />
        <circle r="17" fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
      </motion.svg>
    </div>
  );
}

/* ------------------------------------------------------------ slot reel */

function Reel({ items, target, spinning, duration = 1.6 }) {
  /*
   * Only the *flicker* is state. What the reel shows when it is standing still
   * is derived from the props, so settling on the result needs no write at
   * all — which keeps the whole animation out of the render path except while
   * it is actually running.
   */
  const [flicker, setFlicker] = useState(null);
  const timerRef = useRef(null);
  const shown = spinning && flicker !== null ? flicker : (target ?? items[0]);

  useEffect(() => {
    if (!spinning || prefersReducedMotion()) return undefined;

    let i = 0;
    let delay = 55;
    const step = () => {
      i += 1;
      setFlicker(items[i % items.length]);
      /* Ease the flicker out rather than stopping dead — the deceleration is
         what makes a reel read as a reel. */
      delay *= 1.12;
      if (delay < duration * 420) timerRef.current = setTimeout(step, delay);
      else setFlicker(null);
    };
    timerRef.current = setTimeout(step, delay);
    return () => clearTimeout(timerRef.current);
  }, [spinning, items, duration]);

  return (
    <span className="relative block h-9 overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={String(shown)}
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -22, opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="newq absolute inset-x-0 block truncate text-center text-[22px] leading-9 text-ink"
        >
          {shown}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------ page */

const GAMES = [
  { id: 'spin', label: 'Spin' },
  { id: 'fair', label: 'Fair pick' },
  { id: 'roulette', label: 'Roulette' },
];

export default function GamesPanel({ group, members, me, nets, currency, onSettle }) {
  const { toast } = useToast();
  const { canvasRef, fire } = useConfetti();
  const controls = useAnimationControls();

  const [game, setGame] = useState('spin');
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [treat, setTreat] = useState(null);
  /*
   * Read straight from storage in the initialiser rather than syncing it in
   * afterwards. There is no hydration hazard: this panel is only ever mounted
   * by a tab press, so its first render is always a client render — the server
   * never produces markup for it to disagree with.
   */
  const [treats, setTreats] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_TREATS;
    try {
      const raw = window.localStorage.getItem(`splitta.treats.${group.id}`);
      const saved = raw ? JSON.parse(raw) : null;
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_TREATS;
    } catch {
      return DEFAULT_TREATS;
    }
  });
  const [newTreat, setNewTreat] = useState('');
  const [showOdds, setShowOdds] = useState(false);
  const rotationRef = useRef(0);

  const saveTreats = useCallback(
    (next) => {
      const clean = [...new Set(next.map((t) => t.trim()).filter(Boolean))].slice(0, 14);
      setTreats(clean.length ? clean : DEFAULT_TREATS);
      try {
        localStorage.setItem(`splitta.treats.${group.id}`, JSON.stringify(clean));
      } catch {
        /* private mode */
      }
    },
    [group.id],
  );

  /**
   * Odds for the fair pick.
   *
   * `net` is positive when the group owes you — you have fronted more than
   * your share. So "behind" is distance below the person who has fronted the
   * most, and the further behind you are, the likelier you are to be picked.
   *
   * The floor matters as much as the tilt. At `FLOOR` the luckiest person
   * still carries a quarter of the top weight, so nobody is ever mathematically
   * safe — a draw you cannot lose is one nobody bothers watching. And when
   * everyone is square the range collapses to zero and this degrades to a flat
   * uniform draw, which is the correct answer for a settled group.
   */
  const odds = useMemo(() => {
    const FLOOR = 0.25;
    const rows = members.map((p) => ({ person: p, net: nets[p.id] ?? 0 }));
    const ahead = Math.max(...rows.map((r) => r.net));
    const range = ahead - Math.min(...rows.map((r) => r.net));

    const weighted = rows.map((r) => ({
      ...r,
      weight: range > 0.01 ? FLOOR + (1 - FLOOR) * ((ahead - r.net) / range) : 1,
    }));
    const total = weighted.reduce((a, w) => a + w.weight, 0) || 1;

    return weighted
      .map((w) => ({ ...w, pct: (w.weight / total) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  }, [members, nets]);

  function pickWeighted() {
    const total = odds.reduce((a, o) => a + o.weight, 0);
    let roll = Math.random() * total;
    for (const o of odds) {
      roll -= o.weight;
      if (roll <= 0) return o.person;
    }
    return odds[odds.length - 1]?.person;
  }

  const announce = useCallback(
    (person, detail) => {
      setWinner(person);
      setSpinning(false);
      fire({ count: 100, spread: 8 });
      toast({ title: `${firstName(person.name)} it is`, description: detail });
    },
    [fire, toast],
  );

  async function spinWheel() {
    if (spinning || members.length < 2) return;
    setSpinning(true);
    setWinner(null);
    setTreat(null);

    const index = Math.floor(Math.random() * members.length);
    const seg = 360 / members.length;
    /* Land the chosen segment's centre under the pointer, after a few whole
       turns. Rotation only ever increases so the wheel never spins backwards
       between rounds. */
    const turns = 4 + Math.floor(Math.random() * 3);
    const target = 360 * turns - (index * seg + seg / 2);
    const next = rotationRef.current + ((target - (rotationRef.current % 360)) + 360) % 360 + 360 * turns;
    rotationRef.current = next;

    const duration = prefersReducedMotion() ? 0 : 3.4;
    await noLaterThan(
      controls.start({ rotate: next, transition: { duration, ease: EASE_OUT } }),
      duration * 1000 + 300,
    );
    announce(members[index], 'The wheel decided. No appeals.');
  }

  async function fairPick() {
    if (spinning || members.length < 2) return;
    setSpinning(true);
    setWinner(null);
    setTreat(null);
    const chosen = pickWeighted();
    /* A short pause so the reel has something to show — instant results read
       as a broken button rather than a fast one. */
    await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 0 : 1500));
    announce(chosen, 'Weighted by who the ledger says is behind.');
  }

  async function rollRoulette() {
    if (spinning || members.length < 2) return;
    setSpinning(true);
    setWinner(null);
    const person = members[Math.floor(Math.random() * members.length)];
    const item = treats[Math.floor(Math.random() * treats.length)];
    await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 0 : 1700));
    setTreat(item);
    announce(person, `Buys ${item}.`);
  }

  const run = { spin: spinWheel, fair: fairPick, roulette: rollRoulette }[game];
  const reelNames = members.map((m) => firstName(m.name));

  if (members.length < 2) {
    return (
      <Card tone="soft" pad={false}>
        <EmptyState
          icon={Dices}
          title="Games need a group"
          body="Add at least one more person and the wheel, the fair pick and the roulette all open up."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Pills options={GAMES} value={game} onChange={(v) => { setGame(v); setWinner(null); setTreat(null); }} />

      <Card tone="white" pad={false} className="relative overflow-hidden p-5">
        <ConfettiLayer canvasRef={canvasRef} />

        {game === 'spin' && (
          <div className="relative z-0">
            <p className="newq mb-4 text-center text-[13px] text-ink-3">
              Everyone equal. The wheel picks who pays.
            </p>
            <Wheel people={members} controls={controls} />
          </div>
        )}

        {game === 'fair' && (
          <div className="relative z-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="newq text-[13px] text-ink-3">Weighted by who owes most</p>
              <button
                type="button"
                onClick={() => setShowOdds((v) => !v)}
                className="newq flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] text-ink-2 tap"
              >
                <Info size={11} strokeWidth={2.5} />
                {showOdds ? 'Hide odds' : 'Show odds'}
              </button>
            </div>

            <div className="mx-auto grid size-[132px] place-items-center rounded-full bg-mint">
              <Coffee size={44} strokeWidth={1.9} className="text-ink" />
            </div>

            <div className="mt-4">
              <Reel items={reelNames} target={winner ? firstName(winner.name) : null} spinning={spinning} />
            </div>

            <AnimatePresence>
              {showOdds && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-1.5 overflow-hidden"
                >
                  {odds.map((o) => (
                    <div key={o.person.id} className="flex items-center gap-2.5">
                      <Avatar person={o.person} size="xs" />
                      <span className="newq w-16 shrink-0 truncate text-[12px] text-ink-2">
                        {firstName(o.person.name)}
                      </span>
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <motion.span
                          initial={{ width: 0 }}
                          animate={{ width: `${o.pct}%` }}
                          transition={{ duration: 0.5, ease: EASE_OUT }}
                          className="block h-full rounded-full bg-brand"
                        />
                      </span>
                      <span className="num w-9 shrink-0 text-right text-[11px] text-ink-3">
                        {Math.round(o.pct)}%
                      </span>
                    </div>
                  ))}
                  <p className="newq pt-1 text-[11px] leading-snug text-ink-3">
                    Everyone keeps a real chance — the weights tilt the draw, they do not decide it.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {game === 'roulette' && (
          <div className="relative z-0">
            <p className="newq mb-4 text-center text-[13px] text-ink-3">Who buys what</p>
            <div className="space-y-1.5 rounded-[20px] bg-surface-2 px-4 py-4">
              <Reel items={reelNames} target={winner ? firstName(winner.name) : null} spinning={spinning} />
              <p className="newq text-center text-[12px] text-ink-3">buys</p>
              <Reel items={treats} target={treat} spinning={spinning} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {treats.map((t) => (
                <span
                  key={t}
                  className="group inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1.5 text-[12px] text-ink-2"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ${t}`}
                    onClick={() => saveTreats(treats.filter((x) => x !== t))}
                    className="grid size-4 place-items-center rounded-full text-ink-3 tap hover:bg-surface hover:text-neg"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                </span>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTreat.trim()) return;
                saveTreats([...treats, newTreat]);
                setNewTreat('');
              }}
              className="mt-2.5 flex gap-2"
            >
              <Input
                value={newTreat}
                placeholder="Add a treat"
                containerClass="min-w-0 flex-1"
                onChange={(e) => setNewTreat(e.target.value)}
              />
              <Button size="md" icon={Plus} square type="submit" disabled={!newTreat.trim()} aria-label="Add treat" />
            </form>
          </div>
        )}

        <Button
          block
          size="lg"
          className="relative z-0 mt-5"
          icon={game === 'spin' ? Sparkles : game === 'fair' ? Scale : Dices}
          loading={spinning}
          onClick={run}
        >
          {spinning ? 'Deciding' : game === 'spin' ? 'Spin the wheel' : game === 'fair' ? 'Pick fairly' : 'Roll'}
        </Button>
      </Card>

      <AnimatePresence>
        {winner && !spinning && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
          >
            <Card tone="brand" className="flex items-center gap-4">
              <Avatar person={winner} size="lg" ring />
              <div className="min-w-0 flex-1">
                <p className="newq flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.08em] text-on-brand/70">
                  <Trophy size={12} strokeWidth={2.6} />
                  {game === 'roulette' ? 'Roulette' : game === 'fair' ? 'Fair pick' : 'The wheel'}
                </p>
                <p className="newq mt-1 truncate text-[21px] leading-tight text-on-brand">
                  {winner.id === me.id ? 'You' : firstName(winner.name)}
                  {treat ? ` buy${winner.id === me.id ? '' : 's'} ${treat}` : ''}
                </p>
                {game === 'fair' && nets[winner.id] < -0.01 && (
                  <p className="newq mt-1 text-[12px] text-on-brand/70">
                    Currently behind by {money(Math.abs(nets[winner.id]), currency, { compact: true })}
                  </p>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {winner && !spinning && onSettle && (
        <Button block variant="soft" onClick={() => onSettle(winner)}>
          Record what {winner.id === me.id ? 'you' : firstName(winner.name)} paid
        </Button>
      )}
    </div>
  );
}
