import type { UserProfile } from '../store';
import { matchesRecordQuery } from './recordSearch';

export type BaziProfileInput = Omit<UserProfile, 'id'>;

export interface BaziEditorState {
  profileId: string | null;
  activeProfileId: string | null;
}

const PROFILE_FIELDS = ['name', 'gender', 'birthDate', 'birthTime', 'birthLocation', 'currentLocation'] as const;
const normalizeProfileValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function getBaziBirthFingerprint(profile: BaziProfileInput): string {
  return JSON.stringify([profile.gender, profile.birthDate, profile.birthTime, profile.birthLocation].map(normalizeProfileValue));
}

export function getBaziProfileFingerprint(profile: BaziProfileInput): string {
  return JSON.stringify(PROFILE_FIELDS.map(field => normalizeProfileValue(profile[field])));
}

export function filterBaziProfiles(profiles: UserProfile[], query: string): UserProfile[] {
  return profiles.filter(profile => matchesRecordQuery(query, profile.name, profile.birthDate, profile.birthTime, profile.birthLocation, profile.currentLocation));
}

export function restoreBaziEditor(profiles: UserProfile[], activeProfileId: string | null, form: BaziProfileInput, savedEditor?: BaziEditorState) {
  const activeProfile = profiles.find(profile => profile.id === activeProfileId);
  const hasKnownOwner = savedEditor && (savedEditor.profileId === null || typeof savedEditor.profileId === 'string')
    && (savedEditor.activeProfileId === null || typeof savedEditor.activeProfileId === 'string');
  const activeChanged = hasKnownOwner && savedEditor.activeProfileId !== activeProfileId;
  if (activeProfile && activeChanged) {
    const { id: _id, ...activeForm } = activeProfile;
    return { form: activeForm, editor: { profileId: activeProfile.id, activeProfileId }, reason: 'active-changed' as const };
  }
  if (hasKnownOwner && savedEditor.profileId === null && !activeChanged) {
    return { form, editor: { profileId: null, activeProfileId }, reason: 'new-draft' as const };
  }
  if (hasKnownOwner && activeProfile && savedEditor.profileId === activeProfile.id) {
    return { form, editor: { profileId: activeProfile.id, activeProfileId }, reason: 'owned-draft' as const };
  }
  if (!hasKnownOwner && activeProfile && getBaziProfileFingerprint(form) === getBaziProfileFingerprint(activeProfile)) {
    return { form, editor: { profileId: activeProfile.id, activeProfileId }, reason: 'legacy-matched' as const };
  }
  if (!hasKnownOwner && ['name', 'birthDate', 'birthTime', 'birthLocation', 'currentLocation'].every(field => !normalizeProfileValue(form[field as keyof BaziProfileInput]))) {
    return { form, editor: { profileId: null, activeProfileId }, reason: 'new-draft' as const };
  }
  return { form, editor: { profileId: null, activeProfileId }, reason: 'unconfirmed-draft' as const };
}

export function saveBaziProfile(profiles: UserProfile[], input: BaziProfileInput, editProfileId: string | null, newId: string) {
  const existing = editProfileId ? profiles.find(profile => profile.id === editProfileId) : undefined;
  if (editProfileId && !existing) throw new Error('要编辑的档案已不存在，请重新选择档案或新建。');
  const profile: UserProfile = { ...input, id: existing?.id || newId };
  return {
    profile,
    created: !existing,
    changed: Boolean(existing && getBaziProfileFingerprint(existing) !== getBaziProfileFingerprint(profile)),
    profiles: existing ? profiles.map(item => item.id === existing.id ? profile : item) : [...profiles, profile],
  };
}

export interface BaziResultOwner {
  profileId?: string;
  birthFingerprint?: string;
  profileSnapshot?: BaziProfileInput;
}

export function getBaziResultStatus(result: BaziResultOwner | null | undefined, profile: UserProfile | null | undefined, form?: BaziProfileInput) {
  if (!result) return 'empty' as const;
  if (typeof result.profileId !== 'string' || !result.profileId || typeof result.birthFingerprint !== 'string' || !result.birthFingerprint
    || !result.profileSnapshot || PROFILE_FIELDS.some(field => typeof result.profileSnapshot?.[field] !== 'string')) return 'legacy' as const;
  if (!profile || result.profileId !== profile.id) return 'other-profile' as const;
  if (result.birthFingerprint !== getBaziBirthFingerprint(profile)
    || getBaziProfileFingerprint(result.profileSnapshot) !== getBaziProfileFingerprint(profile)
    || form && getBaziProfileFingerprint(form) !== getBaziProfileFingerprint(profile)) return 'changed' as const;
  return 'current' as const;
}

export function createBaziRequestSnapshot(profile: UserProfile, revision: number) {
  return { profileId: profile.id, fingerprint: getBaziProfileFingerprint(profile), revision };
}

export function isBaziRequestCurrent(request: ReturnType<typeof createBaziRequestSnapshot>, profile: UserProfile | null | undefined, revision: number): boolean {
  return Boolean(profile && request.profileId === profile.id && request.revision === revision && request.fingerprint === getBaziProfileFingerprint(profile));
}
