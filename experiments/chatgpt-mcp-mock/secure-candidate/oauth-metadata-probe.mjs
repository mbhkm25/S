// Public, credential-free OAuth capability probe; not an authorization attempt.
// Reports only metadata presence, never user/client secrets or financial data.
const base="https://hudbzlgclghlhazlduas.supabase.co";
const resources=[
 ["oauth_server",base+"/.well-known/oauth-authorization-server/auth/v1"],
 ["oidc",base+"/auth/v1/.well-known/openid-configuration"]
];
let unavailable=0;
for(const [kind,url] of resources){
 const response=await fetch(url,{headers:{"accept":"application/json"},signal:AbortSignal.timeout(8000),redirect:"manual"});
 const type=response.headers.get("content-type")??"";
 const metadata=type.includes("application/json") ? await response.json().catch(()=>null) : null;
 const issuer=typeof metadata?.issuer==="string"?metadata.issuer:"";
 const authorize=typeof metadata?.authorization_endpoint==="string";
 const token=typeof metadata?.token_endpoint==="string";
 const pkce=Array.isArray(metadata?.code_challenge_methods_supported)?metadata.code_challenge_methods_supported.includes("S256"):null;
 const active=response.status===200&&!!issuer&&authorize&&token;
 if(!active)unavailable++;
 console.log(JSON.stringify({kind,status:response.status,active,issuer:issuer||null,authorization_endpoint_present:authorize,token_endpoint_present:token,pkce_s256:pkce}));
}
if(unavailable)console.log("NOTICE: OAuth metadata not fully available yet. OAuth browser flow remains NOT VERIFIED.");
