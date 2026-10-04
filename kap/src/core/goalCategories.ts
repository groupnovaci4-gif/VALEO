/**
 * Catégories d'objectifs — registre EXTENSIBLE.
 *
 * Les catégories ne sont pas codées en dur dans les écrans : l'écran de
 * création lit `resolveGoalCategories(remote)`, qui fusionne ces valeurs par
 * défaut avec celles publiées par les administrateurs dans Firestore
 * (collection `config/goalCategories/items`). Un administrateur peut ainsi
 * ajouter, renommer, réordonner ou désactiver une catégorie sans mise à jour
 * de l'application.
 */
import type { GoalType } from './types';

export interface GoalTemplate {
  id: string;
  /** Libellé par langue. */
  label: { fr: string; en: string };
  /** Nom proposé pour l'objectif (« Ma voiture »). */
  defaultName?: { fr: string; en: string };
  icon?: string;
}

export interface GoalCategory {
  id: string;
  label: { fr: string; en: string };
  description: { fr: string; en: string };
  /** Emoji : lisible partout, pas de dépendance à une police d'icônes. */
  icon: string;
  order: number;
  active: boolean;
  type: GoalType;
  templates: GoalTemplate[];
  /** Mots-clés pour la suggestion automatique de catégorie. */
  keywords: string[];
}

const t = (id: string, fr: string, en: string, name?: [string, string], icon?: string): GoalTemplate => ({
  id,
  label: { fr, en },
  defaultName: name ? { fr: name[0], en: name[1] } : undefined,
  icon,
});

