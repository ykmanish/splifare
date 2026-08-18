'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Play, AlertCircle } from 'lucide-react';
import { Input, PasswordInput } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Blocks';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/components/ui/Toast';

const EASE = [0.16, 1, 0.3, 1];
const rise = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay: i * 0.04 },
});

export default function LoginPage() {
  const { login, demoLogin, ready } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
    setFormError('');
  };

  function validate() {
    const e = {};
    if (!form.email.trim()) e.email = 'Enter your email';
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'That does not look like an email';
    if (!form.password) e.password = 'Enter your password';
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await login(form);
      toast({ title: 'Welcome back', description: 'Picking up where you left off.' });
      router.replace('/dashboard');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDemo() {
    setBusy(true);
    try {
      await demoLogin();
      toast({
        title: 'Demo account ready',
        description: 'A private account just for this browser.',
      });
      router.replace('/dashboard');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <motion.div {...rise(0)} className="text-center">
        <h1 className="newq  text-ink text-[30px] leading-[1.12]">Welcome back</h1>
        <p className="newq mt-2.5 text-[14.5px]">Log in to pick up your balances.</p>
      </motion.div>

      <motion.form {...rise(1)} onSubmit={onSubmit} className="mt-9 space-y-4" noValidate>
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
            placeholder="••••••••"
            autoComplete="current-password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />
        </div>

        {formError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <StatusPill tone="neg" icon={AlertCircle}>
              {formError}
            </StatusPill>
          </motion.div>
        )}

        <div className="pt-2">
          <Button type="submit" size="lg" block loading={busy} disabled={!ready}>
            Log in
          </Button>
        </div>
      </motion.form>

      <motion.div {...rise(3)} className="mt-3">
        <Button
          variant="soft"
          size="lg"
          block
          icon={Play}
          onClick={onDemo}
          disabled={!ready || busy}
        >
          Start with a demo account
        </Button>
        <p className="newq mt-3 text-center text-[12.5px]">
          Creates a private throwaway account — nothing shared.
        </p>
      </motion.div>

      <motion.p {...rise(4)} className="newq mt-9 text-center text-[14px]">
        New here?{' '}
        <Link href="/signup" className="font-medium text-ink underline">
          Create an account
        </Link>
      </motion.p>
    </div>
  );
}
