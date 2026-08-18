'use client';

import { useState } from 'react';
import { DoorOpen, KeyRound, Mail, UserMinus, UserRound } from 'lucide-react';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import Avatar from '@/components/ui/Avatar';
import { Badge, Card } from '@/components/ui/Bits';
import { FieldRow, GroupLabel, ListGroup } from '@/components/ui/Blocks';
import { money, firstName } from '@/lib/format';

/**
 * One member's card, opened by tapping their row.
 *
 * Tapping a row used to toggle membership, so a stray tap silently dropped
 * someone from the group. Removal now lives behind this sheet and a
 * confirmation, which is two deliberate taps away from a mis-tap.
 */
export default function MemberSheet({
  open,
  onClose,
  person,
  groupName,
  balance = null,
  currency = 'INR',
  isYou = false,
  isMember = true,
  onRemove,
  onLeave,
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!person) return null;

  const settled = balance == null || Math.abs(balance) < 0.005;
  const friend = person.isFriend !== false;

  async function remove() {
    if (busy || !onRemove) return;
    setBusy(true);
    try {
      await onRemove(person);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} size="sm">
        <div className="space-y-6">
          {/* ------------------------------------------------ identity */}
          <div className="flex flex-col items-center pt-1 text-center">
            <Avatar person={person} size="2xl" />

            <p className="newq text-ink mt-3.5 text-[21px] leading-tight">
              {isYou ? `${person.name} (you)` : person.name}
            </p>

            <p className="newq mt-1 text-[13px]">
              {isMember ? `In ${groupName}` : `Not in ${groupName} yet`}
            </p>

            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {friend ? (
                <Badge tone="brandSoft" icon={UserRound}>
                  friend
                </Badge>
              ) : (
                <Badge tone="info" icon={KeyRound}>
                  joined with the code
                </Badge>
              )}
              {!settled && (
                <Badge tone={balance > 0 ? 'pos' : 'neg'}>
                  {balance > 0 ? 'is owed' : 'owes the group'} {money(Math.abs(balance), currency)}
                </Badge>
              )}
            </div>
          </div>

          {/* ------------------------------------------------ balance */}
          {balance != null && (
            <Card tone={settled ? 'mintSoft' : balance > 0 ? 'mintSoft' : 'blushSoft'}>
              <p className="newq text-[11.5px] uppercase tracking-[0.09em] text-ink-3">
                Balance in this group
              </p>
              {settled ? (
                <p className="newq text-ink mt-1 text-[15px]">All settled up</p>
              ) : (
                <>
                  <p
                    className={`num mt-1 text-[26px] leading-none ${
                      balance > 0 ? 'text-pos' : 'text-neg'
                    }`}
                  >
                    {money(Math.abs(balance), currency)}
                  </p>
                  <p className="newq mt-1.5 text-[12.5px]">
                    {balance > 0
                      ? `${isYou ? 'You are' : `${firstName(person.name)} is`} owed this by the group`
                      : `${isYou ? 'You owe' : `${firstName(person.name)} owes`} this to the group`}
                  </p>
                </>
              )}
            </Card>
          )}

          {/* ------------------------------------------------ details */}
          <div>
            <GroupLabel>Details</GroupLabel>
            <ListGroup>
              {friend && person.email ? (
                <FieldRow icon={Mail} label={person.email} sublabel="Email" />
              ) : (
                <FieldRow
                  icon={KeyRound}
                  label="Contact details are private"
                  sublabel="You only share a group, not a friendship"
                />
              )}

              {friend && !isYou && (
                <FieldRow
                  icon={UserRound}
                  label="Open their full profile"
                  sublabel="Every expense you two share"
                  href={`/friends/${person.id}`}
                  chevron
                />
              )}
            </ListGroup>
          </div>

          {/* ------------------------------------------------ actions */}
          {isYou && onLeave ? (
            <div>
              <GroupLabel>Leaving</GroupLabel>
              <Card tone="skySoft" pad={false}>
                <FieldRow
                  icon={DoorOpen}
                  iconTint="var(--info)"
                  iconBg="var(--sky)"
                  label="Leave this group"
                  sublabel="The group carries on without you"
                  onClick={() => {
                    onClose();
                    onLeave();
                  }}
                />
              </Card>
            </div>
          ) : null}

          {!isYou && isMember && onRemove ? (
            <div>
              <GroupLabel>Membership</GroupLabel>
              <Card tone="blushSoft" pad={false}>
                <FieldRow
                  icon={UserMinus}
                  iconBg="var(--blush)"
                  label={`Remove ${firstName(person.name)}`}
                  sublabel="Takes them off this group"
                  danger
                  onClick={() => setConfirming(true)}
                />
              </Card>
            </div>
          ) : null}
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        title={`Remove ${firstName(person.name)} from ${groupName}?`}
        body={
          settled
            ? `${firstName(person.name)} comes off the member list. Expenses they were already part of stay on record, and they can rejoin with the room code.`
            : `${firstName(person.name)} still ${
                balance > 0 ? 'is owed' : 'owes'
              } ${money(Math.abs(balance), currency)} here. Removing them does not clear it — settle up first if you want it closed.`
        }
        confirmLabel="Remove"
        danger
      />
    </>
  );
}
