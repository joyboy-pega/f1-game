
(function(){
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const mc=document.getElementById('m'),mx=mc.getContext('2d');
const $=id=>document.getElementById(id);
let W,H,dpr;
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr}
addEventListener('resize',resize);resize();

// ---- Track: closed Catmull-Rom spline ----
// Buddh International Circuit, traced from the supplied SVG (start/finish = first point)
const D=[2583,573,2631,568,2679,563,2727,558,2774,553,2822,547,2870,543,2918,538,2966,533,3013,528,3061,523,3109,518,3157,514,3205,509,3253,504,3300,499,3348,494,3396,489,3444,484,3492,480,3539,475,3587,470,3635,465,3683,460,3731,455,3778,451,3826,446,3874,441,3922,436,3970,431,4017,426,4065,421,4113,417,4161,412,4209,407,4257,402,4304,397,4352,392,4400,388,4448,383,4496,378,4543,373,4591,368,4639,363,4687,359,4735,354,4782,349,4830,344,4878,339,4926,334,4974,329,5021,325,5069,320,5117,315,5165,310,5213,305,5260,300,5308,296,5356,291,5404,287,5452,292,5494,313,5528,346,5550,388,5559,434,5559,482,5557,530,5553,578,5549,626,5545,674,5541,722,5537,770,5533,818,5531,866,5531,914,5531,962,5532,1010,5537,1057,5542,1105,5547,1153,5555,1200,5567,1247,5579,1293,5595,1338,5617,1381,5638,1424,5660,1467,5685,1508,5713,1547,5741,1586,5769,1625,5797,1664,5831,1698,5865,1732,5899,1766,5933,1800,5967,1834,6001,1868,6035,1902,6072,1932,6110,1961,6149,1990,6187,2019,6226,2048,6264,2077,6302,2106,6342,2133,6385,2154,6428,2175,6471,2196,6514,2218,6557,2239,6601,2260,6644,2281,6689,2298,6734,2315,6779,2332,6824,2349,6869,2366,6914,2383,6959,2400,7004,2416,7050,2430,7096,2443,7142,2457,7188,2471,7233,2487,7278,2503,7324,2518,7370,2533,7414,2552,7453,2579,7482,2617,7491,2664,7492,2712,7485,2759,7460,2799,7428,2835,7386,2858,7339,2867,7291,2870,7243,2869,7195,2869,7147,2868,7099,2869,7051,2871,7003,2872,6955,2873,6907,2874,6859,2875,6811,2876,6763,2877,6715,2879,6667,2880,6619,2881,6570,2882,6522,2883,6474,2885,6426,2886,6378,2887,6330,2888,6282,2890,6234,2892,6186,2893,6138,2895,6090,2896,6042,2898,5994,2900,5946,2901,5898,2903,5850,2904,5802,2906,5754,2908,5706,2910,5658,2912,5610,2914,5562,2916,5514,2917,5466,2919,5418,2921,5370,2923,5322,2925,5274,2927,5226,2928,5178,2929,5130,2931,5082,2932,5034,2933,4986,2935,4938,2936,4890,2937,4841,2939,4793,2940,4745,2941,4697,2943,4649,2944,4601,2945,4553,2947,4505,2948,4457,2950,4409,2952,4361,2953,4313,2955,4265,2957,4217,2958,4169,2960,4121,2962,4073,2964,4025,2965,3977,2967,3929,2969,3881,2970,3833,2971,3785,2973,3737,2974,3689,2975,3641,2976,3593,2977,3545,2978,3497,2979,3449,2981,3401,2982,3352,2983,3304,2984,3256,2985,3208,2986,3160,2987,3112,2988,3064,2990,3016,2991,2968,2992,2920,2993,2872,2995,2824,2997,2776,2999,2728,3001,2680,3003,2632,3004,2584,3006,2536,3008,2488,3010,2440,3012,2392,3014,2344,3015,2296,3017,2248,3018,2200,3019,2152,3020,2104,3021,2056,3022,2008,3024,1960,3025,1912,3026,1864,3027,1816,3028,1767,3030,1719,3031,1671,3033,1623,3034,1575,3036,1527,3037,1479,3039,1431,3040,1383,3042,1335,3043,1287,3045,1239,3046,1191,3047,1143,3048,1095,3049,1047,3050,999,3051,951,3052,903,3053,855,3054,807,3055,759,3056,711,3057,663,3057,615,3059,567,3061,519,3063,471,3065,423,3067,375,3069,326,3071,278,3073,230,3075,182,3077,134,3079,86,3081,38,3082,-10,3083,-58,3084,-106,3085,-154,3086,-202,3087,-250,3088,-298,3089,-346,3090,-394,3091,-442,3092,-490,3093,-538,3094,-586,3095,-634,3097,-682,3098,-730,3099,-778,3101,-826,3102,-874,3104,-922,3105,-970,3107,-1018,3108,-1066,3110,-1115,3111,-1163,3113,-1211,3114,-1259,3115,-1307,3117,-1355,3118,-1403,3120,-1451,3121,-1499,3123,-1547,3124,-1595,3126,-1643,3127,-1691,3128,-1739,3130,-1787,3131,-1835,3133,-1883,3134,-1931,3136,-1979,3137,-2027,3139,-2075,3141,-2123,3142,-2171,3144,-2219,3145,-2267,3147,-2315,3148,-2363,3150,-2411,3151,-2459,3153,-2507,3154,-2555,3155,-2603,3157,-2651,3158,-2700,3159,-2748,3161,-2796,3162,-2844,3163,-2892,3164,-2940,3166,-2988,3167,-3036,3168,-3084,3170,-3132,3171,-3180,3172,-3228,3174,-3276,3175,-3324,3177,-3372,3178,-3420,3179,-3468,3181,-3516,3182,-3564,3182,-3612,3182,-3660,3174,-3707,3165,-3752,3151,-3792,3124,-3828,3092,-3854,3052,-3876,3009,-3885,2963,-3893,2915,-3894,2867,-3882,2821,-3862,2778,-3833,2739,-3800,2704,-3767,2670,-3734,2635,-3701,2600,-3668,2565,-3635,2531,-3601,2496,-3568,2461,-3535,2426,-3502,2392,-3469,2357,-3436,2322,-3402,2287,-3370,2252,-3337,2217,-3305,2181,-3272,2146,-3239,2111,-3207,2075,-3174,2040,-3142,2005,-3109,1969,-3076,1934,-3044,1899,-3011,1864,-2979,1828,-2945,1794,-2912,1759,-2878,1725,-2845,1690,-2811,1656,-2778,1622,-2744,1587,-2711,1553,-2677,1518,-2644,1484,-2610,1449,-2577,1415,-2543,1381,-2508,1347,-2474,1313,-2440,1279,-2406,1246,-2372,1212,-2338,1178,-2304,1144,-2269,1110,-2235,1076,-2201,1043,-2167,1009,-2133,975,-2100,940,-2067,905,-2034,870,-2001,835,-1968,801,-1935,766,-1902,731,-1869,696,-1835,661,-1802,626,-1769,591,-1736,557,-1703,522,-1670,487,-1637,452,-1605,416,-1573,380,-1541,344,-1509,308,-1477,273,-1445,237,-1413,201,-1381,165,-1349,129,-1317,94,-1285,58,-1253,22,-1221,-14,-1188,-49,-1154,-83,-1120,-117,-1086,-151,-1053,-186,-1020,-221,-987,-256,-954,-291,-921,-326,-888,-360,-855,-395,-822,-430,-789,-465,-758,-502,-730,-541,-701,-579,-674,-619,-648,-659,-627,-702,-615,-749,-603,-795,-604,-843,-605,-891,-610,-938,-624,-984,-638,-1030,-660,-1073,-683,-1115,-705,-1158,-728,-1200,-750,-1243,-773,-1285,-796,-1327,-819,-1370,-842,-1412,-865,-1454,-890,-1495,-918,-1534,-945,-1574,-972,-1613,-1001,-1651,-1043,-1675,-1085,-1697,-1129,-1718,-1176,-1724,-1224,-1730,-1271,-1719,-1317,-1707,-1362,-1690,-1404,-1667,-1447,-1645,-1492,-1630,-1539,-1622,-1587,-1622,-1635,-1623,-1681,-1637,-1727,-1651,-1773,-1666,-1818,-1680,-1864,-1696,-1909,-1711,-1955,-1727,-2000,-1743,-2046,-1758,-2091,-1774,-2137,-1789,-2182,-1805,-2227,-1821,-2273,-1836,-2318,-1852,-2364,-1868,-2409,-1883,-2455,-1899,-2500,-1915,-2545,-1930,-2591,-1946,-2636,-1962,-2682,-1977,-2727,-1993,-2773,-2009,-2818,-2024,-2864,-2040,-2902,-2068,-2939,-2099,-2976,-2129,-3007,-2165,-3033,-2205,-3055,-2248,-3070,-2293,-3085,-2339,-3095,-2386,-3105,-2433,-3115,-2480,-3125,-2527,-3134,-2574,-3148,-2620,-3169,-2663,-3193,-2705,-3224,-2741,-3258,-2775,-3300,-2798,-3341,-2822,-3385,-2841,-3431,-2854,-3478,-2868,-3524,-2881,-3570,-2894,-3616,-2907,-3662,-2921,-3708,-2935,-3754,-2949,-3800,-2963,-3846,-2976,-3892,-2990,-3938,-3004,-3984,-3018,-4030,-3032,-4076,-3046,-4122,-3060,-4168,-3073,-4214,-3087,-4261,-3101,-4307,-3114,-4353,-3128,-4399,-3142,-4445,-3155,-4491,-3169,-4537,-3183,-4583,-3196,-4629,-3210,-4675,-3224,-4721,-3237,-4767,-3251,-4813,-3264,-4860,-3278,-4906,-3292,-4952,-3305,-4998,-3319,-5044,-3333,-5090,-3346,-5136,-3360,-5182,-3374,-5228,-3387,-5274,-3401,-5320,-3414,-5366,-3428,-5410,-3448,-5454,-3467,-5498,-3487,-5539,-3511,-5579,-3539,-5618,-3566,-5658,-3594,-5690,-3628,-5720,-3666,-5750,-3703,-5780,-3741,-5804,-3782,-5820,-3827,-5837,-3872,-5853,-3917,-5865,-3964,-5875,-4011,-5884,-4058,-5883,-4106,-5881,-4154,-5879,-4202,-5877,-4250,-5868,-4297,-5857,-4344,-5847,-4391,-5832,-4436,-5808,-4478,-5785,-4520,-5759,-4560,-5728,-4597,-5697,-4634,-5666,-4670,-5628,-4699,-5590,-4729,-5552,-4759,-5514,-4788,-5473,-4813,-5432,-4838,-5391,-4863,-5350,-4888,-5308,-4912,-5263,-4928,-5218,-4944,-5173,-4960,-5127,-4976,-5082,-4992,-5037,-5008,-4991,-5024,-4945,-5035,-4897,-5042,-4850,-5049,-4802,-5056,-4754,-5057,-4706,-5057,-4658,-5058,-4610,-5057,-4562,-5052,-4514,-5047,-4467,-5039,-4423,-5020,-4379,-5001,-4335,-4982,-4299,-4950,-4263,-4918,-4227,-4886,-4201,-4846,-4176,-4805,-4150,-4765,-4131,-4721,-4112,-4676,-4094,-4632,-4076,-4587,-4054,-4544,-4033,-4502,-4011,-4459,-3989,-4416,-3967,-4373,-3946,-4330,-3926,-4286,-3905,-4243,-3884,-4200,-3861,-4158,-3838,-4115,-3815,-4073,-3791,-4031,-3768,-3990,-3735,-3954,-3702,-3920,-3668,-3886,-3634,-3852,-3600,-3818,-3566,-3784,-3532,-3750,-3498,-3716,-3464,-3682,-3430,-3648,-3397,-3613,-3363,-3579,-3329,-3545,-3295,-3511,-3261,-3477,-3227,-3443,-3193,-3409,-3159,-3376,-3125,-3342,-3091,-3308,-3057,-3274,-3023,-3240,-2989,-3206,-2954,-3172,-2920,-3138,-2886,-3104,-2852,-3070,-2818,-3037,-2784,-3003,-2750,-2969,-2716,-2935,-2682,-2901,-2648,-2867,-2613,-2834,-2579,-2800,-2540,-2773,-2499,-2748,-2457,-2723,-2413,-2707,-2366,-2695,-2320,-2682,-2273,-2675,-2225,-2669,-2177,-2664,-2130,-2667,-2083,-2677,-2035,-2686,-1988,-2696,-1944,-2714,-1901,-2736,-1858,-2757,-1815,-2779,-1772,-2800,-1729,-2822,-1686,-2843,-1643,-2865,-1600,-2886,-1557,-2908,-1515,-2929,-1472,-2951,-1429,-2972,-1386,-2994,-1341,-3012,-1296,-3016,-1250,-3001,-1204,-2986,-1159,-2971,-1113,-2955,-1068,-2940,-1022,-2925,-977,-2909,-931,-2894,-886,-2879,-840,-2863,-794,-2848,-749,-2833,-703,-2817,-658,-2802,-612,-2787,-567,-2771,-521,-2756,-476,-2740,-430,-2725,-385,-2710,-339,-2694,-294,-2679,-248,-2664,-202,-2648,-157,-2633,-111,-2618,-66,-2602,-20,-2587,25,-2572,71,-2556,116,-2541,162,-2526,207,-2510,253,-2495,298,-2479,344,-2464,389,-2449,435,-2433,481,-2418,526,-2403,572,-2387,617,-2372,663,-2357,708,-2341,750,-2317,791,-2293,833,-2269,870,-2240,901,-2203,933,-2167,952,-2123,970,-2078,987,-2033,997,-1987,1003,-1939,1009,-1891,1006,-1844,1003,-1796,1000,-1748,986,-1703,964,-1660,942,-1617,913,-1579,882,-1542,851,-1506,820,-1469,787,-1434,754,-1399,721,-1364,688,-1330,654,-1295,621,-1261,588,-1226,554,-1191,521,-1157,488,-1122,454,-1087,421,-1053,388,-1018,354,-983,321,-949,288,-914,255,-879,221,-845,188,-810,155,-776,121,-741,88,-706,55,-672,21,-637,-12,-602,-45,-568,-78,-533,-112,-498,-145,-464,-178,-429,-212,-394,-245,-360,-278,-325,-311,-290,-344,-255,-377,-220,-410,-185,-443,-151,-476,-116,-510,-81,-543,-46,-576,-11,-609,24,-642,58,-675,93,-708,128,-741,163,-774,198,-807,233,-840,268,-873,302,-907,337,-939,373,-970,409,-1002,445,-1034,482,-1054,524,-1068,570,-1080,616,-1073,664,-1066,711,-1043,753,-1017,793,-986,829,-948,858,-903,876,-859,895,-811,898,-763,900,-715,903,-667,906,-619,901,-572,895,-524,890,-476,885,-428,879,-381,874,-333,869,-285,864,-237,858,-190,853,-142,848,-94,843,-46,838,2,834,49,829,97,824,145,819,193,815,241,810,289,805,336,801,384,796,432,791,480,786,528,782,575,777,623,772,671,768,719,763,767,758,815,753,862,749,910,744,958,739,1006,735,1054,730,1101,725,1149,720,1197,716,1245,711,1293,706,1341,702,1388,697,1436,692,1484,687,1532,683,1580,678,1628,673,1675,668,1723,664,1771,659,1819,654,1867,649,1914,644,1962,639,2010,634,2058,629,2106,624,2153,619,2201,614,2249,609,2297,604,2344,598,2392,593,2440,588,2488,583,2536,578];
const P=[];for(let i=0;i<D.length;i+=2)P.push([D[i],D[i+1]]);
const TW=130, pts=[];
(function build(){
  const n=P.length;
  for(let i=0;i<n;i++){
    const p0=P[(i+n-1)%n],p1=P[i],p2=P[(i+1)%n],p3=P[(i+2)%n];
    for(let s=0;s<2;s++){
      const t=s/2,t2=t*t,t3=t2*t;
      pts.push([0,1].map(k=>0.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3)));
    }
  }
})();
const N=pts.length;
function tracePath(g){g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath()}

