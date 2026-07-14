import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { supabase, hasSupabaseConfig } from './lib/supabase';
import { Profile } from './types';
import Auth from './components/Auth';
import Home from './components/Home';
import UploadNotification from './components/Upload';
import NotificationDetails from './components/Details';
import MyOperations from './components/MyOperations';
import MyProfile from './components/Profile';
import VerifyNotice from './components/VerifyNotice';
import ShareIntake from './components/ShareIntake';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';

const Reports = lazy(() => import('./components/Reports'));
const BusinessCreate = lazy(() => import('./components/business/BusinessCreate'));
const BusinessManage = lazy(() => import('./components/business/BusinessManage'));
const BusinessOperations = lazy(() => import('./components/business/BusinessOperations'));
const BusinessTeam = lazy(() => import('./components/business/BusinessTeam'));
const BusinessCommunity = lazy(() => import('./components/business/BusinessCommunity'));
const PublicBusinessProfile = lazy(() => import('./components/business/PublicBusinessProfile'));
const PublicProductDetail = lazy(() => import('./components/business/PublicProductDetail'));
const BusinessProfileEditor = lazy(() => import('./components/business/BusinessProfileEditor'));
const BusinessWhatsAppCatalog = lazy(() => import('./components/business/BusinessWhatsAppCatalog'));
const BusinessCustomers = lazy(() => import('./components/business/BusinessCustomers'));
import { Home as HomeIcon, Upload, QrCode, User, ShieldAlert, Loader2 } from 'lucide-react';
import { isBasicProfileComplete } from './lib/profileUtils';
import ProfileCompletionGateModal from './components/ProfileCompletionGateModal';
import { INTERNAL_BUSINESS_CATALOG_ENABLED } from './lib/urlUtils';

