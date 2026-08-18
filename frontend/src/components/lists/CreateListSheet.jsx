'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Store, UserPlus, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import { Badge } from '@/components/ui/Bits';
import {
  GroupLabel,
  ListGroup,
  FieldRow,
  PersonRow,
  SheetHeader,
  StatusPill,
} from '@/components/ui/Blocks';
import { PersonToggle } from '@/components/ui/Avatar';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { symbolOf } from '@/lib/format';

const LIST_EMOJIS = ['🛒', '🥐', '🏖️', '🍕', '🥦', '🧺', '🎉', '🍳', '🧴', '🐾', '🎁', '🍫'];

const SPRING = { type: 'spring', damping: 26, stiffness: 320 };

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

export default function CreateListSheet({ open, onClose, defaultGroupId = '' }) {
  const { me, people, groups, createList, addPerson, currency } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🛒');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [store, setStore] = useState('');
  const [budget, setBudget] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const [addingPerson, setAddingPerson] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  // React's "adjust state when a prop changes" pattern, as in AddExpenseSheet.
  // Seeding during render on the closed → open edge avoids the extra commit
  // (and the one stale painted frame) a reset effect would cause.
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setName('');
      setEmoji('🛒');
      setGroupId(defaultGroupId);
      setStore('');
      setBudget('');
      setTouched(false);
      setAddingPerson(false);
      setNewName('');
      setNewEmail('');
      setAddBusy(false);
      const g = groups.find((x) => x.id === defaultGroupId);
      setMemberIds(g ? g.memberIds.filter((m) => m !== me?.id) : []);
    }
  }

  const others = people.filter((p) => p.id !== me?.id);
  const canSave = name.trim().length > 1;

  function onGroup(id) {
    setGroupId(id);
    const g = groups.find((x) => x.id === id);
    if (g) setMemberIds(g.memberIds.filter((m) => m !== me.id));
  }

  async function onAddPerson() {
    if (!newName.trim() || addBusy) return;
    setAddBusy(true);
    try {
      const p = await addPerson({ name: newName, email: newEmail });
      setMemberIds((m) => [...m, p.id]);
      setNewName('');
      setNewEmail('');
      setAddingPerson(false);
      toast({ title: `${p.name} added`, description: 'They can shop this list with you.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not add them', description: err.message });
    } finally {
      setAddBusy(false);
    }
  }

  async function submit(e) {
    e?.preventDefault();
    setTouched(true);
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const l = await createList({
        name,
        emoji,
        groupId,
        memberIds,
        store: store.trim(),
        budget: budget ? Number(budget) : null,
      });
      toast({ title: 'List created', description: `${l.name} — start adding items.` });
      onClose();
      router.push(`/lists/${l.id}`);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not create the list', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      footer={
        <Button size="lg" block onClick={submit} loading={busy}>
          Create list
        </Button>
      }
    >
      <form onSubmit={submit} className="space-y-6">
        {/* ------------------------------------------------ header */}
        <Section i={0}>
          <SheetHeader
            left={
              <div className="grid size-10 place-items-center rounded-[14px] bg-surface-2 text-[20px]">
                {emoji}
              </div>
            }
            title="New shopping list"
            subtitle="Plan it now, price it at the store"
          />
        </Section>

        {/* ------------------------------------------------ name */}
        <Section i={1}>
          <Input
            label="List name"
            placeholder="Weekly grocery run"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={touched && !canSave ? 'Give the list a name' : ''}
            autoFocus
          />
        </Section>

        {/* ------------------------------------------------ icon */}
        <Section i={2}>
          <GroupLabel>Icon</GroupLabel>
          <div className="-mx-5 overflow-x-auto px-5 no-scrollbar">
            <div className="flex gap-2 pb-1">
              {LIST_EMOJIS.map((e) => (
                <motion.button
                  key={e}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING}
                  onClick={() => setEmoji(e)}
                  aria-pressed={emoji === e}
                  aria-label={`Icon ${e}`}
                  className={`grid size-13 shrink-0 place-items-center rounded-[16px] text-[22px] tap
                    ${emoji === e ? 'bg-sky' : 'bg-surface-2 hover:bg-surface-3'}`}
                >
                  {e}
                </motion.button>
              ))}
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------ store + budget */}
        <Section i={3}>
          <GroupLabel action={<span className="newq text-[12px]">optional</span>}>
            Where and how much
          </GroupLabel>
          <div className="space-y-2.5">
            <Input
              icon={Store}
              placeholder="Big Bazaar, Phoenix Mall"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              aria-label="Store"
            />
            <Input
              inputMode="decimal"
              placeholder="Budget, e.g. 5000"
              suffix={symbolOf(currency)}
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))}
              className="num"
              aria-label="Budget"
            />
            <StatusPill icon={Wallet}>We nudge you if the trolley goes over</StatusPill>
          </div>
        </Section>

        {/* ------------------------------------------------ group */}
        <Section i={4}>
          <Picker
            label="Group"
            hint="optional"
            title="Attach to a group"
            placeholder="No group"
            clearable
            clearLabel="No group"
            value={groupId}
            onChange={onGroup}
            options={groups.map((g) => ({
              value: g.id,
              label: g.name,
              sublabel: `${g.memberIds.length} members`,
              emoji: g.emoji,
            }))}
          />
        </Section>

        {/* ------------------------------------------------ sharing */}
        <Section i={5}>
          <GroupLabel
            action={
              <span className="newq text-[12px]">
                <span className="num">{memberIds.length + 1}</span> shopping
              </span>
            }
          >
            Members
          </GroupLabel>

          <ListGroup tone="fill">
            <PersonRow
              person={me}
              name="You"
              sublabel="This is your list"
              trailing={<Badge tone="mint">Owner</Badge>}
            />

            {others.map((p) => (
              <PersonToggle
                key={p.id}
                person={p}
                subtitle={p.email}
                selected={memberIds.includes(p.id)}
                onToggle={(pid) =>
                  setMemberIds((m) => (m.includes(pid) ? m.filter((x) => x !== pid) : [...m, pid]))
                }
              />
            ))}

            {!addingPerson && (
              <FieldRow
                icon={UserPlus}
                iconTint="var(--brand)"
                iconBg="var(--sky)"
                label="Add someone new"
                sublabel="They can shop this list with you"
                plus
                onClick={() => setAddingPerson(true)}
              />
            )}
          </ListGroup>
        </Section>

        {/* ------------------------------------------------ inline add */}
        {addingPerson && (
          <Section i={6}>
            <GroupLabel>Add someone new</GroupLabel>
            <div className="space-y-2.5">
              <Input
                placeholder="Their name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <Input
                placeholder="Email (optional)"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <div className="flex gap-2.5 pt-0.5">
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  className="flex-1"
                  onClick={() => setAddingPerson(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="dark"
                  size="sm"
                  icon={Check}
                  className="flex-1"
                  onClick={onAddPerson}
                  loading={addBusy}
                  disabled={!newName.trim()}
                >
                  Add them
                </Button>
              </div>
            </div>
          </Section>
        )}

        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Sheet>
  );
}
