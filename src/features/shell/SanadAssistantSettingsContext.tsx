import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SanadAgentMemory, SanadAgentPreferences } from '../assistant/assistantWorkspaceApi';

export type AssistantPreferenceKey = keyof Pick<SanadAgentPreferences,
  'save_history_enabled' | 'memory_enabled' | 'proactive_insights_enabled' | 'response_cards_enabled'>;

type AssistantSettingsContextValue = {
  preferences: SanadAgentPreferences | null;
  pendingPreferenceKey: AssistantPreferenceKey | null;
  preferenceError: string | null;
  loadingPreferences: boolean;
  ensurePreferences: () => Promise<void>;
  changePreference: (key: AssistantPreferenceKey, value: boolean) => Promise<void>;
  memories: SanadAgentMemory[];
  memoriesLoading: boolean;
  memoryError: string | null;
  pendingMemoryId: string | null;
  ensureMemories: () => Promise<void>;
  setMemorySnapshot: (threadId: string, memories: SanadAgentMemory[]) => void;
  forgetMemory: (memoryId: string) => Promise<void>;
};

const AssistantSettingsContext = createContext<AssistantSettingsContextValue | null>(null);

// One account-scoped owner lives ABOVE both the persistent global sidebar and
// the assistant route. UI state is not an alternate financial source of truth.
export function SanadAssistantSettingsProvider({
  userId,
  children,
}: { userId: string | null; children: ReactNode }) {
  const [preferences, setPreferences] = useState<SanadAgentPreferences | null>(null);
  const [pendingPreferenceKey, setPendingPreferenceKey] = useState<AssistantPreferenceKey | null>(null);
  const pendingPreferenceRef = useRef(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const prefLoadRef = useRef<Promise<void> | null>(null);
  const [memories, setMemories] = useState<SanadAgentMemory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [pendingMemoryId, setPendingMemoryId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  const memoryLoadSeqRef = useRef(0);
  const memoryDeleteRef = useRef(false);
  const userRef = useRef(userId);
  userRef.current = userId;

  // An account switch must not display the previous user's preferences/memories.
  useEffect(() => {
    prefLoadRef.current = null;
    pendingPreferenceRef.current = false;
    activeThreadRef.current = null;
    memoryLoadSeqRef.current++;
    setPreferences(null);
    setMemories([]);
    setActiveThreadId(null);
    setPreferenceError(null);
    setMemoryError(null);
    setPendingMemoryId(null);
    setPendingPreferenceKey(null);
  }, [userId]);

  const ensurePreferences = useCallback(async () => {
    if (!userRef.current || prefLoadRef.current) return prefLoadRef.current || undefined;
    if (preferences) return;
    const account = userRef.current;
    setLoadingPreferences(true);
    const request = import('../assistant/assistantWorkspaceApi')
      .then(({ getSanadAgentPreferences }) => getSanadAgentPreferences())
      .then((value) => {
        if (userRef.current === account) {
          setPreferences(value);
          setPreferenceError(null);
        }
      })
      .catch((error) => {
        if (userRef.current === account) {
          setPreferenceError(error instanceof Error ? error.message : 'تعذر تحميل إعدادات سند.');
        }
      })
      .finally(() => {
        if (userRef.current === account) setLoadingPreferences(false);
        if (prefLoadRef.current === request) prefLoadRef.current = null;
      });
    prefLoadRef.current = request;
    return request;
  }, [preferences]);

  const changePreference = useCallback(async (key: AssistantPreferenceKey, value: boolean) => {
    if (!userRef.current || !preferences || pendingPreferenceRef.current) return;
    const account = userRef.current;
    const previous = preferences;
    pendingPreferenceRef.current = true;
    setPendingPreferenceKey(key);
    setPreferenceError(null);
    setPreferences({ ...preferences, [key]: value });
    try {
      const { updateSanadAgentPreferences } = await import('../assistant/assistantWorkspaceApi');
      const result = await updateSanadAgentPreferences({ [key]: value });
      if (userRef.current === account) setPreferences(result);
    } catch (error) {
      if (userRef.current === account) {
        setPreferences(previous);
        setPreferenceError(error instanceof Error ? error.message : 'تعذر حفظ إعداد سند.');
      }
    } finally {
      pendingPreferenceRef.current = false;
      if (userRef.current === account) setPendingPreferenceKey(null);
    }
  }, [preferences]);

  useEffect(() => {
    const onThreadSelected = (event: Event) => {
      const threadId = (event as CustomEvent<string | null>).detail || null;
      if (activeThreadRef.current === threadId) return;
      activeThreadRef.current = threadId;
      memoryLoadSeqRef.current++;
      setActiveThreadId(threadId);
      setMemories([]);
      setMemoryError(null);
    };
    window.addEventListener('sanad:thread-selected', onThreadSelected);
    return () => window.removeEventListener('sanad:thread-selected', onThreadSelected);
  }, []);

  const setMemorySnapshot = useCallback((threadId: string, values: SanadAgentMemory[]) => {
    // An older asynchronous thread request must never overwrite the current memory view.
    if (activeThreadRef.current && activeThreadRef.current !== threadId) return;
    activeThreadRef.current = threadId;
    setActiveThreadId(threadId);
    memoryLoadSeqRef.current++;
    setMemories(values);
    setMemoryError(null);
    setMemoriesLoading(false);
  }, []);

  const ensureMemories = useCallback(async () => {
    if (!userRef.current) return;
    const account = userRef.current;
    const seq = ++memoryLoadSeqRef.current;
    const currentThread = activeThreadRef.current;
    setMemoriesLoading(true);
    setMemoryError(null);
    try {
      const { listSanadAgentThreads, getSanadAgentContext } = await import('../assistant/assistantWorkspaceApi');
      // Outside chat, read only participant-authorized thread IDs.
      const threadId = currentThread || (await listSanadAgentThreads(1)).find((t) => t.status === 'active')?.id;
      if (userRef.current !== account || seq !== memoryLoadSeqRef.current) return;
      if (!threadId) {
        setMemories([]);
        setMemoriesLoading(false);
        return;
      }
      const context = await getSanadAgentContext(threadId);
      if (userRef.current !== account || seq !== memoryLoadSeqRef.current) return;
      activeThreadRef.current = threadId;
      setActiveThreadId(threadId);
      setMemories(context.memories);
    } catch (error) {
      if (userRef.current === account && seq === memoryLoadSeqRef.current) {
        setMemoryError(error instanceof Error ? error.message : 'تعذر تحميل ذاكرة سند.');
      }
    } finally {
      if (userRef.current === account && seq === memoryLoadSeqRef.current) setMemoriesLoading(false);
    }
  }, []);

  const forgetMemory = useCallback(async (id: string) => {
    if (!userRef.current || memoryDeleteRef.current) return;
    const account = userRef.current;
    memoryDeleteRef.current = true;
    setPendingMemoryId(id);
    setMemoryError(null);
    try {
      const { forgetSanadAgentMemory } = await import('../assistant/assistantWorkspaceApi');
      await forgetSanadAgentMemory(id);
      if (userRef.current === account) setMemories((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      if (userRef.current === account) setMemoryError(error instanceof Error ? error.message : 'تعذر نسيان الذاكرة.');
    } finally {
      memoryDeleteRef.current = false;
      if (userRef.current === account) setPendingMemoryId(null);
    }
  }, []);

  return (
    <AssistantSettingsContext.Provider value={{
      preferences, pendingPreferenceKey, preferenceError, loadingPreferences,
      ensurePreferences, changePreference, memories, memoriesLoading, memoryError,
      pendingMemoryId, ensureMemories, setMemorySnapshot, forgetMemory,
    }}>
      {children}
    </AssistantSettingsContext.Provider>
  );
}

export function useSanadAssistantSettings() {
  const value = useContext(AssistantSettingsContext);
  if (!value) throw new Error('SANAD Assistant Settings requires its shell provider.');
  return value;
}
