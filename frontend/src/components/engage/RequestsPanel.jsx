'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Inbox, Plus, Receipt, Send, ThumbsDown, Undo2 } from 'lucide-react';
import Sheet from '@/components/ui/Sheet';
import Button from '@/components/ui/Button';
import Picker from '@/components/ui/Picker';
import Avatar from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Field';
import { Badge, Card, EmptyState } from '@/components/ui/Bits';
import { api, normSplitRequest } from '@/lib/api';
import { REQUEST_STATUS, REQUEST_TYPE } from '@/lib/engage';
import { firstName, relativeTime } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

/**
 * Split requests.
 *
 * The version this replaces put a single "Done" button on every row, pressable
 * by anyone. That made assignment decorative: the person who asked could tick
 * off their own request, and the person asked never found out either way.
 *
 * Here the buttons follow the role. The assignee accepts, declines, or marks
 * it done; the requester can only withdraw. Both sides get a notification when
 * the other acts, because the whole point of a request is that it closes the
 * loop — silence is what people already have.
 */

const EASE = [0.16, 1, 0.3, 1];

function RequestCard({ request, me, personById, onRespond, onAddBill, busy }) {
  const requester = personById(request.requesterId);
  const assignee = request.assigneeId ? personById(request.assigneeId) : null;
  const status = REQUEST_STATUS[request.status] || REQUEST_STATUS.open;
  const type = REQUEST_TYPE[request.type] || REQUEST_TYPE.add_bill;

  const iAsked = request.requesterId === me.id;
  const settled = ['done', 'declined', 'dismissed'].includes(request.status);
  /* An unassigned request is an open ask to the room, so anyone may pick it up. */
  const mineToAnswer =
    (request.assigneeId === me.id || !request.assigneeId) && request.status === 'open';
  /* But you cannot decline your own ask — passing on something you asked for
     is meaningless, and "Withdraw" is the button that means what you want. */
  const canPass = mineToAnswer && !iAsked;
  const iAccepted = request.assigneeId === me.id && request.status === 'accepted';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={`rounded-[20px] px-4 py-3.5 ${settled ? 'bg-surface-2 opacity-75' : 'bg-surface'}`}
    >
      <div className="flex items-start gap-3">
        <Avatar person={requester} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="newq truncate text-[14.5px] leading-snug text-ink">{request.title}</p>
          <p className="newq mt-0.5 text-[11.5px] text-ink-3">
            {iAsked ? 'You asked' : `${firstName(requester?.name)} asked`}
            {assignee && ` ${assignee.id === me.id ? 'you' : firstName(assignee.name)}`}
            {' · '}
            {relativeTime(request.createdAt)}
          </p>
          {request.details && (
            <p className="newq mt-1.5 text-[13px] leading-snug text-ink-2">{request.details}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone="neutral">{type.label}</Badge>
            {!request.assigneeId && !settled && <Badge tone="neutral">Anyone can take it</Badge>}
          </div>
        </div>
      </div>

      {!settled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mineToAnswer && !iAsked && (
            <Button
              size="xs"
              icon={Check}
              disabled={busy}
              onClick={() => onRespond(request, 'accepted')}
            >
              I&apos;ll do it
            </Button>
          )}

          {canPass && (
            <Button
              size="xs"
              variant="ghost"
              icon={ThumbsDown}
              disabled={busy}
              onClick={() => onRespond(request, 'declined')}
            >
              Pass
            </Button>
          )}

          {(iAccepted || (mineToAnswer && request.type !== 'add_bill')) && (
            <Button
              size="xs"
              variant="soft"
              icon={Check}
              disabled={busy}
              onClick={() => onRespond(request, 'done')}
            >
              Mark done
            </Button>
          )}

          {/* The useful shortcut: a request to add a bill opens the expense
              sheet already titled, and closes itself when the bill lands. */}
          {(iAccepted || mineToAnswer) && request.type === 'add_bill' && (
            <Button
              size="xs"
              variant="soft"
              icon={Receipt}
              disabled={busy}
              onClick={() => onAddBill(request)}
            >
              Add the bill
            </Button>
          )}

          {iAsked && (
            <Button
              size="xs"
              variant="ghost"
              icon={Undo2}
              disabled={busy}
              onClick={() => onRespond(request, 'dismissed')}
            >
              Withdraw
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function NewRequestSheet({ open, onClose, groupId, members, me, onCreated }) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [assignee, setAssignee] = useState('');
  const [type, setType] = useState('add_bill');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving || !title.trim()) return;
    setSaving(true);
    try {
      const { request } = await api.createSplitRequest(groupId, {
        title: title.trim(),
        details: details.trim(),
        assignee: assignee || null,
        type,
      });
      onCreated(normSplitRequest(request));
      setTitle('');
      setDetails('');
      setAssignee('');
      onClose();
      toast({
        title: assignee ? 'Request sent' : 'Request posted',
        description: assignee
          ? `${firstName(members.find((m) => m.id === assignee)?.name)} gets a notification.`
          : 'Anyone in the group can pick it up.',
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not send', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ask for something"
      subtitle="A missing bill, a confirmation, a settle-up"
      footer={
        <Button size="lg" block loading={saving} disabled={!title.trim()} onClick={submit}>
          Send request
        </Button>
      }
    >
      <div className="space-y-4">
        <Picker
          label="What kind"
          value={type}
          onChange={setType}
          options={Object.entries(REQUEST_TYPE).map(([value, v]) => ({ value, label: v.label }))}
        />
        <Input
          label="What do you need"
          value={title}
          placeholder="The Saturday dinner bill"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label="Any detail"
          value={details}
          placeholder="You paid at the counter, I think it was ₹2,400"
          onChange={(e) => setDetails(e.target.value)}
        />
        <Picker
          label="Ask someone in particular"
          value={assignee}
          onChange={setAssignee}
          clearable
          clearLabel="Anyone in the group"
          placeholder="Anyone in the group"
          options={members
            .filter((m) => m.id !== me.id)
            .map((m) => ({ value: m.id, label: m.name }))}
        />
      </div>
    </Sheet>
  );
}

export default function RequestsPanel({
  groupId,
  requests,
  members,
  me,
  personById,
  onChange,
  onOpenExpense,
  loading,
}) {
  const { toast } = useToast();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const buckets = useMemo(() => {
    const open = requests.filter((r) => !['done', 'declined', 'dismissed'].includes(r.status));
    return {
      forMe: open.filter((r) => r.assigneeId === me.id || !r.assigneeId),
      fromMe: open.filter((r) => r.requesterId === me.id && r.assigneeId && r.assigneeId !== me.id),
      closed: requests.filter((r) => ['done', 'declined', 'dismissed'].includes(r.status)).slice(0, 6),
    };
  }, [requests, me.id]);

  async function respond(request, status) {
    setBusy(true);
    try {
      const out = await api.updateSplitRequest(groupId, request.id, { status });
      onChange.updated(normSplitRequest(out.request));
    } catch (err) {
      toast({ tone: 'error', title: 'Could not update', description: err.message });
    } finally {
      setBusy(false);
    }
  }

  /*
   * Opening the expense sheet marks the request accepted first. If the user
   * abandons the sheet the request is left as "on it" rather than closed —
   * honest either way, and better than pre-emptively marking it done for a
   * bill that never got entered.
   */
  function addBill(request) {
    if (request.status === 'open') respond(request, 'accepted');
    onOpenExpense({ groupId, description: request.title });
  }

  const nothing =
    !buckets.forMe.length && !buckets.fromMe.length && !buckets.closed.length;

  return (
    <div className="space-y-4">
      <Button block icon={Plus} onClick={() => setSheet(true)}>
        Ask for a bill or a confirmation
      </Button>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-[20px] bg-surface-2" />
          ))}
        </div>
      ) : nothing ? (
        <Card tone="soft" pad={false}>
          <EmptyState
            icon={Inbox}
            title="Nothing outstanding"
            body="Ask someone to add a bill they paid for, or to confirm one you entered."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {buckets.forMe.length > 0 && (
            <section>
              <p className="newq mb-2 px-1 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
                Waiting on you
              </p>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {buckets.forMe.map((r) => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      me={me}
                      personById={personById}
                      onRespond={respond}
                      onAddBill={addBill}
                      busy={busy}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {buckets.fromMe.length > 0 && (
            <section>
              <p className="newq mb-2 px-1 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
                You asked for
              </p>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {buckets.fromMe.map((r) => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      me={me}
                      personById={personById}
                      onRespond={respond}
                      onAddBill={addBill}
                      busy={busy}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {buckets.closed.length > 0 && (
            <section>
              <p className="newq mb-2 px-1 text-[11.5px] uppercase tracking-[0.08em] text-ink-3">
                Settled
              </p>
              <div className="space-y-2">
                {buckets.closed.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    me={me}
                    personById={personById}
                    onRespond={respond}
                    onAddBill={addBill}
                    busy={busy}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <NewRequestSheet
        open={sheet}
        onClose={() => setSheet(false)}
        groupId={groupId}
        members={members}
        me={me}
        onCreated={onChange.added}
      />
    </div>
  );
}
