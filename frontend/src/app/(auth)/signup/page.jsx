'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, User, Check, AlertCircle } from 'lucide-react';
import { Input, PasswordInput } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import { Progress } from '@/components/ui/Bits';
import { StatusPill } from '@/components/ui/Blocks';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';

const EASE = [0.16, 1, 0.3, 1];
const rise = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

function strengthOf(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

/* `.small` sets its own colour, so the tint has to come from an inline var
   rather than a text-* utility (same trick as the terms error below). */
const STRENGTH = [
  { label: 'Too short', tone: 'neg', color: 'var(--neg)' },
  { label: 'Weak', tone: 'neg', color: 'var(--neg)' },
  { label: 'Fair', tone: 'warn', color: 'var(--warn)' },
  { label: 'Good', tone: 'brand', color: 'var(--brand)' },
  { label: 'Strong', tone: 'mint', color: 'var(--pos)' },
];

export default function SignupPage() {
  const { signup, ready } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => strengthOf(form.password), [form.password]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'What should we call you?';
    else if (form.name.trim().length < 2) e.name = 'That is a bit short';

    if (!form.email.trim()) e.email = 'Enter your email';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'That does not look like an email';

    if (!form.password) e.password = 'Pick a password';
    else if (form.password.length < 8) e.password = 'Use at least 8 characters';

    if (form.confirm !== form.password) e.confirm = 'Passwords do not match';

    if (!accepted) e.terms = 'Please accept the terms to continue';

    setErrors(e);
    return !Object.keys(e).length;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      toast({
        title: `Welcome to Splitta, ${form.name.trim().split(' ')[0]}`,
        description: 'Add a friend or a group to get going.',
      });
      router.replace('/dashboard');
    } catch (err) {
      setErrors((x) => ({ ...x, form: err.message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <motion.div {...rise(0)} className="text-center">
        <h1 className="newq  text-ink text-[30px] leading-[1.12]">Create your account</h1>
        <p className="newq mt-2.5 text-[14.5px]">Takes about thirty seconds.</p>
      </motion.div>

      <motion.form {...rise(1)} onSubmit={onSubmit} className="mt-9 space-y-4" noValidate>
        <Input
          label="Full name"
          icon={User}
          placeholder="Aarav Sharma"
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
        />

        <Input
          label="Email"
          type="email"
          icon={Mail}
          placeholder="you@example.com"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />

        <div>
          <PasswordInput
            label="Password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />
          {form.password && !errors.password && (
            <div className="mt-3 flex items-center gap-3 px-1">
              <Progress value={strength} max={4} tone={STRENGTH[strength].tone} className="flex-1" />
              <span
                className="newq  text-ink shrink-0 text-[11.5px]"
                style={{ color: STRENGTH[strength].color }}
              >
                {STRENGTH[strength].label}
              </span>
            </div>
          )}
        </div>

        <PasswordInput
          label="Confirm password"
          placeholder="Type it again"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
        />

        <div className="pt-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setAccepted((a) => !a);
              setErrors((x) => ({ ...x, terms: undefined }));
            }}
            aria-pressed={accepted}
            className="flex w-full items-start gap-3 rounded-[16px] bg-surface-2 px-4 py-3.5 text-left tap"
          >
            <span
              className={`mt-px grid size-[20px] shrink-0 place-items-center rounded-[7px] tap
                ${accepted ? 'bg-brand text-on-brand' : 'bg-surface'}`}
            >
              {accepted && <Check size={12} strokeWidth={3.4} />}
            </span>
            <span className="newq text-[13px] leading-relaxed">
              I agree to the terms of service and privacy policy.
            </span>
          </motion.button>
          {errors.terms && (
            <p className="newq  text-ink mt-2 px-1 text-[12.5px]" style={{ color: 'var(--neg)' }}>
              {errors.terms}
            </p>
          )}
        </div>

        {errors.form && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <StatusPill tone="neg" icon={AlertCircle}>
              {errors.form}
            </StatusPill>
          </motion.div>
        )}

        <div className="pt-2">
          <Button type="submit" size="lg" block loading={busy} disabled={!ready}>
            Create account
          </Button>
        </div>
      </motion.form>

      <motion.p {...rise(3)} className="newq mt-9 text-center text-[14px]">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-ink underline">
          Log in
        </Link>
      </motion.p>
    </div>
  );
}
