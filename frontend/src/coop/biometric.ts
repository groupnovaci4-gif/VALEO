// VALEO — biométrie (empreinte / Face ID) + mémorisation locale du dernier compte.
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const KEY = "valeo.lastSession";

export type BiometricState = { available: boolean; label: string };

export async function getBiometricState(): Promise<BiometricState> {
  if (Platform.OS === "web") return { available: false, label: "biométrie" };
  try {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHw || !enrolled) return { available: false, label: "biométrie" };
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    return { available: true, label: face ? "Face ID" : "empreinte" };
  } catch {
    return { available: false, label: "biométrie" };
  }
}

export async function promptBiometric(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "Connexion avec la biométrie",
      cancelLabel: "Utiliser le code",
      fallbackLabel: "Utiliser le code",
      disableDeviceFallback: false,
    });
    return !!r.success;
  } catch {
    return false;
  }
}

export async function saveSession(session: any): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session), { keychainAccessible: SecureStore.WHEN_UNLOCKED });
  } catch {
    /* ignore */
  }
}

export async function readSession(): Promise<any | null> {
  if (Platform.OS === "web") return null;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}