// ---- Car ----
const car={x:0,y:0,a:0,vx:0,vy:0,steer:0,idx:0,ers:1,gear:0};
let keys={},state='idle',t0=0,lapT=0,lapNo=1,best=null,last=null,halfway=false,lightsT=0,go=false,dist=0;
function reset(){
  const i=N-10;car.x=pts[i][0];car.y=pts[i][1];
  const n=pts[(i+1)%N];car.a=Math.atan2(n[1]-pts[i][1],n[0]-pts[i][0]);
  car.vx=car.vy=0;car.steer=0;car.idx=i;car.ers=1;
  lapNo=1;lapT=0;halfway=false;go=false;state='lights';lightsT=0;$('msg').textContent='';
  $('lap').textContent=1;
}
addEventListener('keydown',e=>{keys[e.code]=1;if(e.code==='KeyR')reset();if(e.code.startsWith('Arrow')||e.code==='Space')e.preventDefault()});
addEventListener('keyup',e=>keys[e.code]=0);

function nearest(){
  let bi=car.idx,bd=1e18;
  for(let k=-25;k<=25;k++){
    const i=(car.idx+k+N)%N,dx=car.x-pts[i][0],dy=car.y-pts[i][1],d=dx*dx+dy*dy;
    if(d<bd){bd=d;bi=i}
  }
  return [bi,Math.sqrt(bd)];
}
const fmt=t=>{const m=Math.floor(t/60),s=t-m*60;return m+':'+s.toFixed(3).padStart(6,'0')};

