from __future__ import annotations

import asyncio, csv, io, os, re, subprocess, tempfile, time
from collections import OrderedDict
from pathlib import Path
from typing import Any
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

MAX_BODY_BYTES=int(os.getenv("SANAD_FAST_OCR_MAX_BODY_BYTES",str(12*1024*1024)))
CONCURRENCY=max(1,int(os.getenv("SANAD_FAST_OCR_CONCURRENCY","2")))
TIMEOUT_SECONDS=max(1.0,float(os.getenv("SANAD_FAST_OCR_TIMEOUT_SECONDS","8")))
LANG=os.getenv("SANAD_FAST_OCR_LANG","ara+eng")
PRIMARY_PSM=os.getenv("SANAD_FAST_OCR_PSM","6")
SECONDARY_PSM=os.getenv("SANAD_FAST_OCR_SECONDARY_PSM","11")
MAX_IMAGE_LONG_SIDE=max(640,int(os.getenv("SANAD_FAST_OCR_MAX_IMAGE_LONG_SIDE","1600")))
MIN_WORD_CONFIDENCE=max(0.0,min(100.0,float(os.getenv("SANAD_FAST_OCR_MIN_WORD_CONFIDENCE","25"))))
PDF_DPI=max(72,min(300,int(os.getenv("SANAD_FAST_OCR_PDF_DPI","150"))))
MAX_PDF_PAGES=max(1,min(3,int(os.getenv("SANAD_FAST_OCR_MAX_PDF_PAGES","1"))))
NATIVE_PDF_MIN_CHARS=max(24,int(os.getenv("SANAD_FAST_OCR_NATIVE_PDF_MIN_CHARS","60")))
ADAPTIVE_CONFIDENCE_THRESHOLD=min(.95,max(.50,float(os.getenv("SANAD_FAST_OCR_ADAPTIVE_CONFIDENCE_THRESHOLD","0.80"))))
ADAPTIVE_SIGNAL_THRESHOLD=max(1,min(6,int(os.getenv("SANAD_FAST_OCR_ADAPTIVE_SIGNAL_THRESHOLD","4"))))
BEARER_TOKEN=os.getenv("SANAD_FAST_OCR_TOKEN","").strip()
SUPPORTED_TYPES={"image/jpeg":".jpg","image/png":".png","image/webp":".webp","application/pdf":".pdf"}
app=FastAPI(title="SANAD Document OCR",version="0.4.1",docs_url=None,redoc_url=None)
_semaphore=asyncio.Semaphore(CONCURRENCY)

class BBox(BaseModel): x:float; y:float; width:float; height:float
class OcrBlock(BaseModel):
    text:str; confidence:float=Field(ge=0,le=1); page:int|None=None; bbox:BBox|None=None
class EvidenceSignals(BaseModel):
    score:int=Field(ge=0,le=6); amount_anchor:bool; currency_anchor:bool; reference_anchor:bool; date_anchor:bool; identifier_anchor:bool; entity_anchor:bool
class Candidate(BaseModel):
    value:str; line:str; kind:str; score:float=Field(ge=0,le=1)
class FieldCandidates(BaseModel):
    amounts:list[Candidate]; currencies:list[Candidate]; references:list[Candidate]; dates:list[Candidate]; identifiers:list[Candidate]; entity_hints:list[Candidate]
class OcrResponse(BaseModel):
    provider:str; raw_text:str; confidence:float=Field(ge=0,le=1); duration_ms:float; blocks:list[OcrBlock]; warnings:list[str]; document_mode:str; passes:list[str]; evidence:EvidenceSignals; field_candidates:FieldCandidates; refinement_recommended:bool

def _authorize(a:str|None):
    if BEARER_TOKEN and a!=f"Bearer {BEARER_TOKEN}": raise HTTPException(401,"unauthorized")
def _run(args:list[str],timeout:float): return subprocess.run(args,check=True,capture_output=True,text=True,timeout=timeout)
def _norm(s:str): return s.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹","01234567890123456789"))
def _num(s:str): return _norm(s).replace("٬",",").replace("٫",".").replace(" ","").strip(".,:؛;")
def _add(xs:list[Candidate],v:str,line:str,kind:str,score:float):
    v=v.strip()
    if not v:return
    k=re.sub(r"\s+","",v.lower())
    if any(re.sub(r"\s+","",x.value.lower())==k for x in xs):return
    xs.append(Candidate(value=v,line=line[:240],kind=kind,score=score))

