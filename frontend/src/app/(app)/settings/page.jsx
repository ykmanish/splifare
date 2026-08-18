'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Phone,
  Sun,
  Moon,
  Monitor,
  Coins,
  Bell,
  RefreshCw,
  LogOut,
  RotateCcw,
  Info,
  Check,
  Pencil,
  MessageSquare,
  Trash2,
  Loader2,
} from 'lucide-react';
import Page from '@/components/layout/Page';
import Button from '@/components/ui/Button';
import Sheet, { ConfirmSheet } from '@/components/ui/Sheet';
import { Input } from '@/components/ui/Field';
import Picker from '@/components/ui/Picker';
import Avatar from '@/components/ui/Avatar';
import { AVATAR_OPTIONS } from '@/components/ui/Avatar';
import { ActionTiles, FieldRow, GroupLabel, ListGroup } from '@/components/ui/Blocks';
import { Badge, Switch } from '@/components/ui/Bits';
import { useApp } from '@/store/AppContext';
import { pushReason } from '@/lib/push';
import { useToast } from '@/components/ui/Toast';
import { CURRENCIES } from '@/lib/format';

const EASE = [0.16, 1, 0.3, 1];

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

const NOTIF_ROWS = [
  { id: 'expenses', key: 'n-exp', label: 'New expenses', description: 'When someone adds a bill to a shared group' },
  { id: 'payments', key: 'n-pay', label: 'Payments', description: 'When someone settles up with you' },
  { id: 'lists', key: 'n-list', label: 'Shopping lists', description: 'When a shop starts or a list is checked out' },
  { id: 'reminders', key: 'n-rem', label: 'Payment reminders', description: 'A weekly nudge about outstanding balances' },
];

function Section({ title, action, delay = 0, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
    >
      {title && <GroupLabel action={action}>{title}</GroupLabel>}
      {children}
    </motion.section>
  );
}

/** Small grey text sitting under a group, for the explanatory notes. */
function GroupNote({ icon: Icon, children }) {
  return (
    <p className="newq mt-2 flex items-start gap-1.5 px-1.5 text-[12.5px] leading-snug">
      {Icon && <Icon size={13} className="mt-0.5 shrink-0" />}
      {children}
    </p>
  );
}

