import React, { useState, useEffect } from 'react';
import { 
  getUserBusinessContexts, 
  getBusinessCatalog, 
  upsertBusinessCatalogItem, 
  uploadBusinessMedia,
  getBusinessMediaSignedUrl,
  BusinessCatalogItem,
  BusinessProfile
} from '../../lib/businessApi';
import { toLatinDigits } from '../../lib/digits';
import { 
  ArrowRight, Plus, Edit2, CheckCircle, Save, 
  Loader2, AlertCircle, Trash2, PlusCircle, ShoppingBag
} from 'lucide-react';

interface BusinessCatalogProps {
  onNavigate: (page: string) => void;
}

export default function BusinessCatalog({ onNavigate }: BusinessCatalogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [catalogItems, setCatalogItems] = useState<BusinessCatalogItem[]>([]);
  const [resolvedCardImages, setResolvedCardImages] = useState<Record<string, string>>({});

  // Form Editor Modal state
  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<BusinessCatalogItem | null>(null);

  // Form Fields
  const [itemType, setItemType] = useState<'product' | 'service'>('product');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('YER');
  const [features, setFeatures] = useState('');
  const [status, setStatus] = useState<'active' | 'hidden' | 'draft'>('active');

  // Media Lists
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const current = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0];
      if (!current) {
        throw new Error('لم يتم العثور على نشاط تجاري.');
      }
      setBusiness(current);

      const items = await getBusinessCatalog(current.id, true);
      setCatalogItems(items);

      // Resolve signed URL previews for each product card
      const resolvedMap: Record<string, string> = {};
      await Promise.all(items.map(async (item) => {
        if (item.image_paths && item.image_paths.length > 0) {
          const sign = await getBusinessMediaSignedUrl(item.image_paths[0]);
          resolvedMap[item.id] = sign;
        }
      }));
      setResolvedCardImages(resolvedMap);
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل كتالوج المنتجات والخدمات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddModal = () => {
    setEditingItem(null);
    setItemType('product');
    setTitle('');
    setDescription('');
    setPrice('');
    setCurrency('YER');
    setFeatures('');
    setStatus('active');
    setUploadedImages([]);
    setUploadedPreviews([]);
    setShowEditor(true);
  };

  const openEditModal = async (item: BusinessCatalogItem) => {
    setEditingItem(item);
    setItemType(item.item_type);
    setTitle(item.title || '');
    setDescription(item.description || '');
    setPrice(item.price ? toLatinDigits(String(item.price)) : '');
    setCurrency(item.currency || 'YER');
    setFeatures(item.features ? item.features.join(', ') : '');
    setStatus(item.status);

    const paths = item.image_paths || [];
    setUploadedImages(paths);
    setUploadedPreviews([]);
    
    if (paths.length > 0) {
      const urls = await Promise.all(paths.map(p => getBusinessMediaSignedUrl(p)));
      setUploadedPreviews(urls.filter(Boolean));
    }
    setShowEditor(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !business) return;

    setUploadingImage(true);
    setError(null);
    try {
      const file = files[0];
      const result = await uploadBusinessMedia({
        businessId: business.id,
        assetType: 'catalog',
        file
      });
      setUploadedImages(prev => [...prev, result.path]);
      setUploadedPreviews(prev => [...prev, result.signedUrl]);
    } catch (err: any) {
      setError(err.message || 'فشل رفع صورة المنتج.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
    setUploadedPreviews(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const featArr = features.split(',').map(f => f.trim()).filter(f => f.length > 0);
      const parsedPrice = price.trim() ? parseFloat(toLatinDigits(price.trim())) : null;

      await upsertBusinessCatalogItem({
        id: editingItem?.id || null,
        p_business_id: business.id,
        p_item_type: itemType,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_price: isNaN(parsedPrice as number) ? null : parsedPrice,
        p_currency: currency,
        p_image_paths: uploadedImages.length > 0 ? uploadedImages : null,
        p_features: featArr.length > 0 ? featArr : null,
        p_status: status
      });

      setSuccess(editingItem ? 'تم تحديث عنصر الكتالوج بنجاح.' : 'تم إضافة عنصر جديد للكتالوج بنجاح.');
      setShowEditor(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'فشل في حفظ عنصر الكتالوج.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل كتالوج متجرك...</span>
      </div>
    );
  }

  const items = Array.isArray(catalogItems) ? catalogItems : [];

  return (
    <div className="space-y-6 font-arabic text-right min-h-screen bg-slate-50/50 pb-12" dir="rtl">
      {/* Visual Workspace Header */}
      <div className="bg-slate-900 text-white p-6 rounded-b-[2rem] shadow-md space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={() => onNavigate('business-manage')} 
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/5 text-white"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-wider block w-max mb-1">مساحة الأعمال</span>
              <h1 className="text-sm font-bold leading-tight font-arabic">كتالوج المعروضات والخدمات</h1>
            </div>
          </div>

          <button
            onClick={openAddModal}
            className="bg-white hover:bg-slate-100 text-slate-900 text-[10px] font-bold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1 shrink-0 shadow-sm border border-slate-200"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة جديد</span>
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 text-xs rounded-2xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-2xl flex items-start gap-2 animate-scale-up">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 border border-slate-100 text-slate-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xs font-bold text-slate-900 font-arabic">كتالوج المنتجات فارغ</h2>
              <p className="text-[10px] text-slate-400 leading-normal max-w-xs mx-auto font-arabic font-semibold">
                لم تقم بإضافة أي خدمات أو منتجات بعد. انقر على إضافة جديد للبدء في ملء الكتالوج التعريفي لمتجرك.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((item) => {
              const previewUrl = resolvedCardImages[item.id] || '';
              return (
                <div 
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* Image Header Placeholder */}
                    <div className="h-32 bg-slate-50 relative overflow-hidden flex items-center justify-center">
                      {previewUrl ? (
                        <img 
                          src={previewUrl} 
                          alt={item.title} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-350 font-bold text-[10px] gap-1">
                          <ShoppingBag className="w-6 h-6 text-slate-350" />
                          <span>{item.item_type === 'product' ? 'منتج مالي/خدمي' : 'خدمة تجارية'}</span>
                        </div>
                      )}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 font-semibold">
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-md border ${
                          item.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-slate-200 text-slate-650 border-slate-300'
                        }`}>
                          {item.status === 'active' ? 'نشط' : item.status === 'draft' ? 'مسودة' : 'مخفي'}
                        </span>
                        <span className="bg-slate-900/80 text-white text-[8px] font-bold px-2 py-0.5 rounded-md backdrop-blur-xs">
                          {item.item_type === 'product' ? 'منتج' : 'خدمة'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-2 text-right">
                      <h3 className="text-xs font-bold text-slate-900 font-arabic">{item.title}</h3>
                      {item.description && (
                        <p className="text-[10px] text-slate-500 leading-relaxed font-arabic line-clamp-2">{item.description}</p>
                      )}
                      
                      {item.price && (
                        <div className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
                          <span>{toLatinDigits(item.price.toLocaleString())}</span>
                          <span className="text-[8px] font-normal text-emerald-500 font-arabic">{item.currency || 'YER'}</span>
                        </div>
                      )}

                      {item.features && item.features.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1.5">
                          {item.features.map((feat, idx) => (
                            <span key={idx} className="bg-slate-100 text-slate-650 text-[8px] font-bold px-2 py-0.5 rounded font-arabic">
                              {feat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex gap-2">
                    <button
                      onClick={() => openEditModal(item)}
                      className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1 shadow-2xs"
                    >
                      <Edit2 className="w-3 h-3 text-slate-500" />
                      <span>تعديل التفاصيل والوسائط</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-arabic" dir="rtl">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 w-full max-w-sm space-y-4 shadow-xl text-right overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-900">
                {editingItem ? 'تعديل عنصر الكتالوج' : 'إضافة عنصر للكتالوج'}
              </h3>
              <button 
                onClick={() => setShowEditor(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                إغلاق
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Type */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">النوع</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setItemType('product')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      itemType === 'product'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    منتج
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemType('service')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      itemType === 'service'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    خدمة
                  </button>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">العنوان</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-800 outline-none transition-all"
                  placeholder="مثال: توصيل سريع، دقيق يمني فاخر"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">الوصف</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-800 outline-none transition-all resize-none"
                  placeholder="نبذة مختصرة عن هذا المنتج أو الخدمة..."
                />
              </div>

              {/* Price & Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block">السعر (اختياري)</label>
                  <input
                    type="text"
                    value={price}
                    onChange={(e) => setPrice(toLatinDigits(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-800 font-mono outline-none transition-all text-left"
                    placeholder="15000"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 block">العملة</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-800 outline-none transition-all cursor-pointer"
                  >
                    <option value="YER">ريال يمني (YER)</option>
                    <option value="SAR">ريال سعودي (SAR)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                  </select>
                </div>
              </div>

              {/* Catalog Image Upload */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 block">صور المعروض ({toLatinDigits(uploadedImages.length)}/3)</label>
                <div className="flex gap-2">
                  {uploadedPreviews.map((url, index) => (
                    <div key={index} className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 relative group overflow-hidden shadow-2xs">
                      <img src={url} alt="Catalog preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute inset-0 bg-red-600/85 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {uploadedImages.length < 3 && (
                    <div className="w-14 h-14 rounded-xl border border-dashed border-slate-350 hover:bg-slate-50 flex items-center justify-center cursor-pointer relative">
                      {uploadingImage ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-550" />
                      ) : (
                        <PlusCircle className="w-5 h-5 text-slate-400" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={uploadingImage}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Features list */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">الميزات النصية (مفصولة بفاصلة)</label>
                <input
                  type="text"
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-800 outline-none transition-all"
                  placeholder="مثال: ضمان، توصيل مجاني"
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 block">الحالة</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white px-3 py-2.5 rounded-xl text-xs text-slate-800 outline-none transition-all cursor-pointer"
                >
                  <option value="active">نشط (ظاهر للجميع)</option>
                  <option value="hidden">مخفي (للأرشفة)</option>
                  <option value="draft">مسودة (غير جاهز بعد)</option>
                </select>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving || uploadingImage}
                className="w-full bg-slate-900 hover:bg-black text-white text-xs font-bold py-3.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>حفظ في الكتالوج</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
