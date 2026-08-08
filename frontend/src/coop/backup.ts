import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { Data, migrate } from "./lib";

// Export the whole dataset to a JSON file and open the share sheet.
export async function exportData(data: Data): Promise<boolean> {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const uri = `${FileSystem.documentDirectory}valeo-sauvegarde-${stamp}.json`;
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(data, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Sauvegarde VALEO" });
    }
    return true;
  } catch {
    return false;
  }
}

// Let the user pick a previously exported JSON and return the restored data.
export async function importData(): Promise<Data | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]?.uri) return null;
    const raw = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.members)) return null;
    return migrate(parsed);
  } catch {
    return null;
  }
}
