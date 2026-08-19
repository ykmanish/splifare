'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Check, QrCode, Users } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeBox';
import { Card } from '@/components/ui/Bits';
import { GroupLabel, SheetHeader, StatusPill } from '@/components/ui/Blocks';
import QrScanner from '@/components/ui/QrScanner';
import { parseInviteCode } from '@/lib/invite';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';

const CODE_LENGTH = 6;

/**
 * Type a room code, see which group it belongs to, then join. The preview
 * step is what stops a mistyped code from silently dropping someone into a
 * stranger's group.
 */
export default function JoinGroupSheet({
  open,
  onClose,
  onJoined,
  initialCode = '',
  scanOnOpen = false,
}) {
  const { previewGroup, joinGroup } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [scanning, setScanning] = useState(false);

  /**
   * The last lookup, tagged with the code it was for. Reading it back through
   * that tag is what makes an edit discard the stale result — no effect, and
   * no clearing pass that could paint the wrong group for a frame.
   */
  const [lookup, setLookup] = useState({ code: '', group: null, error: '', looking: false });

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const seed = String(initialCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, CODE_LENGTH);
      setCode(seed);
      setBusy(false);
      setFailed('');
      // A code already in hand beats opening the camera on top of it.
      setScanning(scanOnOpen && seed.length < CODE_LENGTH);
      setLookup({ code: '', group: null, error: '', looking: false });
      // A scanned code arrives complete, so look it up straight away instead
      // of waiting for a keystroke that will never come. Deferred by a
      // microtask because lookUp both sets state and fires a request, and
      // neither belongs in the render phase.
      if (seed.length === CODE_LENGTH) Promise.resolve().then(() => lookUp(seed));
    }
  }

  const current = lookup.code === code ? lookup : null;
  const found = current?.group || null;
  const looking = !!current?.looking;
  const error = failed || current?.error || '';

  /** Runs the moment the last character lands (typed or pasted). */
  async function lookUp(full) {
    setFailed('');
    setLookup({ code: full, group: null, error: '', looking: true });
    try {
      const group = await previewGroup(full);
      setLookup({ code: full, group, error: '', looking: false });
    } catch (err) {
      setLookup({ code: full, group: null, error: err.message, looking: false });
    }
  }

  function onCodeChange(next) {
    setFailed('');
    setCode(next);
  }

  /**
   * A scan gives us a whole invite URL. Pull the code out, drop it into the
   * slots and look it up, so the camera closing lands the reader straight on
   * the confirm step.
   */
  const onScan = useCallback(
    (text) => {
      const hit = parseInviteCode(text);
      if (!hit) {
        setFailed('That QR is not a Splitta invite');
        setScanning(false);
        return;
      }
      const scanned = hit.code.slice(0, CODE_LENGTH);
      setScanning(false);
      setFailed('');
      setCode(scanned);
      if (scanned.length === CODE_LENGTH) lookUp(scanned);
    },
    // lookUp is a stable function declaration in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function submit() {
    if (busy || code.length < CODE_LENGTH) return;
    setBusy(true);
    try {
      const { group, alreadyIn } = await joinGroup(code);
      toast(
        alreadyIn
          ? { tone: 'info', title: 'You are already in this group', description: group.name }
          : { title: `Joined ${group.name}`, description: 'You can add expenses here now.' },
      );
      onClose();
      if (onJoined) onJoined(group);
      else router.push(`/groups/${group.id}`);
    } catch (err) {
      setFailed(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      footer={
        <div className="flex gap-2.5">
          <Button variant="soft" size="md" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            className="flex-[2]"
            iconRight={ArrowRight}
            loading={busy}
            disabled={code.length < CODE_LENGTH || !found || found.isMember}
            onClick={submit}
          >
            {found?.isMember ? 'Already a member' : 'Join group'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <SheetHeader
          left={
            <div className="grid size-10 place-items-center rounded-[14px] bg-surface-2 text-ink">
              <Users size={19} strokeWidth={2.1} />
            </div>
          }
          title="Join a group"
          subtitle="Ask a member for the room code"
        />

        {scanning ? (
          <div>
            <GroupLabel>Scan a room code</GroupLabel>
            <QrScanner
              active={scanning}
              onResult={onScan}
              onCancel={() => setScanning(false)}
            />
          </div>
        ) : (
          <div>
            <GroupLabel
              action={
                <button
                  type="button"
                  onClick={() => {
                    setFailed('');
                    setScanning(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5
                    py-1.5 newq text-[12px] text-ink tap active:scale-95 hover:bg-surface-3"
                >
                  <QrCode size={13} strokeWidth={2.3} />
                  Scan
                </button>
              }
            >
              Room code
            </GroupLabel>
            <CodeInput
              value={code}
              onChange={onCodeChange}
              onComplete={lookUp}
              length={CODE_LENGTH}
              error={error}
              autoFocus={!scanOnOpen}
            />
            {!error && (
              <p className="newq mt-2.5 px-1.5 text-center text-[12px]">
                {looking ? 'Looking it up…' : `${CODE_LENGTH} letters and numbers`}
              </p>
            )}
          </div>
        )}

        {found && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <GroupLabel>This code opens</GroupLabel>
            <Card tone="limeSoft" className="flex items-center gap-3.5">
              <span className="grid size-13 shrink-0 place-items-center rounded-[16px] bg-white/70 dark:bg-white/10 text-[24px]">
                {found.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="newq text-ink block truncate text-[16px]">{found.name}</span>
                <span className="newq block truncate text-[12.5px]">
                  {found.memberCount} {found.memberCount === 1 ? 'member' : 'members'} · {found.type}
                </span>
              </span>
            </Card>

            {found.isMember && (
              <StatusPill tone="pos" icon={Check} className="mt-3">
                You are already in this group
              </StatusPill>
            )}
          </motion.div>
        )}
      </div>
    </Sheet>
  );
}
