/** Appels aux Cloud Functions `bo…` : le SEUL accès du portail aux données. */
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function call<T = Record<string, unknown>>(name: string, data: unknown = {}): Promise<T> {
  const fn = httpsCallable(functions, name);
  const res = await fn(data);
  return res.data as T;
}

export type Permission =
  | 'users.view' | 'users.create' | 'users.edit' | 'users.changePlan' | 'users.suspend' | 'users.delete'
  | 'stats.view' | 'audit.view' | 'staff.manage' | 'data.view' | 'data.delete';

export interface Me {
  uid: string;
  email: string;
  displayName: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
  sessionExpiresAt: number;
  recoveryLeft: number;
}

export interface UserSummary {
  uid: string;
  email: string | null;
  firstName: string;
  lastName: string;
  country: string | null;
  currency: string | null;
  language: string | null;
  plan: string;
  planStatus: string;
  planProvider: string;
  planEndsAt: number | null;
  createdAt: number | null;
  lastActiveAt: number | null;
  status: 'active' | 'suspended';
  hasProfile: boolean;
}

export interface AuditEntry {
  seq: number;
  atMs: number;
  actorUid: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  result: 'ok' | 'denied' | 'error';
  code: string | null;
  reasonCode: string | null;
  reasonNote: string | null;
  targetUid: string | null;
  targetLabel: string | null;
  targetDisplay: string | null;
  spaceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  refs: string[] | null;
  effects: Record<string, number> | null;
  prevHash: string;
  hash: string;
}
