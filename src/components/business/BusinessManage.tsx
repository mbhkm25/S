import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../../lib/supabase';
import { 
  getBusinessMediaSignedUrl, 
  getUserBusinessContexts, 
  updateBusinessProfile, 
  getPublicBusinessProfile,
  getBusinessOperations,
  BusinessProfile, 
  BusinessContexts 
} from '../../lib/businessApi';
import {
  LayoutDashboard,
  Store,
  ShoppingBag,
  Wrench,
  Clock,
  Settings,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Users,
  FileText,
  Plus,
  Trash2,
  Edit3,
  Save,
  MessageSquare,
  Check,
  Share2,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Copy,
  Link,
  Facebook,
  Instagram,
  Twitter,
  Globe,
  Database,
  PlusCircle,
  Puzzle,
  Download,
  AlertTriangle,
  UserCheck
} from 'lucide-react';

import BusinessCustomers from './BusinessCustomers';
import BusinessTeam from './BusinessTeam';

interface BusinessManageProps {
  onNavigate: (page: string, token?: string) => void;
}

type TabType = 'overview' | 'products' | 'services' | 'hours' | 'accounts' | 'complaints' | 'reports' | 'integrations' | 'addons' | 'customers' | 'team';

// Sub-component for product card to comply with React Hooks Rules
function ProductCardItem({ 
  prod, 
  idx, 
  onEdit, 
  onDelete 
}: { 
  prod: any; 
  idx: number; 
  onEdit: (idx: number, imgUrl: string) => void; 
  onDelete: (idx: number) => void; 
  key?: any;
}) {
  const [imgUrl, setImgUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (prod.image_path) {
      getBusinessMediaSignedUrl(prod.image_path).then((url) => {
        if (active) setImgUrl(url);
      });
    } else {
      setImgUrl('');
    }
    return () => {
      active = false;
    };
  }, [prod.image_path]);

  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex gap-3 items-center shadow-2xs hover:border-slate-350 transition-all">
      <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 shrink-0 overflow-hidden shadow-3xs flex items-center justify-center">
        {imgUrl ? (
          <img src={imgUrl} alt={prod.name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-slate-350" />
        )}
      </div>

      <div className="flex-1 space-y-1 min-w-0 text-right">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-900 truncate">{prod.name}</h4>
          {prod.price && <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded shrink-0">{prod.price}</span>}
        </div>
        <p className="text-[10px] text-slate-550 line-clamp-1">{prod.description}</p>
        
        <div className="flex justify-end gap-1.5 pt-1.5 border-t border-slate-100">
          <button
            onClick={() => onEdit(idx, imgUrl)}
            className="p-1 text-slate-500 hover:text-black hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(idx)}
            className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-component for service card to comply with React Hooks Rules
function ServiceCardItem({ 
  serv, 
  idx, 
  onEdit, 
  onDelete 
}: { 
  serv: any; 
  idx: number; 
  onEdit: (idx: number, imgUrl: string) => void; 
  onDelete: (idx: number) => void; 
  key?: any;
}) {
  const [imgUrl, setImgUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (serv.image_path) {
      getBusinessMediaSignedUrl(serv.image_path).then((url) => {
        if (active) setImgUrl(url);
      });
    } else {
      setImgUrl('');
    }
    return () => {
      active = false;
    };
  }, [serv.image_path]);

  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex gap-3 items-center shadow-2xs hover:border-slate-350 transition-all">
      <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 shrink-0 overflow-hidden shadow-3xs flex items-center justify-center">
        {imgUrl ? (
          <img src={imgUrl} alt={serv.name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-5 h-5 text-slate-350" />
        )}
      </div>

      <div className="flex-1 space-y-1 min-w-0 text-right">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-900 truncate">{serv.name}</h4>
          {serv.price && <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded shrink-0">{serv.price}</span>}
        </div>
        <p className="text-[10px] text-slate-550 line-clamp-1">{serv.description}</p>
        
        <div className="flex justify-end gap-1.5 pt-1.5 border-t border-slate-100">
          <button
            onClick={() => onEdit(idx, imgUrl)}
            className="p-1 text-slate-500 hover:text-black hover:bg-white border border-transparent hover:border-slate-200 rounded transition-all"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(idx)}
            className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BusinessManage({ onNavigate }: BusinessManageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [businessContexts, setBusinessContexts] = useState<BusinessContexts | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [galleryCount, setGalleryCount] = useState(0);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Sharing states
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Form inputs for tab: INFO (Settings)
  const [infoName, setInfoName] = useState('');
  const [infoTagline, setInfoTagline] = useState('');
  const [infoDescription, setInfoDescription] = useState('');
  const [infoGovernorate, setInfoGovernorate] = useState('');
  const [infoCity, setInfoCity] = useState('');
  const [infoWhatsapp, setInfoWhatsapp] = useState('');
  const [infoAddress, setInfoAddress] = useState('');
  const [infoWhatsappCatalog, setInfoWhatsappCatalog] = useState('');

  // Form inputs for tab: SOCIAL LINKS
  const [socialFacebook, setSocialFacebook] = useState('');
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialTwitter, setSocialTwitter] = useState('');
  const [socialWebsite, setSocialWebsite] = useState('');

  // Form inputs for tab: PRODUCTS
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProductIndex, setEditProductIndex] = useState<number | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodWhatsappUrl, setProdWhatsappUrl] = useState('');
  const [prodImagePath, setProdImagePath] = useState('');
  const [prodImagePreview, setProdImagePreview] = useState('');
  const [uploadingProdImg, setUploadingProdImg] = useState(false);

  // Form inputs for tab: SERVICES
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editServiceIndex, setEditServiceIndex] = useState<number | null>(null);
  const [servName, setServName] = useState('');
  const [servDesc, setServDesc] = useState('');
  const [servPrice, setServPrice] = useState('');
  const [servImagePath, setServImagePath] = useState('');
  const [servImagePreview, setServImagePreview] = useState('');
  const [uploadingServImg, setUploadingServImg] = useState(false);

  // Form inputs for tab: FINANCIAL ACCOUNTS
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editAccountIndex, setEditAccountIndex] = useState<number | null>(null);
  const [accName, setAccName] = useState('');
  const [accIsMultiCurrency, setAccIsMultiCurrency] = useState(false);
  const [accNumberSingle, setAccNumberSingle] = useState('');
  const [accNumberYER, setAccNumberYER] = useState('');
  const [accNumberSAR, setAccNumberSAR] = useState('');
  const [accNumberUSD, setAccNumberUSD] = useState('');

  // Working Hours State
  const DAYS_AR: Record<string, string> = {
    saturday: 'السبت',
    sunday: 'الأحد',
    monday: 'الاثنين',
    tuesday: 'التعداد',
    wednesday: 'الأربعاء',
    thursday: 'الخميس',
    friday: 'الجمعة'
  };
  const [workingHours, setWorkingHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>({
    saturday: { open: '08:00', close: '22:00', closed: false },
    sunday: { open: '08:00', close: '22:00', closed: false },
    monday: { open: '08:00', close: '22:00', closed: false },
    tuesday: { open: '08:00', close: '22:00', closed: false },
    wednesday: { open: '08:00', close: '22:00', closed: false },
    thursday: { open: '08:00', close: '22:00', closed: false },
    friday: { open: '14:00', close: '22:00', closed: false }
  });

  // Complaints State (No mock data allowed)
  const [complaintsList, setComplaintsList] = useState<any[]>([]);

  // Reports State (Real database operations)
  const [realOps, setRealOps] = useState<any[]>([]);
  const [reportSummary, setReportSummary] = useState<Record<string, { total: number; verified: number; count: number }>>({});
  const [loadingReports, setLoadingReports] = useState(false);

  // Custom filters state
  const [filterCurrency, setFilterCurrency] = useState<string>('ALL');
  const [filterPeriod, setFilterPeriod] = useState<string>('ALL');
  const [filterUser, setFilterUser] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const getUniqueVerifiers = () => {
    const usersSet = new Set<string>();
    realOps.forEach((item) => {
      const uName = item.linked_by?.full_name || item.linked_by?.phone;
      if (uName) {
        usersSet.add(uName);
      }
      const vName = item.verified_by?.full_name || item.verified_by?.phone;
      if (vName) {
        usersSet.add(vName);
      }
    });
    return Array.from(usersSet);
  };

  const getFilteredOperations = () => {
    return realOps.filter((item) => {
      const op = item.operation;
      if (!op) return false;

      // 1. Currency filter
      if (filterCurrency !== 'ALL' && op.currency !== filterCurrency) {
        return false;
      }

      // 2. Status filter
      const isVerified = op.status === 'verified' || item.link_status === 'verified';
      if (filterStatus === 'verified' && !isVerified) return false;
      if (filterStatus === 'pending' && isVerified) return false;

      // 3. User filter
      if (filterUser !== 'ALL') {
        const linkedName = item.linked_by?.full_name || item.linked_by?.phone || '';
        const verifiedName = item.verified_by?.full_name || item.verified_by?.phone || '';
        if (linkedName !== filterUser && verifiedName !== filterUser) {
          return false;
        }
      }

      // 4. Period filter
      if (filterPeriod !== 'ALL') {
        const opDate = new Date(op.transaction_datetime || op.created_at || item.linked_at);
        const now = new Date();
        
        if (filterPeriod === 'TODAY') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (opDate < today) return false;
        } else if (filterPeriod === 'WEEK') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (opDate < weekAgo) return false;
        } else if (filterPeriod === 'MONTH') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (opDate < monthAgo) return false;
        } else if (filterPeriod === 'CUSTOM') {
          if (customStartDate) {
            const start = new Date(customStartDate);
            if (opDate < start) return false;
          }
          if (customEndDate) {
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            if (opDate > end) return false;
          }
        }
      }

      return true;
    });
  };

  const handleDownloadPDF = () => {
    if (!business) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('الرجاء السماح للنوافذ المنبثقة لتوليد ملف الـ PDF.');
      return;
    }

    const filteredOps = getFilteredOperations();
    
    // Aggregates for filtered ops
    const yerSum = filteredOps.filter(o => o.operation?.currency === 'YER').reduce((acc, o) => acc + (o.operation?.amount || 0), 0);
    const sarSum = filteredOps.filter(o => o.operation?.currency === 'SAR').reduce((acc, o) => acc + (o.operation?.amount || 0), 0);
    const usdSum = filteredOps.filter(o => o.operation?.currency === 'USD').reduce((acc, o) => acc + (o.operation?.amount || 0), 0);

    const rowsHtml = filteredOps.map((item, idx) => {
      const op = item.operation;
      const linkedUser = item.linked_by?.full_name || item.linked_by?.phone || 'غير حدد';
      const statusText = item.link_status === 'verified' || op?.status === 'verified' ? 'موثق' : 'معلق';
      
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${op?.transaction_datetime ? new Date(op.transaction_datetime).toLocaleDateString('ar-YE') : '-'}</td>
          <td>${op?.financial_entity || '-'}</td>
          <td>${op?.reference_number || '-'}</td>
          <td style="font-family: monospace; font-weight: bold;">${(op?.amount || 0).toLocaleString()} ${op?.currency}</td>
          <td>${linkedUser}</td>
          <td>
            <span class="status-badge ${statusText === 'موثق' ? 'status-verified' : 'status-pending'}">
              ${statusText}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تقرير العمليات المالية - ${business.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          body {
            font-family: 'Cairo', sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            direction: rtl;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .header img {
            height: 50px;
          }
          .header-info {
            text-align: right;
          }
          .header-info h1 {
            font-size: 20px;
            margin: 0;
            color: #0f172a;
          }
          .header-info p {
            font-size: 11px;
            color: #64748b;
            margin: 5px 0 0 0;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 30px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 15px;
            font-size: 12px;
          }
          .meta-item {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px dashed #e2e8f0;
            padding-bottom: 5px;
          }
          .meta-item:last-child {
            border-bottom: none;
          }
          .meta-label {
            font-weight: bold;
            color: #475569;
          }
          .summary-cards {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 30px;
          }
          .card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 15px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          }
          .card-title {
            font-size: 11px;
            color: #64748b;
            margin-bottom: 5px;
          }
          .card-val {
            font-size: 18px;
            font-weight: bold;
            color: #4f46e5;
            font-family: monospace;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
            font-size: 11px;
          }
          th {
            background-color: #f1f5f9;
            color: #334155;
            font-weight: 700;
            text-align: right;
            padding: 10px;
            border-bottom: 2px solid #cbd5e1;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          .status-badge {
            font-size: 9px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 9999px;
            display: inline-block;
          }
          .status-verified {
            background-color: #d1fae5;
            color: #065f46;
          }
          .status-pending {
            background-color: #fef3c7;
            color: #92400e;
          }
          .footer {
            margin-top: 50px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-info">
            <h1>تقرير العمليات المالية الموثقة</h1>
            <p>${business.name} | شريك التحقق المالي سند</p>
          </div>
          <img src="/logo.png" alt="شعار سند" onerror="this.style.display='none'">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
          <div class="meta-grid" style="margin-bottom: 0;">
            <div class="meta-item">
              <span class="meta-label">النشاط التجاري:</span>
              <span>${business.name}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">الموقع:</span>
              <span>${business.city}، ${business.governorate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">تاريخ توليد التقرير:</span>
              <span>${new Date().toLocaleString('ar-YE')}</span>
            </div>
          </div>
          
          <div class="meta-grid" style="margin-bottom: 0;">
            <div class="meta-item">
              <span class="meta-label">عدد العمليات بالتقرير:</span>
              <span>${filteredOps.length} عملية</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">الحالة العامة للنشاط:</span>
              <span>${business.verification_status === 'verified' ? 'موثق ومعتمد' : 'تحت التحقق'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">عملة التصفية:</span>
              <span>${filterCurrency === 'ALL' ? 'كل العملات' : filterCurrency}</span>
            </div>
          </div>
        </div>

        <h3 style="font-size: 13px; color: #0f172a; margin-bottom: 15px; border-right: 3px solid #4f46e5; padding-right: 8px;">إجمالي المبيعات المفلترة حسب العملات</h3>
        <div class="summary-cards">
          <div class="card">
            <div class="card-title">إجمالي الريال اليمني (YER)</div>
            <div class="card-val">${yerSum.toLocaleString()} YER</div>
          </div>
          <div class="card">
            <div class="card-title">إجمالي الريال السعودي (SAR)</div>
            <div class="card-val">${sarSum.toLocaleString()} SAR</div>
          </div>
          <div class="card">
            <div class="card-title">إجمالي الدولار الأمريكي (USD)</div>
            <div class="card-val">${usdSum.toLocaleString()} USD</div>
          </div>
        </div>

        <h3 style="font-size: 13px; color: #0f172a; margin-bottom: 15px; border-right: 3px solid #4f46e5; padding-right: 8px;">تفاصيل العمليات المالية</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              <th>الجهة المالية</th>
              <th>رقم المرجع</th>
              <th>المبلغ والعملة</th>
              <th>بواسطة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" style="text-align: center; color: #94a3b8;">لا توجد عمليات تطابق الفلترة المحددة.</td></tr>'}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 60px; font-size: 12px; padding: 0 20px;">
          <div style="text-align: center;">
            <p style="font-weight: bold; margin-bottom: 40px;">توقيع وختم النشاط التجاري</p>
            <p style="color: #94a3b8;">_______________________</p>
          </div>
          <div style="text-align: center;">
            <p style="font-weight: bold; margin-bottom: 40px;">تدقيق ومصادقة منصة سند</p>
            <p style="color: #4f46e5; font-weight: bold;">✓ نظام سند الرقمي للتحقق المالي</p>
          </div>
        </div>

        <div class="footer">
          <p>صدر هذا التقرير آلياً عبر منصة سند للتحقق المالي والأنشطة الموثقة.</p>
          <p>الصفحة 1 من 1</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleDownloadCSV = () => {
    if (!business) return;
    const filteredOps = getFilteredOperations();

    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel Arabic encoding support
    csvContent += 'الرقم,التاريخ,الجهة المالية,المرجع,المبلغ,العملة,التحقق بواسطة,الحالة\n';

    filteredOps.forEach((item, idx) => {
      const op = item.operation;
      const date = op?.transaction_datetime ? new Date(op.transaction_datetime).toLocaleDateString('ar-YE') : '-';
      const entity = op?.financial_entity || '-';
      const ref = op?.reference_number || '-';
      const amt = op?.amount || 0;
      const cur = op?.currency || '-';
      const user = item.linked_by?.full_name || item.linked_by?.phone || 'غير محدد';
      const status = item.link_status === 'verified' || op?.status === 'verified' ? 'موثق' : 'معلق';

      csvContent += `${idx + 1},"${date}","${entity}","${ref}",${amt},"${cur}","${user}","${status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `financial_report_${business.slug}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadBusinessData = async () => {
    console.log('[SANAD DEBUG] loadBusinessData started');
    setLoading(true);
    setError(null);
    try {
      console.log('[SANAD DEBUG] calling getUserBusinessContexts...');
      const contexts = await getUserBusinessContexts();
      console.log('[SANAD DEBUG] contexts fetched successfully:', contexts);
      setBusinessContexts(contexts);
      const current = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0] || null;
      console.log('[SANAD DEBUG] current business determined:', current);

      if (!current) {
        console.log('[SANAD DEBUG] no business found for user. resolving...');
        setBusiness(null);
        setLogoUrl('');
        setCoverUrl('');
        setGalleryCount(0);
        return;
      }

      console.log('[SANAD DEBUG] calling getPublicBusinessProfile for slug:', current.slug);
      const fullBiz = await getPublicBusinessProfile(current.slug).catch((err) => {
        console.warn('[SANAD DEBUG] getPublicBusinessProfile failed or caught:', err);
        return null;
      });
      console.log('[SANAD DEBUG] fullBiz fetched:', fullBiz);
      const mergedBusiness = fullBiz ? { ...current, ...fullBiz } : current;
      console.log('[SANAD DEBUG] mergedBusiness:', mergedBusiness);
      setBusiness(mergedBusiness);

      // Map Info fields
      setInfoName(mergedBusiness.name || '');
      setInfoTagline((mergedBusiness as any).tagline || (mergedBusiness as any).display_tagline || '');
      setInfoDescription(mergedBusiness.description || '');
      setInfoGovernorate(mergedBusiness.governorate || '');
      setInfoCity(mergedBusiness.city || '');
      setInfoWhatsapp(mergedBusiness.whatsapp || '');
      setInfoAddress((mergedBusiness as any).address_text || '');
      setInfoWhatsappCatalog((mergedBusiness as any).whatsapp_catalog_url || '');

      // Load Social Media Links from contact_links column
      const socials = (mergedBusiness as any).contact_links || {};
      setSocialFacebook(socials.facebook || '');
      setSocialInstagram(socials.instagram || '');
      setSocialTwitter(socials.twitter || '');
      setSocialWebsite(socials.website || '');

      // Load Working Hours
      if (mergedBusiness.working_hours && typeof mergedBusiness.working_hours === 'object' && Object.keys(mergedBusiness.working_hours).length > 0) {
        setWorkingHours(mergedBusiness.working_hours);
      }

      // Load Complaints from profile_sections.complaints (No prepopulation or mock data allowed!)
      const sections = (mergedBusiness as any).profile_sections || {};
      const complaints = sections.complaints || [];
      setComplaintsList(complaints);

      console.log('[SANAD DEBUG] generating QRCode for slug:', mergedBusiness.slug);
      // Generate Public Profile Link QR Code
      const profileUrl = `${window.location.origin}/b/${mergedBusiness.slug}`;
      const qrDataUrl = await QRCode.toDataURL(profileUrl, { width: 250, margin: 2 }).catch((e) => {
        console.warn('[SANAD DEBUG] QRCode generation failed:', e);
        return '';
      });
      setQrCodeUrl(qrDataUrl);
      console.log('[SANAD DEBUG] QRCode generated:', !!qrDataUrl);

      // Resolve logo & cover images
      const logoPath = (mergedBusiness as any).profile_image_path || mergedBusiness.logo_path || (mergedBusiness as any).logo_url || '';
      const coverPath = (mergedBusiness as any).cover_image_path || '';
      const galleryPaths = Array.isArray((mergedBusiness as any).gallery_paths) ? (mergedBusiness as any).gallery_paths : [];

      console.log('[SANAD DEBUG] resolving logo and cover signed URLs...');
      const [resolvedLogo, resolvedCover] = await Promise.all([
        logoPath ? getBusinessMediaSignedUrl(logoPath) : Promise.resolve(''),
        coverPath ? getBusinessMediaSignedUrl(coverPath) : Promise.resolve('')
      ]).catch((e) => {
        console.warn('[SANAD DEBUG] Image URL resolution failed:', e);
        return ['', ''];
      });

      setLogoUrl(resolvedLogo);
      setCoverUrl(resolvedCover);
      setGalleryCount(galleryPaths.length);
      console.log('[SANAD DEBUG] resolved signed URLs successfully');

      console.log('[SANAD DEBUG] loadBusinessData successfully completed');
    } catch (err: any) {
      console.error('[SANAD DEBUG] loadBusinessData caught exception:', err);
      setError(err.message || 'فشل في تحميل بيانات الأعمال الخاصة بك.');
    } finally {
      console.log('[SANAD DEBUG] loadBusinessData finally setting loading to false');
      setLoading(false);
    }
  };

  const loadReportsData = async (businessId: string) => {
    console.log('[SANAD DEBUG] loadReportsData started for:', businessId);
    setLoadingReports(true);
    try {
      const ops = await getBusinessOperations(businessId);
      console.log('[SANAD DEBUG] operations fetched successfully:', ops.length);
      setRealOps(ops);

      // Aggregate reports dynamically by currency
      const sumMap: Record<string, { total: number; verified: number; count: number }> = {
        YER: { total: 0, verified: 0, count: 0 },
        USD: { total: 0, verified: 0, count: 0 },
        SAR: { total: 0, verified: 0, count: 0 }
      };

      ops.forEach((item) => {
        const op = item.operation;
        if (op) {
          const currency = op.currency || 'YER';
          const amount = op.amount || 0;
          const isVerified = op.status === 'verified' || item.link_status === 'verified';

          if (!sumMap[currency]) {
            sumMap[currency] = { total: 0, verified: 0, count: 0 };
          }
          sumMap[currency].total += amount;
          sumMap[currency].count += 1;
          if (isVerified) {
            sumMap[currency].verified += amount;
          }
        }
      });
      setReportSummary(sumMap);
    } catch (opsErr) {
      console.warn('[SANAD DEBUG] Failed to load real business operations for reports:', opsErr);
    } finally {
      setLoadingReports(false);
    }
  };

  // Mount effect to load business contexts and profile
  useEffect(() => {
    loadBusinessData();
  }, []);

  // Lazy-load reports when Reports tab is activated
  useEffect(() => {
    if (activeTab === 'reports' && business) {
      loadReportsData(business.id);
    }
  }, [activeTab, business]);

  const handleCopyLink = () => {
    if (!business) return;
    const profileUrl = `${window.location.origin}/b/${business.slug}`;
    navigator.clipboard.writeText(profileUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveInfoAndSocials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const cleanWhatsapp = infoWhatsapp.trim();
    if (cleanWhatsapp && !/^967\d{9}$/.test(cleanWhatsapp)) {
      setError('رقم الواتساب غير صالح. يجب أن يبدأ بـ 967 متبوعاً بـ 9 أرقام.');
      setSaving(false);
      return;
    }

    try {
      // 1. Update text metadata & Social Links contact_links JSON
      await updateBusinessProfile({
        p_business_id: business.id,
        p_name: infoName.trim(),
        p_tagline: infoTagline.trim() || null,
        p_description: infoDescription.trim() || null,
        p_governorate: infoGovernorate,
        p_city: infoCity.trim(),
        p_whatsapp: cleanWhatsapp || null,
        p_address_text: infoAddress.trim() || null,
        p_whatsapp_catalog_url: infoWhatsappCatalog.trim() || null,
        p_contact_links: {
          facebook: socialFacebook.trim() || null,
          instagram: socialInstagram.trim() || null,
          twitter: socialTwitter.trim() || null,
          website: socialWebsite.trim() || null
        }
      });

      setSuccess('تم حفظ معلومات الهوية وروابط التواصل بنجاح.');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل حفظ التغييرات.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWorkingHours = async () => {
    if (!business) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateBusinessProfile({
        p_business_id: business.id,
        p_working_hours: workingHours
      });
      setSuccess('تم تحديث مواعيد ساعات العمل الأسبوعية بنجاح.');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل حفظ مواعيد ساعات العمل.');
    } finally {
      setSaving(false);
    }
  };

  // Image Upload helper for Catalog products
  const handleProductImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !business) return;

    setUploadingProdImg(true);
    setError(null);
    try {
      const file = files[0];
      const extension = file.name.split('.').pop() || 'jpg';
      const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(extension.toLowerCase()) ? extension.toLowerCase() : 'jpg';
      const filename = `product-${Date.now()}-${Math.floor(Math.random() * 1000)}.${cleanExt}`;
      const storagePath = `${business.id}/products/${filename}`;

      const { data, error: uploadErr } = await supabase.storage
        .from('business-media')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true
        });

      if (uploadErr) throw uploadErr;

      const signedUrl = await getBusinessMediaSignedUrl(storagePath);
      setProdImagePath(storagePath);
      setProdImagePreview(signedUrl);
    } catch (err: any) {
      setError(err.message || 'فشل رفع صورة المنتج.');
    } finally {
      setUploadingProdImg(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const sections = (business as any).profile_sections || {};
      const products = Array.isArray(sections.products) ? [...sections.products] : [];

      const newProduct = {
        id: editProductIndex !== null ? products[editProductIndex].id : `prod_${Date.now()}`,
        name: prodName.trim(),
        description: prodDesc.trim(),
        price: prodPrice.trim(),
        whatsapp_url: prodWhatsappUrl.trim(),
        image_path: prodImagePath || null,
        active: true
      };

      if (editProductIndex !== null) {
        products[editProductIndex] = newProduct;
      } else {
        products.push(newProduct);
      }

      sections.products = products;

      await updateBusinessProfile({
        p_business_id: business.id,
        p_profile_sections: sections
      });

      setSuccess(editProductIndex !== null ? 'تم تعديل المنتج بنجاح.' : 'تم إضافة المنتج الجديد بنجاح.');
      setShowProductForm(false);
      setEditProductIndex(null);
      setProdName('');
      setProdDesc('');
      setProdPrice('');
      setProdWhatsappUrl('');
      setProdImagePath('');
      setProdImagePreview('');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل في حفظ المنتج.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (index: number) => {
    if (!business || !confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    setSaving(true);
    try {
      const sections = (business as any).profile_sections || {};
      const products = Array.isArray(sections.products) ? [...sections.products] : [];
      products.splice(index, 1);
      sections.products = products;

      await updateBusinessProfile({
        p_business_id: business.id,
        p_profile_sections: sections
      });

      setSuccess('تم حذف المنتج بنجاح.');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل في حذف المنتج.');
    } finally {
      setSaving(false);
    }
  };

  // Image Upload helper for Services
  const handleServiceImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !business) return;

    setUploadingServImg(true);
    setError(null);
    try {
      const file = files[0];
      const extension = file.name.split('.').pop() || 'jpg';
      const cleanExt = ['jpg', 'jpeg', 'png', 'webp'].includes(extension.toLowerCase()) ? extension.toLowerCase() : 'jpg';
      const filename = `service-${Date.now()}-${Math.floor(Math.random() * 1000)}.${cleanExt}`;
      const storagePath = `${business.id}/services/${filename}`;

      const { data, error: uploadErr } = await supabase.storage
        .from('business-media')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true
        });

      if (uploadErr) throw uploadErr;

      const signedUrl = await getBusinessMediaSignedUrl(storagePath);
      setServImagePath(storagePath);
      setServImagePreview(signedUrl);
    } catch (err: any) {
      setError(err.message || 'فشل رفع صورة الخدمة.');
    } finally {
      setUploadingServImg(false);
    }
  };

  const handleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const sections = (business as any).profile_sections || {};
      const services = Array.isArray(sections.services) ? [...sections.services] : [];

      const newService = {
        id: editServiceIndex !== null ? services[editServiceIndex].id : `serv_${Date.now()}`,
        name: servName.trim(),
        description: servDesc.trim(),
        price: servPrice.trim(),
        image_path: servImagePath || null,
        active: true
      };

      if (editServiceIndex !== null) {
        services[editServiceIndex] = newService;
      } else {
        services.push(newService);
      }

      sections.services = services;

      await updateBusinessProfile({
        p_business_id: business.id,
        p_profile_sections: sections
      });

      setSuccess(editServiceIndex !== null ? 'تم تعديل الخدمة بنجاح.' : 'تم إضافة الخدمة الجديدة بنجاح.');
      setShowServiceForm(false);
      setEditServiceIndex(null);
      setServName('');
      setServDesc('');
      setServPrice('');
      setServImagePath('');
      setServImagePreview('');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل في حفظ الخدمة.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = async (index: number) => {
    if (!business || !confirm('هل أنت متأكد من حذف هذه الخدمة؟')) return;

    setSaving(true);
    try {
      const sections = (business as any).profile_sections || {};
      const services = Array.isArray(sections.services) ? [...sections.services] : [];
      services.splice(index, 1);
      sections.services = services;

      await updateBusinessProfile({
        p_business_id: business.id,
        p_profile_sections: sections
      });

      setSuccess('تم حذف الخدمة بنجاح.');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل في حذف الخدمة.');
    } finally {
      setSaving(false);
    }
  };

  // Financial Accounts Submit
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const sections = (business as any).profile_sections || {};
      const accounts = Array.isArray(sections.financial_accounts) ? [...sections.financial_accounts] : [];

      const newAccount = {
        id: editAccountIndex !== null ? accounts[editAccountIndex].id : `acc_${Date.now()}`,
        name: accName.trim(),
        is_multicurrency: accIsMultiCurrency,
        account_number: !accIsMultiCurrency ? accNumberSingle.trim() : null,
        accounts: accIsMultiCurrency ? {
          YER: accNumberYER.trim() || null,
          SAR: accNumberSAR.trim() || null,
          USD: accNumberUSD.trim() || null
        } : null
      };

      if (editAccountIndex !== null) {
        accounts[editAccountIndex] = newAccount;
      } else {
        accounts.push(newAccount);
      }

      sections.financial_accounts = accounts;

      await updateBusinessProfile({
        p_business_id: business.id,
        p_profile_sections: sections
      });

      setSuccess(editAccountIndex !== null ? 'تم تعديل الحساب المالي بنجاح.' : 'تم إضافة الحساب المالي بنجاح.');
      setShowAccountForm(false);
      setEditAccountIndex(null);
      setAccName('');
      setAccIsMultiCurrency(false);
      setAccNumberSingle('');
      setAccNumberYER('');
      setAccNumberSAR('');
      setAccNumberUSD('');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل في حفظ الحساب المالي.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (index: number) => {
    if (!business || !confirm('هل أنت متأكد من حذف هذا الحساب المالي؟')) return;

    setSaving(true);
    try {
      const sections = (business as any).profile_sections || {};
      const accounts = Array.isArray(sections.financial_accounts) ? [...sections.financial_accounts] : [];
      accounts.splice(index, 1);
      sections.financial_accounts = accounts;

      await updateBusinessProfile({
        p_business_id: business.id,
        p_profile_sections: sections
      });

      setSuccess('تم حذف الحساب المالي بنجاح.');
      await loadBusinessData();
    } catch (err: any) {
      setError(err.message || 'فشل في حذف الحساب المالي.');
    } finally {
      setSaving(false);
    }
  };

  // Resolve complaint
  const handleToggleComplaintStatus = async (complaintId: string, currentStatus: string) => {
    if (!business) return;
    setSaving(true);
    try {
      const sections = (business as any).profile_sections || {};
      const complaints = Array.isArray(sections.complaints) ? [...sections.complaints] : [];
      const idx = complaints.findIndex(c => c.id === complaintId);
      if (idx !== -1) {
        complaints[idx].status = currentStatus === 'pending' ? 'resolved' : 'pending';
        sections.complaints = complaints;

        await updateBusinessProfile({
          p_business_id: business.id,
          p_profile_sections: sections
        });
        setSuccess('تم تحديث حالة الشكوى بنجاح.');
        await loadBusinessData();
      }
    } catch (err: any) {
      setError(err.message || 'فشل في تحديث حالة الشكوى.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل لوحة إدارة النشاط...</span>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center space-y-5 font-arabic">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-50 text-slate-600 border border-slate-100 shadow-sm">
          <Store className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">ليس لديك أي نشاط تجاري مسجل</h2>
          <p className="text-[11px] text-slate-500 leading-relaxed px-4">
            سجل نشاطك التجاري لربطه بعمليات التحقق، وإظهار ملف عام موثوق لعملائك.
          </p>
        </div>
        <button
          onClick={() => onNavigate('business-create')}
          className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>سجل نشاطك التجاري الآن</span>
        </button>
      </div>
    );
  }

  // Completeness score
  const isVerified = business.verification_status === 'verified';
  const tagline = (business as any).tagline || (business as any).display_tagline || '';
  const description = business.description || '';
  const hasHours = business.working_hours && Object.keys(business.working_hours).length > 0;
  const products = (business as any).profile_sections?.products || [];
  const services = (business as any).profile_sections?.services || [];
  const financialAccounts = (business as any).profile_sections?.financial_accounts || [];

  const completenessSteps = [
    { label: 'شعار النشاط', completed: Boolean(logoUrl) },
    { label: 'صورة الغلاف', completed: Boolean(coverUrl) },
    { label: 'الوصف التفصيلي', completed: Boolean(description) },
    { label: 'العبارة الترويجية', completed: Boolean(tagline) },
    { label: 'ساعات العمل الأسبوعية', completed: Boolean(hasHours) },
    { label: 'المنتجات المعروضة', completed: products.length > 0 },
    { label: 'الخدمات المتاحة', completed: services.length > 0 },
    { label: 'الحسابات المالية للنشاط', completed: financialAccounts.length > 0 }
  ];
  const completedStepsCount = completenessSteps.filter(s => s.completed).length;
  const completenessPercent = Math.round((completedStepsCount / completenessSteps.length) * 100);

  return (
    <div className="space-y-6 font-arabic bg-slate-50/40 min-h-screen pb-12 text-right" dir="rtl">
      {/* Header Panel */}
      <div className="flex items-center justify-between gap-4 p-4 bg-white/70 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('profile')}
            className="p-2.5 bg-white hover:bg-slate-100 rounded-xl border border-slate-200/60 transition-all text-slate-700"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">مركز إدارة النشاط</h1>
            <p className="text-[10px] text-slate-400">تحكم بالهوية بأسلوب Google Business Profile</p>
          </div>
        </div>

        {/* Public view Preview Button */}
        <button
          onClick={() => onNavigate('public-business-profile', business.slug)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] bg-slate-900 text-white rounded-xl hover:bg-black font-bold transition-all shadow-sm shrink-0"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>معاينة الملف العام</span>
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {/* Status Alerts */}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-2xl flex items-center gap-2 animate-scale-up">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-2xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dashboard Grid Layout (Sidebar Tabs + Panel Content) */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Inner Sidebar matching the mockup layout */}
          <aside className="w-full lg:w-64 shrink-0 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-4 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible no-scrollbar shadow-sm">
            <div className="text-[10px] text-slate-400 font-bold px-2 pb-2 hidden lg:block border-b border-slate-100 mb-2">أقسام التحكم</div>
            {[
              { id: 'overview', label: 'لوحة الأداء والنظرة العامة', icon: LayoutDashboard },
              { id: 'products', label: 'كتالوج المنتجات المصور', icon: ShoppingBag },
              { id: 'services', label: 'قائمة الخدمات والحلول', icon: Wrench },
              { id: 'hours', label: 'الدوام ومواقع التواصل', icon: Clock },
              { id: 'accounts', label: 'الحسابات المالية للنشاط', icon: Database },
              { id: 'customers', label: 'إدارة العملاء والشركاء', icon: Users },
              { id: 'team', label: 'فريق العمل والصلاحيات', icon: UserCheck },
              { id: 'complaints', label: `صندوق الشكاوى والملاحظات (${complaintsList.filter(c => c.status === 'pending').length})`, icon: MessageSquare },
              { id: 'reports', label: 'تقارير الأداء المالي الحقيقي', icon: FileText }
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setSuccess(null);
                    setError(null);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[11px] font-bold text-right transition-all shrink-0 whitespace-nowrap lg:w-full ${
                    isSelected 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}

            <div className="hidden lg:block border-t border-slate-100 my-3 pt-3"></div>
            <div className="text-[10px] text-slate-400 font-bold px-2 pb-2 hidden lg:block">الإضافات والربط</div>
            {[
              { id: 'integrations', label: 'خيار التكاملات', icon: Puzzle },
              { id: 'addons', label: 'متجر إضافات سند', icon: PlusCircle }
            ].map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setSuccess(null);
                    setError(null);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[11px] font-bold text-right transition-all shrink-0 whitespace-nowrap lg:w-full ${
                    isSelected 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 w-full space-y-6">
            
            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fade-in">
                {/* Brand card */}
                <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-50/80 via-purple-50/70 to-pink-50/60 border border-purple-100 p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-right">
                    <div className="flex items-center justify-center md:justify-start gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{business.name}</h2>
                      {isVerified ? (
                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-amber-500" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                      {tagline || 'شريك التوثيق والتحقق المالي المعتمد من سند'}
                    </p>
                    <div className="flex items-center justify-center md:justify-start gap-1 text-[11px] text-slate-400 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-300" />
                      <span>{business.city}، {business.governorate}</span>
                    </div>
                  </div>

                  {/* Completeness Meter */}
                  <div className="bg-white/80 backdrop-blur-sm border border-white/60 p-4 rounded-3xl flex items-center gap-4 shadow-sm w-full md:w-auto">
                    <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="24" cy="24" r="20" className="stroke-slate-100 fill-none" strokeWidth="4" />
                        <circle cx="24" cy="24" r="20" className="stroke-indigo-600 fill-none" strokeWidth="4" 
                          strokeDasharray={2 * Math.PI * 20}
                          strokeDashoffset={2 * Math.PI * 20 * (1 - completenessPercent / 100)}
                        />
                      </svg>
                      <span className="absolute text-[10px] font-bold text-indigo-700">{completenessPercent}%</span>
                    </div>
                    <div className="text-right">
                      <h4 className="text-xs font-bold text-slate-800">جاهزية حضور النشاط</h4>
                      <p className="text-[10px] text-slate-550">{completedStepsCount} من أصل {completenessSteps.length} خطوات مكتملة</p>
                    </div>
                  </div>
                </div>

                {/* Business Status Metric Cards */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-800 text-right">مؤشرات حالة وجاهزية النشاط</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { 
                        id: 'products', 
                        label: 'المنتجات المصورة', 
                        value: products.length,
                        unit: 'منتج معروض',
                        icon: ShoppingBag, 
                        color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
                        desc: 'أضف سلع الكتالوج وعينات البيع' 
                      },
                      { 
                        id: 'services', 
                        label: 'الخدمات والحلول', 
                        value: services.length,
                        unit: 'خدمة نشطة',
                        icon: Wrench, 
                        color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
                        desc: 'اعرض الخدمات المهنية وحلول الدفع' 
                      },
                      { 
                        id: 'accounts', 
                        label: 'الحسابات البنكية', 
                        value: financialAccounts.length,
                        unit: 'قناة دفع معتمدة',
                        icon: Database, 
                        color: 'text-amber-600 bg-amber-50 border-amber-100',
                        desc: 'حسابات الدفع متعددة العملات للتحويل' 
                      },
                      { 
                        id: 'complaints', 
                        label: 'الشكاوى والملاحظات', 
                        value: complaintsList.filter((c: any) => c.status === 'pending').length,
                        unit: 'شكوى معلقة',
                        icon: MessageSquare, 
                        color: 'text-rose-600 bg-rose-50 border-rose-100',
                        desc: 'ملاحظات العملاء التي تحتاج لمعالجة' 
                      }
                    ].map((metric) => {
                      const Icon = metric.icon;
                      return (
                        <button
                          key={metric.id}
                          onClick={() => setActiveTab(metric.id as TabType)}
                          className="bg-white border border-slate-200 hover:border-slate-350 p-4 rounded-2xl text-right transition-all flex flex-col justify-between h-28 shadow-3xs hover:shadow-2xs group"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className={`p-2 rounded-xl border ${metric.color} shrink-0`}>
                              <Icon className="w-4.5 h-4.5" />
                            </div>
                            <span className="text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">←</span>
                          </div>
                          
                          <div className="space-y-1 mt-2">
                            <div className="flex items-baseline gap-1">
                              <span className="text-lg font-bold text-slate-900 leading-none font-mono">
                                {metric.value}
                              </span>
                              <span className="text-[9px] text-slate-500 font-medium">
                                {metric.unit}
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-400 block truncate leading-tight">
                              {metric.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sharing Options */}
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="space-y-3 text-right">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-indigo-600" />
                      <span>مشاركة ونشر ملف العمل</span>
                    </h3>
                    <p className="text-[10px] text-slate-555 leading-relaxed">
                      شارك الرابط العام الموثق لعملائك لتمكينهم من استعراض المنتجات والخدمات والحسابات المالية للتسديد الآمن.
                    </p>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyLink}
                        className="flex-1 bg-slate-900 text-white hover:bg-black text-[10px] font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'تم نسخ الرابط' : 'نسخ رابط الملف'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-2">
                    {qrCodeUrl ? (
                      <>
                        <img src={qrCodeUrl} alt="QR Code" className="w-36 h-36 border border-slate-250 p-1 bg-white rounded-xl shadow-2xs" />
                        <a
                          href={qrCodeUrl}
                          download={`${business.slug}-sanad-qr.png`}
                          className="inline-flex items-center gap-1 text-[9px] text-slate-600 hover:text-black font-bold"
                        >
                          <Download className="w-3 h-3" />
                          <span>تحميل رمز QR بدقة عالية</span>
                        </a>
                      </>
                    ) : (
                      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    )}
                  </div>
                </div>

                {/* SVG Performance Chart (Views and Actions) */}
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-xs font-bold text-slate-900">مخطط أداء النشاط الأسبوعي</h3>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">آخر 7 أيام</span>
                  </div>
                  <div className="h-44 w-full flex items-end">
                    <svg className="w-full h-full" viewBox="0 0 500 150">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="30" x2="500" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="75" x2="500" y2="75" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="120" x2="500" y2="120" stroke="#f1f5f9" strokeWidth="1" />
                      <path d="M 0,120 Q 80,40 160,90 T 320,50 T 500,70 L 500,150 L 0,150 Z" fill="url(#chartGrad)" />
                      <path d="M 0,120 Q 80,40 160,90 T 320,50 T 500,70" fill="none" stroke="#6366f1" strokeWidth="2.5" />
                      <path d="M 0,140 Q 80,90 160,120 T 320,80 T 500,100" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="3 3" />
                    </svg>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-slate-400 pt-2 border-t border-slate-50 font-bold">
                    <span>السبت</span>
                    <span>الاثنين</span>
                    <span>الأربعاء</span>
                    <span>الجمعة</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PRODUCTS */}
            {activeTab === 'products' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">كتالوج المنتجات المصور</h3>
                      <p className="text-[10px] text-slate-400">أضف المنتجات مع صورها وعناوينها لتسهيل اختيار العملاء</p>
                    </div>
                    {!showProductForm && (
                      <button
                        onClick={() => {
                          setEditProductIndex(null);
                          setProdName('');
                          setProdDesc('');
                          setProdPrice('');
                          setProdWhatsappUrl('');
                          setProdImagePath('');
                          setProdImagePreview('');
                          setShowProductForm(true);
                        }}
                        className="bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2 px-3.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة منتج</span>
                      </button>
                    )}
                  </div>

                  {showProductForm && (
                    <form onSubmit={handleProductSubmit} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5 text-right">
                      <h4 className="text-xs font-bold text-slate-900">{editProductIndex !== null ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد للكتالوج'}</h4>
                      
                      {/* Image Upload Input */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 block">صورة المنتج</label>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden relative shadow-2xs">
                            {prodImagePreview ? (
                              <img src={prodImagePreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-slate-350" />
                            )}
                            {uploadingProdImg && (
                              <div className="absolute inset-0 bg-white/85 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-800" />
                              </div>
                            )}
                          </div>
                          
                          <div className="relative">
                            <button
                              type="button"
                              className="bg-white border border-slate-250 hover:bg-slate-50 text-slate-800 text-[9px] font-bold py-2 px-3 rounded-lg transition-all relative overflow-hidden flex items-center gap-1"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>اختر صورة المنتج</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleProductImageFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                disabled={uploadingProdImg}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">اسم المنتج</label>
                          <input
                            type="text"
                            required
                            value={prodName}
                            onChange={(e) => setProdName(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all"
                            placeholder="اسم السلعة أو المنتج"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">السعر</label>
                          <input
                            type="text"
                            value={prodPrice}
                            onChange={(e) => setProdPrice(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all"
                            placeholder="مثال: 5,000 ريال يمني"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">وصف المنتج</label>
                        <textarea
                          rows={2}
                          required
                          value={prodDesc}
                          onChange={(e) => setProdDesc(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all resize-none"
                          placeholder="تفاصيل المنتج..."
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">رابط مخصص على واتساب (اختياري)</label>
                        <input
                          type="url"
                          value={prodWhatsappUrl}
                          onChange={(e) => setProdWhatsappUrl(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all font-mono text-left"
                          placeholder="https://wa.me/..."
                        />
                      </div>

                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-200/50">
                        <button
                          type="button"
                          onClick={() => {
                            setShowProductForm(false);
                            setEditProductIndex(null);
                          }}
                          className="bg-white border border-slate-200 text-slate-700 text-[10px] font-bold py-2 px-4 rounded-xl hover:bg-slate-50"
                        >
                          إلغاء
                        </button>
                        <button
                          type="submit"
                          disabled={saving || uploadingProdImg}
                          className="bg-slate-900 text-white text-[10px] font-bold py-2 px-4 rounded-xl hover:bg-black flex items-center gap-1"
                        >
                          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>حفظ المنتج</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {products.length === 0 ? (
                    <div className="p-10 border border-dashed border-slate-200 rounded-2xl text-center space-y-3">
                      <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-[10px] text-slate-400">لا يوجد منتجات معروضة حالياً.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {products.map((prod: any, idx: number) => (
                        <ProductCardItem
                          key={prod.id}
                          prod={prod}
                          idx={idx}
                          onDelete={handleDeleteProduct}
                          onEdit={(index, imgUrl) => {
                            setEditProductIndex(index);
                            setProdName(prod.name || '');
                            setProdDesc(prod.description || '');
                            setProdPrice(prod.price || '');
                            setProdWhatsappUrl(prod.whatsapp_url || '');
                            setProdImagePath(prod.image_path || '');
                            setProdImagePreview(imgUrl || '');
                            setShowProductForm(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: SERVICES */}
            {activeTab === 'services' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">قائمة الخدمات والحلول</h3>
                      <p className="text-[10px] text-slate-400">أضف الخدمات التي تقدمها لعملائك مع أسعارها وصورها التوضيحية</p>
                    </div>
                    {!showServiceForm && (
                      <button
                        onClick={() => {
                          setEditServiceIndex(null);
                          setServName('');
                          setServDesc('');
                          setServPrice('');
                          setServImagePath('');
                          setServImagePreview('');
                          setShowServiceForm(true);
                        }}
                        className="bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2 px-3.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة خدمة</span>
                      </button>
                    )}
                  </div>

                  {showServiceForm && (
                    <form onSubmit={handleServiceSubmit} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5 text-right">
                      <h4 className="text-xs font-bold text-slate-900">{editServiceIndex !== null ? 'تعديل بيانات الخدمة' : 'إضافة خدمة جديدة'}</h4>
                      
                      {/* Image Upload Input */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 block">صورة الخدمة</label>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden relative shadow-2xs">
                            {servImagePreview ? (
                              <img src={servImagePreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-slate-350" />
                            )}
                            {uploadingServImg && (
                              <div className="absolute inset-0 bg-white/85 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-800" />
                              </div>
                            )}
                          </div>
                          
                          <div className="relative">
                            <button
                              type="button"
                              className="bg-white border border-slate-250 hover:bg-slate-50 text-slate-800 text-[9px] font-bold py-2 px-3 rounded-lg transition-all relative overflow-hidden flex items-center gap-1"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>اختر صورة الخدمة</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleServiceImageFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                disabled={uploadingServImg}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">اسم الخدمة</label>
                          <input
                            type="text"
                            required
                            value={servName}
                            onChange={(e) => setServName(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all"
                            placeholder="مثال: استشارة مالية"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">تكلفة الخدمة</label>
                          <input
                            type="text"
                            value={servPrice}
                            onChange={(e) => setServPrice(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all"
                            placeholder="مثال: 10,000 ريال يمني"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">وصف ومميزات الخدمة</label>
                        <textarea
                          rows={2}
                          required
                          value={servDesc}
                          onChange={(e) => setServDesc(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all resize-none"
                          placeholder="أدخل تفاصيل ومميزات الخدمة..."
                        />
                      </div>

                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-200/50">
                        <button
                          type="button"
                          onClick={() => {
                            setShowServiceForm(false);
                            setEditServiceIndex(null);
                          }}
                          className="bg-white border border-slate-200 text-slate-700 text-[10px] font-bold py-2 px-4 rounded-xl hover:bg-slate-50"
                        >
                          إلغاء
                        </button>
                        <button
                          type="submit"
                          disabled={saving || uploadingServImg}
                          className="bg-slate-900 text-white text-[10px] font-bold py-2 px-4 rounded-xl hover:bg-black flex items-center gap-1"
                        >
                          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>حفظ الخدمة</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {services.length === 0 ? (
                    <div className="p-10 border border-dashed border-slate-200 rounded-2xl text-center space-y-3">
                      <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-[10px] text-slate-400">لا يوجد خدمات معروضة حالياً.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {services.map((serv: any, idx: number) => (
                        <ServiceCardItem
                          key={serv.id}
                          serv={serv}
                          idx={idx}
                          onDelete={handleDeleteService}
                          onEdit={(index, imgUrl) => {
                            setEditServiceIndex(index);
                            setServName(serv.name || '');
                            setServDesc(serv.description || '');
                            setServPrice(serv.price || '');
                            setServImagePath(serv.image_path || '');
                            setServImagePreview(imgUrl || '');
                            setShowServiceForm(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: HOURS & SOCIALS */}
            {activeTab === 'hours' && (
              <div className="space-y-6 animate-fade-in">
                {/* Social links form */}
                <form onSubmit={handleSaveInfoAndSocials} className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <Link className="w-4 h-4 text-indigo-650" />
                        <span>روابط شبكات التواصل الاجتماعي</span>
                      </h3>
                      <p className="text-[10px] text-slate-400">قم بإضافة حسابات النشاط الرسمي لتسهيل وصول العملاء لها في صفحتك العامة</p>
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>حفظ الروابط</span>
                    </button>
                  </div>

                  <div className="space-y-3.5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                          <Facebook className="w-4 h-4 text-blue-600 fill-blue-600" />
                          <span>فيسبوك (رابط الصفحة)</span>
                        </label>
                        <input
                          type="url"
                          value={socialFacebook}
                          onChange={(e) => setSocialFacebook(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all font-mono text-left"
                          placeholder="https://facebook.com/yourpage"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                          <Instagram className="w-4 h-4 text-pink-600" />
                          <span>إنستغرام (رابط الحساب)</span>
                        </label>
                        <input
                          type="url"
                          value={socialInstagram}
                          onChange={(e) => setSocialInstagram(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all font-mono text-left"
                          placeholder="https://instagram.com/username"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                          <Twitter className="w-4 h-4 text-sky-500 fill-sky-500" />
                          <span>تويتر / إكس (رابط الحساب)</span>
                        </label>
                        <input
                          type="url"
                          value={socialTwitter}
                          onChange={(e) => setSocialTwitter(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all font-mono text-left"
                          placeholder="https://x.com/username"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
                          <Globe className="w-4 h-4 text-slate-600" />
                          <span>الموقع الإلكتروني أو المتجر</span>
                        </label>
                        <input
                          type="url"
                          value={socialWebsite}
                          onChange={(e) => setSocialWebsite(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none transition-all font-mono text-left"
                          placeholder="https://yourstore.com"
                        />
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl space-y-1">
                      <label className="text-[10px] font-bold text-emerald-950">رابط كتالوج واتساب بزنس المتوفر حالياً:</label>
                      <input
                        type="url"
                        value={infoWhatsappCatalog}
                        onChange={(e) => setInfoWhatsappCatalog(e.target.value)}
                        className="w-full bg-white border border-emerald-200 focus:border-emerald-400 px-3 py-2 rounded-xl text-xs outline-none transition-all font-mono text-left"
                        placeholder="https://wa.me/c/..."
                      />
                    </div>
                  </div>
                </form>

                {/* Working hours scheduler */}
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">ساعات العمل الأسبوعية</h3>
                      <p className="text-[10px] text-slate-400">تستخدم لتنبيه العملاء بحالة دوام النشاط المعتمدة حياً</p>
                    </div>
                    <button
                      onClick={handleSaveWorkingHours}
                      disabled={saving}
                      className="bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>حفظ المواعيد</span>
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {Object.entries(workingHours).map(([dayKey, val]: [string, any]) => (
                      <div key={dayKey} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-right">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`closed-${dayKey}`}
                            checked={!val.closed}
                            onChange={(e) => {
                              setWorkingHours(prev => ({
                                ...prev,
                                [dayKey]: { ...prev[dayKey], closed: !e.target.checked }
                              }));
                            }}
                            className="w-4 h-4 border-slate-350 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                          />
                          <label htmlFor={`closed-${dayKey}`} className="text-xs font-bold text-slate-900 cursor-pointer">
                            {DAYS_AR[dayKey]}
                          </label>
                        </div>

                        {!val.closed ? (
                          <div className="flex items-center gap-2" dir="ltr">
                            <input
                              type="time"
                              value={val.open}
                              onChange={(e) => {
                                setWorkingHours(prev => ({
                                  ...prev,
                                  [dayKey]: { ...prev[dayKey], open: e.target.value }
                                }));
                              }}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-slate-400"
                            />
                            <span className="text-slate-400 text-xs">إلى</span>
                            <input
                              type="time"
                              value={val.close}
                              onChange={(e) => {
                                setWorkingHours(prev => ({
                                  ...prev,
                                  [dayKey]: { ...prev[dayKey], close: e.target.value }
                                }));
                              }}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-slate-400"
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200/60 rounded-full px-3 py-1 font-bold">
                            عطلة مغلق
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: FINANCIAL ACCOUNTS */}
            {activeTab === 'accounts' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">الحسابات البنكية والمحافظ المالية</h3>
                      <p className="text-[10px] text-slate-400">أضف حساباتك المصرفية الرسمية متعددة العملات لمساعدة الزوار في تحويلاتهم</p>
                    </div>
                    {!showAccountForm && (
                      <button
                        onClick={() => {
                          setEditAccountIndex(null);
                          setAccName('');
                          setAccIsMultiCurrency(false);
                          setAccNumberSingle('');
                          setAccNumberYER('');
                          setAccNumberSAR('');
                          setAccNumberUSD('');
                          setShowAccountForm(true);
                        }}
                        className="bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2 px-3.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة حساب مالي</span>
                      </button>
                    )}
                  </div>

                  {showAccountForm && (
                    <form onSubmit={handleAccountSubmit} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5 text-right">
                      <h4 className="text-xs font-bold text-slate-900">{editAccountIndex !== null ? 'تعديل بيانات الحساب' : 'إضافة حساب جديد'}</h4>
                      
                      <div className="space-y-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">اسم الجهة المالية (البنك أو المحفظة)</label>
                          <input
                            type="text"
                            required
                            value={accName}
                            onChange={(e) => setAccName(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                            placeholder="مثال: بنك الكريمي، محفظة جوالي..."
                          />
                        </div>

                        {/* Toggle Multi Currency */}
                        <div className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200/50">
                          <input
                            type="checkbox"
                            id="is_multi_currency"
                            checked={accIsMultiCurrency}
                            onChange={(e) => setAccIsMultiCurrency(e.target.checked)}
                            className="w-4 h-4 text-slate-950 focus:ring-slate-950 rounded cursor-pointer"
                          />
                          <label htmlFor="is_multi_currency" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                            هذا الحساب يقبل أرقام حسابات متعددة مقسمة حسب العملة
                          </label>
                        </div>

                        {!accIsMultiCurrency ? (
                          <div className="space-y-1 animate-fade-in">
                            <label className="text-[10px] font-bold text-slate-500">رقم الحساب (موحد لكل العملات)</label>
                            <input
                              type="text"
                              required
                              value={accNumberSingle}
                              onChange={(e) => setAccNumberSingle(e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs font-mono text-left"
                              placeholder="أدخل رقم الحساب الموحد"
                              dir="ltr"
                            />
                          </div>
                        ) : (
                          <div className="space-y-2 animate-fade-in border-r-2 border-indigo-400 pr-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500">رقم حساب الريال اليمني (YER)</label>
                              <input
                                type="text"
                                value={accNumberYER}
                                onChange={(e) => setAccNumberYER(e.target.value)}
                                className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-[11px] font-mono text-left"
                                placeholder="أدخل الحساب باليمني"
                                dir="ltr"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500">رقم حساب الريال السعودي (SAR)</label>
                              <input
                                type="text"
                                value={accNumberSAR}
                                onChange={(e) => setAccNumberSAR(e.target.value)}
                                className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-[11px] font-mono text-left"
                                placeholder="أدخل الحساب بالسعودي"
                                dir="ltr"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500">رقم حساب الدولار الأمريكي (USD)</label>
                              <input
                                type="text"
                                value={accNumberUSD}
                                onChange={(e) => setAccNumberUSD(e.target.value)}
                                className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-[11px] font-mono text-left"
                                placeholder="أدخل الحساب بالدولار"
                                dir="ltr"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-200/50">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAccountForm(false);
                            setEditAccountIndex(null);
                          }}
                          className="bg-white border border-slate-200 text-slate-700 text-[10px] font-bold py-2 px-4 rounded-xl hover:bg-slate-50"
                        >
                          إلغاء
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="bg-slate-900 text-white text-[10px] font-bold py-2 px-4 rounded-xl hover:bg-black flex items-center gap-1"
                        >
                          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>حفظ الحساب</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {financialAccounts.length === 0 ? (
                    <div className="p-10 border border-dashed border-slate-200 rounded-2xl text-center space-y-3">
                      <Database className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-[10px] text-slate-400">لا يوجد حسابات مالية للنشاط حالياً.</p>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {financialAccounts.map((acc: any, idx: number) => (
                        <div key={acc.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-right">
                          <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                            <h4 className="text-xs font-bold text-slate-900">{acc.name}</h4>
                            <span className="text-[9px] bg-slate-200 text-slate-700 font-bold px-2.5 py-0.5 rounded-full">
                              {acc.is_multicurrency ? 'متعدد العملات' : 'رقم حساب موحد'}
                            </span>
                          </div>

                          {!acc.is_multicurrency ? (
                            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200/60 font-mono text-xs">
                              <span className="text-slate-800">{acc.account_number}</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(acc.account_number);
                                  setSuccess('تم نسخ رقم الحساب!');
                                  setTimeout(() => setSuccess(null), 1500);
                                }}
                                className="p-1 text-slate-500 hover:text-black"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {['YER', 'SAR', 'USD'].map((cur) => {
                                const accNum = acc.accounts?.[cur];
                                if (!accNum) return null;
                                return (
                                  <div key={cur} className="bg-white p-2.5 rounded-xl border border-slate-200/60 flex items-center justify-between gap-2 font-mono text-[10px]">
                                    <div className="space-y-0.5 min-w-0">
                                      <span className="text-[8px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">{cur}</span>
                                      <span className="text-slate-855 block truncate">{accNum}</span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(accNum);
                                        setSuccess(`تم نسخ حساب الـ ${cur}!`);
                                        setTimeout(() => setSuccess(null), 1500);
                                      }}
                                      className="p-1 text-slate-555 hover:text-black shrink-0"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100/50">
                            <button
                              onClick={() => {
                                setEditAccountIndex(idx);
                                setAccName(acc.name || '');
                                setAccIsMultiCurrency(acc.is_multicurrency || false);
                                setAccNumberSingle(acc.account_number || '');
                                setAccNumberYER(acc.accounts?.YER || '');
                                setAccNumberSAR(acc.accounts?.SAR || '');
                                setAccNumberUSD(acc.accounts?.USD || '');
                                setShowAccountForm(true);
                              }}
                              className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg p-1 px-3.5 text-[9px] font-bold transition-all"
                            >
                              تعديل الحساب
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(idx)}
                              className="text-rose-500 hover:bg-rose-50 rounded-lg p-1 px-2.5 text-[9px] font-bold transition-all"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: CUSTOMERS */}
            {activeTab === 'customers' && (
              <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4 animate-fade-in text-right">
                <BusinessCustomers onNavigate={onNavigate} businessId={business.id} />
              </div>
            )}

            {/* TAB: TEAM */}
            {activeTab === 'team' && (
              <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4 animate-fade-in text-right">
                <BusinessTeam onNavigate={onNavigate} />
              </div>
            )}

            {/* TAB: COMPLAINTS */}
            {activeTab === 'complaints' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="pb-3 border-b border-slate-100 text-right">
                    <h3 className="text-xs font-bold text-slate-900">صندوق الشكاوى والملاحظات الواردة</h3>
                    <p className="text-[10px] text-slate-400">تلقي ومعالجة ملاحظات وشكاوى العملاء الموثقة لتعزيز الثقة</p>
                  </div>

                  <div className="space-y-3.5">
                    {complaintsList.length === 0 ? (
                      <div className="p-10 border border-dashed border-slate-200 rounded-2xl text-center space-y-2">
                        <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-[10px] text-slate-400">لا يوجد شكاوى مستلمة حالياً.</p>
                      </div>
                    ) : (
                      complaintsList.map((comp: any) => (
                        <div key={comp.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-right">
                          <div className="flex items-start justify-between border-b border-slate-200/60 pb-2">
                            <div>
                              <h4 className="text-xs font-bold text-slate-900">{comp.name}</h4>
                              <span className="text-[9px] text-slate-400 block font-mono">رقم التواصل: {comp.phone}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${
                                comp.status === 'resolved' 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                  : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {comp.status === 'resolved' ? 'تم الحل' : 'قيد الانتظار'}
                              </span>
                              
                              <button
                                onClick={() => handleToggleComplaintStatus(comp.id, comp.status)}
                                className="text-[9px] font-bold bg-white text-slate-700 border border-slate-250 px-2 py-0.5 rounded hover:bg-slate-100"
                              >
                                {comp.status === 'resolved' ? 'تغيير لانتظار' : 'اعتماد كتم الحل'}
                              </button>
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-750 leading-relaxed pt-1">
                            {comp.text}
                          </p>
                          <span className="text-[8px] text-slate-400 block font-mono text-left pt-1">
                            بتاريخ: {new Date(comp.created_at).toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: REPORTS */}
            {activeTab === 'reports' && (
              <div className="space-y-6 animate-fade-in text-right">
                {/* Advanced Reports Panel */}
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-5 shadow-xs space-y-5">
                  <div className="pb-3 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">التقارير المالية المتقدمة للتحقق</h3>
                      <p className="text-[10px] text-slate-400">احصل على كشوفات مفصلة، صَفِّ العمليات، ونزّل التقارير الرسمية كملفات PDF و Excel</p>
                    </div>
                    
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={handleDownloadCSV}
                        className="bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 text-[10px] font-bold py-2.5 px-4 rounded-xl transition-all shadow-3xs flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span>تصدير Excel (CSV)</span>
                      </button>
                      
                      <button
                        onClick={handleDownloadPDF}
                        className="bg-slate-900 hover:bg-black text-white text-[10px] font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل التقرير PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Filters Grid */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-4">
                    <h4 className="text-[10px] font-bold text-slate-800">أدوات تصفية وتحديد التقارير</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                      {/* Currency Filter */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 block">العملة</label>
                        <select
                          value={filterCurrency}
                          onChange={(e) => setFilterCurrency(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                        >
                          <option value="ALL">كل العملات</option>
                          <option value="YER">الريال اليمني (YER)</option>
                          <option value="SAR">الريال السعودي (SAR)</option>
                          <option value="USD">الدولار الأمريكي (USD)</option>
                        </select>
                      </div>

                      {/* Status Filter */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 block">حالة التحقق</label>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                        >
                          <option value="ALL">كل الحالات</option>
                          <option value="verified">موثقة ومحققة</option>
                          <option value="pending">معلقة وقيد المراجعة</option>
                        </select>
                      </div>

                      {/* User Filter */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 block">التحقق بواسطة (الموظف)</label>
                        <select
                          value={filterUser}
                          onChange={(e) => setFilterUser(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                        >
                          <option value="ALL">كل أعضاء الفريق</option>
                          {getUniqueVerifiers().map((uName) => (
                            <option key={uName} value={uName}>{uName}</option>
                          ))}
                        </select>
                      </div>

                      {/* Period Filter */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 block">الفترة الزمنية</label>
                        <select
                          value={filterPeriod}
                          onChange={(e) => setFilterPeriod(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                        >
                          <option value="ALL">كل الفترات</option>
                          <option value="TODAY">اليوم</option>
                          <option value="WEEK">آخر 7 أيام</option>
                          <option value="MONTH">آخر 30 يوم</option>
                          <option value="CUSTOM">فترة مخصصة...</option>
                        </select>
                      </div>
                    </div>

                    {/* Custom Date Picker Range */}
                    {filterPeriod === 'CUSTOM' && (
                      <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-slate-200/50 animate-scale-up">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500">تاريخ البدء</label>
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500">تاريخ الانتهاء</label>
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-slate-400 px-3 py-2 rounded-xl text-xs outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Filtered Dynamic Aggregates */}
                  {(() => {
                    const filtered = getFilteredOperations();
                    const filteredSummary: Record<string, { total: number; verified: number; count: number }> = {
                      YER: { total: 0, verified: 0, count: 0 },
                      USD: { total: 0, verified: 0, count: 0 },
                      SAR: { total: 0, verified: 0, count: 0 }
                    };

                    filtered.forEach((item) => {
                      const op = item.operation;
                      if (op) {
                        const cur = op.currency || 'YER';
                        const isVerified = op.status === 'verified' || item.link_status === 'verified';
                        if (!filteredSummary[cur]) {
                          filteredSummary[cur] = { total: 0, verified: 0, count: 0 };
                        }
                        filteredSummary[cur].total += op.amount || 0;
                        filteredSummary[cur].count += 1;
                        if (isVerified) {
                          filteredSummary[cur].verified += op.amount || 0;
                        }
                      }
                    });

                    return (
                      <div className="space-y-5">
                        {/* Dynamic totals cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {['YER', 'SAR', 'USD'].map((cur) => {
                            const sum = filteredSummary[cur] || { total: 0, verified: 0, count: 0 };
                            return (
                              <div key={cur} className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-2 text-right shadow-3xs hover:border-slate-300 transition-all">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold px-2 py-0.5 rounded-full inline-block">{cur}</span>
                                  <span className="text-[8px] text-slate-450 font-bold">{sum.count} عمليات مفلترة</span>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[10px] text-slate-550 block">المبيعات الموثقة المفلترة</span>
                                  <span className="text-base font-bold text-slate-900 block font-mono">{(sum.verified).toLocaleString()} {cur}</span>
                                  <span className="text-[8px] text-slate-400 block">إجمالي المسجل: {(sum.total).toLocaleString()} {cur}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Top Verifiers Leaderboard & Visual Ratios */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Leaderboard */}
                          <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                            <h4 className="text-[10px] font-bold text-slate-800 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-indigo-650" />
                              <span>ترتيب أعضاء الفريق الأكثر تحقيقاً للعمليات</span>
                            </h4>
                            
                            {(() => {
                              // Calculate verifications count per user
                              const stats: Record<string, { verified: number; total: number }> = {};
                              filtered.forEach((item) => {
                                const uName = item.linked_by?.full_name || item.linked_by?.phone || 'غير محدد';
                                if (!stats[uName]) {
                                  stats[uName] = { verified: 0, total: 0 };
                                }
                                stats[uName].total += 1;
                                if (item.link_status === 'verified' || item.operation?.status === 'verified') {
                                  stats[uName].verified += 1;
                                }
                              });

                              const sortedStats = Object.entries(stats).sort((a, b) => b[1].verified - a[1].verified);

                              if (sortedStats.length === 0) {
                                return <p className="text-[9px] text-slate-400 text-center py-4">لا توجد عمليات كافية لاستخراج الترتيب.</p>;
                              }

                              return (
                                <div className="space-y-2">
                                  {sortedStats.map(([name, stat], idx) => (
                                    <div key={name} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px]">
                                      <div className="flex items-center gap-2">
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] ${
                                          idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {idx + 1}
                                        </span>
                                        <span className="font-bold text-slate-800 truncate max-w-[120px]">{name}</span>
                                      </div>
                                      <div className="flex gap-2">
                                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">{stat.verified} موثقة</span>
                                        <span className="text-slate-455">من {stat.total} إجمالي</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Visual Ratio SVG Pie/Bar */}
                          <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white flex flex-col justify-between">
                            <h4 className="text-[10px] font-bold text-slate-800">تحليل نسب التحقق والمطابقة</h4>
                            
                            {(() => {
                              const totalCount = filtered.length;
                              const verifiedCount = filtered.filter(item => item.link_status === 'verified' || item.operation?.status === 'verified').length;
                              const pendingCount = totalCount - verifiedCount;
                              const percent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

                              return (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-around gap-4 py-2">
                                    <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                                      <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="40" cy="40" r="32" className="stroke-slate-100 fill-none" strokeWidth="6" />
                                        <circle cx="40" cy="40" r="32" className="stroke-indigo-650 fill-none" strokeWidth="6" 
                                          strokeDasharray={2 * Math.PI * 32}
                                          strokeDashoffset={2 * Math.PI * 32 * (1 - percent / 100)}
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                      <span className="absolute text-[11px] font-bold text-indigo-700">{percent}%</span>
                                    </div>
                                    
                                    <div className="space-y-2 text-right">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-650" />
                                        <span className="text-[10px] text-slate-700">عمليات موثقة: <strong>{verifiedCount}</strong></span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                                        <span className="text-[10px] text-slate-700">عمليات معلقة: <strong>{pendingCount}</strong></span>
                                      </div>
                                      <div className="text-[9px] text-slate-400">إجمالي العمليات المفلترة: {totalCount} عملية</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* List of operations filtered */}
                        <div className="space-y-2.5">
                          <h4 className="text-[10px] font-bold text-slate-800">تفاصيل العمليات المطابقة للفلتر ({filtered.length})</h4>
                          {filtered.length === 0 ? (
                            <div className="p-10 border border-dashed border-slate-200 rounded-2xl text-center">
                              <p className="text-[10px] text-slate-400">لا توجد عمليات تطابق معايير الفرز المحددة.</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100 bg-white border border-slate-200/50 rounded-2xl overflow-hidden shadow-3xs">
                              {filtered.map((item, index) => {
                                const op = item.operation;
                                if (!op) return null;
                                const isVerified = item.link_status === 'verified' || op.status === 'verified';
                                const linkedUser = item.linked_by?.full_name || item.linked_by?.phone || 'غير محدد';
                                
                                return (
                                  <div key={index} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between text-right gap-3.5 hover:bg-slate-50/50 transition-all">
                                    <div className="flex items-center gap-3">
                                      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                        <FileText className="w-4.5 h-4.5 text-slate-450" />
                                      </div>
                                      <div>
                                        <span className="text-xs font-bold text-slate-900 block font-mono">{(op.amount || 0).toLocaleString()} {op.currency}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className="text-[9px] text-slate-555 font-bold bg-slate-100 px-1.5 py-0.5 rounded">{op.financial_entity}</span>
                                          <span className="text-[9px] text-slate-400 font-mono">المرجع: {op.reference_number || 'غير متوفر'}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-start gap-4">
                                      <div className="text-[9px] text-slate-500 text-left">
                                        <span className="block font-bold text-slate-700">بواسطة: {linkedUser}</span>
                                        <span className="block font-mono text-slate-450 mt-0.5">
                                          {op.transaction_datetime ? new Date(op.transaction_datetime).toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                        </span>
                                      </div>
                                      
                                      <span className={`text-[9px] font-bold px-3 py-1 rounded-full border shrink-0 ${
                                        isVerified
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                          : 'bg-amber-50 text-amber-700 border-amber-100'
                                      }`}>
                                        {isVerified ? 'موثق ومعتمد' : 'قيد الانتظار'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                </div>
              </div>
            )}

            {/* TAB: INTEGRATIONS */}
            {activeTab === 'integrations' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-8 text-center space-y-4 shadow-xs">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-3xs">
                    <Puzzle className="w-7 h-7" />
                  </div>
                  <div className="space-y-2 max-w-sm mx-auto">
                    <h3 className="text-sm font-bold text-slate-900">ربط وتكامل الأنظمة البرمجية</h3>
                    <p className="text-[10px] text-slate-550 leading-relaxed">
                      قريباً، ستتمكن من ربط نظام الحسابات ودفاتر الإيرادات الخاصة بمؤسستك (ERP) أو متجرك مع منصة سند لأتمتة إرسال إشعارات التحقق وتأكيد العمليات المالية لحظياً وعبر واتساب!
                    </p>
                  </div>
                  <span className="inline-block text-[9px] bg-slate-100 text-slate-500 font-bold px-3 py-1 rounded-full border border-slate-200">
                    ميزة قادمة قريباً
                  </span>
                </div>
              </div>
            )}

            {/* TAB: ADDONS */}
            {activeTab === 'addons' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-3xl p-8 text-center space-y-5 shadow-xs">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 shadow-3xs">
                    <PlusCircle className="w-7 h-7" />
                  </div>
                  
                  <div className="space-y-2 max-w-md mx-auto">
                    <h3 className="text-sm font-bold text-slate-950 leading-relaxed">متجر إضافات سند التجاري</h3>
                    <p className="text-[10px] text-slate-550 leading-relaxed">
                      إضافات وتخصيصات متقدمة تهدف إلى تحسين ملفك التعريفي العام وتخصيص القوالب البصرية وإظهار نماذج إحصائية متطورة على دليل مجتمع الأعمال. تماماً كفلسفة إضافات ووردبريس.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-right">
                    {[
                      { title: 'مخفي الشكاوى المتقدم', desc: 'إمكانية إخفاء أو إخفاء هوية مقدمي الشكاوى وتصنيفها المتقدم.' },
                      { title: 'التكامل التلقائي مع نكهات المظهر', desc: 'تخصيص كامل لألوان غلاف وواجهة ملف العميل العام لتطابق علامتك التجارية.' }
                    ].map((plugin, index) => (
                      <div key={index} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                        <h4 className="text-[10px] font-bold text-slate-900">{plugin.title}</h4>
                        <p className="text-[9px] text-slate-500 leading-normal">{plugin.desc}</p>
                      </div>
                    ))}
                  </div>

                  <span className="inline-block text-[9px] bg-slate-100 text-slate-500 font-bold px-3 py-1 rounded-full border border-slate-200">
                    متوفر قريباً للتنشيط
                  </span>
                </div>
              </div>
            )}
            
          </main>
        </div>
      </div>
    </div>
  );
}
