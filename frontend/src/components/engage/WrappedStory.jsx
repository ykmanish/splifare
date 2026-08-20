'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  PartyPopper,
  Rabbit,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { Card, EmptyState } from '@/components/ui/Bits';
import { ConfettiLayer, useConfetti } from '@/lib/confetti';
import { buildWrapped, monthLabel, monthsWithData, shiftMonth } from '@/lib/engage';
import { money, firstName } from '@/lib/format';
import { categoryOf } from '@/lib/categories';
import { useToast } from '@/components/ui/Toast';

/**
 * The month in review.
 *
 * The version this replaces was a four-row table of all-time totals under a
 * heading that said "Monthly" — it could not be moved off the current month
 * and it was not monthly. This one is scoped to a month you can step through,
 * and it is built as *cards you swipe*, because that format is the entire
 * reason a Wrapped gets shown to other people.
 *
 * Every number counts up from zero on reveal. That is not decoration: an
 * animated figure is read, and a static one in a stack of five is skipped.
 */

const EASE = [0.16, 1, 0.3, 1];

const COUNT_MS = 900;

/**
 * A figure that counts up when its card lands.
 *
 * The animation is an enhancement and is treated as one, because the thing
 * being animated is money. `requestAnimationFrame` does not fire at all in a
 * background tab, so a naive counter that starts at zero and waits to be
 * driven upward will sit there reading "₹0" for as long as the tab stays
 * hidden — a wrong figure, not merely a still one.
 *
 * Hence two guards: the count only starts from zero if the document is
 * actually visible and motion is wanted, and a timer settles it regardless if
 * the frame loop never arrives.
 */
function CountUp({ value, currency, compact = false, className = '' }) {
  const reduced = useReducedMotion();
  /* The *fraction* of the way through, not the formatted string — so the
     settled figure stays derived from the real value. */
  const [progress, setProgress] = useState(() =>
    reduced || typeof document === 'undefined' || document.hidden ? 1 : 0,
  );

  useEffect(() => {
    if (reduced || !value || document.hidden) return undefined;

    let frame = 0;
    let start = 0;

    const tick = (now) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / COUNT_MS);
      /* Ease-out cubic: quick enough to read as a count, slow enough at the
         end that the final figure registers rather than snapping past. */
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    /* If the tab is hidden mid-count the frames stop; land on the real figure
       anyway rather than freezing part-way up. */
    const settle = setTimeout(() => setProgress(1), COUNT_MS + 250);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [value, reduced]);

  return <span className={className}>{money(value * progress, currency, { compact })}</span>;
}

function Slide({ children, tone = 'panel', className = '' }) {
  return (
    <Card
      tone={tone}
      pad={false}
      className={`flex min-h-[300px] w-full flex-col justify-between p-6 ${className}`}
    >
      {children}
    </Card>
  );
}

const Kicker = ({ icon: Icon, children, dim = false }) => (
  <span
    className={`newq flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.09em] ${
      dim ? 'text-white/55' : 'text-ink-3'
    }`}
  >
    {Icon && <Icon size={13} strokeWidth={2.4} />}
    {children}
  </span>
);