def _candidates(text:str)->FieldCandidates:
    amounts=[];currencies=[];refs=[];dates=[];ids=[];entities=[]
    lines=[x.strip() for x in (text or "").splitlines() if x.strip()]
    erules=[(r"بن\s*دول|bin\s*dowal","bin_dowal",.99),(r"البسيري|al-?busairi|busairi","al_busairi",.99),(r"العمقي|alomq[yi]|amqi","alomqi",.99),(r"الكريمي|حاسب|kuraimi|haseb|fund\s*transfer","kuraimi_haseb",.99)]
    crules=[(r"ريال\s*سعودي|ر\.?\s*س|\bSAR\b","SAR"),(r"ريال\s*يمني|ر\.?\s*ي|\bYER\b","YER"),(r"دولار|\bUSD\b","USD")]
    for i,line0 in enumerate(lines):
        line=_norm(line0); low=line.lower(); near=" ".join(lines[max(0,i-1):min(len(lines),i+2)])
        for pat,val,score in erules:
            if re.search(pat,low,re.I):_add(entities,val,line0,"entity",score)
        if re.search(r"إشعار\s*(?:سحب|إيداع)|قيدنا\s*(?:على|ل)\s*حسابكم",line,re.I):_add(entities,"alomqi",line0,"amqi_template_hint",.92)

        for pat,val in crules:
            if re.search(pat,line,re.I):_add(currencies,val,line0,"currency",.99)

        amount_patterns=[
            (r"(?:المبلغ|مبلغ(?:ه|\s*وقدره)?|مبلغ\s*الحساب|amount|الإجمالي|اجمالي|القيمة|قيمة)\s*[:：#-]?\s*#?\s*([0-9][0-9,٬\.٫ ]{0,18})",.99,"label_amount"),
            (r"#\s*([0-9][0-9,٬\.٫ ]{0,18})\s*#",.98,"hash_amount"),
            (r"([0-9][0-9,٬\.٫ ]{0,18})\s*(?=ريال\s*(?:يمني|سعودي)|ر\.?\s*[يس]|SAR|YER|USD|دولار)",.98,"amount_before_currency"),
            (r"(?:ريال\s*(?:يمني|سعودي)|ر\.?\s*[يس]|SAR|YER|USD|دولار)\s*[:：-]?\s*([0-9][0-9,٬\.٫ ]{0,18})",.95,"amount_after_currency"),
        ]
        for pat,score,kind in amount_patterns:
            for m in re.finditer(pat,line,re.I):
                v=_num(m.group(1))
                if re.search(r"\d",v):_add(amounts,v,line0,kind,score)
        if re.search(r"المبلغ|مبلغ|amount|القيمة|اجمالي|الإجمالي",line,re.I) and i+1<len(lines):
            m=re.search(r"(?:^|\D)([0-9][0-9,٬\.٫ ]{0,18})(?:\D|$)",_norm(lines[i+1]))
            if m:_add(amounts,_num(m.group(1)),f"{line0} | {lines[i+1]}","adjacent_amount",.92)

        for m in re.finditer(r"\bFT[A-Z0-9]{6,}\b",line,re.I):_add(refs,m.group(0).upper(),line0,"transfer_reference",.995)
        for m in re.finditer(r"\b8-[0-9]{6,12}\b",line):_add(refs,m.group(0),line0,"document_reference",.995)
        for pat,kind,score in [
            (r"(?:رقم\s*(?:السند|الإشعار|المرجع|العملية|الحركة)|السند|الإشعار|مرجع|reference|ref)\s*[:：#-]?\s*([A-Z0-9][A-Z0-9\-/]{3,24})","label_reference",.99),
            (r"(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2})\s+([0-9]{4,8})(?![0-9])","date_reference_pair",.97),
            (r"\b([0-9]{4,12})\b(?=[^0-9]{0,50}(?:سند\s*تحويل|سند\s*قيد|إشعار\s*دائن|إشعار))","context_reference",.94),
        ]:
            m=re.search(pat,line,re.I)
            if m:_add(refs,m.group(1),line0,kind,score)
        if re.search(r"رقم\s*(?:السند|الإشعار|المرجع|العملية|الحركة)|مرجع|reference|ref",line,re.I) and i+1<len(lines):
            m=re.search(r"\b([A-Z0-9][A-Z0-9\-/]{3,24})\b",_norm(lines[i+1]),re.I)
            if m:_add(refs,m.group(1),f"{line0} | {lines[i+1]}","adjacent_reference",.91)

        for pat,kind in [(r"\b(20[0-9]{2}[-/][0-9]{1,2}[-/][0-9]{1,2})\b","date_ymd"),(r"\b([0-9]{1,2}[-/][0-9]{1,2}[-/]20[0-9]{2})\b","date_dmy")]:
            for m in re.finditer(pat,line):_add(dates,m.group(1),line0,kind,.99)

        m=re.search(r"(?:رقم\s*الحساب|الحساب|حساب|account|wallet|محفظة|بطاقة|بط|هاتف|جوال|iban)\s*[:：#-]?\s*([+A-Z0-9][A-Z0-9+\- ]{5,28})",line,re.I)
        if m:
            v=re.sub(r"\s+","",m.group(1)).strip("-:؛;,. ")
            if len(v)>=6:_add(ids,v,line0,"labeled_identifier",.98)
        if re.search(r"رقم\s*الحساب|الحساب|حساب|account|wallet|محفظة|بطاقة|بط|هاتف|جوال|iban",line,re.I) and i+1<len(lines):
            m=re.search(r"\b([+A-Z0-9][A-Z0-9+\-]{5,28})\b",re.sub(r"\s+","",_norm(lines[i+1])),re.I)
            if m:_add(ids,m.group(1),f"{line0} | {lines[i+1]}","adjacent_identifier",.90)
    return FieldCandidates(amounts=amounts[:10],currencies=currencies[:4],references=refs[:12],dates=dates[:10],identifiers=ids[:14],entity_hints=entities[:8])

