/**
 * Who may change what.
 *
 * The server is the authority — these helpers only decide whether to *offer* an
 * action, so the UI never presents a button that would come back 403.
 */

/**
 * Only the person who entered an expense may edit or delete it. Everyone on the
 * split can see it, but a flatmate quietly rewriting the rent you recorded is a
 * balance moving under you with nothing to show who moved it.
 *
 * Rows written before `createdBy` existed fall back to "anyone involved", which
 * mirrors the server, so a legacy expense never becomes uneditable by everyone.
 */
export function canEditExpense(expense, meId) {
  if (!expense || !meId) return false;
  if (!expense.createdBy) {
    const ids = [...(expense.paidBy || []), ...(expense.splits || [])].map((r) => r.userId);
    return ids.includes(meId);
  }
  return expense.createdBy === meId;
}

/** Who entered it, for a "added by …" line on the read-only view. */
export const expenseOwnerId = (expense) => expense?.createdBy || null;
