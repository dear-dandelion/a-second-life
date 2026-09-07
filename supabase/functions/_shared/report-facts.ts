// Report text describes observations, not inferred disease duration or treatment status.
export function frequencySummary(entries: Array<{ frequency_count?: unknown }>): string {
  const counts = entries.map(item => item.frequency_count).filter(
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0,
  );
  if (!counts.length) return '未记录明确发作次数';
  return `${counts.length} 条有明确次数的记录：${Math.min(...counts)}—${Math.max(...counts)} 次（按原记录，未折算每日频次）`;
}

export function medicationObservation(action: unknown, date: string): string {
  const observed = action === '停用' ? '停用' : action === '漏服' ? '漏服' : action === '服用' ? '服用' : '用药情况';
  return `${date} 记录${observed}；当前用药情况待确认`;
}

export function latestMedicalNeed(records: Array<{ record_date: string; medical_needs?: unknown }>): string {
  return [...records].sort((a, b) => b.record_date.localeCompare(a.record_date))
    .map(item => typeof item.medical_needs === 'string' ? item.medical_needs.trim() : '')
    .find(Boolean) ?? '';
}
