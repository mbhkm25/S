import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = new URL('../dist/', import.meta.url).pathname;
const siteUrl = 'https://sanadflow.com';
const appUrl = 'https://app.sanadflow.com';
const lastModified = '2026-07-22';

const pages = [
  {
    slug: 'financial-verification',
    title: 'التحقق من الإشعارات المالية | سند فلو',
    description: 'تعرّف على طريقة استخدام سند للتحقق من بيانات الإشعارات والمعاملات المالية عبر الرابط أو رمز QR مع مراجعة واضحة وملاحظات خاصة.',
    eyebrow: 'سند المالي',
    heading: 'تحقق من الإشعارات المالية بوضوح أكبر',
    intro: 'يساعدك سند على تنظيم بيانات الإشعار المالي ومراجعتها قبل الاعتماد عليها، سواء وصلت العملية عبر رابط تحقق أو رمز QR.',
    sections: [
      ['مراجعة منظمة للبيانات', 'يعرض سند معلومات العملية في واجهة واضحة تساعدك على مقارنة الجهة المالية والمبلغ والمرجع والوقت والبيانات المرتبطة بالإشعار.'],
      ['تحقق عبر الرابط أو QR', 'يمكن فتح رابط العملية مباشرة أو مسح رمز QR من تطبيق سند للوصول إلى صفحة التحقق المناسبة.'],
      ['ملاحظات خاصة وآمنة', 'بعد التحقق تستطيع حفظ ملاحظة نصية أو صوتية مرتبطة بالعملية ولا تظهر للمستخدمين الآخرين.'],
      ['تنبيه مهم', 'سند أداة مساعدة لتنظيم المراجعة ولا يستبدل التأكيد النهائي من البنك أو المحفظة أو الجهة المالية عند النزاع.']
    ],
    cta: 'ابدأ التحقق في تطبيق سند',
    ctaUrl: appUrl
  },
  {
    slug: 'business',
    title: 'سند التجاري ومجتمع الأعمال في اليمن | سند فلو',
    description: 'أنشئ حضورًا رقميًا لنشاطك التجاري، واعرض المنتجات والخدمات والكتالوجات، وأدر العملاء والفريق والعمليات عبر سند التجاري.',
    eyebrow: 'سند التجاري',
    heading: 'حضور رقمي متكامل للأعمال من مكان واحد',
    intro: 'يجمع سند التجاري الملف العام والكتالوجات والمنتجات والخدمات والعملاء والفريق في تجربة عربية مصممة للأعمال المحلية.',
    sections: [
      ['ملف تجاري عام', 'عرّف العملاء بنشاطك وبيانات التواصل وموقع الخدمة وهوية العلامة في صفحة عامة منظمة.'],
      ['منتجات وخدمات وكتالوجات', 'انشر العناصر والكتالوجات العامة ليسهل اكتشاف ما يقدمه نشاطك ومشاركته.'],
      ['إدارة العملاء والفريق', 'نظّم علاقات العملاء وأدوار أعضاء الفريق وصلاحيات العمل من واجهة واحدة.'],
      ['مجتمع أعمال موثوق', 'اكتشف الأنشطة المنشورة وتواصل معها ضمن مجتمع سند للأعمال.']
    ],
    cta: 'اكتشف مجتمع أعمال سند',
    ctaUrl: `${appUrl}/businesses`
  },
  {
    slug: 'business-directory',
    title: 'دليل الأنشطة والمنتجات والخدمات في اليمن | سند فلو',
    description: 'ابحث في الأنشطة التجارية المنشورة في مجتمع أعمال سند، واستكشف المنتجات والخدمات والكتالوجات حسب التصنيف والمحافظة.',
    eyebrow: 'دليل أعمال سند',
    heading: 'اكتشف الأنشطة والمنتجات والخدمات المنشورة',
    intro: 'يعرض دليل سند البيانات العامة المعتمدة للنشر فقط، ويحترم مرحلة إطلاق المجتمع وحالة كل نشاط وتصنيف ومحافظة.',
    sections: [
      ['بحث موحد', 'ابحث باسم النشاط أو بكلمات من المنتجات والخدمات والكتالوجات المنشورة.'],
      ['تصفية حسب المحافظة', 'اختر المحافظة المناسبة أو اعرض جميع النتائج المتاحة في اليمن.'],
      ['بيانات عامة محكومة', 'لا يعرض الدليل بيانات المالك أو الفريق الخاصة، ويقود إلى الملف العام الرسمي للنشاط.'],
      ['حالة تحقق واضحة', 'تظهر شارة التحقق للنشاط الموثق فقط، ولا يعني مجرد النشر أن النشاط موثق.']
    ],
    cta: 'افتح دليل الأعمال المباشر',
    ctaUrl: `${siteUrl}/#business-directory`
  },
  {
    slug: 'sanad-pro',
    title: 'اشتراك سند Pro للتحقق المستمر | سند فلو',
    description: 'تعرّف على سند Pro لإتاحة موسعة بمدة وحدود استخدام واضحة، وإدارة الاشتراك وطلبات الدفع وسجل الاستخدام من حسابك في سند.',
    eyebrow: 'سند Pro',
    heading: 'مساحة أكبر للتحقق المستمر',
    intro: 'صُممت باقة سند Pro للمستخدمين وأصحاب الأعمال الذين يحتاجون إلى استخدام موسع خلال مدة اشتراك واضحة تُدار من الحساب.',
    sections: [
      ['مدة محددة بوضوح', 'تظهر مدة الباقة الحالية مباشرة من إعدادات سند عند الاشتراك، وتبدأ من تاريخ تفعيلها.'],
      ['إتاحة موسعة', 'يظهر حد الاستخدام الحالي من إعدادات الباقة، ولا تُرحّل العمليات غير المستخدمة بعد انتهاء الاشتراك.'],
      ['إدارة الاشتراك', 'راجع حالة الخطة وتاريخ البداية والنهاية والرصيد وطلبات الدفع السابقة من قسم حسابي.'],
      ['مراجعة طلبات الدفع', 'تخضع الإشعارات المالية المرفقة للمراجعة، ويصل للمستخدم إشعار واضح عند الموافقة أو الرفض.']
    ],
    cta: 'راجع اشتراك سند Pro',
    ctaUrl: `${appUrl}/profile/subscription`
  },
  {
    slug: 'about',
    title: 'عن سند فلو | منصة التحقق المالي ومجتمع الأعمال',
    description: 'سند منصة عربية تجمع التحقق المنظم من الإشعارات المالية ومجتمع الأعمال والكتالوجات التجارية في تجربة واحدة.',
    eyebrow: 'عن سند',
    heading: 'ثقة أوضح للأفراد وحضور أقرب للأعمال',
    intro: 'بُني سند ليجعل مراجعة العمليات المالية أكثر وضوحًا، ويساعد الأنشطة على إنشاء حضور رقمي عملي يمكن للعملاء اكتشافه والتواصل معه.',
    sections: [
      ['رؤيتنا', 'تقديم أدوات عربية بسيطة وآمنة تجعل البيانات أوضح وتقلل الالتباس في المراجعة والتواصل.'],
      ['سند المالي', 'مسار للتحقق من بيانات الإشعارات والعمليات وحفظ سجل المستخدم وملاحظاته الخاصة.'],
      ['سند التجاري', 'مساحة لإدارة الملفات التجارية والكتالوجات والعملاء والفرق واكتشاف الأنشطة.'],
      ['الخصوصية أولًا', 'نصمم الوصول إلى البيانات الحساسة وفق صلاحيات واضحة، ولا ننشر الملفات الخاصة كروابط عامة.']
    ],
    cta: 'ثبّت تطبيق سند',
    ctaUrl: `${appUrl}/install/`
  },
  {
    slug: 'security',
    title: 'الأمان والخصوصية في سند | سند فلو',
    description: 'تعرّف على مبادئ الأمان والخصوصية في سند، وصلاحيات الوصول، وحماية الملاحظات والملفات وإيصالات الدفع.',
    eyebrow: 'الأمان والخصوصية',
    heading: 'بياناتك لك منذ اللحظة الأولى',
    intro: 'يعتمد سند على وصول محكوم وتخزين خاص للبيانات الحساسة مع فصل واضح بين المحتوى العام ومعلومات الحساب الخاصة.',
    sections: [
      ['صلاحيات واضحة', 'تُقرأ البيانات الخاصة عبر حساب المستخدم والصلاحيات الممنوحة له، وتُقيّد إجراءات الإدارة بدور مدير المنصة.'],
      ['ملفات خاصة', 'تُخزن الملاحظات الصوتية وإيصالات الدفع في مساحات خاصة وليست روابط عامة مفتوحة.'],
      ['سجل إداري', 'تُسجل الإجراءات الإدارية الحساسة للمراجعة والمساءلة داخل المنصة.'],
      ['مسؤولية التحقق', 'لا يطلب سند منك مشاركة كلمة المرور أو رمز التحقق المالي، ولا يستبدل التواصل مع الجهة المالية.']
    ],
    cta: 'افتح تطبيق سند بأمان',
    ctaUrl: appUrl
  },
  {
    slug: 'help',
    title: 'مركز مساعدة سند | التحقق والاشتراك والأعمال',
    description: 'إجابات واضحة عن استخدام سند للتحقق من العمليات، والملاحظات الخاصة، وسند Pro، والملفات التجارية والكتالوجات.',
    eyebrow: 'مركز المساعدة',
    heading: 'إجابات سريعة قبل أن تبدأ',
    intro: 'ابدأ من السؤال الأقرب إلى احتياجك، ثم انتقل إلى التطبيق لإكمال الإجراء من حسابك.',
    sections: [
      ['هل سند يضمن العملية ماليًا؟', 'لا. سند ينظم البيانات ويعرض مؤشرات مساعدة، ويجب الرجوع إلى الجهة المالية للتأكيد النهائي عند النزاع.'],
      ['كيف أتحقق من عملية؟', 'افتح رابط التحقق أو امسح رمز QR ثم راجع البيانات الظاهرة وسجل تحققك داخل الحساب.'],
      ['هل يمكن إضافة ملاحظة؟', 'نعم، بعد التحقق تستطيع إضافة ملاحظة نصية أو صوتية خاصة مرتبطة بالعملية.'],
      ['كيف أتواصل مع الدعم؟', 'يمكن التواصل عبر واتساب على الرقم +967777634971 أو البريد support@sanadflow.com.']
    ],
    cta: 'تواصل مع دعم سند',
    ctaUrl: 'https://wa.me/967777634971'
  },
  {
    slug: 'faq',
    title: 'الأسئلة الشائعة عن سند | التحقق وسند برو ومجتمع الأعمال',
    description: 'إجابات موثوقة ومحدثة عن سند والتحقق المالي والحساب والخصوصية وسند برو ومجتمع الأعمال والدعم.',
    eyebrow: 'الأسئلة الشائعة',
    heading: 'إجابات واضحة عن استخدام سند',
    intro: 'تُدار قاعدة معرفة سند من مصدر منظم، وتُقرأ الأسعار والمدد وحدود الاستخدام وبيانات الدعم من الإعدادات الحالية بدل أرقام ثابتة.',
    sections: [
      ['ما هو سند؟', 'سند منصة عربية تجمع التحقق المنظم من بيانات الإشعارات والمعاملات المالية مع مجتمع أعمال وكتالوجات تجارية في تجربة واحدة.'],
      ['هل سند بنك أو محفظة مالية؟', 'لا. سند منصة تقنية لتنظيم البيانات والمراجعة وإدارة الحضور التجاري، ولا ينفذ التحويل المالي.'],
      ['هل نتيجة سند ضمان نهائي للعملية؟', 'لا. سند يعرض مؤشرات مساعدة ولا يستبدل تأكيد البنك أو المحفظة أو الجهة المالية عند النزاع.'],
      ['كيف أتحقق من عملية؟', 'افتح رابط التحقق أو امسح رمز QR، ثم راجع البيانات وسجّل تحققك من حسابك.'],
      ['هل يمكن إضافة ملاحظة؟', 'نعم. بعد التحقق يمكن حفظ ملاحظة نصية أو صوتية خاصة لا تظهر في رابط التحقق العام.'],
      ['هل الإتاحة المجانية تتجدد؟', 'لا. الإتاحة المجانية تأسيسية لمرة واحدة طوال عمر الحساب وليست رصيدًا شهريًا متجددًا.'],
      ['كيف أبحث عن نشاط أو خدمة؟', 'استخدم دليل الأعمال للبحث بالاسم أو المحافظة أو التصنيف أو كلمات من المنتجات والخدمات المنشورة.'],
      ['كيف أتواصل مع الدعم؟', 'استخدم قنوات الدعم الرسمية الظاهرة في الموقع والتطبيق، ولا تشارك كلمة المرور أو رمز التحقق أو بيانات البطاقة.']
    ],
    cta: 'افتح قاعدة الأسئلة الكاملة',
    ctaUrl: `${siteUrl}/#faq`
  },
  {
    slug: 'privacy',
    title: 'سياسة الخصوصية | سند فلو',
    description: 'سياسة الخصوصية العامة لمنصة سند وشرح أنواع البيانات واستخدامها وحمايتها وخيارات المستخدم.',
    eyebrow: 'سياسة الخصوصية',
    heading: 'نحمي البيانات ونستخدمها لتقديم الخدمة',
    intro: 'توضح هذه الصفحة المبادئ العامة لمعالجة البيانات في سند. قد تُحدّث السياسة عند إضافة خدمات جديدة، ويظهر تاريخ التحديث في الصفحة.',
    sections: [
      ['البيانات التي نعالجها', 'بيانات الحساب والتواصل، والبيانات التي يضيفها المستخدم للعمليات أو النشاط التجاري، وسجلات الاستخدام اللازمة لتشغيل الخدمة وحمايتها.'],
      ['غرض الاستخدام', 'نستخدم البيانات لتقديم وظائف التحقق وإدارة الحساب والاشتراك والأعمال والدعم والأمان، ولا نعرض المحتوى الخاص كمحتوى عام.'],
      ['الحماية والاحتفاظ', 'نطبق صلاحيات وصول وتخزينًا خاصًا للملفات الحساسة، ونحتفظ بالبيانات بالقدر اللازم لتقديم الخدمة والوفاء بالمتطلبات النظامية.'],
      ['حقوق المستخدم والتواصل', 'يمكن للمستخدم مراجعة بيانات حسابه وتحديثها والتواصل مع الدعم بخصوص الخصوصية عبر support@sanadflow.com.']
    ],
    cta: 'تواصل بشأن الخصوصية',
    ctaUrl: 'mailto:support@sanadflow.com'
  },
  {
    slug: 'terms',
    title: 'الشروط والأحكام | سند فلو',
    description: 'الشروط العامة لاستخدام منصة سند وخدمات التحقق وسند التجاري وسند Pro.',
    eyebrow: 'الشروط والأحكام',
    heading: 'استخدام واضح ومسؤول لخدمات سند',
    intro: 'باستخدام سند يوافق المستخدم على استعمال المنصة بصورة مشروعة، وتقديم بيانات صحيحة، واحترام حقوق المستخدمين والأنشطة الأخرى.',
    sections: [
      ['طبيعة الخدمة', 'سند أداة تقنية لتنظيم البيانات والمراجعة وإدارة الأعمال، ولا يمثل بنكًا أو محفظة مالية ولا يضمن صحة أي عملية دون تأكيد مصدرها.'],
      ['مسؤولية الحساب', 'يتحمل المستخدم مسؤولية حماية بيانات الدخول وعدم مشاركة رموز التحقق أو استخدام حسابه للإضرار بالآخرين.'],
      ['الاشتراكات', 'تخضع الأسعار والمدد والحدود لما يظهر في واجهة الاشتراك وقت الطلب، وتنتهي الإتاحة غير المستخدمة بانتهاء مدة الخطة.'],
      ['الاستخدام المقبول', 'يُمنع رفع محتوى غير مشروع أو مضلل أو انتهاك الخصوصية أو محاولة تجاوز الصلاحيات أو تعطيل الخدمة.']
    ],
    cta: 'ابدأ استخدام سند',
    ctaUrl: `${appUrl}/install/`
  }
];

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${siteUrl}/#organization`,
  name: 'سند',
  alternateName: ['Sanad', 'Sanad Flow', 'سند فلو'],
  url: `${siteUrl}/`,
  logo: `${siteUrl}/sanad_logo.png`,
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+967777634971',
    contactType: 'customer support',
    areaServed: 'YE',
    availableLanguage: ['ar']
  }
};

