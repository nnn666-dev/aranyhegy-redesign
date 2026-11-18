const B=process.env.BASE||'http://localhost:8888';
const j=(p,o)=>fetch(B+p,o).then(async r=>[r.status,await r.json().catch(()=>({})),r]);
const post=(p,b)=>j(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
const OFF=3+Math.floor(Math.random()*60)*4; // 12 months of validity: stay inside it, new window every run
const day=n=>new Date(Date.now()+(n+OFF)*864e5).toISOString().slice(0,10);
const ok=(c,m)=>{console.log(c?'PASS':'FAIL',m);if(!c)process.exitCode=1};
const buyer={name:'Vevő Vilmos',email:'vevo@example.com',terms:true,lang:'hu'};
const guest={name:'Teszt Elek',email:'teszt@example.com',phone:'+36301234567',terms:true,lang:'hu',guests:2};
const order=async(pkg,extra={})=>{const [s,r]=await post('/api/voucher-order',{...buyer,pkg,...extra});return [s,r]};
const pay=async(r)=>post('/api/voucher',{action:'demo-pay',code:r.code,t:r.token});
// ---- ordering
let [s,r]=await order(1,{amount:1,price:1});ok(s===200&&r.mode==='demo'&&r.amount===60000&&/^AHU-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(r.code),'order pkg1: server price 60000, code '+r.code);
const v1=r;
for(const [k,p] of [[2,120000],[3,90000],[4,180000]]){const [s2,r2]=await order(k);ok(s2===200&&r2.amount===p,`order pkg${k}: ${r2.amount}`)}
[s,r]=await order(9);ok(s===400&&r.error==='pkg','unknown package -> 400');
[s,r]=await order(1,{email:'nem'});ok(s===400&&r.error==='email','bad email -> 400');
[s,r]=await order(1,{terms:false});ok(s===400&&r.error==='terms','terms required');
[s,r]=await order(1,{website:'spam'});ok(s===200&&!r.code,'honeypot ignored');
// ---- unpaid voucher cannot be used or downloaded
[s,r]=await j(`/api/voucher?a=check&code=${v1.code}`);ok(r.state==='unpaid','unpaid voucher state=unpaid');
[s,r]=await post('/api/reserve',{...guest,in:day(1),out:day(2),apt:'smaragd',voucher:v1.code});ok(s===409&&r.error==='voucher_unpaid','unpaid voucher cannot be redeemed');
[s,r]=await j(`/api/voucher?a=pdf&code=${v1.code}&t=${v1.token}`);ok(s===409,'pdf of unpaid voucher refused');
// ---- pay
[s,r]=await post('/api/voucher',{action:'demo-pay',code:v1.code,t:'wrong'});ok(s===404,'demo-pay wrong token -> 404');
[s,r]=await pay(v1);ok(s===200&&r.voucher.state==='valid'&&r.voucher.validUntil&&r.voucher.mail==='skipped','paid: valid, has validity, mail skipped (no RESEND key) -> '+(r.voucher&&r.voucher.validUntil));
const until=r.voucher.validUntil;const wantUntil=new Date(Date.now());wantUntil.setFullYear(wantUntil.getFullYear()+1);
ok(Math.abs(Date.parse(until)-wantUntil.getTime())<3*864e5,'validity = about 12 months');
[s,r]=await pay(v1);ok(s===200&&r.voucher.validUntil===until,'second demo-pay is idempotent (validity unchanged)');
const pr=await fetch(B+`/api/voucher?a=pdf&code=${v1.code}&t=${v1.token}`);ok(pr.status===200&&pr.headers.get('content-type')==='application/pdf','pdf download 200 application/pdf');
const buf=Buffer.from(await pr.arrayBuffer());ok(buf.subarray(0,5).toString()==='%PDF-'&&buf.length>100000,'pdf is real ('+buf.length+' bytes)');
[s,r]=await j(`/api/voucher?a=pdf&code=${v1.code}&t=wrong`);ok(s===404,'pdf with wrong token -> 404');
[s,r]=await j(`/api/voucher?a=check&code=${v1.code.toLowerCase().replace(/-/g,' ')}`);ok(r.state==='valid'&&!('buyer' in r)&&!('email' in r),'check works with sloppy input, leaks no buyer data');
[s,r]=await j(`/api/voucher?a=check&code=AHU-AAAA-AAAA`);ok(s===404,'unknown code -> 404');
// ---- redeem 1-night apartment voucher
[s,r]=await post('/api/reserve',{...guest,in:day(1),out:day(3),apt:'smaragd',voucher:v1.code});ok(s===400&&r.error==='voucher_nights','1-night voucher refuses 2 nights');
[s,r]=await post('/api/reserve',{...guest,in:day(1),out:day(2),apt:'haz',voucher:v1.code});ok(s===400&&r.error==='voucher_apt','apartment voucher refuses whole house ('+r.error+')');
[s,r]=await post('/api/reserve',{...guest,in:day(1),out:day(2),apt:'smaragd',voucher:v1.code,amount:5});ok(s===200&&r.mode==='voucher'&&r.amount===0&&r.status==='confirmed','redeem: confirmed immediately, amount 0');
const bid=r.id,bt=r.token;
[s,r]=await j(`/api/booking?id=${bid}&t=${bt}`);ok(r.booking.status==='confirmed','booking confirmed');
[s,r]=await post('/api/reserve',{...guest,in:day(10),out:day(11),apt:'smaragd',voucher:v1.code});ok(s===409&&r.error==='voucher_redeemed','used voucher cannot be used again');
[s,r]=await j(`/api/voucher?a=check&code=${v1.code}`);ok(r.state==='redeemed','state=redeemed');
[s,r]=await j(`/api/quote?in=${day(1)}&out=${day(2)}&guests=2&apt=smaragd`);ok(r.available===false,'redeemed night is taken for everybody');
// ---- whole house, 2 nights
[s,r]=await order(4);const v4=r;await pay(v4);
[s,r]=await post('/api/reserve',{...guest,in:day(20),out:day(21),apt:'haz',voucher:v4.code});ok(s===400&&r.error==='voucher_nights','2-night house voucher refuses 1 night');
[s,r]=await post('/api/reserve',{...guest,in:day(20),out:day(22),apt:'smaragd',voucher:v4.code});ok(s===200&&r.mode==='voucher'&&r.apt==='haz'&&r.aptName==='Egész ház','house voucher books BOTH apartments even if one was requested');
for(const a of ['smaragd','zafir']){[s,r]=await j(`/api/quote?in=${day(20)}&out=${day(22)}&guests=2&apt=${a}`);ok(r.available===false,`${a} blocked by the house stay`)}
// house voucher while one apartment is busy
[s,r]=await order(3);const v3=r;await pay(v3);
[s,r]=await post('/api/reserve',{...guest,in:day(1),out:day(2),apt:'haz',voucher:v3.code});ok(s===409&&r.error==='unavailable','house voucher refused while an apartment is booked');
[s,r]=await j(`/api/voucher?a=check&code=${v3.code}`);ok(r.state==='valid','refused attempt did NOT burn the voucher');
[s,r]=await post('/api/reserve',{...guest,in:day(25),out:day(26),apt:'haz',voucher:v3.code});ok(s===200&&r.mode==='voucher','...and it works on a free date');
// ---- after validity
[s,r]=await order(2);const v2=r;await pay(v2);
[s,r]=await post('/api/reserve',{...guest,in:'2099-01-01',out:'2099-01-03',apt:'zafir',voucher:v2.code});ok(s===400&&r.error==='voucher_after','arrival after validity refused');
// ---- race: the same voucher on two dates at once
[s,r]=await order(1);const vr=r;await pay(vr);
const rs=await Promise.all([40,42,44,46].map(n=>post('/api/reserve',{...guest,in:day(n),out:day(n+1),apt:'smaragd',voucher:vr.code})));
const wins=rs.filter(x=>x[0]===200);ok(wins.length<=1,'same voucher, 4 parallel redemptions -> at most one booking ('+rs.map(x=>x[0]).join(',')+')');
[s,r]=await j(`/api/voucher?a=check&code=${vr.code}`);ok(wins.length===0?r.state==='valid':r.state==='redeemed','voucher state consistent with outcome: '+r.state);
// ---- resend
[s,r]=await post('/api/voucher',{action:'resend',code:v2.code,t:v2.token});ok(s===200,'resend allowed ('+JSON.stringify(r)+')');
// ---- booking dialog without voucher still refuses house/3 guests
[s,r]=await post('/api/reserve',{...guest,in:day(60),out:day(61),apt:'haz'});ok(s===400,'house without voucher still phone-only ('+(r.error||'')+')');
