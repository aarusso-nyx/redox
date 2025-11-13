export function lgpdGate(map:{ field:string; table:string; legalBasis:string; retention:string }[]) {
  const missing = map.filter(m => !(m.legalBasis && m.retention));
  if (missing.length) throw new Error(`LGPD map incomplete for ${missing.length} fields`);
}
