import fs from 'node:fs';

const path = 'src/App.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const index = source.indexOf(from);
  if (index === -1) throw new Error(`Patch marker not found: ${label}`);
  if (source.indexOf(from, index + from.length) !== -1) throw new Error(`Patch marker is not unique: ${label}`);
  source = `${source.slice(0, index)}${to}${source.slice(index + from.length)}`;
}

function replaceSection(label, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Section start not found: ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`Section end not found: ${label}`);
  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

replaceOnce(
  'profile failure import',
  "import { ShellSkeleton, ContentSkeleton } from './components/Skeletons';",
  "import { ShellSkeleton, ContentSkeleton } from './components/Skeletons';\nimport ProfileLoadFailure from './components/ProfileLoadFailure';"
);

replaceOnce(
  'profile timeout helper',
  "import ProfileLoadFailure from './components/ProfileLoadFailure';\n\nexport default function App() {",
  `import ProfileLoadFailure from './components/ProfileLoadFailure';

const PROFILE_LOAD_TIMEOUT_MS = 12_000;
const SESSION_LOAD_TIMEOUT_MS = 10_000;

function withTimeout<T>(operation: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(\`${'${label}'} timed out after ${'${timeoutMs}'}ms\`)), timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  }) as Promise<T>;
}

export default function App() {`
);

replaceOnce(
  'request refs',
  '  const requestGenerationRef = useRef(0);',
  `  const sessionRequestRef = useRef(0);
  const profileRequestRef = useRef(0);
  const activeProfileUserIdRef = useRef<string | null>(null);
  const profileLoadingUserIdRef = useRef<string | null>(null);
  const loadedProfileUserIdRef = useRef<string | null>(null);`
);

replaceSection(
  'refresh profile',
  '  const refreshProfile = async () => {',
  '\n\n  const ensureProfileComplete',
  `  const refreshProfile = async () => {
    const requestId = ++profileRequestRef.current;
    setProfileStatus('loading');
    setProfileError(null);

    try {
      const { data: { session }, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        SESSION_LOAD_TIMEOUT_MS,
        'profile session refresh'
      );
      if (sessionError) throw sessionError;
      if (!session?.user) {
        if (requestId === profileRequestRef.current) {
          setProfile(null);
          setProfileStatus('missing');
          setProfileError('No active session');
        }
        return null;
      }

      const userId = session.user.id;
      activeProfileUserIdRef.current = userId;
      profileLoadingUserIdRef.current = userId;

      const { data: prof, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        PROFILE_LOAD_TIMEOUT_MS,
        'profile refresh'
      );

      const isCurrent = requestId === profileRequestRef.current && activeProfileUserIdRef.current === userId;
      if (!isCurrent) return null;
      if (error) throw error;
      if (!prof) {
        setProfile(null);
        loadedProfileUserIdRef.current = null;
        setProfileStatus('missing');
        setProfileError('Profile record is missing');
        return null;
      }

      loadedProfileUserIdRef.current = userId;
      setProfile(prof as Profile);
      setProfileStatus('ready');
      return prof as Profile;
    } catch (err) {
      logAuthDiagnostic('profile_refresh_failed', err);
      if (requestId === profileRequestRef.current) {
        setProfileStatus('degraded');
        setProfileError(err instanceof Error ? err.message : 'Unable to load profile');
      }
      return null;
    } finally {
      if (requestId === profileRequestRef.current) profileLoadingUserIdRef.current = null;
    }
  };`
);

