/**
 * Administration du parrainage : chiffres AGRÉGÉS (Cloud Function
 * `adminReferralStats`, réservée au droit `admin`) et réglage du mode
 * ambassadeur (`setAmbassador`). Aucun montant ; seuls le prénom et le code
 * des 20 meilleurs parrains (et des comptes suspects) sont montrés.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { useI18n } from '@/i18n';
import { Button, Card, ErrorState, Field, Loading, Row, SectionHeader, Text, useToast } from '@/components/ui';
import { firebase } from '@/services/firebase';
import { isValidCode, normalizeCode } from '@/core/referral';

interface ParrainRow {
  code: string;
  firstName: string;
  signups: number;
  validated: number;
  monthsEarned: number;
  ambassador: boolean;
  maxRewardsPerMonth: number;
  refusals: Record<string, number>;
}

interface ReferralStats {
  codes: number;
  sharesWithConsent: number;
  signups: number;
  validated: number;
  expired: number;
  validationRate: number;
  top: ParrainRow[];
  suspects: ParrainRow[];
}

export function ReferralAdmin() {
  const { t } = useI18n();
  const toast = useToast();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [error, setError] = useState(false);
  const [code, setCode] = useState('');
  const [cap, setCap] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchStats = useCallback(
    () =>
      httpsCallable<unknown, ReferralStats>(firebase().functions, 'adminReferralStats')({})
        .then((r) => setStats(r.data))
        .catch(() => setError(true)),
    [],
  );
  const load = () => {
    setError(false);
    void fetchStats();
  };
  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const save = async (enabled: boolean) => {
    const c = normalizeCode(code);
    const n = cap.trim() ? Number(cap.trim()) : undefined;
    if (!isValidCode(c)) return setFormError(t('ref.err.invalid'));
    if (n !== undefined && !(Number.isInteger(n) && n >= 0 && n <= 1000)) return setFormError(t('admin.ref.amb.cap'));
    setBusy(true);
    setFormError(null);
    try {
      await httpsCallable(firebase().functions, 'setAmbassador')({ code: c, enabled, maxRewardsPerMonth: n });
      toast.show(t('admin.ref.amb.saved'));
      load();
    } catch {
      setFormError(t('ref.err.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const line = (r: ParrainRow) => t('admin.ref.row', { name: r.firstName || '—', code: r.code, signups: r.signups, validated: r.validated, months: r.monthsEarned });
  const refusals = (r: ParrainRow) =>
    Object.entries(r.refusals)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');

  return (
    <>
      <SectionHeader title={t('admin.ref.title')} />
      {error ? (
        <ErrorState onRetry={load} />
      ) : !stats ? (
        <Loading />
      ) : (
        <>
          <Card>
            <Row title={t('admin.ref.codes')} right={<Text weight="700">{stats.codes}</Text>} />
            <Row title={t('admin.ref.shares')} right={<Text weight="700">{stats.sharesWithConsent}</Text>} />
            <Row title={t('admin.ref.signups')} right={<Text weight="700">{stats.signups}</Text>} />
            <Row title={t('admin.ref.validated')} right={<Text weight="700">{stats.validated}</Text>} />
            <Row title={t('admin.ref.expired')} right={<Text weight="700">{stats.expired}</Text>} />
            <Row title={t('admin.ref.rate')} right={<Text weight="700">{`${Math.round(stats.validationRate * 100)} %`}</Text>} />
          </Card>
          <SectionHeader title={t('admin.ref.top')} />
          <Card>
            {stats.top.length ? (
              stats.top.map((r) => <Row key={r.code} title={line(r)} subtitle={r.ambassador ? t('admin.ref.ambassador', { cap: r.maxRewardsPerMonth }) : undefined} />)
            ) : (
              <Text tone="muted">{t('admin.ref.empty')}</Text>
            )}
          </Card>
          {stats.suspects.length ? (
            <>
              <SectionHeader title={t('admin.ref.suspects')} />
              <Card>
                {stats.suspects.map((r) => (
                  <Row key={r.code} title={line(r)} subtitle={t('admin.ref.refusals', { list: refusals(r) })} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
      <SectionHeader title={t('admin.ref.amb.title')} />
      <Card>
        <Field label={t('admin.ref.amb.code')} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={12} error={formError} />
        <Field label={t('admin.ref.amb.cap')} value={cap} onChangeText={setCap} keyboardType="number-pad" inputMode="numeric" maxLength={4} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button label={t('admin.ref.amb.enable')} loading={busy} onPress={() => void save(true)} />
          <Button variant="secondary" label={t('admin.ref.amb.disable')} disabled={busy} onPress={() => void save(false)} />
        </View>
      </Card>
    </>
  );
}
