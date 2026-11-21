import {
  Bed, Bath, Shirt, Utensils, Backpack, BookOpen, Pencil, Dog, Cat, Trash2, ShowerHead, Sun, Moon, Smile,
  Footprints, ToyBrick, Apple, Droplets, Pill, Car, Bike, Music, Palette, Dumbbell, Heart, Star, Home,
  WashingMachine, Sparkles, Clock, Bus, Book, Calculator, Sprout, Soup, Milk, Carrot, Gamepad2, Tv,
  Phone, Mail, Users, Baby, Stethoscope, Thermometer, Flower2, Brush, Hand, Hammer, CookingPot, Coffee,
  School, Laptop, Glasses, Scissors, Package, ShoppingCart, Cake, Gift, Trophy, Flame, Wind, Waves, Sunrise,
  Sunset, Umbrella, Snowflake, CloudRain, Plane, Tent, TreePine, Fish, Bird, Rabbit, Puzzle, Timer, Bell,
  type LucideIcon,
} from 'lucide-react'

export interface IconDef { key: string; label: string; cat: string; I: LucideIcon }
const d = (key: string, label: string, cat: string, I: LucideIcon): IconDef => ({ key, label, cat, I })

export const ICONS: IconDef[] = [
  d('wake', 'Wake up', 'morning', Sun), d('bed', 'Make bed', 'morning', Bed), d('teeth', 'Brush teeth', 'morning', Sparkles),
  d('wash', 'Wash face', 'morning', Droplets), d('bath', 'Bath', 'morning', Bath), d('shower', 'Shower', 'morning', ShowerHead),
  d('dress', 'Get dressed', 'morning', Shirt), d('hair', 'Brush hair', 'morning', Brush), d('breakfast', 'Eat breakfast', 'morning', Utensils),
  d('shoes', 'Shoes on', 'morning', Footprints), d('backpack', 'Pack backpack', 'morning', Backpack), d('bus', 'Bus / ride', 'morning', Bus),
  d('vitamin', 'Vitamins', 'morning', Pill), d('toilet', 'Potty', 'morning', Hand),
  d('homework', 'Homework', 'school', Pencil), d('read', 'Read a book', 'school', BookOpen), d('book', 'Library book', 'school', Book),
  d('math', 'Math', 'school', Calculator), d('school', 'School', 'school', School), d('laptop', 'Computer', 'school', Laptop),
  d('glasses', 'Glasses', 'school', Glasses), d('scissors', 'Craft', 'school', Scissors), d('snack', 'Snack', 'school', Apple),
  d('lunch', 'Lunch', 'school', Soup), d('milk', 'Drink milk', 'school', Milk), d('carrot', 'Veggies', 'school', Carrot),
  d('trash', 'Take out trash', 'chores', Trash2), d('laundry', 'Laundry', 'chores', WashingMachine), d('dishes', 'Dishes', 'chores', Utensils),
  d('pet-dog', 'Feed dog', 'chores', Dog), d('pet-cat', 'Feed cat', 'chores', Cat), d('tidy', 'Tidy up toys', 'chores', ToyBrick),
  d('water-plants', 'Water plants', 'chores', Sprout), d('sweep', 'Sweep', 'chores', Brush), d('cook', 'Help cook', 'chores', CookingPot),
  d('home', 'Clean room', 'chores', Home), d('fix', 'Fix it', 'chores', Hammer), d('shop', 'Groceries', 'chores', ShoppingCart),
  d('package', 'Mail / package', 'chores', Package), d('flower', 'Garden', 'chores', Flower2), d('fish', 'Feed fish', 'chores', Fish), d('bird', 'Feed bird', 'chores', Bird), d('rabbit', 'Pet care', 'chores', Rabbit),
  d('pjs', 'Pajamas', 'bedtime', Moon), d('story', 'Story time', 'bedtime', BookOpen), d('cuddle', 'Cuddle', 'bedtime', Heart),
  d('lights', 'Lights out', 'bedtime', Moon), d('calm', 'Calm breaths', 'bedtime', Wind), d('sleep', 'Sleep', 'bedtime', Bed),
  d('stars', 'Say goodnight', 'bedtime', Star), d('sunset', 'Wind down', 'bedtime', Sunset), d('sunrise', 'Rise', 'bedtime', Sunrise),
  d('play', 'Play', 'fun', Gamepad2), d('tv', 'Screen time', 'fun', Tv), d('music', 'Music', 'fun', Music), d('art', 'Art', 'fun', Palette),
  d('puzzle', 'Puzzle', 'fun', Puzzle), d('bike', 'Bike', 'fun', Bike), d('exercise', 'Exercise', 'fun', Dumbbell), d('swim', 'Swim', 'fun', Waves),
  d('outside', 'Go outside', 'fun', TreePine), d('camp', 'Camp', 'fun', Tent), d('trophy', 'Game / match', 'fun', Trophy), d('cake', 'Party', 'fun', Cake), d('gift', 'Gift', 'fun', Gift),
  d('car', 'Car ride', 'out', Car), d('plane', 'Travel', 'out', Plane), d('phone', 'Call', 'out', Phone), d('mail', 'Email', 'out', Mail),
  d('family', 'Family time', 'out', Users), d('baby', 'Baby care', 'out', Baby), d('umbrella', 'Rain gear', 'out', Umbrella),
  d('snow', 'Coat / cold', 'out', Snowflake), d('rain', 'Rainy day', 'out', CloudRain), d('coffee', 'Coffee', 'out', Coffee),
  d('doctor', 'Doctor', 'care', Stethoscope), d('temp', 'Check temp', 'care', Thermometer), d('medicine', 'Medicine', 'care', Pill),
  d('smile', 'Kind words', 'care', Smile), d('fire', 'Safety', 'care', Flame), d('clock', 'Be on time', 'care', Clock),
  d('timer', 'Timer', 'care', Timer), d('bell', 'Reminder', 'care', Bell), d('wash-hands', 'Wash hands', 'care', Droplets),
]
export const ICON_CATS: Record<string, string> = {
  morning: 'Morning', school: 'School', chores: 'Chores', bedtime: 'Bedtime', fun: 'Fun', out: 'Out & about', care: 'Care',
}
const map = new Map(ICONS.map((i) => [i.key, i]))
export const getIcon = (k: string) => map.get(k) ?? map.get('star') ?? ICONS[0]
export function Ico({ k, size = 24, stroke = 2 }: { k: string; size?: number; stroke?: number }) {
  const I = (map.get(k)?.I ?? Star) as LucideIcon
  return <I size={size} strokeWidth={stroke} aria-hidden />
}
export const AVATARS = ['smile', 'star', 'heart', 'dog', 'rabbit', 'bird', 'fish', 'trophy', 'music', 'bike'] as const
export const AVATAR_ICON: Record<string, LucideIcon> = { smile: Smile, star: Star, heart: Heart, dog: Dog, rabbit: Rabbit, bird: Bird, fish: Fish, trophy: Trophy, music: Music, bike: Bike }
export function Avatar({ icon, color, size = 36 }: { icon: string; color: string; size?: number }) {
  const I = AVATAR_ICON[icon] ?? Smile
  return (
    <span className="avatar" style={{ background: color, width: size, height: size }}>
      <I size={size * 0.56} strokeWidth={2.2} color="#0b1020" aria-hidden />
    </span>
  )
}
