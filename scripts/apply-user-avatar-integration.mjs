import { readFileSync, writeFileSync } from 'node:fs';

function update(path, transform) {
  const beforeRaw = readFileSync(path, 'utf8');
  const usesCrlf = beforeRaw.includes('\r\n');
  const before = beforeRaw.replace(/\r\n/g, '\n');
  const after = transform(before);
  if (after === before) {
    console.log(`No change: ${path}`);
    return;
  }
  const output = usesCrlf ? after.replace(/\n/g, '\r\n') : after;
  writeFileSync(path, output, 'utf8');
  console.log(`Updated: ${path}`);
}

function replaceRequired(text, search, replacement, label) {
  if (text.includes(replacement)) return text;
  if (!text.includes(search)) throw new Error(`Missing expected block: ${label}`);
  return text.replace(search, replacement);
}

update('src/types.ts', text => {
  if (text.includes('avatar_path?: string | null;')) return text;
  return replaceRequired(
    text,
    '  governorate?: string | null;\n',
    '  governorate?: string | null;\n  avatar_path?: string | null;\n',
    'Profile.avatar_path'
  );
});

update('src/App.tsx', text => {
  if (!text.includes("import { getUserAvatarUrl } from './lib/userAvatar';")) {
    text = replaceRequired(
      text,
      "import { isBasicProfileComplete } from './lib/profileUtils';\n",
      "import { isBasicProfileComplete } from './lib/profileUtils';\nimport { getUserAvatarUrl } from './lib/userAvatar';\n",
      'App avatar import'
    );
  }

  const oldAvatar = `                    <div className="w-6.5 h-6.5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px]">\n                      {profile ? (profile.full_name?.slice(0, 1) || 'أ') : '...'}\n                    </div>`;
  const newAvatar = `                    <button type="button" onClick={() => navigateTo('profile')} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-white ring-2 ring-white shadow-sm" aria-label="فتح حسابي">\n                      {profile?.avatar_path ? (\n                        <img src={getUserAvatarUrl(profile.avatar_path)} alt={profile.full_name || 'صورة المستخدم'} className="h-full w-full object-cover" />\n                      ) : (\n                        <span className="text-sm font-bold">{profile ? (profile.full_name?.slice(0, 1) || 'أ') : '...'}</span>\n                      )}\n                    </button>`;
  return replaceRequired(text, oldAvatar, newAvatar, 'global header avatar');
});

