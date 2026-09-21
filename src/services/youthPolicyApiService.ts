import { XMLParser } from 'fast-xml-parser';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

export type YouthPolicySearchParams = {
  pageIndex?: number;
  display?: number;
};

export type YouthPolicyApiResult = {
  items: Array<Record<string, unknown>>;
  totalCount: number | null;
  pageIndex: number;
  display: number;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

const policyKeys = ['polyBizSecd', 'plcyNo', 'plcyNm', 'policyId', 'policy_id', 'id', 'title'];
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const maxUpstreamAttempts = 5;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeKey = (key: string) => key.replace(/[_-]/g, '').toLowerCase();

const hasPolicyField = (value: Record<string, unknown>) => {
  const keys = new Set(Object.keys(value).map(normalizeKey));
  return policyKeys.some((key) => keys.has(normalizeKey(key)));
};

const collectPolicyRecords = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.flatMap(collectPolicyRecords);
  if (!isRecord(value)) return [];
  if (hasPolicyField(value)) return [value];
  return Object.values(value).flatMap(collectPolicyRecords);
};

const readValue = (record: Record<string, unknown>, aliases: string[]): string | undefined => {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(record)) {
    if (!wanted.has(normalizeKey(key))) continue;
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || undefined;
    if (isRecord(value) && typeof value['#text'] === 'string') return value['#text'].trim() || undefined;
  }
  return undefined;
};

const readNumber = (record: Record<string, unknown>, aliases: string[]) => {
  const value = readValue(record, aliases);
  if (!value) return undefined;
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

const readDate = (record: Record<string, unknown>, aliases: string[]) => {
  const value = readValue(record, aliases);
  if (!value) return undefined;
  const match = value.match(/(\d{4})\D?(\d{2})\D?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
};

const parsePayload = (body: string, contentType: string | null): Record<string, unknown> => {
  const trimmed = body.trim();
  if (!trimmed) throw new AppError('YOUTH_POLICY_API_EMPTY_RESPONSE', 'Youth policy API returned an empty response', 502);
  try {
    if (contentType?.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed) as Record<string, unknown>;
    return parser.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new AppError('YOUTH_POLICY_API_INVALID_RESPONSE', 'Youth policy API returned an invalid response', 502);
  }
};

export function parseYouthPolicyPayload(body: string, contentType: string | null, params: Required<Pick<YouthPolicySearchParams, 'pageIndex' | 'display'>>): YouthPolicyApiResult {
  const payload = parsePayload(body, contentType);
  const items = collectPolicyRecords(payload);
  const totalValue = collectScalarValues(payload, ['totalCnt', 'totalCount', 'totCount', 'total', 'totCnt', 'count']).find((value) => /^\d+$/.test(value));
  return { items, totalCount: totalValue ? Number(totalValue) : null, pageIndex: params.pageIndex, display: params.display };
}

const collectScalarValues = (value: unknown, aliases: string[]): string[] => {
  if (Array.isArray(value)) return value.flatMap((item) => collectScalarValues(item, aliases));
  if (!isRecord(value)) return [];
  const result: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (aliases.map(normalizeKey).includes(normalizeKey(key)) && (typeof child === 'string' || typeof child === 'number')) result.push(String(child));
    else result.push(...collectScalarValues(child, aliases));
  }
  return result;
};

export async function fetchYouthPolicies(params: YouthPolicySearchParams = {}): Promise<YouthPolicyApiResult> {
  const pageIndex = params.pageIndex ?? 1;
  const display = params.display ?? 20;
  const url = new URL(env.YOUTH_POLICY_API_URL);
  const query = new URLSearchParams({ apiKeyNm: env.YOUTH_POLICY_API_KEY, pageNum: String(pageIndex), pageSize: String(display) });
  url.search = query.toString();

  for (let attempt = 1; attempt <= maxUpstreamAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { redirect: 'manual', headers: { Accept: 'application/xml, text/xml, application/json' } });
    } catch {
      if (attempt === maxUpstreamAttempts) throw new AppError('YOUTH_POLICY_API_UNAVAILABLE', `Youth policy API is unavailable for page ${pageIndex}`, 502);
      await sleep(attempt * 500);
      continue;
    }
    if (response.status >= 300 && response.status < 400) throw new AppError('YOUTH_POLICY_API_REDIRECT', 'Youth policy API redirected the request; refusing an insecure redirect', 502);
    if (response.ok) return parseYouthPolicyPayload(await response.text(), response.headers.get('content-type'), { pageIndex, display });
    if ((response.status === 400 || response.status === 429 || response.status >= 500) && attempt < maxUpstreamAttempts) {
      await sleep(attempt * 500);
      continue;
    }
    throw new AppError('YOUTH_POLICY_API_ERROR', `Youth policy API request failed for page ${pageIndex} with status ${response.status}`, 502);
  }
  throw new AppError('YOUTH_POLICY_API_UNAVAILABLE', 'Youth policy API is unavailable', 502);
}
