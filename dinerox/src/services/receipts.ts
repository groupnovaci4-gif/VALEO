/**
 * Justificatifs : photo compressée envoyée dans Firebase Storage sous
 * spaces/{spaceId}/receipts/ (règles : membres de l'espace uniquement).
 */
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { firebase } from './firebase';
import { newId } from '@/core/sync';

export async function uploadReceipt(spaceId: string, localUri: string): Promise<string> {
  const blob = await (await fetch(localUri)).blob();
  if (blob.size > 5 * 1024 * 1024) throw new Error('receipt/too-large');
  const r = ref(firebase().storage, `spaces/${spaceId}/receipts/${newId('rcp_')}.jpg`);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(r);
}