update('src/components/Auth.tsx', text => {
  text = text.replace(
    "import React, { useState } from 'react';",
    "import React, { useEffect, useState } from 'react';"
  );
  text = text.replace(
    "import { Lock, Mail, User, AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';",
    "import { Lock, Mail, User, AlertCircle, CheckCircle2, Loader2, Sparkles, Camera } from 'lucide-react';"
  );

  if (!text.includes("import { uploadUserAvatar } from '../lib/userAvatar';")) {
    text = replaceRequired(
      text,
      "import { logAuthDiagnostic } from '../lib/authDiagnostics';\n",
      "import { logAuthDiagnostic } from '../lib/authDiagnostics';\nimport { uploadUserAvatar } from '../lib/userAvatar';\n",
      'Auth avatar import'
    );
  }

  if (!text.includes('const [avatarFile')) {
    text = replaceRequired(
      text,
      "  const [governorate, setGovernorate] = useState('');\n",
      "  const [governorate, setGovernorate] = useState('');\n  const [avatarFile, setAvatarFile] = useState<File | null>(null);\n  const [avatarPreview, setAvatarPreview] = useState('');\n",
      'Auth avatar state'
    );
    text = replaceRequired(
      text,
      '  // Translate standard Supabase auth/db errors',
      "  useEffect(() => {\n    if (!avatarFile) {\n      setAvatarPreview('');\n      return;\n    }\n    const url = URL.createObjectURL(avatarFile);\n    setAvatarPreview(url);\n    return () => URL.revokeObjectURL(url);\n  }, [avatarFile]);\n\n  // Translate standard Supabase auth/db errors",
      'Auth avatar preview effect'
    );
  }

  const oldSuccess = "          const userProfile = await ensureProfileExists(authData.user);\n          setSuccessMessage('تم إنشاء الحساب بنجاح!');";
  const newSuccess = "          let userProfile = await ensureProfileExists(authData.user);\n          if (avatarFile) {\n            const avatarPath = await uploadUserAvatar(authData.user.id, avatarFile);\n            const { data: updatedProfile, error: avatarError } = await supabase\n              .from('profiles')\n              .update({ avatar_path: avatarPath, updated_at: new Date().toISOString() })\n              .eq('id', authData.user.id)\n              .select()\n              .single();\n            if (avatarError) throw avatarError;\n            userProfile = updatedProfile as Profile;\n          }\n          setSuccessMessage('تم إنشاء الحساب بنجاح!');";
  if (!text.includes('const avatarPath = await uploadUserAvatar')) {
    text = replaceRequired(text, oldSuccess, newSuccess, 'signup avatar upload');
  }

  if (!text.includes('معاينة صورة البروفايل')) {
    const marker = '              {/* Full Name */}';
    const avatarUi = `              <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">\n                <label className="relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-white text-slate-500 shadow-sm">\n                  {avatarPreview ? <img src={avatarPreview} alt="معاينة صورة البروفايل" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}\n                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} />\n                </label>\n                <div className="min-w-0">\n                  <p className="text-xs font-bold text-slate-800">صورة البروفايل <span className="font-normal text-slate-400">(اختيارية)</span></p>\n                  <p className="mt-1 text-[10px] leading-5 text-slate-500">يمكنك تخطيها وإضافتها لاحقًا من حسابي.</p>\n                  {avatarFile && <button type="button" onClick={() => setAvatarFile(null)} className="mt-1 text-[10px] font-bold text-rose-600">إزالة الصورة</button>}\n                </div>\n              </div>\n\n`;
    text = replaceRequired(text, marker, avatarUi + marker, 'signup avatar picker');
  }

  return text;
});

