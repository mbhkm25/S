// Standalone OAuth consent UI helpers. No auth tokens, passwords, or server credentials.
export function authorizationId(search){
 const id=new URLSearchParams(search).get("authorization_id");
 return typeof id==="string" && /^[A-Za-z0-9_-]{8,256}$/.test(id)?id:null;
}
export function displayAuthorizationDetails(details){
 if(!details||typeof details!=="object")throw Error("authorization_details_unavailable");
 if(!("authorization_id" in details))return {alreadyConsented:true,redirect:details.redirect_url};
 const uri=new URL(details.redirect_uri);
 if(uri.protocol!=="https:" && !(uri.protocol==="http:"&&["localhost","127.0.0.1"].includes(uri.hostname)))throw Error("untrusted_client_redirect");
 if(typeof details.client?.name!=="string"||typeof details.client?.id!=="string")throw Error("unverified_client_details");
 const scopes=typeof details.scope==="string"?details.scope.trim().split(/\s+/).filter(Boolean):[];
 return {alreadyConsented:false,clientName:details.client.name,clientId:details.client.id,redirectUri:uri.href,scopes};
}
export function safeSupabaseRedirect(response,expectedRedirect){
 if(!response||typeof response.redirect_url!=="string")throw Error("oauth_redirect_missing");
 const actual=new URL(response.redirect_url);
 const expected=new URL(expectedRedirect);
 const localhost=["localhost","127.0.0.1"].includes(expected.hostname);
 if(actual.origin!==expected.origin||actual.pathname!==expected.pathname||!(actual.protocol==="https:"||(localhost&&actual.protocol==="http:")))throw Error("oauth_redirect_mismatch");
 if(!actual.searchParams.has("code")&&!actual.searchParams.has("error"))throw Error("oauth_redirect_incomplete");
 return actual.href;
}