export const DEFAULT_GOAL_CATEGORIES: GoalCategory[] = [
  {
    id: 'vehicle',
    label: { fr: 'Véhicule', en: 'Vehicle' },
    description: { fr: 'Voiture, moto, taxi, tricycle…', en: 'Car, motorbike, taxi…' },
    icon: '🚗',
    order: 1,
    active: true,
    type: 'purchase',
    templates: [
      t('buy_car', 'Acheter une voiture', 'Buy a car', ['Ma voiture', 'My car'], '🚗'),
      t('buy_moto', 'Acheter une moto', 'Buy a motorbike', ['Ma moto', 'My motorbike'], '🏍️'),
      t('buy_vehicle', 'Acheter un autre véhicule', 'Buy another vehicle', ['Mon véhicule', 'My vehicle'], '🚐'),
    ],
    keywords: ['voiture', 'auto', 'moto', 'taxi', 'véhicule', 'vehicule', 'camion', 'tricycle', 'scooter', 'car', 'bike', 'gbaka', 'woro'],
  },
  {
    id: 'real_estate',
    label: { fr: 'Immobilier', en: 'Real estate' },
    description: { fr: 'Terrain, maison, construction, rénovation', en: 'Land, house, building, renovation' },
    icon: '🏠',
    order: 2,
    active: true,
    type: 'construction',
    templates: [
      t('buy_land', 'Acheter un terrain', 'Buy land', ['Mon terrain', 'My land'], '🏞️'),
      t('buy_house', 'Acheter une maison', 'Buy a house', ['Ma maison', 'My house'], '🏡'),
      t('build_house', 'Construire une maison', 'Build a house', ['Ma maison', 'My house'], '🏗️'),
      t('renovate_house', 'Rénover une maison', 'Renovate a house', ['Rénovation', 'Renovation'], '🛠️'),
    ],
    keywords: ['terrain', 'maison', 'construire', 'construction', 'rénover', 'renover', 'appartement', 'villa', 'hectare', 'parcelle', 'lot', 'immobilier', 'house', 'land'],
  },
  {
    id: 'professional',
    label: { fr: 'Professionnel', en: 'Business' },
    description: { fr: 'Machine, matériel, entreprise, activité', en: 'Machine, equipment, business' },
    icon: '💼',
    order: 3,
    active: true,
    type: 'professional',
    templates: [
      t('buy_machine', 'Acheter une machine', 'Buy a machine', ['Ma machine', 'My machine'], '⚙️'),
      t('pro_equipment', 'Acheter du matériel professionnel', 'Buy professional equipment', ['Mon matériel', 'My equipment'], '🧰'),
      t('start_business', 'Créer une entreprise', 'Start a business', ['Mon entreprise', 'My business'], '🏪'),
      t('grow_business', 'Développer mon activité', 'Grow my business', ['Mon commerce', 'My business'], '📈'),
      t('farm_equipment', 'Acheter du matériel agricole', 'Buy farm equipment', ['Matériel agricole', 'Farm equipment'], '🚜'),
    ],
    keywords: ['machine', 'matériel', 'materiel', 'équipement', 'equipement', 'entreprise', 'commerce', 'boutique', 'restaurant', 'maquis', 'activité', 'activite', 'agricole', 'tracteur', 'cacao', 'transformation', 'atelier', 'business', 'magasin', 'congélateur', 'congelateur', 'glace', 'moulin', 'stock'],
  },
  {
    id: 'education',
    label: { fr: 'Éducation', en: 'Education' },
    description: { fr: 'Formation, études, scolarité des enfants', en: 'Training, studies, school fees' },
    icon: '🎓',
    order: 4,
    active: true,
    type: 'family',
    templates: [
      t('training', 'Formation', 'Training', ['Ma formation', 'My training'], '📚'),
      t('studies', 'Études', 'Studies', ['Mes études', 'My studies'], '🎓'),
      t('child_studies', "Études d'un enfant", "A child's studies", ['Les études de mon enfant', "My child's studies"], '🎒'),
    ],
    keywords: ['formation', 'études', 'etudes', 'école', 'ecole', 'scolarité', 'scolarite', 'université', 'universite', 'master', 'diplôme', 'permis', 'cours', 'school'],
  },
  {
    id: 'family',
    label: { fr: 'Famille', en: 'Family' },
    description: { fr: 'Mariage, projet familial, grosse dépense', en: 'Wedding, family project' },
    icon: '👨‍👩‍👧',
    order: 5,
    active: true,
    type: 'family',
    templates: [
      t('wedding', 'Mariage', 'Wedding', ['Mon mariage', 'My wedding'], '💍'),
      t('family_project', 'Projet familial', 'Family project', ['Projet familial', 'Family project'], '👨‍👩‍👧'),
      t('family_expense', 'Dépense importante pour la famille', 'Major family expense', ['Dépense familiale', 'Family expense'], '🏠'),
    ],
    keywords: ['mariage', 'dot', 'famille', 'familial', 'parents', 'baptême', 'bapteme', 'funérailles', 'funerailles', 'naissance', 'wedding'],
  },
  {
    id: 'personal',
    label: { fr: 'Vie personnelle', en: 'Personal life' },
    description: { fr: 'Voyage, téléphone, ordinateur, gros achat', en: 'Travel, phone, computer' },
    icon: '✈️',
    order: 6,
    active: true,
    type: 'purchase',
    templates: [
      t('travel', 'Voyage', 'Travel', ['Mon voyage', 'My trip'], '✈️'),
      t('phone', 'Téléphone', 'Phone', ['Mon téléphone', 'My phone'], '📱'),
      t('computer', 'Ordinateur', 'Computer', ['Mon ordinateur', 'My computer'], '💻'),
      t('big_purchase', 'Autre achat important', 'Other big purchase', ['Mon achat', 'My purchase'], '🛍️'),
    ],
    keywords: ['voyage', 'vacances', 'téléphone', 'telephone', 'iphone', 'smartphone', 'ordinateur', 'laptop', 'pc', 'télé', 'tele', 'meuble', 'pèlerinage', 'pelerinage', 'travel', 'phone'],
  },
  {
    id: 'finance',
    label: { fr: 'Finance', en: 'Finance' },
    description: { fr: "Fonds d'urgence, épargne, retraite, dette", en: 'Emergency fund, savings, retirement' },
    icon: '💰',
    order: 7,
    active: true,
    type: 'financial',
    templates: [
      t('emergency_fund', "Fonds d'urgence", 'Emergency fund', ["Mon fonds d'urgence", 'My emergency fund'], '🛡️'),
      t('savings', 'Épargne', 'Savings', ['Mon épargne', 'My savings'], '🐷'),
      t('investment', 'Investissement', 'Investment', ['Mon investissement', 'My investment'], '📊'),
      t('retirement', 'Retraite', 'Retirement', ['Ma retraite', 'My retirement'], '🌅'),
      t('repay_debt', "Remboursement d'une dette", 'Repay a debt', ['Rembourser ma dette', 'Repay my debt'], '🧾'),
      t('capital', 'Constituer un capital', 'Build capital', ['Mon capital', 'My capital'], '💰'),
    ],
    keywords: ['urgence', 'épargne', 'epargne', 'économiser', 'economiser', 'retraite', 'investir', 'investissement', 'dette', 'rembourser', 'crédit', 'credit', 'capital', 'tontine', 'placement', 'bourse'],
  },
];