def _evidence(text:str)->EvidenceSignals:
    c=_candidates(text); flags=[bool(c.amounts),bool(c.currencies),bool(c.references),bool(c.dates),bool(c.identifiers),bool(c.entity_hints)]
    return EvidenceSignals(score=sum(flags),amount_anchor=flags[0],currency_anchor=flags[1],reference_anchor=flags[2],date_anchor=flags[3],identifier_anchor=flags[4],entity_anchor=flags[5])

def _prepare(path:str):
    from PIL import Image,ImageOps
    warnings=[]
    with Image.open(path) as opened:
        image=ImageOps.exif_transpose(opened)
        if max(image.size)<=MAX_IMAGE_LONG_SIDE:return path,None,warnings
        copy=image.convert("RGB");copy.thumbnail((MAX_IMAGE_LONG_SIDE,MAX_IMAGE_LONG_SIDE),Image.Resampling.LANCZOS)
        with tempfile.NamedTemporaryFile(prefix="sanad-fast-ocr-scaled-",suffix=".png",delete=False) as h:target=h.name
        copy.save(target,format="PNG",optimize=False);warnings.append("fast_ocr_image_downscaled");return target,target,warnings

def _enhance(path:str):
    from PIL import Image,ImageEnhance,ImageFilter,ImageOps
    with Image.open(path) as opened:
        im=ImageOps.autocontrast(ImageOps.exif_transpose(opened).convert("L"),cutoff=1);im=ImageEnhance.Contrast(im).enhance(1.25);im=im.filter(ImageFilter.UnsharpMask(radius=1.2,percent=145,threshold=3))
        if max(im.size)<1800:
            scale=min(2.0,1800/max(im.size))
            if scale>1.05:im=im.resize((int(im.width*scale),int(im.height*scale)),Image.Resampling.LANCZOS)
        with tempfile.NamedTemporaryFile(prefix="sanad-fast-ocr-enhanced-",suffix=".png",delete=False) as h:target=h.name
        im.save(target,format="PNG",optimize=False);return target

