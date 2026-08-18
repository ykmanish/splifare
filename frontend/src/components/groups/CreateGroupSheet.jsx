'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import { Badge } from '@/components/ui/Bits';
import { GroupLabel, ListGroup, FieldRow, PersonRow, SheetHeader } from '@/components/ui/Blocks';
import { PersonToggle } from '@/components/ui/Avatar';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';
import { GROUP_TYPES, GROUP_EMOJIS } from '@/lib/categories';

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

export default function CreateGroupSheet({ open, onClose, onCreated }) {
  const { me, people, createGroup, addPerson } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [type, setType] = useState('home');
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
      setEmoji('🏠');
      setType('home');
      setMemberIds([]);
      setTouched(false);
      setAddingPerson(false);
      setNewName('');
      setNewEmail('');
      setAddBusy(false);
    }
  }

  const others = people.filter((p) => p.id !== me?.id);
  const canSave = name.trim().length > 1;

  function onTypeChange(t) {
    if (!t) return;
    setType(t.id);
    setEmoji(t.emoji);
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
      toast({ title: `${p.name} added`, description: 'They are now selectable in this group.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not add them', description: err.message });
    } finally {
      setAddBusy(false);
    }
  }

  async function onSubmit(e) {
    e?.preventDefault();
    setTouched(true);
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const g = await createGroup({ name, emoji, type, memberIds });
      toast({ title: 'Group created', description: `${g.name} · ${g.memberIds.length} members` });
      onClose();
      if (onCreated) onCreated(g);
      else router.push(`/groups/${g.id}`);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not create the group', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      footer={
        <Button size="lg" block onClick={onSubmit} loading={busy}>
          Create group
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="space-y-6">
        {/* ------------------------------------------------ header */}
        <Section i={0}>
          <SheetHeader
            left={
              <div className="grid size-10 place-items-center rounded-[14px] bg-surface-2 text-[20px]">
                {emoji}
              </div>
            }
            title="New group"
            subtitle="Flatmates, a trip, the lunch crew"
          />
        </Section>

        {/* ------------------------------------------------ name */}
        <Section i={1}>
          <Input
            label="Group name"
            placeholder="Flat 402"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={touched && !canSave ? 'Give the group a name' : ''}
            autoFocus
          />
        </Section>

        {/* ------------------------------------------------ icon */}
        <Section i={2}>
          <GroupLabel>Icon</GroupLabel>
          <div className="-mx-5 overflow-x-auto px-5 no-scrollbar">
            <div className="flex gap-2 pb-1">
              {GROUP_EMOJIS.map((e) => (
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

        {/* ------------------------------------------------ type */}
        <Section i={3}>
          <Picker
            label="Type"
            title="What kind of group?"
            placeholder="Choose a type…"
            value={type}
            onChange={(id) => onTypeChange(GROUP_TYPES.find((t) => t.id === id))}
            options={GROUP_TYPES.map((t) => ({ value: t.id, label: t.label, emoji: t.emoji }))}
          />
        </Section>

        {/* ------------------------------------------------ members */}
        <Section i={4}>
          <GroupLabel
            action={
              <span className="newq text-[12px]">
                <span className="num">{memberIds.length + 1}</span> in this group
              </span>
            }
          >
            Members
          </GroupLabel>

          <ListGroup tone="fill">
            <PersonRow
              person={me}
              name="You"
              sublabel="Always part of the group"
              trailing={<Badge tone="mint">Member</Badge>}
            />

            {others.map((p) => (
              <PersonToggle
                key={p.id}
                person={p}
                subtitle={p.email}
                selected={memberIds.includes(p.id)}
                onToggle={(id) =>
                  setMemberIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
                }
              />
            ))}

            {!addingPerson && (
              <FieldRow
                icon={UserPlus}
                iconTint="var(--brand)"
                iconBg="var(--sky)"
                label="Add someone new"
                sublabel="They become selectable right here"
                plus
                onClick={() => setAddingPerson(true)}
              />
            )}
          </ListGroup>
        </Section>

        {/* ------------------------------------------------ inline add */}
        {addingPerson && (
          <Section i={5}>
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
