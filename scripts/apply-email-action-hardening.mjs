import fs from 'node:fs';

function replaceOnce(source, label, from, to) {
  const index = source.indexOf(from);
  if (index === -1) throw new Error(`Patch marker not found: ${label}`);
  if (source.indexOf(from, index + from.length) !== -1) throw new Error(`Patch marker not unique: ${label}`);
  return `${source.slice(0, index)}${to}${source.slice(index + from.length)}`;
}

function replaceSection(source, label, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Section start not found: ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`Section end not found: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

// Auth form redirects and profile creation safety.
{
  const path = 'src/components/Auth.tsx';
  let source = fs.readFileSync(path, 'utf8');

  source = replaceOnce(
    source,
    'email action URL helper',
    `function getAppRootUrl(): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || import.meta.env.BASE_URL || '/';
  const cleanBase = base.startsWith('/') ? base : \`/\${base}\`;
  const root = \`\${window.location.origin}\${cleanBase}\`;
  return root.endsWith('/') ? root : \`\${root}/\`;
}`,
    `function getAppRootUrl(): string {
  const base = import.meta.env.VITE_APP_BASE_PATH || import.meta.env.BASE_URL || '/';
  const cleanBase = base.startsWith('/') ? base : \`/\${base}\`;
  const root = \`\${window.location.origin}\${cleanBase}\`;
  return root.endsWith('/') ? root : \`\${root}/\`;
}

function getEmailActionUrl(action: 'signup' | 'email_change' | 'invite' | 'magiclink'): string {
  const url = new URL('auth-action.html', getAppRootUrl());
  url.searchParams.set('action', action);
  return url.toString();
}`
  );

  source = replaceOnce(
    source,
    'profile fetch failure handling',
    `    const { data: profile, error: fetchError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (fetchError) logAuthDiagnostic('profile_fetch_fallback', fetchError);
    if (profile) return profile as Profile;`,
    `    const { data: profile, error: fetchError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (fetchError) {
      logAuthDiagnostic('profile_fetch_failed', fetchError);
      throw fetchError;
    }
    if (profile) return profile as Profile;`
  );

  source = replaceOnce(
    source,
    'safe profile defaults',
    `      phone: user.user_metadata?.phone || (phone ? normalizeYemenPhone(phone) : ''),
      governorate: user.user_metadata?.governorate || governorate || null,
      status: 'active',
      profile_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select().single();`,
    `      phone: user.user_metadata?.phone || (phone ? normalizeYemenPhone(phone) : null),
      governorate: user.user_metadata?.governorate || governorate || null,
      status: 'active',
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' }).select().single();`
  );

  source = source.replaceAll(`options: { emailRedirectTo: getAppRootUrl() }`, `options: { emailRedirectTo: getEmailActionUrl('signup') }`);
  source = source.replaceAll(`emailRedirectTo: getAppRootUrl(),`, `emailRedirectTo: getEmailActionUrl('signup'),`);
  source = replaceOnce(
    source,
    'password recovery redirect',
    `      const redirectTo = new URL('reset-password.html', getAppRootUrl()).toString();`,
    `      const recoveryUrl = new URL('reset-password.html', getAppRootUrl());
      recoveryUrl.searchParams.set('action', 'recovery');
      const redirectTo = recoveryUrl.toString();`
  );

  if (!source.includes("getEmailActionUrl('signup')")) throw new Error('Signup redirect hardening missing');
  if (source.includes('profile_completed_at: new Date().toISOString()')) throw new Error('Unsafe profile completion remains in Auth');
  fs.writeFileSync(path, source);
}