import { ShellSkeleton, ContentSkeleton } from './components/Skeletons';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authState, setAuthState] = useState<'booting_shell' | 'session_pending' | 'authenticated' | 'unauthenticated' | 'auth_error'>('booting_shell');
  const [connectivity, setConnectivity] = useState<'online' | 'offline' | 'slow'>('online');
  const [profileStatus, setProfileStatus] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'degraded'>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showStatusBanner, setShowStatusBanner] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const requestGenerationRef = useRef(0);
  
  // Navigation states
  const [currentPage, setCurrentPage] = useState<'home' | 'upload' | 'my-operations' | 'profile' | 'details' | 'verify-notice' | 'login' | 'reports' | 'scan-qr' | 'share-intake' | 'business-create' | 'business-manage' | 'business-operations' | 'business-team' | 'business-manage-profile' | 'business-whatsapp-catalog' | 'business-community' | 'public-business-profile' | 'business-customers' | 'public-product-detail'>('home');
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [activeProductToken, setActiveProductToken] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<'link' | 'qr' | 'search' | 'app'>('link');
  const [profileInitialTab, setProfileInitialTab] = useState<'overview' | 'products' | 'services' | 'financial' | 'complaints'>('overview');

  // Profile completion gate states
  const [showCompletionGate, setShowCompletionGate] = useState(false);
  const [gatePendingAction, setGatePendingAction] = useState<(() => void) | null>(null);

  const refreshProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: prof, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!error && prof) {
          setProfile(prof as Profile);
          return prof as Profile;
        }
      }
    } catch (err) {
      console.error('Error refreshing profile:', err);
    }
    return null;
  };

  const ensureProfileComplete = (action: () => void) => {
    if (isBasicProfileComplete(profile, user?.email)) {
      action();
    } else {
      setGatePendingAction(() => action);
      setShowCompletionGate(true);
    }
  };

  // Parse path after /v/, /b/, or business routes
  const parsePath = () => {
    const path = window.location.pathname;
    if (path.includes('/share-intake')) {
      return { type: 'share-intake' };
    }
    if (path.includes('/business/create')) {
      return { type: 'business-create' };
    }
    if (path.includes('/business/manage/operations')) {
      return { type: 'business-operations' };
    }
    if (path.includes('/business/manage/team')) {
      return { type: 'business-team' };
    }
    if (path.includes('/business/manage/profile')) {
      return { type: 'business-manage-profile' };
    }
    if (path.includes('/business/manage/whatsapp-catalog')) {
      return { type: 'business-whatsapp-catalog' };
    }
    if (path.includes('/business/manage/customers')) {
      return { type: 'business-customers' };
    }
    if (path.includes('/business/manage/catalog')) {
      const base = import.meta.env.VITE_APP_BASE_PATH || '/';
      const cleanBase = base.endsWith('/') ? base : `${base}/`;
      window.history.replaceState({}, '', `${cleanBase}business/manage/whatsapp-catalog`);
      return { type: 'business-whatsapp-catalog' };
    }
    if (path.includes('/business/manage')) {
      return { type: 'business-manage' };
    }
    if (path.includes('/business-community')) {
      return { type: 'business-community' };
    }
    const bpMatch = path.match(/\/b\/([^/]+)\/p\/([^/]+)/);
    if (bpMatch) {
      if (!INTERNAL_BUSINESS_CATALOG_ENABLED) {
        return { type: 'public-business-profile', slug: bpMatch[1] };
      }
      return { type: 'public-product-detail', slug: bpMatch[1], productId: bpMatch[2] };
    }
    const bMatch = path.match(/\/b\/([^/]+)/);
    if (bMatch) {
      return { type: 'public-business-profile', slug: bMatch[1] };
    }
    const match = path.match(/\/v\/([^/]+)/);
    if (match) {
      return { type: 'details', token: match[1] };
    }
    return { type: 'other' };
  };

  // Safe navigation function
  const navigateTo = (
    page: any, 
    token?: string,
    source?: 'link' | 'qr' | 'search' | 'app'
  ) => {
    const base = import.meta.env.VITE_APP_BASE_PATH || '/';
    const cleanBase = base.endsWith('/') ? base : `${base}/`;

    if (page === 'details' && token) {
      const src = source || 'link';
      window.history.pushState({}, '', `${cleanBase}v/${token}${src !== 'link' ? `?src=${src}` : ''}`);
      setActiveToken(token);
      setActiveSource(src);
      setCurrentPage('details');
    } else if (page === 'share-intake') {
      window.history.pushState({}, '', `${cleanBase}share-intake`);
      setActiveToken(null);
      setActiveSource('link');
      setCurrentPage('share-intake');
    } else if (page === 'business-create') {
      window.history.pushState({}, '', `${cleanBase}business/create`);
      setCurrentPage('business-create');
    } else if (page === 'business-manage') {
      window.history.pushState({}, '', `${cleanBase}business/manage`);
      setCurrentPage('business-manage');
    } else if (page === 'business-operations') {
      window.history.pushState({}, '', `${cleanBase}business/manage/operations`);
      setCurrentPage('business-operations');
    } else if (page === 'business-team') {
      window.history.pushState({}, '', `${cleanBase}business/manage/team`);
      setCurrentPage('business-team');
    } else if (page === 'business-manage-profile') {
      window.history.pushState({}, '', `${cleanBase}business/manage/profile`);
      setCurrentPage('business-manage-profile');
    } else if (page === 'business-whatsapp-catalog') {
      window.history.pushState({}, '', `${cleanBase}business/manage/whatsapp-catalog`);
      setCurrentPage('business-whatsapp-catalog');
    } else if (page === 'business-community') {
      window.history.pushState({}, '', `${cleanBase}business-community`);
      setCurrentPage('business-community');
    } else if (page === 'public-business-profile' && token) {
      window.history.pushState({}, '', `${cleanBase}b/${token}`);
      setActiveToken(token);
      setCurrentPage('public-business-profile');
    } else if (page === 'public-product-detail' && token) {
      const [bSlug, pId] = token.split('/');
      if (!INTERNAL_BUSINESS_CATALOG_ENABLED) {
        window.history.pushState({}, '', `${cleanBase}b/${bSlug}`);
        setActiveToken(bSlug);
        setCurrentPage('public-business-profile');
      } else {
        window.history.pushState({}, '', `${cleanBase}b/${bSlug}/p/${pId}`);
        setActiveToken(bSlug);
        setActiveProductToken(pId);
        setProfileInitialTab('products');
        setCurrentPage('public-product-detail');
      }
    } else {
      window.history.pushState({}, '', cleanBase);
      setActiveToken(null);
      setActiveSource('link');
      setCurrentPage(page);
    }
  };

  // Listen to browser Back/Forward pops
  useEffect(() => {
    const handlePopState = () => {
      if (!INTERNAL_BUSINESS_CATALOG_ENABLED) {
        const path = window.location.pathname;
        const bpMatch = path.match(/\/b\/([^/]+)\/p\/([^/]+)/);
        if (bpMatch) {
          const base = import.meta.env.VITE_APP_BASE_PATH || '/';
          const cleanBase = base.endsWith('/') ? base : `${base}/`;
          window.history.replaceState({}, '', `${cleanBase}b/${bpMatch[1]}`);
        }
      }

      const parsed = parsePath();
      if (parsed.type === 'share-intake') {
        setActiveToken(null);
        setActiveSource('link');
        setCurrentPage('share-intake');
      } else if (parsed.type === 'business-create') {
        setCurrentPage('business-create');
      } else if (parsed.type === 'business-manage') {
        setCurrentPage('business-manage');
      } else if (parsed.type === 'business-operations') {
        setCurrentPage('business-operations');
      } else if (parsed.type === 'business-team') {
        setCurrentPage('business-team');
      } else if (parsed.type === 'business-manage-profile') {
        setCurrentPage('business-manage-profile');
      } else if (parsed.type === 'business-whatsapp-catalog') {
        setCurrentPage('business-whatsapp-catalog');
      } else if (parsed.type === 'business-customers') {
        setCurrentPage('business-customers');
      } else if (parsed.type === 'business-community') {
        setCurrentPage('business-community');
      } else if (parsed.type === 'public-business-profile' && parsed.slug) {
        setActiveToken(parsed.slug);
        setCurrentPage('public-business-profile');
      } else if (parsed.type === 'public-product-detail' && parsed.slug && parsed.productId) {
        if (!INTERNAL_BUSINESS_CATALOG_ENABLED) {
          setActiveToken(parsed.slug);
          setCurrentPage('public-business-profile');
        } else {
          setActiveToken(parsed.slug);
          setActiveProductToken(parsed.productId);
          setProfileInitialTab('products');
          setCurrentPage('public-product-detail');
        }
      } else if (parsed.type === 'details' && parsed.token) {
        const urlParams = new URLSearchParams(window.location.search);
        const src = (urlParams.get('src') as any) || 'link';
        setActiveToken(parsed.token);
        setActiveSource(src);
        setCurrentPage('details');
      } else {
        setActiveToken(null);
        setActiveSource('link');
        setCurrentPage('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Initial parse
    if (!INTERNAL_BUSINESS_CATALOG_ENABLED) {
      const path = window.location.pathname;
      const bpMatch = path.match(/\/b\/([^/]+)\/p\/([^/]+)/);
      if (bpMatch) {
        const base = import.meta.env.VITE_APP_BASE_PATH || '/';
        const cleanBase = base.endsWith('/') ? base : `${base}/`;
        window.history.replaceState({}, '', `${cleanBase}b/${bpMatch[1]}`);
      }
    }

    const parsed = parsePath();
    if (parsed.type === 'share-intake') {
      setActiveToken(null);
      setActiveSource('link');
      setCurrentPage('share-intake');
    } else if (parsed.type === 'business-create') {
      setCurrentPage('business-create');
    } else if (parsed.type === 'business-manage') {
      setCurrentPage('business-manage');
    } else if (parsed.type === 'business-operations') {
      setCurrentPage('business-operations');
    } else if (parsed.type === 'business-team') {
      setCurrentPage('business-team');
    } else if (parsed.type === 'business-manage-profile') {
      setCurrentPage('business-manage-profile');
    } else if (parsed.type === 'business-whatsapp-catalog') {
      setCurrentPage('business-whatsapp-catalog');
    } else if (parsed.type === 'business-customers') {
      setCurrentPage('business-customers');
    } else if (parsed.type === 'business-community') {
      setCurrentPage('business-community');
    } else if (parsed.type === 'public-business-profile' && parsed.slug) {
      setActiveToken(parsed.slug);
      setCurrentPage('public-business-profile');
    } else if (parsed.type === 'public-product-detail' && parsed.slug && parsed.productId) {
      setActiveToken(parsed.slug);
      setActiveProductToken(parsed.productId);
      setProfileInitialTab('products');
      setCurrentPage('public-product-detail');
    } else if (parsed.type === 'details' && parsed.token) {
      const urlParams = new URLSearchParams(window.location.search);
      const src = (urlParams.get('src') as any) || 'link';
      setActiveToken(parsed.token);
      setActiveSource(src);
      setCurrentPage('details');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check auth session on startup and subscribe to auth changes
  useEffect(() => {
    // Transition to session_pending immediately on mount
    setAuthState('session_pending');

    const slowConnectionTimer = setTimeout(() => {
      setAuthState(prev => {
        if (prev === 'session_pending') {
          setConnectivity('slow');
          setStatusMessage('جاري الاتصال بالخادم، يرجى الانتظار...');
          setShowStatusBanner(true);
        }
        return prev;
      });
    }, 1500);

    const loadProfileBackground = async (userId: string, metadata: any) => {
      const thisGen = requestGenerationRef.current;
      setProfileStatus('loading');
      setProfileError(null);

      if (import.meta.env.DEV) {
        performance.mark('profile_load_start');
      }

      try {
        const { data: prof, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        // Check if user changed or session reset since request started (race condition guard)
        if (thisGen !== requestGenerationRef.current) {
          if (import.meta.env.DEV) {
            console.warn('[SW/Auth] Aborted profile state application: generation mismatch.');
          }
          return;
        }

        if (!error && prof) {
          setProfile(prof as Profile);
          setProfileStatus('ready');
        } else {
          // Attempt upsert in background
          const { data: newProf, error: insError } = await supabase
            .from('profiles')
            .upsert({
              id: userId,
              full_name: metadata?.full_name || 'مستخدم سند',
              phone: metadata?.phone || '',
              status: 'active',
              profile_completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (thisGen !== requestGenerationRef.current) return;

          if (!insError && newProf) {
            setProfile(newProf as Profile);
            setProfileStatus('ready');
          } else {
            setProfileStatus('missing');
            setProfileError('Failed to fetch profile');
          }
        }
      } catch (err) {
        console.error('Error fetching profile in background:', err);
        if (thisGen === requestGenerationRef.current) {
          setProfileStatus('degraded');
          setProfileError('Network error loading profile');
        }
      } finally {
        if (thisGen === requestGenerationRef.current && import.meta.env.DEV) {
          performance.mark('profile_load_end');
          performance.measure('Profile Load Time', 'profile_load_start', 'profile_load_end');
        }
      }
    };

    const verifySession = async () => {
      requestGenerationRef.current += 1;
      const thisGen = requestGenerationRef.current;

      if (import.meta.env.DEV) {
        performance.mark('session_restore_start');
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (thisGen !== requestGenerationRef.current) {
          return;
        }

        clearTimeout(slowConnectionTimer);
        setShowStatusBanner(false);

        if (session?.user) {
          setUser(session.user);
          setAuthState('authenticated');
          loadProfileBackground(session.user.id, session.user.user_metadata);
        } else {
          setUser(null);
          setProfile(null);
          setProfileStatus('idle');
          setAuthState('unauthenticated');
        }
      } catch (err: any) {
        if (thisGen !== requestGenerationRef.current) {
          return;
        }

        clearTimeout(slowConnectionTimer);
        console.error('Session verification error:', err);

        if (!navigator.onLine) {
          setConnectivity('offline');
          setStatusMessage('أنت غير متصل بالإنترنت حالياً');
          setShowStatusBanner(true);
        } else {
          setAuthState('auth_error');
        }
      } finally {
        clearTimeout(slowConnectionTimer);
        if (thisGen === requestGenerationRef.current && import.meta.env.DEV) {
          performance.mark('session_restore_end');
          performance.measure('Session Restoration Time', 'session_restore_start', 'session_restore_end');
        }
      }
    };

    verifySession();

    // Listen to network status changes to auto-retry
    const handleOnline = () => {
      setConnectivity('online');
      setStatusMessage('تم استعادة الاتصال. جاري التحديث...');
      verifySession();
      setTimeout(() => {
        setConnectivity(prev => prev === 'online' ? 'online' : prev);
        setShowStatusBanner(false);
      }, 2000);
    };

    const handleOffline = () => {
      setConnectivity('offline');
      setStatusMessage('أنت غير متصل بالإنترنت حالياً');
      setShowStatusBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      requestGenerationRef.current += 1;

      if (session?.user) {
        setUser(prevUser => {
          if (prevUser?.id === session.user.id) {
            // User did not change, likely a TOKEN_REFRESHED event, skip profile reload
            return prevUser;
          }
          loadProfileBackground(session.user.id, session.user.user_metadata);
          return session.user;
        });
        setAuthState('authenticated');
      } else {
        // Safe clean up user data only, keep App Shell caches
        setUser(null);
        setProfile(null);
        setProfileStatus('idle');
        setAuthState('unauthenticated');
      }
    });

    return () => {
      clearTimeout(slowConnectionTimer);
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // IndexedDB helper for Capacitor share sheet integration
  const openShareDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sanad-share-db', 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('shares')) {
          db.createObjectStore('shares', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e: any) => resolve(e.target.result);
      request.onerror = (e: any) => reject(e.target.error);
    });
  };

  // Check and process files shared from Android Share Sheet
  useEffect(() => {
    const checkAndroidShare = async () => {
      const androidShare = (window as any).AndroidShare;
      if (androidShare && user && profile) {
        try {
          const rawData = androidShare.getSharedData();
          if (rawData) {
            const data = JSON.parse(rawData);
            if (data && data.base64 && data.mimeType && data.name) {
              const byteCharacters = atob(data.base64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], { type: data.mimeType });

              const db = await openShareDB();
              await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('shares', 'readwrite');
                const store = tx.objectStore('shares');
                const req = store.put({
                  id: 'latest-share',
                  title: '',
                  text: '',
                  url: '',
                  files: [{
                    blob: blob,
                    name: data.name,
                    type: data.mimeType,
                    size: blob.size
                  }],
                  timestamp: Date.now()
                });
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(tx.error);
              });

              androidShare.clearSharedData();
              navigateTo('share-intake');
            }
          }
        } catch (err) {
          console.error('Error handling Android share intent:', err);
        }
      }
    };

    // Run when authenticated state resolves
    if (user && profile) {
      checkAndroidShare();
    }

    const handleHotShare = () => {
      if (user && profile) {
        checkAndroidShare();
      }
    };

    window.addEventListener('androidShareReceived', handleHotShare);
    return () => {
      window.removeEventListener('androidShareReceived', handleHotShare);
    };
  }, [user, profile]);

  // Handle Capacitor native deep link opens
  useEffect(() => {
    let appListener: any = null;
    const setupDeepLinks = async () => {
      if ((window as any).Capacitor) {
        try {
          const { App: CapApp } = await import('@capacitor/app');
          appListener = await CapApp.addListener('appUrlOpen', (event: any) => {
            try {
              const url = new URL(event.url);
              const match = url.pathname.match(/\/v\/([^/]+)/);
              if (match) {
                const token = match[1];
                navigateTo('details', token, 'link');
              }
            } catch (err) {
              console.error('Failed to parse deep link URL:', err);
            }
          });
        } catch (err) {
          console.warn('Capacitor App plugin listener setup failed:', err);
        }
      }
    };
    setupDeepLinks();

    return () => {
      if (appListener && typeof appListener.remove === 'function') {
        appListener.remove();
      }
    };
  }, []);


  // Render Supabase Key missing alert screen
  if (!hasSupabaseConfig) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-slate-800 border border-slate-700/50 p-8 rounded-3xl space-y-6 shadow-xl">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold">مطلوب تهيئة مفاتيح الاتصال</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              يرجى توفير مفاتيح Supabase البيئية لمشروع <code className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-rose-300">sanad_verify_v3</code> لتمكين قاعدة البيانات وتوثيق الدخول الحقيقي.
            </p>
          </div>
          <div className="bg-slate-900/60 p-4 rounded-2xl text-right font-mono text-xs text-slate-300 space-y-2 border border-slate-950">
            <div>VITE_SUPABASE_URL=https://hudbzlgclghlhazlduas.supabase.co</div>
            <div>VITE_SUPABASE_PUBLISHABLE_KEY=M_KEY</div>
          </div>
          <p className="text-[11px] text-slate-500">قم بضبط هذه المتغيرات في لوحة الإعدادات لإطلاق التطبيق بنجاح.</p>
        </div>
      </div>
    );
  }

  // Booting and session pending states render ShellSkeleton
  if (authState === 'booting_shell' || authState === 'session_pending') {
    return <ShellSkeleton />;
  }

  // Render Authentication Connection Error screen
  if (authState === 'auth_error') {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100/80 max-w-sm space-y-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto animate-bounce" />
          <h2 className="text-base font-bold font-arabic text-slate-800">حدث خطأ أثناء الاتصال</h2>
          <p className="text-xs text-slate-500 font-arabic leading-relaxed">
            تعذر تأكيد حالتك الأمنية أو الاتصال بالخادم الرئيسي حالياً. يرجى التحقق من الشبكة وإعادة المحاولة.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-[#111111] hover:bg-slate-800 text-white font-arabic py-2 rounded-2xl text-xs font-bold transition-all shadow-sm"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const isDetailsView = currentPage === 'details' && activeToken;
  const isAuthenticated = authState === 'authenticated';
  const shouldShowAuth = authState === 'unauthenticated' && !isDetailsView;

  const handleAuthSuccess = (sessionUser: any, userProfile: Profile) => {
    setUser(sessionUser);
    setProfile(userProfile);
    setAuthState('authenticated');
    navigateTo('home');
  };

  const handleLogoutSuccess = () => {
    setUser(null);
    setProfile(null);
    setAuthState('unauthenticated');
    navigateTo('home');
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-slate-800 flex flex-col" id="app_root">
      
      {/* Top Brand Navbar */}
      <header className="bg-white border-b border-slate-200/60 sticky top-0 z-50 px-4 py-3 shadow-sm" id="global_header">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center">
            <img 
              src={`${import.meta.env.BASE_URL}logo.png`} 
              alt="شعار سند" 
              className="h-10 w-auto object-contain" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const span = document.createElement('span');
                  span.className = "text-lg font-bold text-slate-900 font-arabic";
                  span.innerText = "سند للتحقق";
                  parent.appendChild(span);
                }
              }} 
            />
          </div>

          <div>
            {isAuthenticated && (
              <div className="flex items-center gap-2 bg-slate-50 p-1 pl-3 pr-1 rounded-full border border-slate-200/80">
                <div className="w-6.5 h-6.5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px]">
                  {profile ? (profile.full_name?.slice(0, 1) || 'أ') : '...'}
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold leading-none text-slate-800">
                    {profile ? profile.full_name : 'جاري التحميل...'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showStatusBanner && (
        <div className={`text-white text-[11px] font-bold py-1.5 px-4 text-center font-arabic animate-slide-down flex items-center justify-center gap-2 shadow-sm sticky top-[53px] z-40 ${
          connectivity === 'offline' ? 'bg-rose-600' : 'bg-amber-500'
        }`}>
          <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Main Container Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 pb-24" id="app_main">
        {shouldShowAuth ? (
          <Auth onAuthSuccess={handleAuthSuccess} />
        ) : (
          <div className="animate-fade-in">
             {currentPage === 'home' && (
              <Home profile={profile} onNavigate={(p: any, t?: string) => navigateTo(p, t, 'app')} />
            )}
            
            {currentPage === 'upload' && user && (
              profile ? (
                <UploadNotification
                  user={user}
                  profile={profile}
                  onNavigateToDetails={(token) => navigateTo('details', token, 'app')}
                  onNavigate={(p: any) => navigateTo(p)}
                  ensureProfileComplete={ensureProfileComplete}
                />
              ) : (
                <ContentSkeleton />
              )
            )}

            {currentPage === 'details' && activeToken && (
              <NotificationDetails
                token={activeToken}
                user={user}
                onNavigateToLogin={() => navigateTo('profile')}
                ensureProfileComplete={ensureProfileComplete}
                onNavigate={(p: any, t?: string, s?: any) => navigateTo(p, t, s)}
                source={activeSource}
              />
            )}

            {currentPage === 'my-operations' && (
              <MyOperations onNavigateToDetails={(token) => navigateTo('details', token, 'app')} />
            )}

            {currentPage === 'verify-notice' && (
              <VerifyNotice onNavigateToDetails={(token) => navigateTo('details', token, 'search')} />
            )}

            {currentPage === 'scan-qr' && (
              <VerifyNotice
                onNavigateToDetails={(token) => navigateTo('details', token, 'qr')}
                directCameraOnly={true}
                onCancelDirectCamera={() => navigateTo('home')}
              />
            )}

            {currentPage === 'profile' && user && (
              profile ? (
                <MyProfile
                  user={user}
                  profile={profile}
                  onLogout={handleLogoutSuccess}
                  refreshProfile={refreshProfile}
                  onNavigate={(page, token) => navigateTo(page, token)}
                />
              ) : (
                <ContentSkeleton />
              )
            )}

            {currentPage === 'reports' && (
              profile ? (
                <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                  <Suspense fallback={<ContentSkeleton />}>
                    <Reports
                      profile={profile}
                      standalone={true}
                      ensureProfileComplete={ensureProfileComplete}
                    />
                  </Suspense>
                </ChunkErrorBoundary>
              ) : (
                <ContentSkeleton />
              )
            )}

            {currentPage === 'share-intake' && user && (
              profile ? (
                <ShareIntake
                  user={user}
                  profile={profile}
                  onNavigateToDetails={(token) => navigateTo('details', token, 'app')}
                  onNavigate={(p: any) => navigateTo(p)}
                  ensureProfileComplete={ensureProfileComplete}
                />
              ) : (
                <ContentSkeleton />
              )
            )}

            {currentPage === 'business-create' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessCreate onNavigate={(page) => navigateTo(page)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'business-manage' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessManage onNavigate={(page, token) => navigateTo(page, token)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'business-operations' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessOperations onNavigate={(page, token) => navigateTo(page, token)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'business-team' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessTeam onNavigate={(page) => navigateTo(page)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'business-manage-profile' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessProfileEditor onNavigate={(page) => navigateTo(page)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'business-whatsapp-catalog' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessWhatsAppCatalog onNavigate={(page) => navigateTo(page)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'business-customers' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessCustomers onNavigate={(page, token) => navigateTo(page, token)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'business-community' && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <BusinessCommunity onNavigate={(page, token) => navigateTo(page, token)} />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'public-business-profile' && activeToken && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <PublicBusinessProfile
                    slug={activeToken}
                    initialTab={profileInitialTab}
                    onNavigate={(page, token) => {
                      if (page !== 'public-product-detail') {
                        setProfileInitialTab('overview');
                      }
                      navigateTo(page, token);
                    }}
                  />
                </Suspense>
              </ChunkErrorBoundary>
            )}

            {currentPage === 'public-product-detail' && activeToken && activeProductToken && (
              <ChunkErrorBoundary onGoHome={() => navigateTo('home')}>
                <Suspense fallback={<ContentSkeleton />}>
                  <PublicProductDetail
                    businessSlug={activeToken}
                    productId={activeProductToken}
                    onNavigate={(page, token) => navigateTo(page, token)}
                  />
                </Suspense>
              </ChunkErrorBoundary>
            )}
          </div>
        )}
      </main>

      {/* Bottom Sticky Tab Navigation */}
      {isAuthenticated && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/60 py-2 px-3 shadow-md z-50 animate-fade-in" id="bottom_nav">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            {/* Tab: Home */}
            <button
              onClick={() => navigateTo('home')}
              className="flex-1 flex flex-col items-center justify-center transition-all"
            >
              <div className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full transition-all ${
                currentPage === 'home' 
                  ? 'bg-[#111111] text-white' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}>
                <HomeIcon className="w-4 h-4" />
                <span className="text-[9px] font-bold font-arabic mt-0.5">الرئيسية</span>
              </div>
            </button>

            {/* Tab: Scan QR */}
            <button
              onClick={() => navigateTo('scan-qr')}
              className="flex-1 flex flex-col items-center justify-center transition-all"
            >
              <div className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full transition-all ${
                currentPage === 'scan-qr' 
                  ? 'bg-[#111111] text-white' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}>
                <QrCode className="w-4 h-4" />
                <span className="text-[9px] font-bold font-arabic mt-0.5">مسح QR</span>
              </div>
            </button>

            {/* Tab: Upload */}
            <button
              onClick={() => navigateTo('upload')}
              className="flex-1 flex flex-col items-center justify-center transition-all"
            >
              <div className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full transition-all ${
                currentPage === 'upload' 
                  ? 'bg-[#111111] text-white' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}>
                <Upload className="w-4 h-4" />
                <span className="text-[9px] font-bold font-arabic mt-0.5">رفع إشعار</span>
              </div>
            </button>

            {/* Tab: Profile */}
            <button
              onClick={() => navigateTo('profile')}
              className="flex-1 flex flex-col items-center justify-center transition-all"
            >
              <div className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full transition-all ${
                currentPage === 'profile' 
                  ? 'bg-[#111111] text-white' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}>
                <User className="w-4 h-4" />
                <span className="text-[9px] font-bold font-arabic mt-0.5">حسابي</span>
              </div>
            </button>
          </div>
        </nav>
      )}

      <ProfileCompletionGateModal
        isOpen={showCompletionGate}
        profile={profile}
        onClose={() => {
          setShowCompletionGate(false);
          setGatePendingAction(null);
        }}
        onSuccess={() => {
          setShowCompletionGate(false);
          if (gatePendingAction) {
            gatePendingAction();
            setGatePendingAction(null);
          }
        }}
        refreshProfile={refreshProfile}
      />

    </div>
  );
}
