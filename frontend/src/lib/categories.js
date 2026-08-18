import {
  Utensils,
  ShoppingCart,
  Home,
  Car,
  Plane,
  Zap,
  Film,
  HeartPulse,
  GraduationCap,
  Gift,
  Wifi,
  Dumbbell,
  Shirt,
  Coffee,
  Receipt,
  Wrench,
  PawPrint,
  Baby,
  Apple,
  Milk,
  Beef,
  Croissant,
  Snowflake,
  SprayCan,
  Wine,
  Cookie,
  Package,
} from 'lucide-react';

/* ------------------------------------------------------- expenses */

export const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Food & Drink', icon: Utensils, tint: '#F76707' },
  { id: 'groceries', label: 'Groceries', icon: ShoppingCart, tint: '#06A97F' },
  { id: 'rent', label: 'Rent & Home', icon: Home, tint: '#6C5CE7' },
  { id: 'transport', label: 'Transport', icon: Car, tint: '#2F7EF0' },
  { id: 'travel', label: 'Travel', icon: Plane, tint: '#1098AD' },
  { id: 'utilities', label: 'Utilities', icon: Zap, tint: '#E08600' },
  { id: 'entertainment', label: 'Entertainment', icon: Film, tint: '#D6336C' },
  { id: 'health', label: 'Health', icon: HeartPulse, tint: '#F2545B' },
  { id: 'education', label: 'Education', icon: GraduationCap, tint: '#7048E8' },
  { id: 'gifts', label: 'Gifts', icon: Gift, tint: '#E64980' },
  { id: 'internet', label: 'Internet & Phone', icon: Wifi, tint: '#0CA678' },
  { id: 'fitness', label: 'Fitness', icon: Dumbbell, tint: '#F59F00' },
  { id: 'shopping', label: 'Shopping', icon: Shirt, tint: '#AE3EC9' },
  { id: 'cafe', label: 'Coffee', icon: Coffee, tint: '#A0522D' },
  { id: 'repairs', label: 'Repairs', icon: Wrench, tint: '#868E96' },
  { id: 'pets', label: 'Pets', icon: PawPrint, tint: '#12B886' },
  { id: 'kids', label: 'Kids', icon: Baby, tint: '#4DABF7' },
  { id: 'other', label: 'Other', icon: Receipt, tint: '#5B6670' },
];

export const categoryOf = (id) =>
  EXPENSE_CATEGORIES.find((c) => c.id === id) ||
  EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

/* ------------------------------------------------------- groceries */

export const GROCERY_AISLES = [
  { id: 'produce', label: 'Fruit & Veg', icon: Apple, tint: '#06A97F' },
  { id: 'dairy', label: 'Dairy & Eggs', icon: Milk, tint: '#4DABF7' },
  { id: 'meat', label: 'Meat & Fish', icon: Beef, tint: '#F2545B' },
  { id: 'bakery', label: 'Bakery', icon: Croissant, tint: '#E08600' },
  { id: 'frozen', label: 'Frozen', icon: Snowflake, tint: '#1098AD' },
  { id: 'pantry', label: 'Pantry', icon: Package, tint: '#A0522D' },
  { id: 'snacks', label: 'Snacks', icon: Cookie, tint: '#D6336C' },
  { id: 'drinks', label: 'Drinks', icon: Wine, tint: '#7048E8' },
  { id: 'household', label: 'Household', icon: SprayCan, tint: '#868E96' },
];

export const aisleOf = (id) =>
  GROCERY_AISLES.find((a) => a.id === id) || GROCERY_AISLES[GROCERY_AISLES.length - 1];

export const UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'pack', 'dozen', 'box'];

/**
 * Guess an aisle from what the user typed, so adding items stays fast.
 */
const KEYWORDS = {
  produce: ['apple', 'banana', 'tomato', 'onion', 'potato', 'spinach', 'carrot', 'lemon', 'mango', 'grape', 'chilli', 'ginger', 'garlic', 'cucumber', 'salad', 'fruit', 'veg', 'coriander', 'lettuce', 'avocado', 'berry', 'orange'],
  dairy: ['milk', 'cheese', 'butter', 'yog', 'curd', 'paneer', 'cream', 'egg', 'ghee'],
  meat: ['chicken', 'mutton', 'fish', 'prawn', 'beef', 'pork', 'lamb', 'bacon', 'sausage', 'salmon', 'tuna'],
  bakery: ['bread', 'bun', 'cake', 'croissant', 'bagel', 'pastry', 'muffin', 'roll', 'baguette'],
  frozen: ['frozen', 'ice cream', 'peas', 'nugget', 'fries'],
  pantry: ['rice', 'flour', 'atta', 'dal', 'lentil', 'pasta', 'oil', 'sugar', 'salt', 'spice', 'masala', 'sauce', 'noodle', 'cereal', 'oats', 'honey', 'vinegar', 'can', 'bean'],
  snacks: ['chips', 'biscuit', 'cookie', 'chocolate', 'candy', 'namkeen', 'popcorn', 'nuts', 'snack'],
  drinks: ['water', 'juice', 'coke', 'pepsi', 'soda', 'beer', 'wine', 'coffee', 'tea', 'drink', 'cola'],
  household: ['soap', 'detergent', 'tissue', 'paper', 'clean', 'shampoo', 'brush', 'paste', 'bag', 'foil', 'wrap', 'sanitizer', 'towel', 'bulb', 'battery'],
};

export function guessAisle(name = '') {
  const n = name.toLowerCase().trim();
  if (!n) return 'pantry';
  for (const [aisle, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => n.includes(w))) return aisle;
  }
  return 'pantry';
}

/* ------------------------------------------------------- groups */

export const GROUP_TYPES = [
  { id: 'home', label: 'Home', emoji: '🏠' },
  { id: 'trip', label: 'Trip', emoji: '✈️' },
  { id: 'couple', label: 'Couple', emoji: '💞' },
  { id: 'friends', label: 'Friends', emoji: '🎉' },
  { id: 'work', label: 'Work', emoji: '💼' },
  { id: 'other', label: 'Other', emoji: '📁' },
];

export const GROUP_EMOJIS = ['🏠', '✈️', '🏝️', '🎉', '🍕', '💞', '💼', '🎬', '🏔️', '🚗', '🎓', '⚽', '🎸', '🛒', '🐾', '📁'];
