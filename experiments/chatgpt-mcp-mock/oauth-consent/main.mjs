// Standalone consent-site candidate; not deployed and never collects account data server-side.
// Browser-only credentials go directly to Supabase Auth over HTTPS.
import {createClient} from "@supabase/supabase-js";
import {authorizationId,displayAuthorizationDetails,safeSupabaseRedirect} from "./consent-core.mjs";
import "./style.css";

const settings={
 url:import.meta.env.VITE_SUPABASE_URL,
 key:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
 callback:import.meta.env.VITE_OAUTH_CALLBACK_URL
};
const elements={
 status:document.querySelector("#status"), login:document.querySelector("#login"),
 consent:document.querySelector("#consent"), email:document.querySelector("#email"),
 password:document.querySelector("#password"), client:document.querySelector("#client"),
 redirect:document.querySelector("#redirect"), scopes:document.querySelector("#scopes"),
 approve:document.querySelector("#approve"), deny:document.querySelector("#deny")
};
const message=(text)=>{elements.status.textContent=text};
const id=authorizationId(location.search);
let supabase,requestedCallback=null,busy=false;
function validConfig(){
 if(!id)throw Error("رابط طلب الموافقة غير صالح.");
 if(!settings.url||!settings.key||!settings.callback)throw Error("هذه النسخة التجريبية غير مهيأة بعد.");
 const u=new URL(settings.url),cb=new URL(settings.callback);
 if(u.protocol!=="https:"||cb.protocol!=="https:")throw Error("تتطلب هذه الخدمة اتصالًا آمنًا.");
 // First pilot must never accidentally point the UI to a different SANAD project.
 if(u.hostname!=="hudbzlgclghlhazlduas.supabase.co")throw Error("عنوان مشروع الهوية غير مطابق.");
}
async function openConsent(){
 const {data:{user},error:userError}=await supabase.auth.getUser();
 if(userError||!user){elements.login.hidden=false;elements.consent.hidden=true;message("سجل دخولك إلى سند لاستعراض طلب الربط.");return}
 elements.login.hidden=true;
 const {data,error}=await supabase.auth.oauth.getAuthorizationDetails(id);
 if(error||!data)throw Error("تعذر التحقق من تفاصيل طلب الربط. لا توافق على الطلب.");
 if(!("authorization_id" in data)){
  // Supabase may redirect immediately on a previously authorized request.
  // A *fixed*, owner-configured callback prevents arbitrary frontend redirects.
  location.assign(safeSupabaseRedirect(data,settings.callback));
  return;
 }
 const details=displayAuthorizationDetails(data);
 const configured=new URL(settings.callback),actual=new URL(details.redirectUri);
 if(actual.origin!==configured.origin||actual.pathname!==configured.pathname)throw Error("عنوان العودة غير مصرح به.");
 requestedCallback=details.redirectUri;
 elements.client.textContent=details.clientName;
 elements.redirect.textContent=details.redirectUri;
 elements.scopes.replaceChildren();
 for(const item of details.scopes){const li=document.createElement("li");li.textContent=item;elements.scopes.append(li)}
 elements.consent.hidden=false;
 message("راجع هوية التطبيق والأذونات المطلوبة قبل اتخاذ القرار.");
}
async function decision(kind){
 if(busy||!requestedCallback)return;
 busy=true;elements.approve.disabled=true;elements.deny.disabled=true;
 message("جارٍ معالجة القرار بشكل آمن...");
 try{
  const api=kind==="approve"?supabase.auth.oauth.approveAuthorization:supabase.auth.oauth.denyAuthorization;
  const {data,error}=await api.call(supabase.auth.oauth,id);
  if(error||!data)throw Error("تعذر إتمام الطلب. لم يتم السماح بأي وصول.");
  location.assign(safeSupabaseRedirect(data,requestedCallback));
 }catch(e){
  message(e.message||"تعذر إتمام العملية.");busy=false;elements.approve.disabled=false;elements.deny.disabled=false;
 }
}
try{
 validConfig();
 supabase=createClient(settings.url,settings.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 openConsent().catch(e=>message(e.message||"تعذر التحقق من الطلب."));
 elements.login.addEventListener("submit",async(event)=>{
  event.preventDefault();if(busy)return;busy=true;
  message("جارٍ تسجيل الدخول...");
  try{
   const {error}=await supabase.auth.signInWithPassword({email:elements.email.value.trim(),password:elements.password.value});
   elements.password.value="";if(error)throw Error("تعذر تسجيل الدخول. تحقق من بياناتك دون مشاركتها.");
   await openConsent();
  }catch(e){elements.password.value="";message(e.message||"تعذر تسجيل الدخول.")}
  finally{busy=false}
 });
 elements.approve.addEventListener("click",()=>decision("approve"));
 elements.deny.addEventListener("click",()=>decision("deny"));
}catch(e){message(e.message||"الإعداد غير مكتمل.")}
