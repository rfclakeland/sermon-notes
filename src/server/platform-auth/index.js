// Source: rfclakeland/rfc-digital-platform, apps/media-portal/server/platform-auth/index.js at 8e28225.
// Keep in sync until extracted into a shared package.
export class HttpError extends Error { constructor(status,message) { super(message);this.status=status; } }
export const SESSION_COOKIE='__Host-rfc_session';
export const SESSION_SECONDS=7*24*60*60;
export const LINK_SECONDS=20*60;
const GRANT_SECONDS=15*60;
export const REQUEST_MESSAGE='If this address is eligible, a sign-in link will arrive shortly.';
export const PASSWORD_ERROR='The email or password is incorrect.';
export const LINK_ERROR='This sign-in link is invalid, expired, or already used.';
const ATTEMPT_ERROR='Too many attempts, try again later or use an email link.';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const seconds=()=>Math.floor(Date.now()/1000);
const prepare=(db,sql,params=[])=>db.prepare(sql).bind(...params);
export function randomToken(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
function httpsOrigin(value) {
 let origin;
 try { origin=new URL(value); } catch { throw new HttpError(503,'Sign-in setup is incomplete.'); }
 if(origin.protocol!=='https:' || origin.origin!==value)throw new HttpError(503,'Sign-in setup is incomplete.');
 return origin.origin;
}

export function configuration({db,secret,appOrigin,aliases=[],rpID,rpName='RFC',cookieName=SESSION_COOKIE,cookieDomain,appId,sendAuthEmail}) {
 if(!db || !appOrigin)throw new HttpError(503,'Sign-in setup is incomplete.');
 const origin=httpsOrigin(appOrigin);
 if(cookieDomain && (cookieName.startsWith('__Host-') ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(cookieDomain) ||
    !(new URL(origin).hostname===cookieDomain || new URL(origin).hostname.endsWith('.'+cookieDomain)))) {
  throw new HttpError(503,'Session cookie configuration is invalid.');
 }
 return {db,secret,appOrigin:origin,origins:new Set([origin,...aliases.map(httpsOrigin)]),
  rpID,rpName,cookieName,cookieDomain,appId,sendAuthEmail};
}
export function approvedOrigin(request,config) {
 const origin=new URL(request.url).origin;
 if(!config.origins.has(origin))throw new HttpError(403,'Use the approved sign-in address.');
 return origin;
}
function hasSecret(config){return typeof config.secret==='string' && config.secret.length>=32 && !/REPLACE_ME/.test(config.secret);}
async function key(config){
 if(!hasSecret(config))throw new HttpError(503,'Sign-in is not configured.');
 return crypto.subtle.importKey('raw',encoder.encode(config.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
}
const value=(purpose,parts)=>encoder.encode(JSON.stringify([purpose,...parts]));
export async function digest(config,purpose,...parts){return hex(await crypto.subtle.sign('HMAC',await key(config),value(purpose,parts)));}
export function normalizeEmail(value){
 if(typeof value!=='string')return null;
 const email=value.trim().toLowerCase();
 return email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null;
}
export function cookie(name,token,maxAge,{domain,sameSite='Lax'}={}){
 return `${name}=${token}; Path=/;${domain?' Domain='+domain+';':''} HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}`;
}
export function sessionCookie(config,token,maxAge=SESSION_SECONDS){
 return cookie(config.cookieName,token,maxAge,{domain:config.cookieDomain});
}
export function readCookie(request,name){
 const matches=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
 if(matches.length!==1)return null;
 const token=matches[0].slice(name.length+1);
 return /^[a-f0-9]{64}$/.test(token)?token:null;
}
export function trustedIP(request){
 // Cloudflare supplies/overwrites this header on ingress. Never use X-Forwarded-For.
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip || ip.length>45)return null;
 if(ip.includes(':'))return /^[a-fA-F0-9:.]+$/.test(ip)?ip.toLowerCase():null;
 return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(v=>Number(v)<=255)?ip:null;
}
export async function sessionTokenHash(request,config) {
 const token=readCookie(request,config.cookieName);
 if(!token)throw new HttpError(401,'Sign in to continue.');
 if(!hasSecret(config))throw new HttpError(503,'Sign-in is not configured.');
 return digest(config,'session',token);
}
export async function authenticate(request,config,now=seconds()) {
 approvedOrigin(request,config);
 const tokenHash=await sessionTokenHash(request,config);
 const user=await prepare(config.db,`SELECT u.id,u.display_name,s.id AS session_id
  FROM platform_sessions s JOIN platform_users u ON u.id=s.user_id
  WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND u.active=1`,[tokenHash,now]).first();
 if(!user)throw new HttpError(401,'Sign in to continue.');
 return user;
}
export async function loadAccess(db,userId,app) {
 const {results}=await prepare(db,'SELECT permission FROM platform_effective_permissions WHERE user_id=?',[userId]).all();
 const apps=new Set(),permissions=new Set();
 for(const {permission} of results){
  const parts=permission.split('.');
  if(parts.length===2 && parts[1]==='access')apps.add(parts[0]);
  if(parts[0]===app)permissions.add(permission);
 }
 return {apps,permissions};
}
export function requirePermission(access,key) {
 if(!access?.permissions.has(key))throw new HttpError(403,'Permission denied.');
}
export async function revokeSession(request,config,now=seconds()){
 const token=readCookie(request,config.cookieName);
 if(token && hasSecret(config))await prepare(config.db,'UPDATE platform_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL',[now,await digest(config,'session',token)]).run();
}
export async function cleanupAuth(db,now=seconds()) {
 await db.batch(['platform_email_links','platform_sessions','platform_auth_rate_limits','platform_webauthn_challenges'].map(table=>prepare(db,`DELETE FROM ${table} WHERE expires_at<=?`,[now])));
}

const PASSWORD_VERSION='pbkdf2-sha256$100000';
const DUMMY_PASSWORD_HASH=PASSWORD_VERSION+'$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const validPassword=password=>typeof password==='string' && password.length>=10 && password.length<=128;
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64=text=>Uint8Array.from(atob(text),char=>char.charCodeAt(0));

async function derivePassword(password,salt) {
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt},key,256));
}