export default function SettingsPage() {
  const {
    me,
    prefs,
    setPrefs,
    setTheme,
    updateProfile,
    logout,
    reload,
    unreadCount,
    push,
    enablePush,
    disablePush,
    testPush,
    fx,
    refreshRates,
  } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email || '');
  const [phone, setPhone] = useState(me.phone || '');
  const [avatarSeed, setAvatarSeed] = useState(me.avatarSeed || me.name || me.id);
  const [avatarStyle, setAvatarStyle] = useState(me.avatarStyle || 'adventurer');
  const [avatarBg, setAvatarBg] = useState(me.avatarBg || '');
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const [pushBusy, setPushBusy] = useState(false);
  const [ratesBusy, setRatesBusy] = useState(false);

  const activeTheme = THEMES.find((t) => t.id === prefs.theme) || THEMES[2];

  const pushOn = push.subscribed && push.permission === 'granted';
  const pushBlocked = push.permission === 'denied';
  const pushUnsupported = push.permission === 'unsupported';
  const pushSummary = pushUnsupported
    ? 'Unavailable'
    : pushBlocked
      ? 'Blocked'
      : pushOn
        ? 'On'
        : 'Off';
  const handle = me.email
    ? `@${me.email.split('@')[0]}`
    : `@${String(me.name || 'you').toLowerCase().replace(/\s+/g, '')}`;

  async function togglePush(next) {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (!next) {
        await disablePush();
        toast({ tone: 'info', title: 'Push turned off' });
        return;
      }
      const result = await enablePush();
      if (result.ok) {
        toast({ title: 'Push notifications on', description: 'Try the test below.' });
      } else {
        toast({ tone: 'error', title: 'Could not turn push on', description: pushReason(result.reason) });
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Could not change push', description: err.message });
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    try {
      await testPush();
      toast({ title: 'Test sent', description: 'It should arrive in a second or two.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Test failed', description: err.message });
    }
  }

  async function onRefreshRates() {
    if (ratesBusy) return;
    setRatesBusy(true);
    try {
      await refreshRates(prefs.currency);
      toast({ title: 'Rates refreshed' });
    } finally {
      setRatesBusy(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim() || me.name,
        email: email.trim(),
        phone: phone.trim(),
        avatarSeed: avatarSeed.trim() || name.trim() || me.name,
        avatarStyle,
        avatarBg,
      });
      setDirty(false);
      setEditOpen(false);
      toast({ title: 'Profile saved' });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save profile', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  function openProfileEditor() {
    const currentIndex = AVATAR_OPTIONS.findIndex(
      (option) =>
        option.seed === (me.avatarSeed || '') &&
        option.style === (me.avatarStyle || 'adventurer') &&
        option.bg === (me.avatarBg || ''),
    );
    setName(me.name);
    setEmail(me.email || '');
    setPhone(me.phone || '');
    if (currentIndex >= 0) {
      setAvatarIndex(currentIndex);
      setAvatarSeed(AVATAR_OPTIONS[currentIndex].seed);
      setAvatarStyle(AVATAR_OPTIONS[currentIndex].style);
      setAvatarBg(AVATAR_OPTIONS[currentIndex].bg);
    } else {
      setAvatarIndex(0);
      setAvatarSeed(me.avatarSeed || me.name || me.id);
      setAvatarStyle(me.avatarStyle || 'adventurer');
      setAvatarBg(me.avatarBg || AVATAR_OPTIONS[0].bg);
    }
    setDirty(false);
    setEditOpen(true);
  }

  function pickAvatar(index) {
    const nextIndex = (index + AVATAR_OPTIONS.length) % AVATAR_OPTIONS.length;
    const option = AVATAR_OPTIONS[nextIndex];
    setAvatarIndex(nextIndex);
    setAvatarSeed(option.seed);
    setAvatarStyle(option.style);
    setAvatarBg(option.bg);
    setDirty(true);
  }

  async function pickTheme(id) {
    setThemeOpen(false);
    try {
      await setTheme(id);
    } catch (err) {
      toast({ tone: 'error', title: 'Could not change theme', description: err.message });
    }
  }

  async function pickCurrency(code) {
    try {
      await setPrefs({ currency: code });
      toast({ title: `Switched to ${CURRENCIES[code].name}` });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not change currency', description: err.message });
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await reload();
      toast({ title: 'Synced', description: 'Pulled the latest from the server.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Sync failed', description: err.message });
    } finally {
      setSyncing(false);
    }
  }

  function signOut() {
    logout();
    router.replace('/login');
  }

  return (
    <Page title="Settings">
      <div className="space-y-7">
        {/* ---------------------------------------------- profile header */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-col items-center pb-1 pt-3"
        >
          <Avatar person={me} size="2xl" />
          <p className="newq  text-ink mt-4 text-[21px]">{me.name}</p>
          <p className="newq mt-0.5 text-[13.5px]">{handle}</p>

          <Button
            variant="soft"
            size="sm"
            icon={Pencil}
            className="mt-4"
            onClick={openProfileEditor}
          >
            Edit profile
          </Button>
        </motion.section>

        {/* ---------------------------------------------- personal */}
        <Section title="Personal" delay={0.04}>
          <ListGroup>
            <FieldRow
              icon={User}
              label="My profile"
              sublabel={me.email || 'Add an email address'}
              chevron
              onClick={openProfileEditor}
            />
            <div className="px-4 py-3.5">
              <Picker
                label="Currency"
                hint="applies everywhere"
                title="Choose a currency"
                searchable
                value={prefs.currency}
                onChange={pickCurrency}
                options={Object.values(CURRENCIES).map((c) => ({
                  value: c.code,
                  label: `${c.symbol}  ${c.code}`,
                  sublabel: c.name,
                }))}
              />
            </div>
            <FieldRow
              icon={RefreshCw}
              label="Exchange rates"
              sublabel={
                !fx.rates
                  ? 'Not loaded yet'
                  : fx.stale
                    ? `Live rates unreachable — using ${fx.date || 'cached'}`
                    : `${fx.date || 'today'} · ${fx.source}`
              }
              trailing={
                <span className="newq text-[13px]">{ratesBusy ? 'Refreshing…' : 'Refresh'}</span>
              }
              onClick={onRefreshRates}
            />
          </ListGroup>
          <GroupNote icon={Coins}>
            Every expense keeps the currency it was recorded in. Totals are converted into{' '}
            {prefs.currency} at the latest rate, so a mixed-currency group still adds up.
          </GroupNote>
        </Section>

        {/* ---------------------------------------------- preferences */}
        <Section
          title="Preferences"
          delay={0.08}
          action={
            unreadCount > 0 ? (
              <Badge tone="neg" className="num">
                {unreadCount} unread
              </Badge>
            ) : null
          }
        >
          <ListGroup>
            <FieldRow
              icon={activeTheme.icon}
              label="Appearance"
              trailing={<span className="newq text-[14px]">{activeTheme.label}</span>}
              chevron
              onClick={() => setThemeOpen(true)}
            />
            <FieldRow
              icon={Bell}
              label="Notifications"
              trailing={<span className="newq text-[14px]">{pushSummary}</span>}
              chevron
              onClick={() => setNotifOpen(true)}
            />
          </ListGroup>
        </Section>

        {/* ---------------------------------------------- app */}
        <Section title="App" delay={0.12}>
          <ListGroup>
            <FieldRow
              icon={RotateCcw}
              label="Sync now"
              sublabel="Pull the latest from the server"
              onClick={syncNow}
              chevron={!syncing}
              trailing={
                syncing ? (
                  <Loader2 size={17} className="shrink-0 animate-spin text-ink-3" />
                ) : undefined
              }
            />
            <FieldRow
              icon={MessageSquare}
              label="Send feedback"
              sublabel="Tell us what feels wrong"
              href="mailto:hello@splitta.app?subject=Splitta%20feedback"
              chevron
            />
          </ListGroup>
          <GroupNote icon={Info}>
            Your groups, expenses and lists are stored in MongoDB and sync across every device you
            sign in on.
          </GroupNote>
        </Section>

        {/* ---------------------------------------------- session */}
        <Section title="Session" delay={0.16}>
          <ListGroup>
            <FieldRow
              icon={LogOut}
              label="Log out"
              sublabel="Keeps everything on the server"
              chevron
              onClick={() => setConfirmLogout(true)}
            />
            <FieldRow
              icon={Trash2}
              label="Log out of all data"
              sublabel="Also drops every record cached on this device"
              danger
              onClick={() => setConfirmWipe(true)}
            />
          </ListGroup>
        </Section>

        <p className="newq pb-2 text-center text-[12px]">Splitta · front-end demo build</p>
      </div>

      {/* ================================================ edit profile */}
      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit profile"
        subtitle="This is how you appear to everyone you split with."
        footer={
          <Button size="lg" block icon={Check} loading={saving} disabled={!dirty} onClick={saveProfile}>
            Save changes
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-[22px] bg-surface-2 p-4">
            <div className="flex flex-col items-center text-center">
              <Avatar
                person={{ ...me, name, avatarSeed, avatarStyle, avatarBg }}
                size="2xl"
                className="ring-4 ring-surface"
              />
              <p className="newq mt-3 text-[15px] text-ink">Choose your avatar</p>
              <p className="newq mt-1 max-w-[250px] text-[12.5px]">
                Browse 30 ready-made avatars. Everyone you split with will see this.
              </p>
            </div>

            <div className="mt-4">
              <GroupLabel
                action={
                  <span className="newq text-[12px]">
                    {avatarIndex + 1} of {AVATAR_OPTIONS.length}
                  </span>
                }
              >
                Avatar options
              </GroupLabel>
              <div className="grid grid-cols-5 gap-2">
                {AVATAR_OPTIONS.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pickAvatar(index)}
                    aria-label={`Use ${option.label}`}
                    className={`relative grid aspect-square place-items-center rounded-[18px] bg-surface tap ${
                      avatarIndex === index
                        ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface-2'
                        : 'hover:bg-surface-3'
                    }`}
                  >
                    <Avatar
                      person={{
                        ...me,
                        name,
                        avatarSeed: option.seed,
                        avatarStyle: option.style,
                        avatarBg: option.bg,
                      }}
                      size="sm"
                    />
                    {avatarIndex === index && (
                      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-on-brand">
                        <Check size={12} strokeWidth={3.2} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[16px] bg-surface px-3 py-2.5">
                  <p className="newq text-[11px] uppercase tracking-[0.07em] text-ink-3">Style</p>
                  <p className="newq mt-0.5 text-[14px] text-ink">
                    {AVATAR_OPTIONS[avatarIndex]?.styleLabel || avatarStyle}
                  </p>
                </div>
                <div className="rounded-[16px] bg-surface px-3 py-2.5">
                  <p className="newq text-[11px] uppercase tracking-[0.07em] text-ink-3">Option</p>
                  <p className="newq mt-0.5 text-[14px] text-ink">
                    {AVATAR_OPTIONS[avatarIndex]?.label || 'Custom avatar'}
                  </p>
                </div>
              </div>
              <Input
                label="Avatar seed"
                hint="advanced"
                value={avatarSeed}
                onChange={(e) => {
                  setAvatarSeed(e.target.value);
                  setAvatarIndex(-1);
                  setDirty(true);
                }}
              />
            </div>
          </div>

          <Input
            label="Full name"
            icon={User}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
          <Input
            label="Email"
            type="email"
            icon={Mail}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setDirty(true);
            }}
          />
          <Input
            label="Phone"
            hint="optional"
            icon={Phone}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setDirty(true);
            }}
          />
        </div>
      </Sheet>

      {/* ================================================ appearance */}
      <Sheet
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        title="Appearance"
        subtitle="Pick how Splitta should look on this device."
      >
        <ActionTiles
          actions={THEMES.map((t) => ({
            id: t.id,
            label: t.label,
            icon: t.icon,
            tone: prefs.theme === t.id ? 'dark' : 'neutral',
            onClick: () => pickTheme(t.id),
          }))}
        />
        <GroupNote icon={Monitor}>
          System follows whatever your phone is set to, switching with it through the day.
        </GroupNote>
      </Sheet>

      {/* ================================================ notifications */}
      <Sheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifications"
        subtitle="Choose what is worth interrupting you for."
      >
        <ListGroup tone="fill">
          <div className="px-4 py-3">
            <Switch
              id="push-on"
              label="Push notifications"
              description={
                pushUnsupported
                  ? 'This browser cannot receive them.'
                  : pushBlocked
                    ? 'Blocked — allow notifications in your browser settings first.'
                    : 'Arrive even when Splitta is closed.'
              }
              checked={pushOn}
              disabled={pushBusy || pushUnsupported || pushBlocked}
              onChange={togglePush}
            />
          </div>
        </ListGroup>

        {pushOn && (
          <div className="mt-3">
            <Button variant="soft" size="sm" block icon={Bell} onClick={sendTestPush}>
              Send a test notification
            </Button>
          </div>
        )}

        <GroupNote icon={Bell}>
          {pushOn
            ? 'You will be told about new expenses, payments, list activity and friend requests. Splitta also keeps checking in the background as a fallback.'
            : 'With push off, updates only appear while Splitta is open in a tab.'}
        </GroupNote>

        <div className="mt-6">
          <GroupLabel>What you will hear about</GroupLabel>
          <ListGroup tone="fill">
            {NOTIF_ROWS.filter((r) => r.id !== 'reminders').map((r) => (
              <FieldRow key={r.id} label={r.label} sublabel={r.description} />
            ))}
          </ListGroup>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Log out?"
        body="Your data stays saved on the server — sign back in any time."
        confirmLabel="Log out"
        danger
        onConfirm={signOut}
      />

      <ConfirmSheet
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Log out of all data?"
        body="This signs you out and clears every group, expense and list cached on this device. Nothing is deleted from the server."
        confirmLabel="Log out & clear"
        danger
        onConfirm={signOut}
      />
    </Page>
  );
}
