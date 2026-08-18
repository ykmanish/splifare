'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, UserPlus, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import { Badge } from '@/components/ui/Bits';
import { GroupLabel, ListGroup, FieldRow, PersonRow, SheetHeader } from '@/components/ui/Blocks';
import { PersonToggle } from '@/components/ui/Avatar';
import CodeBox from '@/components/ui/CodeBox';
import { groupInviteLink } from '@/lib/invite';
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
  const { me, friends, createGroup } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [type, setType] = useState('home');
  const [memberIds, setMemberIds] = useState([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Set once the group exists, which swaps the sheet to the code hand-off. */
  const [created, setCreated] = useState(null);

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
      setCreated(null);
    }
  }

  const canSave = name.trim().length > 1;

  function onTypeChange(t) {
    if (!t) return;
    setType(t.id);
    setEmoji(t.emoji);
  }

  async function onSubmit(e) {
    e?.preventDefault();
    setTouched(true);
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const g = await createGroup({ name, emoji, type, memberIds });
      toast({ title: 'Group created', description: `${g.name} · ${g.memberIds.length} members` });
      setCreated(g);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not create the group', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    const g = created;
    onClose();
    if (!g) return;
    if (onCreated) onCreated(g);
    else router.push(`/groups/${g.id}`);
  }

  /* ---------------------------------------------------------- created */

  // The code is the only way anyone outside your friend list gets in, so it
  // gets a screen of its own rather than a line in a toast.
  if (created) {
    return (
      <Sheet
        open={open}
        onClose={finish}
        footer={
          <Button size="lg" block iconRight={ArrowRight} onClick={finish}>
            Open {created.name}
          </Button>
        }
      >
        <div className="space-y-6">
          <Section i={0}>
            <SheetHeader
              left={
                <div className="grid size-10 place-items-center rounded-[14px] bg-surface-2 text-[20px]">
                  {created.emoji}
                </div>
              }
              title={`${created.name} is live`}
              subtitle={`${created.memberIds.length} ${
                created.memberIds.length === 1 ? 'member' : 'members'
              } so far`}
            />
          </Section>

          <Section i={1}>
            <CodeBox
              code={created.code}
              label="Room code"
              hint="Anyone with this code can join the group"
              shareTitle={`Join ${created.name} on Splitta`}
              shareText={`Join ${created.name} on Splitta — the room code is ${created.code}`}
              qrValue={groupInviteLink(created.code)}
              qrLabel={`QR code to join ${created.name}`}
            />
          </Section>

          <Section i={2}>
            <p className="newq px-1.5 text-[13px] leading-relaxed">
              Send the code to anyone who should be in here. They do not have to be your
              friend first — joining the room is enough to split expenses in it.
            </p>
          </Section>
        </div>
      </Sheet>
    );
  }

  /* ------------------------------------------------------------ form */

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

            {friends.map((p) => (
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

            {friends.length === 0 && (
              <FieldRow
                icon={UserPlus}
                iconTint="var(--brand)"
                iconBg="var(--sky)"
                label="No friends to add yet"
                sublabel="Create the group anyway and share its code"
                href="/friends"
                chevron
              />
            )}
          </ListGroup>

          <p className="newq mt-2.5 flex items-start gap-1.5 px-1.5 text-[12px]">
            <Users size={13} className="mt-0.5 shrink-0" />
            Friends can be added here. Everyone else joins with the room code you get
            once the group exists.
          </p>
        </Section>

        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Sheet>
  );
}
