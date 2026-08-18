'use client';

import Topbar from './Topbar';
import { useUI } from './AppShell';

/**
 * Standard screen frame: sticky topbar, an optional full-bleed hero, then a
 * gutter-padded main with enough bottom room to clear the nav bar and its
 * raised centre button.
 *
 * Deliberately free of animated wrappers — BottomNav is position:fixed and a
 * transformed ancestor would break it.
 */
export default function Page({
  title,
  subtitle,
  back,
  actions,
  padded = true,
  hero,
  children,
}) {
  const { openNotifications } = useUI();

  return (
    <>
      <Topbar
        title={title}
        subtitle={subtitle}
        back={back}
        right={actions}
        onOpenNotifications={openNotifications}
      />

      {hero}

      <main className={padded ? 'px-5 pb-32 pt-1' : 'pb-32'}>{children}</main>
    </>
  );
}