export async function hashPassword(password) {
 if(!validPassword(password))throw new HttpError(400,'Use a password between 10 and 128 characters.');
 const salt=crypto.getRandomValues(new Uint8Array(16));
 return [PASSWORD_VERSION,base64(salt),base64(await derivePassword(password,salt))].join('$');
}

export async function verifyPassword(password,storedHash) {
 const parsed=/^pbkdf2-sha256\$100000\$([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{43}=)$/.exec(storedHash||'');
 const [,salt,expected]=parsed||DUMMY_PASSWORD_HASH.split('$').slice(1);
 const actual=await derivePassword(typeof password==='string'?password.slice(0,128):'',fromBase64(salt));
 const expectedBytes=fromBase64(expected);
 // Both arrays have a fixed length. Visit every byte before testing the result.
 let difference=0;
 for(let index=0;index<actual.length;index++)difference|=actual[index]^expectedBytes[index];
 return difference===0 && !!parsed && validPassword(password);
}

export const fixedLimit=(scope,subject,window,max,now)=>{
 const start=Math.floor(now/window)*window;
 return {scope,subject,start,expires:start+window,max};
};

export async function charge(db,limits) {
 const results=await db.batch(limits.map(({scope,subject,start,expires,max})=>prepare(db,
  `INSERT INTO platform_auth_rate_limits(scope,subject_hash,window_start,count,expires_at) VALUES(?,?,?,1,?)
   ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET count=min(count+1,?) RETURNING count`,
  [scope,subject,start,expires,max+1])));
 return results.every((result,index)=>result.results[0].count<=limits[index].max);
}

async function cooldown(db,subject,now) {
 const row=await prepare(db,`INSERT INTO platform_auth_rate_limits(scope,subject_hash,window_start,count,expires_at)
  VALUES('link-cooldown',?,0,1,?)
  ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET count=1,expires_at=excluded.expires_at
  WHERE expires_at<=? RETURNING count`,[subject,now+60,now]).first();
 return !!row;
}

async function passwordLimits(config,email,ip,now) {
 const [emailHash,ipHash]=await Promise.all([digest(config,'rate-email',email),digest(config,'rate-ip',ip)]);
 return [fixedLimit('password-email',emailHash,900,5,now),fixedLimit('password-ip',ipHash,900,30,now)];
}

export async function reserveAttempts(db,limits,message=ATTEMPT_ERROR) {
 // Reserve both slots before PBKDF2 so concurrent guesses cannot outrun completed failures.
 const row=await prepare(db,`WITH targets(scope,subject_hash,window_start,expires_at,cap) AS (
   VALUES
   ${limits.map(()=>'(?,?,?,?,?)').join(',')}
  ), eligible AS MATERIALIZED (
   SELECT NOT EXISTS(SELECT 1 FROM targets t JOIN platform_auth_rate_limits r
    USING(scope,subject_hash,window_start) WHERE r.count>=t.cap) AS allowed
  )
  INSERT INTO platform_auth_rate_limits(scope,subject_hash,window_start,expires_at,count)
  SELECT scope,subject_hash,window_start,expires_at,1 FROM targets,eligible WHERE allowed=1
  ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET count=count+1 RETURNING count`,
  limits.flatMap(({scope,subject,start,expires,max})=>[scope,subject,start,expires,max])).first();
 if(!row)throw new HttpError(429,message);
}

export async function releaseAttempts(db,limits) {
 await db.batch(limits.flatMap(({scope,subject,start})=>{
  const args=[scope,subject,start];
  return [
   prepare(db,'DELETE FROM platform_auth_rate_limits WHERE scope=? AND subject_hash=? AND window_start=? AND count=1',args),
   prepare(db,'UPDATE platform_auth_rate_limits SET count=count-1 WHERE scope=? AND subject_hash=? AND window_start=? AND count>1',args)
  ];
 }));
}

export async function signInPassword(request,config,input,password,now=seconds(),verify=verifyPassword) {
 const email=normalizeEmail(input),ip=trustedIP(request);
 if(!ip || !hasSecret(config))throw new HttpError(401,PASSWORD_ERROR);
 const limits=await passwordLimits(config,email||'invalid',ip,now);
 await reserveAttempts(config.db,limits);
 const user=await prepare(config.db,'SELECT u.id,u.email,p.password_hash FROM platform_users u JOIN platform_passwords p ON p.user_id=u.id WHERE u.email=? AND u.active=1',[email]).first();
 const valid=await verify(password,user?.password_hash||DUMMY_PASSWORD_HASH);
 if(!valid || !user?.password_hash)throw new HttpError(401,PASSWORD_ERROR);

 await releaseAttempts(config.db,limits);
 const token=randomToken(),tokenHash=await digest(config,'session',token);
 const result=await prepare(config.db,`INSERT INTO platform_sessions(token_hash,user_id,created_at,expires_at)
  SELECT ?,u.id,?,? FROM platform_users u JOIN platform_passwords p ON p.user_id=u.id
  WHERE u.id=? AND u.email=? AND u.active=1 AND p.password_hash=?`,
  [tokenHash,now,now+SESSION_SECONDS,user.id,user.email,user.password_hash]).run();
 if(!result.meta.changes)throw new HttpError(401,PASSWORD_ERROR);
 return token;
}

// App adapters can require an effective access key before issuing and sending a link.
export async function issueLink(request,config,input,now=seconds(),permission=null) {
 const email=normalizeEmail(input),ip=trustedIP(request);
 if(!email || !ip || !hasSecret(config) || typeof config.sendAuthEmail!=='function')return;
 const [emailHash,ipHash]=await Promise.all([digest(config,'rate-email',email),digest(config,'rate-ip',ip)]);
 // Every request uses IP quota, including repeats during the rolling email cooldown.
 if(!await charge(config.db,[fixedLimit('link-ip',ipHash,3600,20,now)]))return;
 if(!await cooldown(config.db,emailHash,now))return;
 if(!await charge(config.db,[fixedLimit('link-email',emailHash,3600,5,now)]))return;
 const eligible='(? IS NULL OR EXISTS(SELECT 1 FROM platform_effective_permissions WHERE user_id=u.id AND permission=?))';
 const user=await prepare(config.db,`SELECT u.id,u.email FROM platform_users u WHERE u.email=? COLLATE NOCASE AND u.active=1 AND ${eligible}`,[email,permission,permission]).first();
 if(!user)return;
 const id=crypto.randomUUID(),token=randomToken(),tokenHash=await digest(config,'auth-link',token);
 await config.db.batch([
  prepare(config.db,`UPDATE platform_email_links SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL
   AND EXISTS(SELECT 1 FROM platform_users u WHERE u.id=? AND u.email=? COLLATE NOCASE AND u.active=1 AND ${eligible})`,[now,user.id,user.id,email,permission,permission]),
  prepare(config.db,`INSERT INTO platform_email_links(id,user_id,email_snapshot,token_hash,purpose,created_at,expires_at,requested_ip_hash)
   SELECT ?,u.id,u.email,?,CASE WHEN NOT EXISTS(SELECT 1 FROM platform_passwords WHERE user_id=u.id) THEN 'setup' ELSE 'signin' END,?,?,?
   FROM platform_users u WHERE u.id=? AND u.email=? COLLATE NOCASE AND u.active=1 AND ${eligible}`,[id,tokenHash,now,now+LINK_SECONDS,ipHash,user.id,email,permission,permission])
 ]);
 try {
  const current=await prepare(config.db,`SELECT u.email,u.display_name,l.purpose FROM platform_email_links l JOIN platform_users u ON u.id=l.user_id
   WHERE l.id=? AND l.consumed_at IS NULL AND u.active=1 AND u.email=l.email_snapshot COLLATE NOCASE AND ${eligible}`,[id,permission,permission]).first();
  if(current){
   await config.sendAuthEmail({
    purpose:current.purpose,to:current.email,name:current.display_name.trim().split(/\s+/)[0],
    link:`${config.appOrigin}/login/link#token=${token}`,expiresMinutes:LINK_SECONDS/60
   });
   return;
  }
 }catch{/* Delivery failures are handled without exposing connection or message details. */}
 await prepare(config.db,'UPDATE platform_email_links SET consumed_at=? WHERE id=? AND consumed_at IS NULL',[now,id]).run();
}

export async function consumeLink(request,config,input,now=seconds()) {
 const ip=trustedIP(request),invalid=()=>new HttpError(401,LINK_ERROR);
 if(!ip || !hasSecret(config))throw invalid();
 const ipHash=await digest(config,'rate-ip',ip);
 if(!await charge(config.db,[fixedLimit('link-consume',ipHash,900,20,now)]))throw new HttpError(429,LINK_ERROR);
 if(typeof input!=='string' || !/^[a-f0-9]{64}$/.test(input))throw invalid();
 const token=randomToken();
 const [linkHash,sessionHash]=await Promise.all([digest(config,'auth-link',input),digest(config,'session',token)]);
 // changes() ties the insert to the immediately preceding UPDATE within the D1 transaction.
 const [update,session]=await config.db.batch([
  prepare(config.db,`UPDATE platform_email_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?
   AND EXISTS(SELECT 1 FROM platform_users m WHERE m.id=user_id AND m.active=1 AND m.email=email_snapshot COLLATE NOCASE)
   RETURNING user_id`,[now,linkHash,now]),
  prepare(config.db,`INSERT INTO platform_sessions(token_hash,user_id,created_at,expires_at,password_grant_expires_at)
   SELECT ?,user_id,?,?,? FROM platform_email_links WHERE token_hash=? AND changes()=1
   RETURNING NOT EXISTS(SELECT 1 FROM platform_passwords p WHERE p.user_id=platform_sessions.user_id) AS needs_password`,
  [sessionHash,now,now+SESSION_SECONDS,now+GRANT_SECONDS,linkHash])
 ]);
 if(!update.results.length || !session.results.length)throw invalid();
 return {token,needsPassword:!!session.results[0].needs_password};
}

export async function setPassword(request,config,password,currentPassword,now=seconds()) {
 if(!validPassword(password))throw new HttpError(400,'Use a password between 10 and 128 characters.');
 const token=readCookie(request,config.cookieName);
 if(!token || !hasSecret(config))throw new HttpError(401,'Sign in to continue.');
 const tokenHash=await digest(config,'session',token);
 const user=await prepare(config.db,`SELECT m.id,m.email,p.password_hash,s.password_grant_expires_at
  FROM platform_sessions s JOIN platform_users m ON m.id=s.user_id
  LEFT JOIN platform_passwords p ON p.user_id=m.id
  WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND m.active=1`,[tokenHash,now]).first();
 if(!user)throw new HttpError(401,'Sign in to continue.');
 const freshGrant=user.password_grant_expires_at>now;
 const denied=()=>new HttpError(403,'Enter your current password or request a fresh sign-in link.');
 if(!freshGrant) {
  const ip=trustedIP(request);
  if(!ip)throw denied();
  const limits=await passwordLimits(config,normalizeEmail(user.email),ip,now);
  await reserveAttempts(config.db,limits);
  if(!await verifyPassword(currentPassword,user.password_hash))throw denied();
  await releaseAttempts(config.db,limits);
 }
 const hash=await hashPassword(password);
 const [update]=await config.db.batch([
  prepare(config.db,`INSERT INTO platform_passwords(user_id,password_hash,updated_at)
   SELECT u.id,?,? FROM platform_users u JOIN platform_sessions s ON s.user_id=u.id
   LEFT JOIN platform_passwords p ON p.user_id=u.id
   WHERE u.id=? AND u.email=? AND u.active=1 AND p.password_hash IS ?
   AND s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL
   AND (?=0 OR s.password_grant_expires_at>?)
   ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at
   RETURNING user_id`,
  [hash,now,user.id,user.email,user.password_hash,tokenHash,now,Number(freshGrant),now]),
  prepare(config.db,`UPDATE platform_sessions SET revoked_at=?
   WHERE user_id=? AND token_hash<>? AND revoked_at IS NULL
   AND EXISTS(SELECT 1 FROM platform_passwords WHERE user_id=? AND password_hash=?)`,[now,user.id,tokenHash,user.id,hash]),
  prepare(config.db,`UPDATE platform_sessions SET password_grant_expires_at=NULL WHERE token_hash=?
   AND EXISTS(SELECT 1 FROM platform_passwords WHERE user_id=? AND password_hash=?)`,[tokenHash,user.id,hash])
 ]);
 if(!update.results.length)throw denied();
}