const css = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
:root{font-family:'IBM Plex Sans Arabic',sans-serif;color:#0b1327;background:#f7f9fb}*{box-sizing:border-box}body{margin:0;direction:rtl;background:linear-gradient(180deg,#07101f 0,#0a2430 430px,#f7f9fb 431px);color:#0b1327}a{color:inherit;text-decoration:none}.seo-nav{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 max(5vw,22px);color:#fff;border-bottom:1px solid #ffffff18}.seo-nav img{width:106px;height:52px;object-fit:contain}.seo-nav div{display:flex;gap:20px;font-size:13px;color:#cbd5e1}.seo-nav .install{background:#34d399;color:#062117;padding:12px 18px;border-radius:14px;font-weight:700}.seo-hero{max-width:1120px;margin:auto;padding:78px 24px 92px;color:#fff}.seo-hero span{color:#6ee7b7;font-weight:700;font-size:14px}.seo-hero h1{font-size:clamp(36px,6vw,68px);line-height:1.35;margin:16px 0}.seo-hero p{max-width:760px;color:#c3cfdd;line-height:2;font-size:17px}.seo-content{max-width:1120px;margin:-36px auto 60px;padding:0 24px;display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.seo-card{background:#fff;border:1px solid #e5ebf0;border-radius:24px;padding:28px;box-shadow:0 16px 50px #0f172a0d}.seo-card h2{font-size:21px;margin:0 0 10px}.seo-card p{color:#59677a;line-height:2;margin:0}.seo-cta{grid-column:1/-1;background:linear-gradient(120deg,#d1fae5,#e0f2fe);border-radius:26px;padding:30px;display:flex;align-items:center;justify-content:space-between}.seo-cta strong{font-size:24px}.seo-cta a{background:#07101f;color:#fff;padding:14px 20px;border-radius:14px;font-weight:700}.seo-footer{background:#050b16;color:#fff;padding:36px max(6vw,24px);display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.seo-footer div{display:flex;gap:18px;flex-wrap:wrap;color:#aab6ca}.seo-footer small{color:#7d8ba0}@media(max-width:760px){.seo-nav div{display:none}.seo-content{grid-template-columns:1fr}.seo-cta{flex-direction:column;align-items:flex-start;gap:18px}.seo-hero{padding-top:54px}.seo-hero h1{font-size:38px}}`;

function pageHtml(page) {
  const url = `${siteUrl}/${page.slug}/`;
  const graph = [
      organization,
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: 'ar-YE',
        isPartOf: { '@id': `${siteUrl}/#website` },
        about: { '@id': `${siteUrl}/#organization` },
        dateModified: lastModified
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: page.eyebrow, item: url }
        ]
      }
    ];
  if (page.slug === 'faq' || page.slug === 'help') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: page.sections.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer }
      }))
    });
  }
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': graph
  };
  const cards = page.sections.map(([title, body]) => `<article class="seo-card"><h2>${title}</h2><p>${body}</p></article>`).join('');
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07101f"><meta name="robots" content="index, follow, max-image-preview:large">
<title>${page.title}</title><meta name="description" content="${page.description}">
<link rel="canonical" href="${url}"><link rel="alternate" hreflang="ar-YE" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">
<link rel="icon" href="/sanad_logo.png"><link rel="stylesheet" href="/seo-pages.css">
<meta property="og:locale" content="ar_YE"><meta property="og:type" content="website"><meta property="og:site_name" content="سند">
<meta property="og:title" content="${page.title}"><meta property="og:description" content="${page.description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${siteUrl}/sanad_logo.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${page.title}"><meta name="twitter:description" content="${page.description}"><meta name="twitter:image" content="${siteUrl}/sanad_logo.png">
<script type="application/ld+json">${JSON.stringify(structuredData)}</script></head><body>
<header class="seo-nav"><a href="/"><img src="/sanad_logo.png" width="106" height="52" alt="سند فلو"></a><div><a href="/financial-verification/">سند المالي</a><a href="/business/">سند التجاري</a><a href="/business-directory/">دليل الأعمال</a><a href="/sanad-pro/">سند Pro</a><a href="/faq/">الأسئلة الشائعة</a></div><a class="install" href="${appUrl}/install/">ثبّت التطبيق</a></header>
<main><section class="seo-hero"><span>${page.eyebrow}</span><h1>${page.heading}</h1><p>${page.intro}</p></section><section class="seo-content">${cards}<div class="seo-cta"><strong>${page.cta}</strong><a href="${page.ctaUrl}">انتقل الآن</a></div></section></main>
<footer class="seo-footer"><div><a href="/about/">عن سند</a><a href="/privacy/">الخصوصية</a><a href="/terms/">الشروط</a><a href="/help/">الدعم</a></div><small>© 2026 سند. جميع الحقوق محفوظة.</small></footer>
</body></html>`;
}

await writeFile(join(outputDir, 'seo-pages.css'), css, 'utf8');

for (const page of pages) {
  const directory = join(outputDir, page.slug);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'index.html'), pageHtml(page), 'utf8');
}

const sitemapEntries = [
  { loc: `${siteUrl}/`, priority: '1.0' },
  ...pages.map(page => ({ loc: `${siteUrl}/${page.slug}/`, priority: page.slug === 'privacy' || page.slug === 'terms' ? '0.4' : '0.8' }))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.map(entry => `  <url><loc>${entry.loc}</loc><lastmod>${lastModified}</lastmod><changefreq>monthly</changefreq><priority>${entry.priority}</priority></url>`).join('\n')}
</urlset>\n`;
await writeFile(join(outputDir, 'sitemap.xml'), sitemap, 'utf8');

console.log(`Generated ${pages.length} SEO pages and sitemap.xml`);
