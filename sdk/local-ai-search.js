const MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct-ONNX-GQA';
const RUNTIME_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

const RULES = [
  { id:'banks',title:'Banks & ATMs',icon:'▤',pattern:/\b(?:atm|atms|cash machine|cash withdrawal|bank|banks|branch|branches|sbi|state bank of india|hdfc|icici|axis bank|kotak|pnb|canara bank|bank of baroda)\b/i },
  { id:'health',title:'Healthcare',icon:'+',pattern:/\b(?:hospital|clinic|doctor|dentist|pharmacy|chemist|gynecologist|gynaecologist|urologist|ivf|fertility clinic|diagnostic lab|pathology lab|urgent care)\b/i },
  { id:'transport',title:'Transport & charging',icon:'↗',pattern:/\b(?:airport|railway station|train station|metro station|bus station|bus stand|bus stop|petrol pump|gas station|fuel station|ev charging|charging station)\b/i },
  { id:'food',title:'Food & drink',icon:'♨',pattern:/\b(?:restaurant|food|eatery|dining|dinner|lunch|breakfast|biryani|pizza|burger|dhaba|street food|tiffin|mess|vegetarian|veg food|vegan|non veg|cafe|coffee shop|bakery|sweet shop|ice cream|fast food|food court)\b/i },
  { id:'shopping',title:'Shops & retail',icon:'◇',pattern:/\b(?:shop|store|shopping|supermarket|grocery|mall|department store|clothing|clothes|electronics shop|hardware store|bookshop|bookstore)\b/i },
  { id:'fitness',title:'Fitness & recreation',icon:'◉',pattern:/\b(?:gym|fitness centre|fitness center|yoga studio|swimming pool|sports complex|stadium|sports ground)\b/i },
  { id:'outdoors',title:'Parks & outdoors',icon:'❋',pattern:/\b(?:park|garden|playground|kids activities|things to do with kids|children|family activities|walking trail|hiking trail|nature reserve|picnic spot)\b/i },
  { id:'education',title:'Schools & universities',icon:'⌂',pattern:/\b(?:school|college|university|coaching class|tuition|library)\b/i },
  { id:'lodging',title:'Hotels & accommodation',icon:'⌑',pattern:/\b(?:hotel|hostel|motel|resort|guest house|guesthouse)\b/i },
  { id:'landmarks',title:'Landmarks & attractions',icon:'⌖',pattern:/\b(?:monument|museum|landmark|attraction|temple|church|mosque|tourist spot|tourist places|places to visit|things to do|historical place|historic site)\b/i },
  { id:'personal',title:'Personal services',icon:'✂',pattern:/\b(?:salon|beauty salon|barber|barbershop|laundromat|laundry|dry cleaner|tailor)\b/i },
  { id:'services',title:'Public services & fuel',icon:'↗',pattern:/\b(?:petrol pump|gas station|post office|government office|police station|fire station|public toilet|restroom|courier)\b/i }
];
const BRANDS = [
  [/\b(?:sbi|state bank of india)\b/i,'SBI'],[/\bhdfc\b/i,'HDFC Bank'],[/\bicici\b/i,'ICICI Bank'],
  [/\baxis(?: bank)?\b/i,'Axis Bank'],[/\bkotak\b/i,'Kotak Mahindra Bank'],
  [/\b(?:pnb|punjab national bank)\b/i,'Punjab National Bank'],
  [/\b(?:bob|bank of baroda)\b/i,'Bank of Baroda'],[/\bcanara(?: bank)?\b/i,'Canara Bank'],
  [/\bindian bank\b/i,'Indian Bank'],[/\bunion bank\b/i,'Union Bank of India'],[/\bbank of india\b/i,'Bank of India']
];
const PREFERENCES = [
  ['vegetarian',/\b(?:vegetarian|veg food|pure veg)\b/i],['vegan',/\bvegan\b/i],
  ['budget',/\b(?:cheap|affordable|budget|low cost|inexpensive)\b/i],
  ['open_now',/\b(?:open now|currently open|right now)\b/i],['popular',/\b(?:famous|popular|well known|top rated)\b/i],
  ['family_friendly',/\b(?:family friendly|family-friendly|kids|children|child friendly)\b/i],
  ['parking',/\bparking\b/i],['accessible',/\b(?:wheelchair|accessible|step free)\b/i],
  ['emergency',/\b(?:emergency|24.?7|urgent|open all night)\b/i],['romantic',/\b(?:romantic|date night|candlelight)\b/i]
];
const normalise = value => String(value||'').normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().slice(0,180);

