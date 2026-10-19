/**
 * Rubriques de l'application que l'IA peut nommer, ouvrir et interroger
 * (docs/ia-comprend-tout.md §2.0, §2.3). Module PUR.
 *
 * Chaque rubrique : identifiant stable, écran, libellé (clé i18n de l'écran ou de la ligne de
 * « Plus »), mots qui la désignent (fr + en, texte normalisé : minuscules, sans accents) et
 * droits (`can()` / `hasFeature()`) : une rubrique fermée par le rôle ou la formule reste fermée.
 * `tests/ia-intent.test.ts` vérifie que CHAQUE ligne de l'onglet Plus (`app/(tabs)/more.tsx`) a
 * sa rubrique ici, et une phrase dans le corpus.
 */
import type { Feature } from '../subscription';
import type { Action } from '../permissions';
import type { CollectionName } from '../types';

export type SectionId =
  | 'home'
  | 'budget'
  | 'goals'
  | 'history'
  | 'accounts'
  | 'savings'
  | 'tontines'
  | 'obligations'
  | 'seasons'
  | 'simulate'
  | 'debts'
  | 'assets'
  | 'recurring'
  | 'assistant'
  | 'analysis'
  | 'calendar'
  | 'independence'
  | 'rewards'
  | 'score'
  | 'family'
  | 'reports'
  | 'notifications'
  | 'categories'
  | 'invite'
  | 'whatsapp'
  | 'review'
  | 'subscription'
  | 'settings'
  | 'admin';

export interface Section {
  id: SectionId;
  /** Écran ouvert (« Ouvre mes tontines »). */
  path: string;
  /** Libellé affiché (clé i18n existante : titre de l'écran, ou ligne de « Plus »). */
  labelKey: string;
  /** Clé de la ligne de l'onglet Plus qui ouvre cette rubrique (absente : onglet). */
  moreKey?: string;
  /** Mots (normalisés) qui désignent la rubrique ; le plus long l'emporte. */
  words: string[];
  /** Droit de lecture nécessaire (miroir de `firestore.rules`). */
  can?: [Action, CollectionName];
  /** Fonction de la formule nécessaire pour ouvrir la rubrique. */
  feature?: Feature;
  /** Réservée à l'administrateur de l'application. */
  admin?: boolean;
}

