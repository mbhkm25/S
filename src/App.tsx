import { useState, useEffect } from 'react';
import { supabase, hasSupabaseConfig } from './lib/supabase';
import { Profile } from './types';
import Auth from './components/Auth';
import Home from './components/Home';
import UploadNotification from './components/Upload';
import NotificationDetails from './components/Details';
import MyOperations from './components/MyOperations';
import MyProfile from './components/Profile';
import VerifyNotice from './components/VerifyNotice';
import Reports from './components/Reports';
import ShareIntake from './components/ShareIntake';
import BusinessCreate from './components/business/BusinessCreate';
import BusinessManage from './components/business/BusinessManage';
import BusinessOperations from './components/business/BusinessOperations';
import BusinessTeam from './components/business/BusinessTeam';
import BusinessCommunity from './components/business/BusinessCommunity';
import PublicBusinessProfile from './components/business/PublicBusinessProfile';
import BusinessProfileEditor from './components/business/BusinessProfileEditor';
import BusinessWhatsAppCatalog from './components/business/BusinessWhatsAppCatalog';
import { Home as HomeIcon, Upload, QrCode, User, ShieldAlert, Loader2 } from 'lucide-react';
import { isBasicProfileComplete } from './lib/profileUtils';
import ProfileCompletionGateModal from './components/ProfileCompletionGateModal';

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  
  // Navigation states
  const [currentPage, setCurrentPage] = useState<'home' | 'upload' | 'my-operations' | 'profile' | 'details' | 'verify-notice' | 'login' | 'reports' | 'scan-qr' | 'share-intake' | 'business-create' | 'business-manage' | 'business-operations' | 'business-team' | 'business-manage-profile' | 'business-whatsapp-catalog' | 'business-community' | 'public-business-profile'>('home');
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<'link' | 'qr' | 'search' | 'app'>('link');

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
      } else if (parsed.type === 'business-community') {
        setCurrentPage('business-community');
      } else if (parsed.type === 'public-business-profile' && parsed.slug) {
        setActiveToken(parsed.slug);
        setCurrentPage('public-business-profile');
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
    } else if (parsed.type === 'business-community') {
      setCurrentPage('business-community');
    } else if (parsed.type === 'public-business-profile' && parsed.slug) {
      setActiveToken(parsed.slug);
      setCurrentPage('public-business-profile');
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
    const checkSessionAndProfile = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          
          // Get profile
          const { data: prof, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (!error && prof) {
            setProfile(prof as Profile);
          } else {
            // Force create/upsert profile using metadata if missing in DB
            const { data: newProf, error: insError } = await supabase
              .from('profiles')
              .upsert({
                id: session.user.id,
                full_name: session.user.user_metadata?.full_name || 'مستخدم سند',
                phone: session.user.user_metadata?.phone || '',
                status: 'active',
                profile_completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .single();

            if (!insError && newProf) {
              setProfile(newProf as Profile);
            } else {
              setProfile(null);
            }
          }
        }
      } catch (err) {
        console.error('Session verification error:', err);
        setProfile(null);
      } finally {
        setSessionChecked(true);
      }
    };

    checkSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          setUser(session.user);
          const { data: prof, error: getError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          if (!getError && prof) {
            setProfile(prof as Profile);
          } else {
            // Force create/upsert profile using metadata if missing in DB
            const { data: newProf, error: insError } = await supabase
              .from('profiles')
              .upsert({
                id: session.user.id,
                full_name: session.user.user_metadata?.full_name || 'مستخدم سند',
                phone: session.user.user_metadata?.phone || '',
                status: 'active',
                profile_completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .single();

            if (!insError && newProf) {
              setProfile(newProf as Profile);
            } else {
              setProfile(null);
            }
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Error in auth state change subscriber:', err);
      } finally {
        setSessionChecked(true);
      }
    });

    return () => {
      subscription.unsubscribe();
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

  // Render Loader during session check
  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100/80 inline-flex items-center justify-center mb-2">
          <img 
            src={`${import.meta.env.BASE_URL}logo.png`} 
            alt="شعار سند" 
            className="h-12 object-contain" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
        <div className="flex flex-col items-center space-y-2">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          <span className="text-xs text-slate-500 font-medium font-arabic">جاري التحقق الفوري والآمن...</span>
        </div>
      </div>
    );
  }

  const isDetailsView = currentPage === 'details' && activeToken;
  const isAuthenticated = !!user && !!profile;
  const shouldShowAuth = !isAuthenticated && !isDetailsView;

  const handleAuthSuccess = (sessionUser: any, userProfile: Profile) => {
    setUser(sessionUser);
    setProfile(userProfile);
    navigateTo('home');
  };

  const handleLogoutSuccess = () => {
    setUser(null);
    setProfile(null);
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
                  {profile?.full_name?.slice(0, 1) || 'أ'}
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold leading-none text-slate-800">{profile?.full_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 pb-24" id="app_main">
        {shouldShowAuth ? (
          <Auth onAuthSuccess={handleAuthSuccess} />
        ) : (
          <div className="animate-fade-in">
             {currentPage === 'home' && profile && (
              <Home profile={profile} onNavigate={(p: any, t?: string) => navigateTo(p, t, 'app')} />
            )}
            
            {currentPage === 'upload' && user && profile && (
              <UploadNotification
                user={user}
                profile={profile}
                onNavigateToDetails={(token) => navigateTo('details', token, 'app')}
                onNavigate={(p: any) => navigateTo(p)}
                ensureProfileComplete={ensureProfileComplete}
              />
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

            {currentPage === 'profile' && user && profile && (
              <MyProfile
                user={user}
                profile={profile}
                onLogout={handleLogoutSuccess}
                refreshProfile={refreshProfile}
                onNavigate={(page) => navigateTo(page)}
              />
            )}

            {currentPage === 'reports' && profile && (
              <Reports 
                profile={profile} 
                standalone={true} 
                ensureProfileComplete={ensureProfileComplete}
              />
            )}

            {currentPage === 'share-intake' && user && profile && (
              <ShareIntake
                user={user}
                profile={profile}
                onNavigateToDetails={(token) => navigateTo('details', token, 'app')}
                onNavigate={(p: any) => navigateTo(p)}
                ensureProfileComplete={ensureProfileComplete}
              />
            )}

            {currentPage === 'business-create' && (
              <BusinessCreate onNavigate={(page) => navigateTo(page)} />
            )}

            {currentPage === 'business-manage' && (
              <BusinessManage onNavigate={(page, token) => navigateTo(page, token)} />
            )}

            {currentPage === 'business-operations' && (
              <BusinessOperations onNavigate={(page, token) => navigateTo(page, token)} />
            )}

            {currentPage === 'business-team' && (
              <BusinessTeam onNavigate={(page) => navigateTo(page)} />
            )}

            {currentPage === 'business-manage-profile' && (
              <BusinessProfileEditor onNavigate={(page) => navigateTo(page)} />
            )}

            {currentPage === 'business-whatsapp-catalog' && (
              <BusinessWhatsAppCatalog onNavigate={(page) => navigateTo(page)} />
            )}

            {currentPage === 'business-community' && (
              <BusinessCommunity onNavigate={(page, token) => navigateTo(page, token)} />
            )}

            {currentPage === 'public-business-profile' && activeToken && (
              <PublicBusinessProfile slug={activeToken} onNavigate={(page) => navigateTo(page)} />
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