function update(dt){
  // start lights
  if(state==='lights'){
    lightsT+=dt;const n=Math.min(5,Math.floor(lightsT/0.8));
    [...$('lights').children].forEach((s,i)=>s.classList.toggle('on',i<n&&lightsT<4.6));
    if(lightsT>=4.6+Math.random()*0){go=true;state='run';$('lights').querySelectorAll('span').forEach(s=>s.classList.remove('on'));$('msg').textContent='GO';setTimeout(()=>{if($('msg').textContent==='GO')$('msg').textContent=''},900)}
  }
  const thr=go&&(keys.ArrowUp||keys.KeyW),brk=go&&(keys.ArrowDown||keys.KeyS);
  const tgt=(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0);
  car.steer+=(tgt-car.steer)*Math.min(1,7*dt);
  const c=Math.cos(car.a),s=Math.sin(car.a);
  let vf=car.vx*c+car.vy*s,vl=-car.vx*s+car.vy*c;
  const [ni,d]=nearest();
  const onTrack=d<TW/2+6, gravel=d>TW/2+40;
  const drsOn=go&&keys.Space&&Math.abs(car.steer)<0.15&&vf>300;
  const ersOn=go&&keys.ShiftLeft&&car.ers>0&&thr||go&&keys.ShiftRight&&car.ers>0&&thr;
  if(ersOn)car.ers=Math.max(0,car.ers-dt*0.22);else car.ers=Math.min(1,car.ers+dt*0.04+(brk?dt*0.1:0));
  const maxV=900+(drsOn?90:0)+(ersOn?50:0);
  if(thr)vf+=(760+(ersOn?350:0))*(1-Math.max(0,vf)/maxV)*dt;
  if(brk){vf-=(vf>0?1900:500)*dt;if(vf<-120)vf=-120}
  vf-=vf*(drsOn?0.05:0.13)*dt; // coasting drag
  if(!onTrack)vf-=vf*(gravel?4:1.6)*dt;
  vl*=Math.exp(-(onTrack?5.5:3)*dt);
  const ar=Math.abs(vf);
  car.a+=car.steer*2.6*Math.min(ar/220,1)/(1+ar/620)*(vf>=0?1:-1)*dt;
  const c2=Math.cos(car.a),s2=Math.sin(car.a);
  car.vx=vf*c2-vl*s2;car.vy=vf*s2+vl*c2; // keep world velocity from local comps (slip carries over)
  car.x+=car.vx*dt;car.y+=car.vy*dt;

  // lap logic
  const prev=car.idx;car.idx=ni;
  if(go){
    lapT+=dt;
    if(ni>N*0.45&&ni<N*0.55)halfway=true;
    if(prev>N*0.9&&ni<N*0.1&&halfway&&vf>0){
      last=lapT;if(best===null||last<best){best=last;$('msg').style.color='var(--purple)'}else $('msg').style.color='';
      $('msg').textContent='LAP '+lapNo+'  '+fmt(last);setTimeout(()=>$('msg').textContent='',2600);
      lapNo++;lapT=0;halfway=false;$('lap').textContent=lapNo;
      $('last').textContent=fmt(last);$('best').textContent=fmt(best);
    }
    if(prev<N*0.1&&ni>N*0.9&&!halfway){/* wrong way over line: ignore */}
  }
  // HUD
  const kmh=Math.abs(vf)*0.37;
  $('speed').firstChild.nodeValue=Math.round(kmh);
  const g=vf<-5?'R':kmh<8?'N':Math.min(8,1+Math.floor(kmh/42));
  $('gear').textContent=g;
  const inG=typeof g==='number'?((kmh-(g-1)*42)/42):0;
  $('rev').firstElementChild.style.width=Math.round(Math.max(0,Math.min(1,inG))*100)+'%';
  $('ersb').firstElementChild.style.width=Math.round(car.ers*100)+'%';
  $('drs').textContent=drsOn?'DRS open':'DRS off';$('drs').classList.toggle('on',drsOn);
  $('cur').textContent=fmt(lapT);
  car.drs=drsOn;car.onTrack=onTrack;
}

