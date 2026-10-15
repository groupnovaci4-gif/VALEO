/**
 * I1 — Demande d'accord avant la première dictée (le son part au service de
 * reconnaissance du téléphone), ou message du pack de langue. Dans la page, jamais
 * une fenêtre système : le clavier et la phrase écrite restent juste dessous.
 */
import { View } from 'react-native';
import { Banner, Button, Text } from '@/components/ui';

export function VoiceConsentCard({ title, text, yes, no, onYes, onNo }: { title?: string; text: string; yes: string; no: string; onYes: () => void; onNo: () => void }) {
  return (
    <View style={{ alignSelf: 'stretch', gap: 4 }}>
      {title ? (
        <Text variant="bodyStrong" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Banner tone="info" icon="mic-outline" text={text} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button icon="mic-outline" label={yes} onPress={onYes} />
        <Button variant="secondary" icon="keypad-outline" label={no} onPress={onNo} />
      </View>
    </View>
  );
}