function findLocation(query) {
  const q=normalise(query);
  const direct=q.match(/\b(?:in|within)\s+(.+)$/i);
  if(direct){const p=normalise(direct[1]).replace(/\s+(?:near me|around me|close to me)$/i,'').trim();if(p&&!/^(?:me|here|nearby|my area|my location)$/i.test(p))return p}
  const near=q.match(/\b(?:near|around|close to)\s+(.+)$/i);
  if(near){const p=normalise(near[1]);if(p&&!/^(?:me|here|nearby|my area|my location)$/i.test(p))return p}
  return '';
}
function ruleFor(q){return RULES.find(rule=>rule.pattern.test(q))||null}
function brandFor(q){return BRANDS.find(([pattern])=>pattern.test(q))?.[1]||''}
function categoryQuery(rule,q,brand){
  if(brand){const sub=/\batms?\b|\bcash machine\b/i.test(q)?' ATM':/\bbranches?\b/i.test(q)?' branch':/\bbanks?\b/i.test(q)?' bank':'';return brand+sub}
  if(!rule)return '';
  if(rule.id==='food'){
    if(/\bvegan\b/i.test(q))return 'vegan restaurants';
    if(/\b(?:vegetarian|veg food|pure veg)\b/i.test(q))return 'vegetarian restaurants';
    if(/\bbiryani\b/i.test(q))return 'biryani restaurants';
    if(/\bpizza\b/i.test(q))return 'pizza restaurants';
    if(/\bburger\b/i.test(q))return 'burger restaurants';
    if(/\b(?:cafe|coffee)\b/i.test(q))return 'coffee shops';
    if(/\bbaker/i.test(q))return 'bakeries';
    if(/\bdhaba/i.test(q))return 'dhabas';
    if(/\bsweet shop/i.test(q))return 'sweet shops';
    if(/\bbreakfast\b/i.test(q))return 'breakfast restaurants';
    if(/\bstreet food\b/i.test(q))return 'street food';
    return 'restaurants';
  }
  if(rule.id==='banks')return /\batms?\b|\bcash machine\b|\bcash withdrawal\b/i.test(q)?'ATMs':'banks';
  if(rule.id==='health'){if(/\b(?:pharmacy|pharmacies|chemist|medical store)\b/i.test(q))return 'pharmacies';if(/\bdentist/i.test(q))return 'dentists';if(/\b(?:gynecologist|gynaecologist)\b/i.test(q))return 'gynecologists';if(/\burologist/i.test(q))return 'urologists';if(/\bivf|fertility/i.test(q))return 'fertility clinics';if(/\bhospital/i.test(q))return 'hospitals';return 'health clinics'}
  if(rule.id==='transport'){if(/\bairport\b/i.test(q))return 'airports';if(/\b(?:railway|train|metro) station\b/i.test(q))return 'railway stations';if(/\b(?:bus station|bus stand|bus stop)\b/i.test(q))return 'bus stations';if(/\b(?:ev charging|charging station)\b/i.test(q))return 'EV charging stations';return 'petrol pumps'}
  if(rule.id==='shopping')return /\b(?:grocery|supermarket)\b/i.test(q)?'supermarkets and grocery stores':/\bmall\b/i.test(q)?'shopping malls':'shops and stores';
  if(rule.id==='fitness')return /\byoga\b/i.test(q)?'yoga studios':'gyms and fitness centres';
  if(rule.id==='outdoors')return /\bplayground/i.test(q)?'playgrounds and parks':'parks and gardens';
  if(rule.id==='education')return /\blibrar/i.test(q)?'libraries':'schools and universities';
  if(rule.id==='lodging')return /\bhostel/i.test(q)?'hostels':/\bresort/i.test(q)?'resorts':'hotels';
  if(rule.id==='landmarks')return /\btemple/i.test(q)?'temples':/\bmuseum/i.test(q)?'museums':'attractions and landmarks';
  if(rule.id==='personal')return /\bbarber/i.test(q)?'barbershops':/\b(?:laundry|laundromat|dry cleaner)\b/i.test(q)?'laundromats and dry cleaners':'salons';
  if(rule.id==='services')return /\b(?:toilet|restroom)\b/i.test(q)?'public toilets':/\bpost office\b/i.test(q)?'post offices':'public services';
  return '';
}

