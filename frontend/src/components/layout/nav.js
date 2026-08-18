import { Home, Users, UserRound, ShoppingBasket, Activity, CircleUser } from 'lucide-react';

export const NAV = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/groups', label: 'Groups', icon: Users },
  { href: '/friends', label: 'Friends', icon: UserRound },
  { href: '/lists', label: 'Lists', icon: ShoppingBasket },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Profile', icon: CircleUser },
];

export const isActive = (pathname, href) =>
  pathname === href || pathname.startsWith(`${href}/`);
