export type QuantityKind = 'weight' | 'duration' | 'exerciseFrequency';
export const quantityUnits = {weight:'kg',duration:'分钟',exerciseFrequency:'次/周'} as const;
/** No default unit for legacy free text: a bare number is ambiguous. */
export function normalizeQuantity(value: unknown, kind: QuantityKind): string | null {
  if(value===undefined || value===null || value==='')return '';
  if(typeof value!=='string')return null;
  const s=value.trim().toLowerCase().replace(/\s+/g,'');
  let match:RegExpMatchArray|null=null, factor=1;
  if(kind==='weight'){
    match=s.match(/^(\d+(?:\.\d+)?)(kg|公斤|千克|斤|g|克)$/);
    if(match)factor=match[2]==='斤'?.5:['g','克'].includes(match[2])?.001:1;
  }else if(kind==='duration'){
    match=s.match(/^(\d+(?:\.\d+)?)(分钟|分|min|小时|h)$/);
    if(match)factor=['小时','h'].includes(match[2])?60:1;
  }else{
    match=s.match(/^(\d+)(次\/周|次每周)$/)??s.match(/^(?:每周|本周)(\d+)次$/);
  }
  if(!match)return null;
  const number=Number(match[1])*factor;
  if(!Number.isFinite(number)||number<0)return null;
  return `${Number(number.toFixed(6))}${quantityUnits[kind]}`;
}