update('src/components/ProfileV2.tsx', text => {
  text = text.replace(
    "  User\n} from 'lucide-react';",
    "  User,\n  Camera,\n  ImagePlus\n} from 'lucide-react';"
  );

  if (!text.includes("from '../lib/userAvatar';")) {
    text = replaceRequired(
      text,
      "import { getAppPublicInformation, type AppPublicInformation } from '../lib/appPublicInformation';\n",
      "import { getAppPublicInformation, type AppPublicInformation } from '../lib/appPublicInformation';\nimport { getUserAvatarUrl, removeUserAvatar, uploadUserAvatar } from '../lib/userAvatar';\n",
      'Profile avatar import'
    );
  }

  if (!text.includes('const [savingAvatar')) {
    text = replaceRequired(
      text,
      '  const [profileError, setProfileError] = useState<string | null>(null);\n',
      '  const [profileError, setProfileError] = useState<string | null>(null);\n  const [savingAvatar, setSavingAvatar] = useState(false);\n  const avatarInputRef = useRef<HTMLInputElement | null>(null);\n',
      'Profile avatar state'
    );

    const marker = '  const handleAddAccount = async (event: React.FormEvent) => {';
    const handlers = `  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {\n    const file = event.target.files?.[0];\n    event.target.value = '';\n    if (!file || savingAvatar) return;\n    setProfileError(null);\n    setProfileSuccess(null);\n    setSavingAvatar(true);\n    let newPath = '';\n    try {\n      newPath = await uploadUserAvatar(user.id, file);\n      const previousPath = profile.avatar_path;\n      const { error } = await supabase\n        .from('profiles')\n        .update({ avatar_path: newPath, updated_at: new Date().toISOString() })\n        .eq('id', user.id);\n      if (error) throw error;\n      await refreshProfile();\n      if (previousPath) await removeUserAvatar(previousPath).catch(() => undefined);\n      setProfileSuccess('تم تحديث صورة البروفايل.');\n    } catch (error) {\n      if (newPath) await removeUserAvatar(newPath).catch(() => undefined);\n      const message = error instanceof Error && error.message === 'avatar_too_large'\n        ? 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت.'\n        : 'تعذر رفع صورة البروفايل الآن.';\n      setProfileError(message);\n    } finally {\n      setSavingAvatar(false);\n    }\n  };\n\n  const handleRemoveAvatar = async () => {\n    if (!profile.avatar_path || savingAvatar || !window.confirm('هل تريد حذف صورة البروفايل؟')) return;\n    setSavingAvatar(true);\n    setProfileError(null);\n    try {\n      const previousPath = profile.avatar_path;\n      const { error } = await supabase\n        .from('profiles')\n        .update({ avatar_path: null, updated_at: new Date().toISOString() })\n        .eq('id', user.id);\n      if (error) throw error;\n      await refreshProfile();\n      await removeUserAvatar(previousPath).catch(() => undefined);\n      setProfileSuccess('تم حذف صورة البروفايل.');\n    } catch {\n      setProfileError('تعذر حذف صورة البروفايل الآن.');\n    } finally {\n      setSavingAvatar(false);\n    }\n  };\n\n`;
    text = replaceRequired(text, marker, handlers + marker, 'Profile avatar handlers');
  }

  const oldAvatar = '<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><User className="h-6 w-6" /></div>';
  const newAvatar = `<button type="button" onClick={() => navigateSection('personal')} className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-white ring-2 ring-white shadow-md" aria-label="تعديل صورة البروفايل">{profile.avatar_path ? <img src={getUserAvatarUrl(profile.avatar_path)} alt={profile.full_name || 'صورة المستخدم'} className="h-full w-full object-cover" /> : <User className="h-7 w-7" />}</button>`;
  if (!text.includes('aria-label="تعديل صورة البروفايل"')) {
    text = replaceRequired(text, oldAvatar, newAvatar, 'Profile overview avatar');
  }

  const personalStart = '<div className="space-y-4 pb-24"><SubpageHeader title="البيانات الشخصية" /><form id="personal-data-form"';
  if (!text.includes('اختيارية ولا تؤثر على اكتمال الحساب')) {
    const personalReplacement = `<div className="space-y-4 pb-24"><SubpageHeader title="البيانات الشخصية" />\n      <section className="flex items-center gap-4 rounded-[1.7rem] bg-white p-4 shadow-sm">\n        <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={savingAvatar} className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-950 text-white disabled:opacity-60">\n          {profile.avatar_path ? <img src={getUserAvatarUrl(profile.avatar_path)} alt={profile.full_name || 'صورة المستخدم'} className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7" />}\n          <span className="absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-800 shadow"><Camera className="h-3.5 w-3.5" /></span>\n        </button>\n        <div className="min-w-0 flex-1">\n          <h3 className="text-sm font-bold">صورة البروفايل</h3>\n          <p className="mt-1 text-[11px] leading-5 text-slate-500">اختيارية ولا تؤثر على اكتمال الحساب أو استخدام مزايا سند.</p>\n          <div className="mt-2 flex gap-2">\n            <button type="button" disabled={savingAvatar} onClick={() => avatarInputRef.current?.click()} className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold">{savingAvatar ? 'جاري الحفظ...' : profile.avatar_path ? 'استبدال' : 'إضافة صورة'}</button>\n            {profile.avatar_path && <button type="button" disabled={savingAvatar} onClick={handleRemoveAvatar} className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-600">حذف</button>}\n          </div>\n        </div>\n        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleAvatarChange} />\n      </section>\n      <form id="personal-data-form"`;
    text = replaceRequired(text, personalStart, personalReplacement, 'Personal avatar section');
  }

  return text;
});

console.log('User avatar integration applied successfully.');