def _native_pdf(path:str):
    try:
        p=_run(["pdftotext","-layout","-f","1","-l",str(MAX_PDF_PAGES),path,"-"],min(TIMEOUT_SECONDS,5));t="\n".join(x.rstrip() for x in p.stdout.splitlines() if x.strip()).strip();n=_norm(t)
        return t if len(n)>=NATIVE_PDF_MIN_CHARS and len(re.findall(r"\d",n))>=4 else None
    except Exception:return None

def _render_pdf(path:str):
    d=tempfile.mkdtemp(prefix="sanad-fast-ocr-pdf-");prefix=str(Path(d)/"page");args=["pdftoppm","-f","1","-l",str(MAX_PDF_PAGES),"-r",str(PDF_DPI),"-png"]
    if MAX_PDF_PAGES==1:args.append("-singlefile")
    _run([*args,path,prefix],TIMEOUT_SECONDS);pages=sorted(str(p) for p in Path(d).glob("page*.png"))
    if not pages:raise RuntimeError("fast_ocr_pdf_render_no_pages")
    return pages,["fast_ocr_pdf_rasterized"]
def _int(row,name):
    try:return int(row.get(name) or 0)
    except:return 0

def _tess(path:str,page:int,psm:str):
    p=_run(["tesseract",path,"stdout","-l",LANG,"--oem","1","--psm",psm,"tsv"],TIMEOUT_SECONDS);r=csv.DictReader(io.StringIO(p.stdout),delimiter="\t");blocks=[];lines=OrderedDict();warnings=[]
    for row in r:
        txt=str(row.get("text") or "").strip()
        if not txt:continue
        try:conf=float(row.get("conf") or -1)
        except:conf=-1
        if conf<MIN_WORD_CONFIDENCE:continue
        key=(page,_int(row,"block_num"),_int(row,"par_num"),_int(row,"line_num"));lines.setdefault(key,[]).append(txt)
        try:b=BBox(x=float(row.get("left") or 0),y=float(row.get("top") or 0),width=max(0,float(row.get("width") or 0)),height=max(0,float(row.get("height") or 0)))
        except:b=None
        blocks.append(OcrBlock(text=txt,confidence=max(0,min(1,conf/100)),page=page,bbox=b))
    if not blocks:warnings.append(f"fast_ocr_psm{psm}_returned_no_text")
    return blocks,[" ".join(v).strip() for v in lines.values() if v],warnings

def _key(line):return re.sub(r"[^\w\u0600-\u06FF]+","",_norm(line).lower())
def _merge(a,b):
    out=[];seen=set()
    for line in [*a,*b]:
        k=_key(line)
        if len(k)>=2 and k not in seen:seen.add(k);out.append(line)
    return out
def _conf(blocks):
    if not blocks:return 0.0
    vals=sorted((b.confidence for b in blocks),reverse=True);keep=vals[:max(1,int(len(vals)*.9))];return max(0,min(1,sum(keep)/len(keep)))
def _needs_secondary(conf,e):return conf<ADAPTIVE_CONFIDENCE_THRESHOLD or e.score<ADAPTIVE_SIGNAL_THRESHOLD

def _response(provider,text,conf,started,blocks,warnings,mode,passes):
    c=_candidates(text);e=_evidence(text);refine=conf<.72 or e.score<3 or not(e.amount_anchor and e.currency_anchor and e.reference_anchor)
    if refine:warnings.append("document_evidence_still_weak")
    return OcrResponse(provider=provider,raw_text=text,confidence=conf,duration_ms=round((time.perf_counter()-started)*1000,3),blocks=blocks,warnings=sorted(set(warnings)),document_mode=mode,passes=passes,evidence=e,field_candidates=c,refinement_recommended=refine)