const authSection = `  // Check auth session on startup and subscribe to auth changes
  useEffect(() => {
    let disposed = false;
    setAuthState('session_pending');

    const slowConnectionTimer = setTimeout(() => {
      if (disposed) return;
      setAuthState(previous => {
        if (previous === 'session_pending') {
          setConnectivity('slow');
          setStatusMessage('جاري الاتصال بالخادم، يرجى الانتظار...');
          setShowStatusBanner(true);
        }
        return previous;
      });
    }, 1500);

    const resetAuthenticatedUser = () => {
      profileRequestRef.current += 1;
      activeProfileUserIdRef.current = null;
      profileLoadingUserIdRef.current = null;
      loadedProfileUserIdRef.current = null;
      setPasskeyEnrollmentUser(null);
      setUser(null);
      setProfile(null);
      setProfileStatus('idle');
      setProfileError(null);
    };

    const loadProfileBackground = async (userId: string, metadata: SupabaseUser['user_metadata']) => {
      if (disposed) return;
      if (profileLoadingUserIdRef.current === userId) return;

      const requestId = ++profileRequestRef.current;
      activeProfileUserIdRef.current = userId;
      profileLoadingUserIdRef.current = userId;
      setProfileStatus('loading');
      setProfileError(null);

      if (import.meta.env.DEV) performance.mark('profile_load_start');

      try {
        const { data: prof, error } = await withTimeout(
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          PROFILE_LOAD_TIMEOUT_MS,
          'profile bootstrap'
        );

        const isCurrent = !disposed
          && requestId === profileRequestRef.current
          && activeProfileUserIdRef.current === userId;
        if (!isCurrent) return;
        if (error) throw error;

        let resolvedProfile = prof as Profile | null;
        if (resolvedProfile) {
          const missingSignupData: Partial<Profile> = {};
          if (!resolvedProfile.full_name && metadata?.full_name) missingSignupData.full_name = metadata.full_name;
          if (!resolvedProfile.phone && metadata?.phone) missingSignupData.phone = metadata.phone;
          if (!resolvedProfile.governorate && metadata?.governorate) missingSignupData.governorate = metadata.governorate;

          if (Object.keys(missingSignupData).length > 0) {
            const { data: reconciledProfile, error: reconcileError } = await withTimeout(
              supabase
                .from('profiles')
                .update({ ...missingSignupData, updated_at: new Date().toISOString() })
                .eq('id', userId)
                .select()
                .single(),
              PROFILE_LOAD_TIMEOUT_MS,
              'profile reconciliation'
            );
            if (!reconcileError && reconciledProfile) {
              resolvedProfile = reconciledProfile as Profile;
            } else if (reconcileError) {
              logAuthDiagnostic('profile_reconciliation_failed', reconcileError);
            }
          }
        } else {
          const { data: newProfile, error: insertError } = await withTimeout(
            supabase
              .from('profiles')
              .upsert({
                id: userId,
                full_name: metadata?.full_name || 'مستخدم سند',
                phone: metadata?.phone || null,
                governorate: metadata?.governorate || null,
                status: 'active',
                updated_at: new Date().toISOString(),
              }, { onConflict: 'id' })
              .select()
              .single(),
            PROFILE_LOAD_TIMEOUT_MS,
            'profile creation'
          );
          if (insertError) throw insertError;
          resolvedProfile = newProfile as Profile;
        }

        const stillCurrent = !disposed
          && requestId === profileRequestRef.current
          && activeProfileUserIdRef.current === userId;
        if (!stillCurrent || !resolvedProfile) return;

        loadedProfileUserIdRef.current = userId;
        setProfile(resolvedProfile);
        setProfileStatus('ready');
      } catch (err) {
        logAuthDiagnostic('profile_bootstrap_failed', err);
        const isCurrent = !disposed
          && requestId === profileRequestRef.current
          && activeProfileUserIdRef.current === userId;
        if (isCurrent) {
          loadedProfileUserIdRef.current = null;
          setProfileStatus('degraded');
          setProfileError(err instanceof Error ? err.message : 'Unable to load profile');
        }
      } finally {
        if (profileLoadingUserIdRef.current === userId) profileLoadingUserIdRef.current = null;
        if (!disposed && import.meta.env.DEV) {
          performance.mark('profile_load_end');
          performance.measure('Profile Load Time', 'profile_load_start', 'profile_load_end');
        }
      }
    };

    const acceptSession = (sessionUser: SupabaseUser) => {
      const userChanged = activeProfileUserIdRef.current !== sessionUser.id;
      if (userChanged) {
        profileRequestRef.current += 1;
        loadedProfileUserIdRef.current = null;
        profileLoadingUserIdRef.current = null;
        setProfile(null);
        setProfileStatus('idle');
      }

      activeProfileUserIdRef.current = sessionUser.id;
      setUser(sessionUser);
      setAuthState('authenticated');

      if (loadedProfileUserIdRef.current !== sessionUser.id
          && profileLoadingUserIdRef.current !== sessionUser.id) {
        void loadProfileBackground(sessionUser.id, sessionUser.user_metadata);
      }
    };

    const verifySession = async () => {
      const requestId = ++sessionRequestRef.current;
      if (import.meta.env.DEV) performance.mark('session_restore_start');

      try {
        if (hasExplicitSignOutIntent()) {
          clearPersistedSupabaseSession();
          await supabase.auth.signOut({ scope: 'local' });
          if (disposed || requestId !== sessionRequestRef.current) return;
          resetAuthenticatedUser();
          setAuthState('unauthenticated');
          return;
        }

        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_LOAD_TIMEOUT_MS,
          'session restoration'
        );
        if (error) throw error;
        if (disposed || requestId !== sessionRequestRef.current) return;

        clearTimeout(slowConnectionTimer);
        setShowStatusBanner(false);

        if (session?.user) {
          acceptSession(session.user);
        } else {
          resetAuthenticatedUser();
          setAuthState('unauthenticated');
        }
      } catch (err) {
        if (disposed || requestId !== sessionRequestRef.current) return;
        clearTimeout(slowConnectionTimer);
        logAuthDiagnostic('session_verification_failed', err);

        if (!navigator.onLine) {
          setConnectivity('offline');
          setStatusMessage('أنت غير متصل بالإنترنت حالياً');
          setShowStatusBanner(true);
        } else {
          setAuthState('auth_error');
        }
      } finally {
        clearTimeout(slowConnectionTimer);
        if (!disposed && import.meta.env.DEV) {
          performance.mark('session_restore_end');
          performance.measure('Session Restoration Time', 'session_restore_start', 'session_restore_end');
        }
      }
    };

    void verifySession();

    const handleOnline = () => {
      setConnectivity('online');
      setStatusMessage('تم استعادة الاتصال. جاري التحديث...');
      setShowStatusBanner(true);
      void verifySession();
      window.setTimeout(() => {
        if (!disposed) setShowStatusBanner(false);
      }, 2000);
    };

    const handleOffline = () => {
      setConnectivity('offline');
      setStatusMessage('أنت غير متصل بالإنترنت حالياً');
      setShowStatusBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;

      if (session?.user) {
        if (hasExplicitSignOutIntent()) {
          if (hasManualAuthAttempt()) {
            clearManualAuthAttempt();
            clearExplicitSignOutIntent();
          } else {
            resetAuthenticatedUser();
            setAuthState('unauthenticated');
            return;
          }
        }

        setPasskeyEnrollmentUser(candidate => candidate?.id === session.user.id ? candidate : null);
        acceptSession(session.user);

        if (event === 'USER_UPDATED' && loadedProfileUserIdRef.current === session.user.id) {
          void loadProfileBackground(session.user.id, session.user.user_metadata);
        }
      } else {
        resetAuthenticatedUser();
        setAuthState('unauthenticated');
      }
    });

    return () => {
      disposed = true;
      sessionRequestRef.current += 1;
      profileRequestRef.current += 1;
      clearTimeout(slowConnectionTimer);
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
`;

