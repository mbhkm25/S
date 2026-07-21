import { supabase } from './supabase';
import { optimizeImageForUpload } from './imageOptimization';

export const USER_AVATAR_BUCKET = 'user-avatars';

export function getUserAvatarUrl(path?: string | null): string {
  if (!path) return '';
  const { data } = supabase.storage.from(USER_AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl || '';
}

export async function uploadUserAvatar(userId: string, file: File): Promise<string> {
  const optimized = await optimizeImageForUpload(file, 'avatar');
  const path = `${userId}/avatar-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(USER_AVATAR_BUCKET).upload(path, optimized, {
    cacheControl: '31536000',
    upsert: false,
    contentType: 'image/webp'
  });
  if (error) throw error;
  return path;
}

export async function removeUserAvatar(path?: string | null): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(USER_AVATAR_BUCKET).remove([path]);
  if (error) throw error;
}