/** The cards, built from the wrapped payload. Empty slots are dropped. */
function buildSlides(w, currency, group) {
  const slides = [];

  slides.push({
    id: 'total',
    render: () => (
      <Slide tone="panel">
        <Kicker icon={Sparkles} dim>
          {w.label}
        </Kicker>
        <div>
          <p className="newq text-[15px] leading-snug text-white/70">
            {group.name} spent
          </p>
          <CountUp
            value={w.total}
            currency={currency}
            className="num mt-1 block text-[44px] leading-none text-white"
          />
          <p className="newq mt-3 text-[13.5px] leading-snug text-white/70">
            across {w.count} {w.count === 1 ? 'bill' : 'bills'}
            {w.average > 0 && ` · ${money(w.average, currency, { compact: true })} a bill on average`}
          </p>
        </div>
        {w.changePct === null ? (
          <p className="newq text-[12.5px] text-white/55">First month on the books</p>
        ) : (
          <span className="newq inline-flex w-fit items-center gap-1.5 rounded-full bg-white/14 px-3 py-1.5 text-[12.5px] text-white">
            {w.changePct > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(Math.round(w.changePct))}% {w.changePct > 0 ? 'up on' : 'down on'}{' '}
            {monthLabel(shiftMonth(w.month, -1))}
          </span>
        )}
      </Slide>
    ),
  });

  if (w.topCategory) {
    const cat = categoryOf(w.topCategory.id);
    slides.push({
      id: 'category',
      render: () => (
        <Slide tone="butter">
          <Kicker icon={Flame}>Top category</Kicker>
          <div>
            <span
              className="grid size-14 place-items-center rounded-[20px] bg-surface"
              style={{ color: cat.tint }}
            >
              <cat.icon size={26} strokeWidth={2.2} />
            </span>
            <p className="newq mt-4 text-[30px] leading-tight text-ink">{w.topCategory.label}</p>
            <p className="newq mt-2 text-[14px] leading-snug text-ink-3">
              {money(w.topCategory.amount, currency)} — {Math.round(w.topCategory.share)}% of
              everything spent
            </p>
          </div>
          {/* A stacked bar makes the share readable without a legend. */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-black/8">
            {w.categories.slice(0, 5).map((c) => (
              <span
                key={c.id}
                className="h-full"
                style={{ width: `${c.share}%`, background: categoryOf(c.id).tint }}
              />
            ))}
          </div>
        </Slide>
      ),
    });
  }

  if (w.topPayer?.person) {
    slides.push({
      id: 'payer',
      render: () => (
        <Slide tone="grape">
          <Kicker icon={Crown}>Paid the most</Kicker>
          <div className="flex items-center gap-4">
            <Avatar person={w.topPayer.person} size="xl" />
            <div className="min-w-0">
              <p className="newq truncate text-[26px] leading-tight text-ink">
                {firstName(w.topPayer.person.name)}
              </p>
              <CountUp
                value={w.topPayer.amount}
                currency={currency}
                className="num mt-1 block text-[17px] text-ink"
              />
            </div>
          </div>
          <p className="newq text-[13px] leading-snug text-ink-3">
            Fronting the money is its own kind of work — worth a thank you.
          </p>
        </Slide>
      ),
    });
  }

  if (w.fastestSettler?.person) {
    slides.push({
      id: 'fastest',
      render: () => (
        <Slide tone="mint">
          <Kicker icon={Rabbit}>Settled fastest</Kicker>
          <div className="flex items-center gap-4">
            <Avatar person={w.fastestSettler.person} size="xl" />
            <div className="min-w-0">
              <p className="newq truncate text-[26px] leading-tight text-ink">
                {firstName(w.fastestSettler.person.name)}
              </p>
              <p className="newq mt-1 text-[13.5px] text-ink-3">
                {w.fastestSettler.count} {w.fastestSettler.count === 1 ? 'payment' : 'payments'}, typically
                day {Math.round(w.fastestSettler.days) + 1} of the month
              </p>
            </div>
          </div>
          <p className="newq text-[13px] leading-snug text-ink-3">
            Nobody had to send a second reminder.
          </p>
        </Slide>
      ),
    });
  }

  if (w.funniest) {
    slides.push({
      id: 'funniest',
      render: () => (
        <Slide tone="blush">
          <Kicker icon={PartyPopper}>Best bill name</Kicker>
          <div>
            <p className="newq text-[28px] leading-tight text-ink">
              &ldquo;{w.funniest.description}&rdquo;
            </p>
            <p className="newq mt-3 text-[14px] text-ink-3">
              {money(w.funniest.amount, w.funniest.currency)} ·{' '}
              {new Date(w.funniest.date).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
          <p className="newq text-[13px] leading-snug text-ink-3">
            Whoever typed that: this is your award.
          </p>
        </Slide>
      ),
    });
  }

  if (w.biggest) {
    slides.push({
      id: 'biggest',
      render: () => (
        <Slide tone="sky">
          <Kicker icon={TrendingUp}>Biggest single bill</Kicker>
          <div>
            <CountUp
              value={w.biggest.amount}
              currency={w.biggest.currency}
              className="num block text-[40px] leading-none text-ink"
            />
            <p className="newq mt-3 truncate text-[18px] text-ink">{w.biggest.description}</p>
            {w.busiestDay && (
              <p className="newq mt-2 text-[13px] text-ink-3">
                Busiest day of the week was {w.busiestDay.label} —{' '}
                {money(w.busiestDay.amount, currency, { compact: true })}
              </p>
            )}
          </div>
          <span />
        </Slide>
      ),
    });
  }

  return slides;
}

export default function WrappedStory({
  group,
  expenses,
  settlements,
  currency,
  convert,
  personById,
}) {
  const { toast } = useToast();
  const { canvasRef, fire } = useConfetti();
  const months = useMemo(() => monthsWithData(expenses), [expenses]);
  const [picked, setPicked] = useState(months[0]);
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);

  /* Adding the first expense of a new month reshapes this list, so the choice
     is validated on the way out rather than corrected afterwards — the view
     can never be pointing at a month that is no longer in the list. */
  const month = months.includes(picked) ? picked : months[0];

  /* Stepping to another month starts its story at the first card. */
  const [shownMonth, setShownMonth] = useState(month);
  if (shownMonth !== month) {
    setShownMonth(month);
    setIndex(0);
  }

  const wrapped = useMemo(
    () =>
      buildWrapped({
        expenses,
        settlements,
        memberIds: group.memberIds,
        month,
        convert,
        personById,
      }),
    [expenses, settlements, group.memberIds, month, convert, personById],
  );

  const slides = useMemo(
    () => (wrapped.empty ? [] : buildSlides(wrapped, currency, group)),
    [wrapped, currency, group],
  );

  /* One burst when a month's story is opened at its last card — the payoff
     for actually swiping to the end. */
  useEffect(() => {
    if (slides.length > 1 && index === slides.length - 1) fire({ count: 70, spread: 8 });
  }, [index, slides.length, fire]);

  const monthPos = months.indexOf(month);

  async function share() {
    const lines = [
      `${group.emoji} ${group.name} — ${wrapped.label}`,
      `Total: ${money(wrapped.total, currency)} across ${wrapped.count} bills`,
      wrapped.topCategory && `Top category: ${wrapped.topCategory.label}`,
      wrapped.topPayer?.person && `Paid most: ${firstName(wrapped.topPayer.person.name)}`,
      wrapped.funniest && `Best bill name: "${wrapped.funniest.description}"`,
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: `${group.name} wrapped`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ title: 'Wrapped copied', description: 'Paste it wherever you like.' });
      }
    } catch {
      /* A cancelled share sheet is not an error. */
    }
  }

  return (
    <div className="space-y-4">
      {/* month stepper */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Earlier month"
          disabled={monthPos >= months.length - 1}
          onClick={() => setPicked(months[monthPos + 1])}
          className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink tap disabled:opacity-30"
        >
          <ChevronLeft size={17} strokeWidth={2.4} />
        </button>

        <AnimatePresence mode="wait">
          <motion.p
            key={month}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="newq text-[15px] text-ink"
          >
            {monthLabel(month, { long: true })}
          </motion.p>
        </AnimatePresence>

        <button
          type="button"
          aria-label="Later month"
          disabled={monthPos <= 0}
          onClick={() => setPicked(months[monthPos - 1])}
          className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink tap disabled:opacity-30"
        >
          <ChevronRight size={17} strokeWidth={2.4} />
        </button>
      </div>

      {wrapped.empty ? (
        <Card tone="soft" pad={false}>
          <EmptyState
            icon={Sparkles}
            title={`Nothing in ${monthLabel(month)}`}
            body="Add a bill to this month, or step back to one with spending in it."
          />
        </Card>
      ) : (
        <>
          <div className="relative">
            <ConfettiLayer canvasRef={canvasRef} />
            {/*
             * A scroll-snap track rather than a drag-driven carousel: it gets
             * native momentum, keyboard and screen-reader behaviour for free,
             * and on a phone it is the gesture people already expect.
             */}
            <div
              ref={trackRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
              }}
              className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 no-scrollbar"
            >
              {slides.map((s) => (
                <div key={s.id} className="w-full shrink-0 snap-center">
                  {s.render()}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {slides.map((s, i) => (
                <motion.span
                  key={s.id}
                  animate={{
                    width: i === index ? 18 : 6,
                    opacity: i === index ? 1 : 0.35,
                  }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="h-1.5 rounded-full bg-ink"
                />
              ))}
            </div>
            <Button size="sm" variant="soft" icon={Share2} onClick={share}>
              Share
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
