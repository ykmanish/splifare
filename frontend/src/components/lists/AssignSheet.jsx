'use client';

import { Users, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { SumRow, SummaryCard } from '@/components/ui/Bits';
import { GroupLabel, ListGroup, FieldRow, SheetHeader, StatusPill } from '@/components/ui/Blocks';
import { PersonToggle } from '@/components/ui/Avatar';
import { money } from '@/lib/format';
import { allocate } from '@/lib/split';

/** Section entrance — restrained, staggered by index. */
function Section({ i = 0, className = '', children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Same check affordance PersonToggle uses, so the rows read as one set. */
function Tick({ on }) {
  return (
    <span
      className={`grid size-5 shrink-0 place-items-center rounded-full
        ${on ? 'bg-brand text-on-brand' : 'bg-surface-3'}`}
    >
      {on && <Check size={12} strokeWidth={3.2} />}
    </span>
  );
}

/**
 * "Who is this item for?" — the piece that makes per-item splitting work.
 */
export default function AssignSheet({ open, onClose, item, members, meId, currency, onChange }) {
  if (!item) return null;

  const who = item.splitWith || [];
  const price = Number(item.price) || 0;
  const each = who.length ? allocate(price, who.map(() => 1))[0] : 0;

  const toggle = (id) => {
    const next = who.includes(id) ? who.filter((x) => x !== id) : [...who, id];
    if (!next.length) return;
    onChange(next);
  };

  const allSelected = who.length === members.length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <Button size="lg" block onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        {/* -------------------------------------------------- header */}
        <Section i={0}>
          <SheetHeader title="Who is this for?" subtitle={item.name} />
        </Section>

        {/* -------------------------------------------------- people */}
        <Section i={1}>
          <GroupLabel
            action={
              <span className="newq text-[12px]">
                <span className="num">{who.length}</span> of{' '}
                <span className="num">{members.length}</span>
              </span>
            }
          >
            Sharing this item
          </GroupLabel>

          <ListGroup tone="fill">
            <FieldRow
              icon={Users}
              iconTint="var(--brand)"
              iconBg="var(--sky)"
              label="Everyone on the list"
              sublabel={`Split it ${members.length} ways, evenly`}
              trailing={<Tick on={allSelected} />}
              onClick={() => onChange(allSelected ? [meId] : members.map((m) => m.id))}
            />

            {members.map((p) => (
              <PersonToggle
                key={p.id}
                person={{ ...p, name: p.id === meId ? 'You' : p.name }}
                subtitle={
                  who.includes(p.id) && price > 0 ? `pays ${money(each, currency)}` : undefined
                }
                selected={who.includes(p.id)}
                onToggle={toggle}
              />
            ))}
          </ListGroup>
        </Section>

        {/* -------------------------------------------------- share */}
        <Section i={2}>
          {price > 0 ? (
            <SummaryCard tone="soft" title="The share">
              <SumRow label="Item price" value={money(price, currency)} />
              <SumRow
                label={`Split ${who.length} ${who.length === 1 ? 'way' : 'ways'}`}
                value={money(each, currency)}
                strong
                hint="each"
              />
            </SummaryCard>
          ) : (
            <StatusPill>Add a price while shopping and the share shows up here</StatusPill>
          )}
        </Section>
      </div>
    </Sheet>
  );
}
