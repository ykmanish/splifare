/**
 * What changed, in the words a person who uses Splitta would use.
 *
 * Hand-written on purpose. Commit subjects describe the diff, not the app —
 * "added" tells a user nothing — so this is the one place release notes are
 * written for the people who read them. Newest entry first; the update screen
 * shows the top one after it finishes.
 *
 * Keep each entry short: a title and three or four lines. Anything longer is
 * not read on a phone at the moment someone just wanted their app back.
 */

const CHANGELOG = [
  {
    version: '1.4',
    date: '2026-08-19',
    title: 'Photos, private accounts and a calmer expense screen',
    items: [
      'Add an expense from a photo — point it at a receipt or an order screen and the items fill themselves in.',
      'Tapping an expense now opens it to read. Editing is a separate choice from its menu, so a stray tap cannot change a bill.',
      'Only whoever added an expense can edit or delete it. Everyone on the split can still see it.',
      'Pick your own username instead of one made from your email.',
      'Close and delete your account from Settings, without losing anyone else’s history.',
    ],
  },
  {
    version: '1.3',
    date: '2026-08-18',
    title: 'Live updates and a new look',
    items: [
      'Balances, groups and notifications now arrive the moment they happen.',
      'A fresh set of colours and type across every screen.',
      'Share a payment message straight into Splitta to start an expense.',
      'A buzz when an expense lands or a bill is settled.',
    ],
  },
  {
    version: '1.2',
    date: '2026-08-17',
    title: 'Rooms, friends and other currencies',
    items: [
      'Groups have a room code — share it and people can join without a friend request.',
      'Friend requests, so nobody can add you to anything uninvited.',
      'Record an expense in any currency; totals convert at the day’s rate.',
      'Notifications on your phone, even with Splitta closed.',
    ],
  },
];

/** The newest entry — what someone taking an update is about to get. */
const LATEST = CHANGELOG[0] || null;

module.exports = { CHANGELOG, LATEST };