// Make password recovery accept only a real recovery callback.
{
  const path = 'src/reset-password.tsx';
  let source = fs.readFileSync(path, 'utf8');

  source = replaceOnce(
    source,
    'recovery imports',
    `import { supabase } from './lib/supabase';`,
    `import { clearPersistedSupabaseSession, supabase } from './lib/supabase';`
  );

  const start = source.indexOf('  useEffect(() => {');
  const end = source.indexOf('\n  }, []);', start);
  if (start === -1 || end === -1) throw new Error('Recovery effect markers not found');
  const effect = `  useEffect(() => {
    let mounted = true;
    let resolved = false;
    let timeoutId: number | undefined;

    const url = new URL(window.location.href);
    const parameters = new URLSearchParams(url.search);
    const hashParameters = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    hashParameters.forEach((value, key) => {
      if (!parameters.has(key)) parameters.set(key, value);
    });

    const hasRecoveryIntent = parameters.get('action') === 'recovery'
      || parameters.get('type') === 'recovery';
    const hasAuthPayload = Boolean(
      parameters.get('code')
      || parameters.get('access_token')
      || parameters.get('refresh_token')
      || parameters.get('error')
      || parameters.get('error_code')
    );

    const endTemporarySession = async () => {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } finally {
        clearPersistedSupabaseSession();
      }
    };

    const acceptRecoverySession = () => {
      if (!mounted || resolved) return;
      resolved = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      clearRecoveryParameters();
      setError(null);
      setRecoveryState('ready');
    };

    const rejectRecoveryLink = async (message?: string | null) => {
      if (!mounted || resolved) return;
      resolved = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      await endTemporarySession();
      if (!mounted) return;
      clearRecoveryParameters();
      setError(message || 'رابط تعيين كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رسالة جديدة من شاشة تسجيل الدخول.');
      setRecoveryState('invalid');
    };

    const errorDescription = parameters.get('error_description');
    if (parameters.get('error') || parameters.get('error_code') || errorDescription) {
      void rejectRecoveryLink(errorDescription);
      return () => {
        mounted = false;
      };
    }

    if (!hasRecoveryIntent || !hasAuthPayload) {
      void rejectRecoveryLink('لا يمكن فتح صفحة تغيير كلمة المرور مباشرة. استخدم رابط الاستعادة المرسل إلى بريدك من سند.');
      return () => {
        mounted = false;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || resolved) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        acceptRecoverySession();
      }
    });

    const initialize = async () => {
      try {
        const authorizationCode = parameters.get('code');
        if (authorizationCode) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(authorizationCode);
          if (exchangeError) {
            await rejectRecoveryLink(exchangeError.message);
            return;
          }
          if (data.session) {
            acceptRecoverySession();
            return;
          }
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          await rejectRecoveryLink(sessionError.message);
          return;
        }
        if (session) {
          acceptRecoverySession();
          return;
        }

        timeoutId = window.setTimeout(() => {
          void rejectRecoveryLink();
        }, 8_000);
      } catch (error) {
        await rejectRecoveryLink(error instanceof Error ? error.message : null);
      }
    };

    void initialize();

    return () => {
      mounted = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);`;
  source = `${source.slice(0, start)}${effect}${source.slice(end + '\n  }, []);'.length)}`;

  source = replaceOnce(
    source,
    'clear session after password update',
    `    await supabase.auth.signOut({ scope: 'local' });
    setLoading(false);
    setRecoveryState('success');

    window.setTimeout(() => {
      window.location.replace(getAppUrl());
    }, 2200);`,
    `    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      clearPersistedSupabaseSession();
    }
    clearRecoveryParameters();
    setLoading(false);
    setRecoveryState('success');`
  );

  source = replaceOnce(
    source,
    'password success instructions',
    `<p className="mt-1 text-sm leading-6">سيتم تحويلك إلى تسجيل الدخول لاستخدام كلمة المرور الجديدة.</p>`,
    `<p className="mt-1 text-sm leading-6">أغلق هذه الصفحة، ثم افتح تطبيق سند وسجّل الدخول باستخدام كلمة المرور الجديدة.</p>
            <a href={getAppUrl()} className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
              فتح صفحة تسجيل الدخول
            </a>`
  );

  if (source.includes('Give detectSessionInUrl')) throw new Error('Legacy permissive recovery flow remains');
  fs.writeFileSync(path, source);
}

// Add the dedicated email action page to the production build.
{
  const path = 'vite.config.ts';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    'vite email action entry',
    `          app: path.resolve(__dirname, 'index.html'),
          'reset-password': path.resolve(__dirname, 'reset-password.html')`,
    `          app: path.resolve(__dirname, 'index.html'),
          'auth-action': path.resolve(__dirname, 'auth-action.html'),
          'reset-password': path.resolve(__dirname, 'reset-password.html')`
  );
  fs.writeFileSync(path, source);
}

// Reject direct visits to the action page that only inherit an unrelated stored session.
{
  const path = 'src/auth-action.tsx';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    'auth evidence declaration',
    `    const errorDescription = parameters.get('error_description');
    const errorCode = parameters.get('error_code') || parameters.get('error');`,
    `    const errorDescription = parameters.get('error_description');
    const errorCode = parameters.get('error_code') || parameters.get('error');
    const hasAuthEvidence = Boolean(
      parameters.get('code')
      || parameters.get('access_token')
      || parameters.get('refresh_token')
      || parameters.get('token_hash')
      || errorCode
      || errorDescription
    );`
  );
  source = replaceOnce(
    source,
    'auth evidence guard',
    `    if (errorCode || errorDescription) {
      void finishError(errorDescription);
      return () => {
        mounted = false;
      };
    }

    const { data: { subscription } }`,
    `    if (errorCode || errorDescription) {
      void finishError(errorDescription);
      return () => {
        mounted = false;
      };
    }

    if (!hasAuthEvidence) {
      void finishError('لا يمكن فتح صفحة التأكيد مباشرة. استخدم الرابط الموجود في رسالة سند المرسلة إلى بريدك.');
      return () => {
        mounted = false;
      };
    }

    const { data: { subscription } }`
  );
  fs.writeFileSync(path, source);
}

console.log('Email action and recovery hardening applied.');
