import type { ProductArea } from '../../lib/productNavigation';

export const loadFinancialWorkspaceRoute = () => import('./FinancialWorkspaceRoute');
export const loadFinancialActionRoute = () => import('./FinancialActionRoute');
export const loadPersonalFinanceSectionRoute = () => import('./PersonalFinanceSectionRoute');
export const loadSanadAgentWorkspace = () => import('../assistant/SanadAgentWorkspace');
export const loadPersonalFinanceOverview = () => import('./PersonalFinanceOverview');

export function prefetchProductArea(area: ProductArea): void {
  void loadFinancialWorkspaceRoute();
  if (area === 'assistant') void loadSanadAgentWorkspace();
  if (area === 'financial') void loadPersonalFinanceOverview();
}
