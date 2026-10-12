/**
 * Icônes Ionicons (même jeu que @expo/vector-icons dans l'app), en SVG LOCAL :
 * seules les icônes listées ici sont embarquées. Toujours décoratives
 * (aria-hidden) : le sens est porté par le texte voisin ou un aria-label.
 */
const files = import.meta.glob(
  '../node_modules/ionicons/dist/svg/{add-outline,alert-circle,alert-circle-outline,analytics-outline,arrow-back-outline,arrow-down,arrow-up,ban,ban-outline,bar-chart-outline,calculator-outline,checkmark,checkmark-circle,checkmark-circle-outline,checkmark-done-outline,chevron-back,chevron-down,chevron-forward,close,close-circle,close-circle-outline,close-outline,cloud-offline-outline,contrast-outline,copy-outline,create-outline,document-lock-outline,document-text-outline,eye-outline,finger-print-outline,grid-outline,headset-outline,home-outline,information-circle,information-circle-outline,key-outline,layers,link-outline,list-outline,lock-closed,lock-closed-outline,log-in-outline,log-out-outline,mail-open-outline,mail-outline,mail-unread-outline,menu-outline,moon-outline,options-outline,people,people-outline,person-add-outline,person-outline,pulse,qr-code-outline,receipt-outline,refresh-outline,remove,remove-circle-outline,ribbon-outline,save-outline,search-outline,send-outline,settings-outline,shield-checkmark,shield-checkmark-outline,shield-half-outline,star-outline,sunny-outline,swap-horizontal,time-outline,trash-outline,trending-up,warning,construct-outline}.svg',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const SVG: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, raw]) => [path.split('/').pop()!.replace('.svg', ''), raw.replace(/<title>.*?<\/title>/, '')]),
);

export type IconName = string;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const svg = SVG[name];
  if (!svg && import.meta.env.DEV) console.warn(`icône inconnue : ${name}`);
  return <span className={`ic${className ? ` ${className}` : ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />;
}
