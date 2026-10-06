import { describe, expect, it } from 'vitest';
import { applyPending, pendingOf, queuePatch } from '../src/core/profilePending';
import type { UserProfile } from '../src/core/types';

const server = (over: Partial<UserProfile> = {}): UserProfile =>
  ({
    uid: 'u1', firstName: 'Awa', lastName: 'Koffi', email: 'a@ex.com', phone: null, country: 'CI', currency: 'XOF', photoURL: null,
    language: 'fr', timezone: 'Africa/Abidjan', preferences: { theme: 'dark' }, onboarding: { completed: false },
    termsAcceptedVersion: '1', createdAt: 1, updatedAt: 100, ...over,
  }) as unknown as UserProfile;

describe('profil en attente de confirmation serveur', () => {
  it("un instantané serveur plus ancien n'efface pas « onboarding terminé »", () => {
    const pending = queuePatch(null, { onboarding: { completed: true } }, 200);
    const profile = applyPending(server(), pending);
    expect(profile.onboarding.completed).toBe(true);
    expect(profile.firstName).toBe('Awa');
  });
  it('un instantané plus récent (qui intègre la modification) est affiché tel quel', () => {
    const pending = queuePatch(null, { onboarding: { completed: true } }, 200);
    const s = server({ updatedAt: 250, onboarding: { completed: true } });
    expect(applyPending(s, pending)).toBe(s);
  });
  it('les modifications successives se cumulent (objets imbriqués fusionnés)', () => {
    let p = queuePatch(null, { currency: 'EUR', preferences: { theme: 'light' } as UserProfile['preferences'] }, 150);
    p = queuePatch(p, { onboarding: { completed: true } }, 160);
    const profile = applyPending(server(), p);
    expect(profile.currency).toBe('EUR');
    expect(profile.onboarding.completed).toBe(true);
    expect(p.at).toBe(160);
  });
  it('sans modification en attente, le serveur fait foi', () => {
    const s = server();
    expect(applyPending(s, null)).toBe(s);
  });
  it("appareil partagé : la modification en attente de A n'est jamais appliquée au profil de B", () => {
    const holder = { uid: 'userA', data: queuePatch(null, { firstName: 'Awa', financial: { monthlyIncome: 500000 } }, 200) };
    expect(pendingOf(holder, 'userB')).toBeNull();
    const b = applyPending(server({ uid: 'userB', firstName: 'Bakary', updatedAt: 50 }), pendingOf(holder, 'userB'));
    expect(b.firstName).toBe('Bakary');
    expect((b as unknown as { financial?: unknown }).financial).toBeUndefined();
    expect(pendingOf(holder, 'userA')).toBe(holder.data);
  });
});