/** Identifiant réservé à l'objectif personnalisé (toujours proposé). */
export const CUSTOM_GOAL_CATEGORY = 'custom';

/**
 * Fusionne les catégories par défaut avec celles publiées par les admins :
 * même `id` = surcharge, nouvel `id` = ajout. Les inactives sont retirées.
 */
export function resolveGoalCategories(remote: Partial<GoalCategory>[] = []): GoalCategory[] {
  const map = new Map<string, GoalCategory>(DEFAULT_GOAL_CATEGORIES.map((c) => [c.id, c]));
  for (const r of remote) {
    if (!r.id || r.id === CUSTOM_GOAL_CATEGORY) continue;
    const base = map.get(r.id);
    if (base) map.set(r.id, { ...base, ...r } as GoalCategory);
    else if (r.label && r.icon) {
      map.set(r.id, {
        id: r.id,
        label: r.label,
        description: r.description ?? { fr: '', en: '' },
        icon: r.icon,
        order: r.order ?? 99,
        active: r.active ?? true,
        type: r.type ?? 'custom',
        templates: r.templates ?? [],
        keywords: r.keywords ?? [],
      });
    }
  }
  return [...map.values()].filter((c) => c.active).sort((a, b) => a.order - b.order);
}

export function findGoalCategory(id: string, categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES): GoalCategory | undefined {
  return categories.find((c) => c.id === id);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ');

/**
 * Suggère une catégorie pour un objectif libre (« Acheter une machine de
 * transformation de cacao » → professional). Renvoie null si aucun indice :
 * l'objectif reste alors « personnalisé ». Ce n'est qu'une SUGGESTION.
 */
export function suggestGoalCategory(
  text: string,
  categories: GoalCategory[] = DEFAULT_GOAL_CATEGORIES,
): { category: GoalCategory; template?: GoalTemplate; score: number } | null {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  let best: { category: GoalCategory; template?: GoalTemplate; score: number } | null = null;
  for (const c of categories) {
    let score = 0;
    for (const k of c.keywords) {
      const nk = normalize(k).trim();
      if (!nk) continue;
      if (words.includes(nk)) score += 2;
      else if (words.some((w) => w.length > 3 && (w.startsWith(nk) || nk.startsWith(w)))) score += 1;
    }
    if (score > (best?.score ?? 0)) best = { category: c, score };
  }
  if (!best) return null;
  // Modèle le plus proche dans la catégorie retenue.
  const nt = normalize(text);
  let bestTpl: GoalTemplate | undefined;
  let bestTplScore = 0;
  for (const tpl of best.category.templates) {
    const tw = normalize(tpl.label.fr).split(/\s+/).filter((w) => w.length > 3);
    const s = tw.filter((w) => nt.includes(w)).length;
    if (s > bestTplScore) {
      bestTplScore = s;
      bestTpl = tpl;
    }
  }
  return { ...best, template: bestTpl };
}
