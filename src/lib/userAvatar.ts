import { supabase } from './supabase';

export const USER_AVATAR_BUCKET = 'user-avatars';

export function getUserAvatarUrl(path?: string | null): string {
  if (!path) return '';
  const { data } = supabase.storage.from(USER_AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl || '';
}

export async function uploadUserAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('invalid_avatar_type');
  if (file.size > 5 * 1024 * 1024) throw new Error('avatar_too_large');

  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(USER_AVATAR_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;
  return path;
}

export async function removeUserAvatar(path?: string | null): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(USER_AVATAR_BUCKET).remove([path]);
  if (error) throw error;
}