// ---- 3D first-person rendering (perspective projection, no libraries) ----
const MM=(()=>{
  let a=1e9,b=-1e9,c=1e9,d=-1e9;
  pts.forEach(p=>{a=Math.min(a,p[0]);b=Math.max(b,p[0]);c=Math.min(c,p[1]);d=Math.max(d,p[1])});
  const targetW=330, targetH=215;
  const padX=26, padY=22;
  const s=Math.min((targetW-padX*2)/(b-a), (targetH-padY*2)/(d-c));
  const ox=targetW/2 - (a+b)/2*s;
  const oy=targetH/2 - (c+d)/2*s;
  return{s,ox,oy,w:targetW,h:targetH};
})();

const TURN_MARKS=[
  {label:'1', idx:122, name:'T1'},
  {label:'3', idx:263, name:'T3'},
  {label:'4', idx:755, name:'T4'},
  {label:'6', idx:957, name:'T6'},
  {label:'10', idx:1233, name:'T10'},
  {label:'11', idx:1334, name:'T11'},
  {label:'15', idx:1629, name:'T15'},
  {label:'16', idx:1760, name:'T16'}
];
const carTrail=[];
let miniExpanded=false;
.addEventListener('click',()=>{
  miniExpanded=!miniExpanded;
  const m=;
  if(miniExpanded){m.style.width='420px';m.style.height='274px'}
  else{m.style.width='330px';m.style.height='215px'}
});
const NEAR=3,FAR=3200,CAMH=10;
const nrm=pts.map((p,i)=>{const a=pts[(i+N-1)%N],b=pts[(i+1)%N],tx=b[0]-a[0],ty=b[1]-a[1],l=Math.hypot(tx,ty);return[-ty/l,tx/l]});
const cf=new Float32Array(N),cl=new Float32Array(N),nf=new Float32Array(N),nl=new Float32Array(N);
let T=0,focal=600,hor=300;
function clip(p){const o=[];for(let k=0;k<p.length;k++){const a=p[k],b=p[(k+1)%p.length],ai=a[0]>=NEAR,bi=b[0]>=NEAR;if(ai)o.push(a);if(ai!==bi){const t=(NEAR-a[0])/(b[0]-a[0]);o.push([NEAR,a[1]+(b[1]-a[1])*t])}}return o}
function quad(i,w1,w2,col){
  const j=(i+1)%N,P4=[[cf[i]+nf[i]*w1,cl[i]+nl[i]*w1],[cf[i]+nf[i]*w2,cl[i]+nl[i]*w2],[cf[j]+nf[j]*w2,cl[j]+nl[j]*w2],[cf[j]+nf[j]*w1,cl[j]+nl[j]*w1]];
  const q=clip(P4);if(q.length<3)return;
  ctx.fillStyle=col;ctx.beginPath();
  q.forEach((p,k)=>{const x=W/2+p[1]/p[0]*focal,y=hor+CAMH/p[0]*focal;k?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.fill();
}
function cockpit(){
  const u=H/600,cx=W/2;
  // front wheels (turn with steering)
  ctx.fillStyle='#0c0c0e';
  [-1,1].forEach(sd=>{ctx.save();ctx.translate(cx+sd*W*0.27,H*0.74);ctx.rotate(car.steer*0.35);
    ctx.fillRect(-26*u,-70*u,52*u,140*u);ctx.fillStyle='#22252a';ctx.fillRect(-26*u,-70*u,52*u,12*u);ctx.restore();ctx.fillStyle='#0c0c0e'});
  // nose + side pods
  ctx.fillStyle='#b80500';ctx.beginPath();ctx.moveTo(cx-W*0.045,H*0.7);ctx.lineTo(cx+W*0.045,H*0.7);ctx.lineTo(cx+W*0.2,H);ctx.lineTo(cx-W*0.2,H);ctx.fill();
  ctx.fillStyle='#e10600';ctx.beginPath();ctx.moveTo(cx-W*0.02,H*0.7);ctx.lineTo(cx+W*0.02,H*0.7);ctx.lineTo(cx+W*0.06,H);ctx.lineTo(cx-W*0.06,H);ctx.fill();
  ctx.fillStyle='#111316';[-1,1].forEach(sd=>{ctx.beginPath();ctx.moveTo(cx+sd*W*0.3,H);ctx.lineTo(cx+sd*W*0.36,H*0.86);ctx.lineTo(cx+sd*W*0.5,H*0.86);ctx.lineTo(cx+sd*W*0.5,H);ctx.fill()});
  // halo
  ctx.strokeStyle='#0d0e10';ctx.lineWidth=13*u;ctx.lineCap='round';ctx.beginPath();
  ctx.moveTo(cx,H*0.7);ctx.lineTo(cx,H*0.4);ctx.stroke();
  ctx.lineWidth=16*u;ctx.beginPath();ctx.moveTo(cx-W*0.3,H*0.9);ctx.quadraticCurveTo(cx-W*0.2,H*0.34,cx,H*0.36);ctx.quadraticCurveTo(cx+W*0.2,H*0.34,cx+W*0.3,H*0.9);ctx.stroke();
  // steering wheel
  ctx.save();ctx.translate(cx,H*1.0);ctx.rotate(car.steer*1.1);
  ctx.fillStyle='#15171a';const ww=W*0.17,wh=H*0.13;ctx.beginPath();ctx.roundRect(-ww,-wh,ww*2,wh*1.4,14*u);ctx.fill();
  ctx.fillStyle='#000';ctx.fillRect(-ww*0.42,-wh*0.85,ww*0.84,wh*0.62);
  ctx.fillStyle='#3ddc84';ctx.font='700 '+Math.round(28*u)+'px "Chakra Petch",sans-serif';ctx.textAlign='center';ctx.fillText($('gear').textContent,0,-wh*0.3);
  for(let k=0;k<9;k++){ctx.fillStyle=k<car.rev*9?(k>6?'#e10600':k>3?'#f5d000':'#3ddc84'):'#333';ctx.beginPath();ctx.arc(-ww*0.4+k*ww*0.1,-wh*0.98,4*u,0,7);ctx.fill()}
  ctx.restore();
}
function draw(){
  T+=0.016;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const sp=Math.hypot(car.vx,car.vy),k=sp/900;
  focal=Math.min(W,H*1.8)*0.62*(1-k*0.12);
  hor=H*0.42+Math.sin(T*70)*k*1.5+(car.onTrack?0:Math.sin(T*90)*3);
  const c=Math.cos(car.a),s=Math.sin(car.a);
  for(let i=0;i<N;i++){const dx=pts[i][0]-car.x,dy=pts[i][1]-car.y;cf[i]=dx*c+dy*s;cl[i]=-dx*s+dy*c;nf[i]=nrm[i][0]*c+nrm[i][1]*s;nl[i]=-nrm[i][0]*s+nrm[i][1]*c}
  // sky + ground
  const sg=ctx.createLinearGradient(0,0,0,hor);sg.addColorStop(0,'#3a78c8');sg.addColorStop(1,'#cfe4f2');
  ctx.fillStyle=sg;ctx.fillRect(0,0,W,hor+1);
  ctx.fillStyle='#2f5a2a';ctx.fillRect(0,hor,W,H-hor);
  ctx.save();ctx.translate(W/2,H/2);ctx.rotate(-car.steer*k*0.05);ctx.translate(-W/2,-H/2);
  // collect visible segments + trackside posts, draw far to near
  const items=[];
  for(let i=0;i<N;i++){const j=(i+1)%N,mx_=Math.max(cf[i],cf[j]),mn=Math.min(cf[i],cf[j]);
    if(mx_<NEAR||mn>FAR)continue;
    items.push([(cf[i]+cf[j])/2,i,0]);
    if(i%8===0&&cf[i]>NEAR){items.push([cf[i],i,-1]);items.push([cf[i],i,1])}}
  items.sort((a,b)=>b[0]-a[0]);
  const HW=TW/2;
  for(const [d,i,t] of items){
    if(t===0){
      quad(i,-900,900,(i>>4)&1?'#2f5a2a':'#376633');
      quad(i,-HW-90,HW+90,'#c9b98a');
      const kc=(i>>1)&1?'#e10600':'#f2f2ee';
      quad(i,-HW-14,-HW,kc);quad(i,HW,HW+14,kc);
      quad(i,-HW,HW,(i>>2)&1?'#3b3d40':'#404246');
      if(i>=N-1||i===0)quad(i,-HW,HW,'#f2f2ee');
      if(i%6<3)quad(i,-2,2,'#8c8f94');
    }else{
      const w=t*(HW+70),f=cf[i]+nf[i]*w,l=cl[i]+nl[i]*w;if(f<NEAR)continue;
      const x=W/2+l/f*focal,y=hor+CAMH/f*focal,h=34*focal/f,bw=7*focal/f;
      ctx.fillStyle=(i/8|0)%2?'#e10600':'#f2f2ee';ctx.fillRect(x-bw/2,y-h,bw,h);
    }
  }
  ctx.restore();
  car.rev=Math.max(0,Math.min(1,parseFloat($('rev').firstElementChild.style.width)/100||0));
  cockpit();
  // ---- F1 Broadcast Minimap (Bigger, High-DPI & Sector-Colored) ----
  mx.save();
  mx.setTransform(2, 0, 0, 2, 0, 0); // 2x retina backing store
  mx.clearRect(0, 0, MM.w, MM.h);
  
  // Background
  mx.fillStyle = 'rgba(12, 16, 23, 0.55)';
  mx.fillRect(0, 0, MM.w, MM.h);

  const ms = MM.s, ox = MM.ox, oy = MM.oy;

  // Track casing shadow / roadbed
  mx.beginPath();
  for(let i=0; i<N; i+=3){
    const X = pts[i][0] * ms + ox, Y = pts[i][1] * ms + oy;
    i ? mx.lineTo(X, Y) : mx.moveTo(X, Y);
  }
  mx.closePath();
  mx.strokeStyle = '#080c14';
  mx.lineWidth = 10;
  mx.lineCap = 'round';
  mx.lineJoin = 'round';
  mx.stroke();

  mx.strokeStyle = '#1b2333';
  mx.lineWidth = 7;
  mx.stroke();

  // Sector 1: Gold / Yellow (#ffb800) [Start/Finish to Turn 3]
  mx.beginPath();
  for(let i=0; i<=280; i+=2){
    const X = pts[i][0] * ms + ox, Y = pts[i][1] * ms + oy;
    i ? mx.lineTo(X, Y) : mx.moveTo(X, Y);
  }
  mx.strokeStyle = '#ffb800';
  mx.lineWidth = 3.5;
  mx.stroke();

  // Sector 2: F1 Purple (#b56cff) [1.1km Back Straight to Turn 9]
  mx.beginPath();
  for(let i=280; i<=1130; i+=2){
    const X = pts[i][0] * ms + ox, Y = pts[i][1] * ms + oy;
    i === 280 ? mx.moveTo(X, Y) : mx.lineTo(X, Y);
  }
  mx.strokeStyle = '#b56cff';
  mx.lineWidth = 3.5;
  mx.stroke();

  // Sector 3: Cyan (#00e5ff) [Parabolica to Main Straight]
  mx.beginPath();
  for(let i=1130; i<N; i+=2){
    const X = pts[i][0] * ms + ox, Y = pts[i][1] * ms + oy;
    i === 1130 ? mx.moveTo(X, Y) : mx.lineTo(X, Y);
  }
  mx.lineTo(pts[0][0] * ms + ox, pts[0][1] * ms + oy);
  mx.strokeStyle = '#00e5ff';
  mx.lineWidth = 3.5;
  mx.stroke();

  // DRS Zones: Back Straight (320-730) & Main Straight (1800-90)
  mx.save();
  mx.strokeStyle = '#3ddc84';
  mx.lineWidth = 3.5;
  mx.setLineDash([4, 3]);
  mx.beginPath();
  for(let i=320; i<=730; i+=3){
    const X = pts[i][0] * ms + ox, Y = pts[i][1] * ms + oy;
    i === 320 ? mx.moveTo(X, Y) : mx.lineTo(X, Y);
  }
  mx.stroke();

  mx.beginPath();
  for(let i=1800; i<N; i+=3){
    const X = pts[i][0] * ms + ox, Y = pts[i][1] * ms + oy;
    i === 1800 ? mx.moveTo(X, Y) : mx.lineTo(X, Y);
  }
  for(let i=0; i<=90; i+=3){
    const X = pts[i][0] * ms + ox, Y = pts[i][1] * ms + oy;
    mx.lineTo(X, Y);
  }
  mx.stroke();
  mx.restore();

  // Start / Finish Checkered Bar
  const sfx = pts[0][0] * ms + ox, sfy = pts[0][1] * ms + oy;
  const sfx2 = pts[2][0] * ms + ox, sfy2 = pts[2][1] * ms + oy;
  const sfnx = -(sfy2 - sfy), sfny = (sfx2 - sfx);
  const sfnl = Math.hypot(sfnx, sfny) || 1;
  const sfw = 6;
  mx.beginPath();
  mx.moveTo(sfx - (sfnx/sfnl)*sfw, sfy - (sfny/sfnl)*sfw);
  mx.lineTo(sfx + (sfnx/sfnl)*sfw, sfy + (sfny/sfnl)*sfw);
  mx.strokeStyle = '#ffffff';
  mx.lineWidth = 2.5;
  mx.stroke();

  // Turn Number Badges
  mx.font = '700 8px "Chakra Petch", sans-serif';
  mx.textAlign = 'center';
  mx.textBaseline = 'middle';
  TURN_MARKS.forEach(tm => {
    const tx = pts[tm.idx][0] * ms + ox;
    const ty = pts[tm.idx][1] * ms + oy;
    const nx = nrm[tm.idx][0], ny = nrm[tm.idx][1];
    const bx = tx + nx * 11;
    const by = ty + ny * 11;
    mx.fillStyle = 'rgba(8, 12, 18, 0.92)';
    mx.beginPath();
    mx.arc(bx, by, 7.5, 0, Math.PI * 2);
    mx.fill();
    mx.strokeStyle = '#e10600';
    mx.lineWidth = 1;
    mx.stroke();
    mx.fillStyle = '#ffffff';
    mx.fillText(tm.label, bx, by + 0.5);
  });

  // Car Motion Trail
  const carX = car.x * ms + ox, carY = car.y * ms + oy;
  carTrail.push([carX, carY]);
  if (carTrail.length > 14) carTrail.shift();
  if (carTrail.length > 2) {
    for (let k = 1; k < carTrail.length; k++) {
      const alpha = (k / carTrail.length) * 0.45;
      mx.beginPath();
      mx.moveTo(carTrail[k-1][0], carTrail[k-1][1]);
      mx.lineTo(carTrail[k][0], carTrail[k][1]);
      mx.strokeStyle = 'rgba(225, 6, 0, ' + alpha + ')';
      mx.lineWidth = 2.5;
      mx.stroke();
    }
  }

  // Car Pulse Radar
  const pulseR = 7 + Math.sin(T * 7) * 3;
  mx.beginPath();
  mx.arc(carX, carY, pulseR, 0, Math.PI * 2);
  mx.strokeStyle = 'rgba(225, 6, 0, 0.4)';
  mx.lineWidth = 1.5;
  mx.stroke();

  // Car Heading Direction Arrow
  mx.save();
  mx.translate(carX, carY);
  mx.rotate(car.a);
  mx.fillStyle = '#ffffff';
  mx.beginPath();
  mx.moveTo(0, 7);
  mx.lineTo(-4, -5);
  mx.lineTo(0, -3);
  mx.lineTo(4, -5);
  mx.closePath();
  mx.fill();

  // Core Beacon Dot
  mx.beginPath();
  mx.arc(0, 0, 4.5, 0, Math.PI * 2);
  mx.fillStyle = '#e10600';
  mx.fill();
  mx.strokeStyle = '#ffffff';
  mx.lineWidth = 1.5;
  mx.stroke();
  mx.restore();

  mx.restore();

  // Update Sector Pills
  const inS1 = car.idx < 280;
  const inS2 = car.idx >= 280 && car.idx < 1130;
  const inS3 = car.idx >= 1130;
  .className = 'sec-badge' + (inS1 ? ' active-s1' : '');
  .className = 'sec-badge' + (inS2 ? ' active-s2' : '');
  .className = 'sec-badge' + (inS3 ? ' active-s3' : '');

  // Closest Turn Callout
  let nearestTurn = 'MAIN STRAIGHT';
  let minTurnDist = 9999;
  TURN_MARKS.forEach(tm => {
    let diff = Math.abs(car.idx - tm.idx);
    if (diff > N / 2) diff = N - diff;
    if (diff < minTurnDist) {
      minTurnDist = diff;
      if (diff < 40) nearestTurn = ;
      else if (diff < 90) nearestTurn = ;
    }
  });
  if (car.idx >= 320 && car.idx <= 730) nearestTurn = '1.1KM BACK STRAIGHT';
  else if (car.idx >= 1200 && car.idx <= 1350) nearestTurn = 'PARABOLICA COMPLEX';
  else if (car.idx >= 1850 || car.idx <= 80) nearestTurn = 'START / FINISH STRAIGHT';

  .textContent = nearestTurn;
  const miniDrs = ;
  if (drsOn) {
    miniDrs.textContent = 'DRS ACTIVE';
    miniDrs.className = 'mini-drs-tag active';
  } else if ((car.idx >= 310 && car.idx <= 730) || (car.idx >= 1800 || car.idx <= 90)) {
    miniDrs.textContent = 'DRS ZONE';
    miniDrs.className = 'mini-drs-tag';
  } else {
    miniDrs.textContent = 'DRS CLOSED';
    miniDrs.className = 'mini-drs-tag';
  }
}
let prevT=performance.now();
function loop(now){
  const dt=Math.min(0.033,(now-prevT)/1000);prevT=now;
  update(dt);draw();requestAnimationFrame(loop);
}
reset();requestAnimationFrame(loop);
})();
