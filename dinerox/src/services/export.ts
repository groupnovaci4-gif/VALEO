/**
 * Exports : CSV des opérations, rapport PDF, export complet des données
 * (portabilité / RGPD). Les fichiers sont générés sur l'appareil puis
 * partagés via la feuille de partage du système — rien ne transite par
 * un serveur.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import type { SpaceData, UserProfile } from '@/core/types';

async function shareText(name: string, content: string, mimeType: string, UTI?: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle: name });
  return file.uri;
}

export function shareCsv(name: string, csv: string) {
  return shareText(name, csv, 'text/csv', 'public.comma-separated-values-text');
}

/** Export complet : profil (sans abonnement interne) + toutes les données des espaces fournis. */
export function shareFullExport(profile: UserProfile | null, spaces: { id: string; name: string; data: SpaceData }[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'dinerox-export-v1',
    profile: profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: profile.phone,
          country: profile.country,
          currency: profile.currency,
          language: profile.language,
          timezone: profile.timezone,
          preferences: profile.preferences,
          plan: profile.subscription?.plan,
          createdAt: profile.createdAt,
        }
      : null,
    spaces,
  };
  return shareText(`export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json', 'public.json');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface PdfSection {
  title: string;
  rows: [string, string][];
}

/** Rapport PDF simple et lisible (HTML → PDF natif). */
export async function sharePdf(name: string, title: string, subtitle: string, sections: PdfSection[], footer: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#152033;padding:28px}
    h1{font-size:22px;margin:0 0 4px}.sub{color:#64748B;margin-bottom:22px}
    h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #E2E8F0;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 0;border-bottom:1px solid #F1F5F9}
    td:last-child{text-align:right;font-weight:600}.foot{margin-top:28px;color:#94A3B8;font-size:11px}
  </style></head><body>
  <h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div>
  ${sections.map((s) => `<h2>${esc(s.title)}</h2><table>${s.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>`).join('')}
  <div class="foot">${esc(footer)}</div></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
  return uri;
}
