'use client';

import { PillScroller } from '@/components/ui/Controls';
import { EXPENSE_CATEGORIES } from '@/lib/categories';

/**
 * Horizontal scroller of expense categories. Purely presentational —
 * reports the picked category id straight back up.
 */
export default function CategoryPicker({ value, onChange, className = '' }) {
  return (
    <PillScroller
      className={className}
      value={value}
      onChange={onChange}
      options={EXPENSE_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
        tint: c.tint,
      }))}
    />
  );
}
