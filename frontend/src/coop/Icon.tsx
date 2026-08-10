import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React from "react";

// Map lucide-react icon names (kebab-case) to @expo/vector-icons families.
type Fam = "feather" | "ion" | "mci";
const MAP: Record<string, [Fam, string]> = {
  users: ["feather", "users"],
  user: ["feather", "user"],
  "user-plus": ["feather", "user-plus"],
  scale: ["mci", "scale-balance"],
  receipt: ["mci", "receipt"],
  plus: ["feather", "plus"],
  "map-pin": ["feather", "map-pin"],
  "arrow-left": ["feather", "arrow-left"],
  x: ["feather", "x"],
  settings: ["feather", "settings"],
  "trending-up": ["feather", "trending-up"],
  camera: ["feather", "camera"],
  briefcase: ["feather", "briefcase"],
  package: ["feather", "package"],
  check: ["feather", "check"],
  banknote: ["mci", "cash"],
  coins: ["mci", "cash-multiple"],
  wallet: ["mci", "wallet"],
  printer: ["feather", "printer"],
  smartphone: ["feather", "smartphone"],
  landmark: ["mci", "bank"],
  "log-out": ["feather", "log-out"],
  clock: ["feather", "clock"],
  "check-circle": ["feather", "check-circle"],
  "x-circle": ["feather", "x-circle"],
  truck: ["feather", "truck"],
  clipboard: ["mci", "clipboard-list-outline"],
  link: ["feather", "link"],
  building: ["mci", "office-building"],
  sprout: ["mci", "sprout"],
  "piggy-bank": ["mci", "piggy-bank"],
  "chevron-right": ["feather", "chevron-right"],
  "shield-check": ["mci", "shield-check"],
  key: ["feather", "key"],
  bell: ["feather", "bell"],
  activity: ["feather", "activity"],
  edit: ["feather", "edit-2"],
  search: ["feather", "search"],
  share: ["feather", "share-2"],
  "trash": ["feather", "trash-2"],
  award: ["feather", "award"],
  "handshake": ["mci", "handshake-outline"],
};

export function Icon({ name, size = 20, color = "#000" }: { name: string; size?: number; color?: string }) {
  const entry = MAP[name] || MAP["package"];
  const [fam, icon] = entry;
  if (fam === "feather") return <Feather name={icon as any} size={size} color={color} />;
  if (fam === "ion") return <Ionicons name={icon as any} size={size} color={color} />;
  return <MaterialCommunityIcons name={icon as any} size={size} color={color} />;
}
