export const SCRIPT_CONFIG_KEY='lunas-script-config-v1';
export const SCRIPT_SESSION_KEY='lunas-script-session-v1';
export type ScriptConfig={url:string};
export type ScriptSession={url:string;token:string;expiresAt:number};
export function parseScriptUrl(value:string){
  const url=new URL(value.trim());
  if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[\w-]{20,}\/exec$/.test(url.pathname)||url.username||url.password)throw new Error('Gunakan URL Web app Apps Script yang berakhir /exec.');
  return url.origin+url.pathname;
}
export function getScriptConfig():ScriptConfig{
  try{const saved=JSON.parse(localStorage.getItem(SCRIPT_CONFIG_KEY)||'{}');const url=saved.url||import.meta.env?.VITE_APPS_SCRIPT_URL||'';return{url:url?parseScriptUrl(url):''};}catch{return{url:''};}
}
export function getScriptSession(url:string):ScriptSession|null{
  for(const storage of [sessionStorage,localStorage]){
    try{const s=JSON.parse(storage.getItem(SCRIPT_SESSION_KEY)||'null');if(s?.url===url&&typeof s.token==='string'&&/^[\w-]{60,180}$/.test(s.token)&&Number.isFinite(s.expiresAt)&&s.expiresAt>Date.now())return s;}catch{/* unavailable or expired storage */}
  }
  return null;
}
export function clearScriptSession(){for(const storage of [sessionStorage,localStorage])storage.removeItem(SCRIPT_SESSION_KEY);}
export function storeScriptSession(s:ScriptSession,remember:boolean){
  clearScriptSession();(remember?localStorage:sessionStorage).setItem(SCRIPT_SESSION_KEY,JSON.stringify(s));
}
export function saveScriptConfig(url:string){const config={url:parseScriptUrl(url)};if(config.url!==getScriptConfig().url)clearScriptSession();localStorage.setItem(SCRIPT_CONFIG_KEY,JSON.stringify(config));return config;}