export function understandMapQuery(input){
  const original=normalise(input),location=findLocation(original);
  const nearby=/\b(?:near me|around me|close to me|in my area|in my location|nearby|around here)\b/i.test(original);
  const preferences=PREFERENCES.filter(([,pattern])=>pattern.test(original)).map(([name])=>name);
  const brand=brandFor(original),rule=ruleFor(original);
  let base=rule?categoryQuery(rule,original,brand):'';
  if(!base){
    base=original.replace(/^[\s,.;!?-]+|[\s,.;!?-]+$/g,'');
    base=base.replace(/^(?:hey[, ]+)?(?:please\s+)?(?:where can i find|where is|how do i get to|can you find|could you find|show me|find me|find|show|search for|search|look for|i am looking for|i'm looking for|looking for|i need|i want|take me to|navigate to)\s+/i,'');
    base=base.replace(/\b(?:near me|around me|close to me|in my area|in my location|nearby|around here|please|the nearest|nearest|closest|best|top rated|famous|popular|recommended|recommend|some|a few|any|somewhere|something|nice place to|place to|good place to|right now|currently open|open now|open|affordable|cheap|budget friendly|budget-friendly|inexpensive|low cost|with parking|parking available|family friendly|family-friendly|wheelchair accessible)\b/ig,' ');
    base=base.replace(/\s+/g,' ').replace(/^[\s,.;!?-]+|[\s,.;!?-]+$/g,'');
  }
  if(!base||base.length<2)base=original;
  if(location&&!base.toLowerCase().includes(location.toLowerCase()))base+=' in '+location;
  else if(nearby&&!/\b(?:near me|nearby|around me)\b/i.test(base))base+=' near me';
  else if(!location&&!nearby&&/\b(?:in|near|around|within)\s+$/i.test(original))base=original;
  base=normalise(base).slice(0,120);
  return {original,searchQuery:base,category:rule?{id:rule.id,title:rule.title,icon:rule.icon}:null,location,nearby,preferences,brand,explanation:base,source:'local-rules'};
}

let generator=null,loading=null,enabled=false,lastError='';
export const isLocalAIEnabled=()=>enabled;
export const getLocalAIStatus=()=>({enabled,ready:Boolean(generator),loading:Boolean(loading),error:lastError});

async function loadPipeline(onProgress=()=>{}){
  if(generator)return generator;
  if(loading)return loading;
  loading=(async()=>{
    const lib=await import(RUNTIME_URL);
    if(lib.env){lib.env.allowLocalModels=false;lib.env.allowRemoteModels=true;lib.env.useBrowserCache=true}
    if(typeof lib.pipeline!=='function')throw new Error('Local model runtime has no text-generation pipeline.');
    const progress=info=>{try{onProgress(info||{})}catch{}};
    let instance;
    try{instance=await lib.pipeline('text-generation',MODEL_ID,{dtype:'q4',device:typeof navigator!=='undefined'&&navigator.gpu?'webgpu':'wasm',progress_callback:progress})}
    catch(error){if(!(typeof navigator!=='undefined'&&navigator.gpu))throw error;progress({status:'fallback',message:'GPU initialization failed; using CPU.'});instance=await lib.pipeline('text-generation',MODEL_ID,{dtype:'q4',device:'wasm',progress_callback:progress})}
    generator=instance;return generator;
  })().catch(error=>{lastError=String(error&&error.message||error||'Model failed').slice(0,220);throw error}).finally(()=>{loading=null});
  return loading;
}
export async function enableLocalAI(onProgress){lastError='';await loadPipeline(onProgress);enabled=true;return getLocalAIStatus()}
export function disableLocalAI(){enabled=false;return getLocalAIStatus()}

function generatedText(output){
  const value=Array.isArray(output)?output[0]?.generated_text:output?.generated_text;
  if(Array.isArray(value)){const last=value[value.length-1];return typeof last?.content==='string'?last.content:''}
  return typeof value==='string'?value:'';
}
function parseJSON(text){const match=String(text||'').match(/\{[\s\S]*\}/);if(!match)return null;try{return JSON.parse(match[0])}catch{return null}}

export async function interpretWithLocalModel(query){
  const fallback=understandMapQuery(query);if(!enabled)return fallback;
  const model=await loadPipeline();
  const messages=[
    {role:'system',content:'You interpret search requests for a map, you do not answer them. Convert natural wording into one short query suitable for place geocoding and OpenStreetMap search. Preserve exact brand names and any named city or locality. Map intent synonyms to searchable categories: cash withdrawal=ATMs, vegetarian dinner=vegetarian restaurants, places for kids=playgrounds and parks. Never invent businesses, coordinates, addresses, ratings or hours. Return only JSON: {"search_query":"short search phrase" }.'},
    {role:'user',content:'Interpret this map query: '+normalise(query)}
  ];
  const output=await model(messages,{max_new_tokens:90,do_sample:false,return_full_text:false});
  const parsed=parseJSON(generatedText(output));
  let candidate=normalise(parsed?.search_query||'');
  if(candidate.length<2||candidate.length>110||/^(?:here are|you can|i recommend|the best place)/i.test(candidate))candidate=fallback.searchQuery;
  if(fallback.location&&!candidate.toLowerCase().includes(fallback.location.toLowerCase()))candidate+=' in '+fallback.location;
  if(fallback.nearby&&!/\b(?:near me|around me|nearby)\b/i.test(candidate))candidate+=' near me';
  candidate=normalise(candidate).slice(0,120);
  return {...fallback,searchQuery:candidate||fallback.searchQuery,explanation:candidate||fallback.explanation,source:candidate&&candidate!==fallback.searchQuery?'on-device-model':'local-rules',modelUsed:true};
}