export const SECTIONS: Section[] = [
  { id: 'home', path: '/', labelKey: 'tab.home', words: ['accueil', 'page d accueil', 'tableau de bord', 'home', 'dashboard'] },
  { id: 'budget', path: '/budget', labelKey: 'tab.budget', words: ['budget', 'mon budget', 'enveloppes', 'mes enveloppes', 'envelopes'] },
  { id: 'goals', path: '/goals', labelKey: 'tab.goals', words: ['objectifs', 'mes objectifs', 'projets', 'mes projets', 'goals', 'my goals'] },
  { id: 'history', path: '/transactions', labelKey: 'history.menu', moreKey: 'history.menu', words: ['historique', 'mes operations', 'operations', 'journal', 'history', 'transactions'] },
  { id: 'accounts', path: '/accounts', labelKey: 'acc.title', moreKey: 'acc.title', words: ['comptes', 'mes comptes', 'accounts', 'my accounts'] },
  { id: 'savings', path: '/savings', labelKey: 'sav.title', moreKey: 'sav.title', words: ['mon epargne', 'epargne', 'compte epargne', 'my savings', 'savings'] },
  { id: 'tontines', path: '/tontines', labelKey: 'tontine.title', moreKey: 'tontine.title', can: ['read', 'tontines'], words: ['tontines', 'mes tontines', 'tontine', 'my tontines'] },
  { id: 'obligations', path: '/obligations', labelKey: 'obl.title', moreKey: 'obl.title', can: ['read', 'recurring'], words: ['famille et obligations', 'obligations', 'soutiens', 'soutiens reguliers', 'family support', 'obligations'] },
  { id: 'seasons', path: '/seasons', labelKey: 'season.title', moreKey: 'season.title', words: ['moments forts', 'moment fort', 'fetes', 'evenements de l annee', 'key moments', 'seasons'] },
  { id: 'simulate', path: '/simulate', labelKey: 'sim.title', moreKey: 'sim.title', words: ['puis je contribuer', 'simulateur', 'simulation de contribution', 'can i contribute', 'simulator'] },
  { id: 'debts', path: '/debts', labelKey: 'debt.title', moreKey: 'debt.title', can: ['read', 'debts'], words: ['dettes', 'mes dettes', 'dettes et credits', 'credits', 'debts', 'loans'] },
  { id: 'assets', path: '/assets', labelKey: 'nw.title', moreKey: 'nw.title', can: ['read', 'assets'], feature: 'net_worth', words: ['patrimoine', 'mon patrimoine', 'biens', 'mes biens', 'valeur nette', 'net worth', 'assets'] },
  { id: 'recurring', path: '/recurring', labelKey: 'rec.title', moreKey: 'rec.title', can: ['read', 'recurring'], words: ['operations recurrentes', 'recurrences', 'paiements recurrents', 'recurring', 'recurring payments'] },
  { id: 'assistant', path: '/assistant', labelKey: 'ai.title', moreKey: 'ai.title', words: ['parler a dinerox', 'assistant', 'l assistant', 'dinerox ia', 'talk to dinerox'] },
  { id: 'analysis', path: '/analysis', labelKey: 'intel.title', moreKey: 'intel.title', words: ['analyse financiere', 'analyse', 'mon analyse', 'financial analysis', 'analysis'] },
  { id: 'calendar', path: '/calendar', labelKey: 'cal.title', moreKey: 'cal.title', words: ['calendrier', 'calendrier financier', 'echeancier', 'calendar'] },
  { id: 'independence', path: '/independence', labelKey: 'fi.title', moreKey: 'fi.title', words: ['independance financiere', 'independance', 'liberte financiere', 'financial independence'] },
  { id: 'rewards', path: '/rewards', labelKey: 'reward.title', moreKey: 'reward.title', words: ['recompenses', 'mes recompenses', 'trophees', 'badges', 'rewards'] },
  { id: 'score', path: '/score', labelKey: 'score.cta', moreKey: 'score.cta', words: ['score', 'mon score', 'note financiere', 'my score'] },
  { id: 'family', path: '/family', labelKey: 'fam.title', moreKey: 'fam.title', words: ['espace famille', 'espace familial', 'membres de la famille', 'family space', 'famille'] },
  { id: 'reports', path: '/reports', labelKey: 'rep.title', moreKey: 'rep.title', words: ['rapports', 'mes rapports', 'rapport', 'reports'] },
  { id: 'notifications', path: '/notifications', labelKey: 'notif.title', moreKey: 'notif.title', words: ['notifications', 'alertes', 'mes alertes', 'alerts'] },
  { id: 'categories', path: '/categories', labelKey: 'cat.title', moreKey: 'cat.title', can: ['create', 'categories'], words: ['categories', 'mes categories', 'sous categories'] },
  { id: 'invite', path: '/invite', labelKey: 'ref.title', moreKey: 'ref.title', words: ['parrainage', 'inviter', 'inviter un ami', 'code d invitation', 'invite a friend', 'referral'] },
  { id: 'whatsapp', path: '/more', labelKey: 'more.whatsappChannel', moreKey: 'more.whatsappChannel', words: ['chaine whatsapp', 'whatsapp', 'whatsapp channel'] },
  { id: 'review', path: '/more', labelKey: 'more.review', moreKey: 'more.review', words: ['donner mon avis', 'avis', 'noter l application', 'rate the app', 'review'] },
  { id: 'subscription', path: '/subscription', labelKey: 'sub.title', moreKey: 'sub.title', words: ['formules', 'ma formule', 'abonnement', 'mon abonnement', 'formule plus', 'subscription', 'plans'] },
  { id: 'settings', path: '/settings', labelKey: 'set.title', moreKey: 'set.title', words: ['parametres', 'reglages', 'settings'] },
  { id: 'admin', path: '/admin', labelKey: 'admin.title', moreKey: 'admin.title', admin: true, words: ['administration', 'admin', 'espace admin'] },
];

export const sectionById = (id: SectionId): Section => SECTIONS.find((s) => s.id === id)!;