def _infer(path,ctype):
    started=time.perf_counter();cleanup=[];dirs=set();warnings=[];passes=[]
    try:
        if ctype=="application/pdf":
            native=_native_pdf(path)
            if native:return _response("pdf-native-text:pdftotext-layout",native,.995,started,[],["native_pdf_text_used"],"native_pdf_text",["pdftotext-layout"])
            warnings.append("native_pdf_text_unavailable");pages,w=_render_pdf(path);warnings+=w;cleanup+=pages;dirs.update(str(Path(p).parent) for p in pages);mode="pdf_raster_ocr"
        else:
            prepared,tmp,w=_prepare(path);warnings+=w;pages=[prepared];mode="image_ocr"
            if tmp:cleanup.append(tmp)
        blocks=[];primary=[]
        for i,p in enumerate(pages):b,l,w=_tess(p,i,PRIMARY_PSM);blocks+=b;primary+=l;warnings+=w
        passes.append(f"tesseract-psm{PRIMARY_PSM}");ptext="\n".join(primary);pconf=_conf(blocks);pe=_evidence(ptext);secondary=[];sblocks=[]
        if _needs_secondary(pconf,pe):
            warnings.append("adaptive_secondary_pass_triggered")
            for i,p in enumerate(pages):
                enhanced=_enhance(p);cleanup.append(enhanced);b,l,w=_tess(enhanced,i,SECONDARY_PSM);sblocks+=b;secondary+=l;warnings+=w
            passes.append(f"enhanced-tesseract-psm{SECONDARY_PSM}")
        text="\n".join(_merge(primary,secondary));conf=max(pconf,_conf(sblocks)) if sblocks else pconf;provider=f"document-ocr:tesseract:{LANG}:adaptive" if sblocks else f"document-ocr:tesseract:{LANG}:primary"
        return _response(provider,text,conf,started,[*blocks,*sblocks],warnings,mode,passes)
    finally:
        for f in cleanup:Path(f).unlink(missing_ok=True)
        for d in dirs:
            try:Path(d).rmdir()
            except OSError:pass

@app.get("/health/live")
async def live()->dict[str,Any]:return {"ok":True,"service":"sanad-document-ocr"}
@app.get("/health/ready")
async def ready():
    try:
        tv=_run(["tesseract","--version"],3).stdout.splitlines()[0];langs=_run(["tesseract","--list-langs"],3).stdout;pop=_run(["pdftotext","-v"],3);ok="ara" in langs and "eng" in langs and pop.returncode==0
        p={"ok":ok,"service":"sanad-document-ocr","provider":"adaptive-tesseract-plus-native-pdf","version":tv,"document_ocr_version":"0.4.1","lang":LANG,"primary_psm":PRIMARY_PSM,"secondary_psm":SECONDARY_PSM,"pdf_dpi":PDF_DPI,"native_pdf_text":True,"field_candidates":True,"adaptive_confidence_threshold":ADAPTIVE_CONFIDENCE_THRESHOLD,"adaptive_signal_threshold":ADAPTIVE_SIGNAL_THRESHOLD,"max_image_long_side":MAX_IMAGE_LONG_SIDE,"concurrency":CONCURRENCY,"text_layout":"logical_lines"}
        return JSONResponse(status_code=200 if ok else 503,content=p)
    except Exception as e:return JSONResponse(status_code=503,content={"ok":False,"error":type(e).__name__})
@app.post("/v1/ocr",response_model=OcrResponse)
async def ocr(request:Request,authorization:str|None=Header(default=None)):
    _authorize(authorization);ctype=(request.headers.get("content-type") or "").split(";",1)[0].strip().lower();suffix=SUPPORTED_TYPES.get(ctype)
    if not suffix:raise HTTPException(415,"unsupported_media_type")
    body=await request.body()
    if not body:raise HTTPException(400,"empty_document")
    if len(body)>MAX_BODY_BYTES:raise HTTPException(413,"document_too_large")
    async with _semaphore:
        with tempfile.NamedTemporaryFile(prefix="sanad-document-ocr-",suffix=suffix,delete=False) as h:h.write(body);path=h.name
        try:return await asyncio.to_thread(_infer,path,ctype)
        except subprocess.TimeoutExpired as e:raise HTTPException(504,"document_ocr_timeout") from e
        except Exception as e:raise HTTPException(503,f"document_ocr_failed:{type(e).__name__}") from e
        finally:Path(path).unlink(missing_ok=True)
