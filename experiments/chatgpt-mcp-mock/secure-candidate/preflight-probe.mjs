// Read-only diagnostic of hosted function browser preflight. No JWTs or secrets.
const url="https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-mcp-secure-v1/mcp";
const response=await fetch(url,{method:"OPTIONS",headers:{"Origin":"https://app.sanadflow.com","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,content-type,apikey"}});
console.log(JSON.stringify({status:response.status,allowOrigin:response.headers.get("access-control-allow-origin"),allowMethods:response.headers.get("access-control-allow-methods"),wwwAuthenticate:response.headers.get("www-authenticate")?"present":"absent"}));
