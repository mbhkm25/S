import { readFile, writeFile } from 'node:fs/promises';

const path = 'src/components/business/BusinessManage.tsx';
let source = await readFile(path, 'utf8');

const importAnchor = "import BusinessReports from './reports/BusinessReports';";
const importLine = "import BusinessManageNavigation, { type BusinessManageTab } from './BusinessManageNavigation';";
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error('BusinessReports import anchor not found');
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const stateAnchor = "  const [activeTab, setActiveTab] = useState<TabType>('overview');";
const stateLine = "  const [navigationOpen, setNavigationOpen] = useState(false);";
if (!source.includes(stateLine)) {
  if (!source.includes(stateAnchor)) throw new Error('activeTab state anchor not found');
  source = source.replace(stateAnchor, `${stateAnchor}\n${stateLine}`);
}

const startMarker = '          {/* Inner Sidebar matching the mockup layout */}';
const endMarker = '          {/* Main Content Area */}';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start === -1 || end === -1 || end <= start) {
  throw new Error('Navigation block markers not found');
}

const replacement = `          <BusinessManageNavigation\n            activeTab={activeTab as BusinessManageTab}\n            complaintsCount={complaintsList.filter((item) => item.status === 'pending').length}\n            open={navigationOpen}\n            onOpenChange={setNavigationOpen}\n            onSelect={(tab) => {\n              setActiveTab(tab as TabType);\n              setSuccess(null);\n              setError(null);\n            }}\n          />\n\n`;
source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;

if (source.includes('إدارة العملاء والشركاء')) {
  source = source.replaceAll('إدارة العملاء والشركاء', 'إدارة العملاء');
}

await writeFile(path, source, 'utf8');
console.log('BusinessManage navigation updated successfully.');