replaceSection(
  'auth bootstrap',
  '  // Check auth session on startup and subscribe to auth changes',
  '\n\n  // IndexedDB helper for Capacitor share sheet integration',
  authSection
);

replaceOnce(
  'auth success refs',
  `    setUser(sessionUser);
    setProfile(userProfile);
    setAuthState('authenticated');`,
  `    activeProfileUserIdRef.current = sessionUser.id;
    loadedProfileUserIdRef.current = sessionUser.id;
    profileLoadingUserIdRef.current = null;
    setUser(sessionUser);
    setProfile(userProfile);
    setProfileStatus('ready');
    setProfileError(null);
    setAuthState('authenticated');`
);

replaceOnce(
  'logout invalidation',
  `    requestGenerationRef.current += 1;
    setPasskeyEnrollmentUser(null);`,
  `    sessionRequestRef.current += 1;
    profileRequestRef.current += 1;
    activeProfileUserIdRef.current = null;
    profileLoadingUserIdRef.current = null;
    loadedProfileUserIdRef.current = null;
    setPasskeyEnrollmentUser(null);`
);

replaceOnce(
  'profile fallback declaration',
  `  return (
    <NotificationProvider userId={user?.id || null} isAuthenticated={isAuthenticated}>`,
  `  const profileFallback = profileStatus === 'degraded' || profileStatus === 'missing' ? (
    <ProfileLoadFailure
      message={profileError}
      retrying={profileStatus === 'loading'}
      onRetry={() => { void refreshProfile(); }}
      onLogout={() => { void handleLogoutSuccess(); }}
    />
  ) : (
    <ContentSkeleton />
  );

  return (
    <NotificationProvider userId={user?.id || null} isAuthenticated={isAuthenticated}>`
);

replaceOnce(
  'home profile gate',
  `             {currentPage === 'home' && (
               <Home profile={profile} onNavigate={(p: any, t?: string) => navigateTo(p, t, 'app')} />
             )}`,
  `             {currentPage === 'home' && (
               profile ? (
                 <Home profile={profile} onNavigate={(p: any, t?: string) => navigateTo(p, t, 'app')} />
               ) : profileFallback
             )}`
);

const fallbackPattern = `              ) : (
                <ContentSkeleton />
              )`;
let fallbackCount = 0;
while (source.includes(fallbackPattern)) {
  source = source.replace(fallbackPattern, `              ) : profileFallback`);
  fallbackCount += 1;
}
if (fallbackCount < 4) throw new Error(`Expected at least 4 profile fallbacks, replaced ${'${fallbackCount}'}`);

if (source.includes('requestGenerationRef')) throw new Error('Legacy requestGenerationRef remains after patch');
if (!source.includes('profileLoadingUserIdRef')) throw new Error('Profile loading guard was not installed');

fs.writeFileSync(path, source);
console.log(`Hardened ${'${path}'}; replaced ${'${fallbackCount}'} profile skeleton fallbacks.`);
