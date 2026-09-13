import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { dateOnly, parseDateOnly } from '../utils/dates';

export const POLICY_PRESENTATION_VERSION = 'v1';

export type PolicyPresentation = {
  badgeText: string;
  headline: string;
  summary: string;
  targetText: string;
  benefitText: string;
  applicationText: string;
  categoryText: string;
  deadlineLabel?: string | null;
};

type PolicyLike = {
  id?: string;
  title?: string;
  summary?: string;
  description?: string;
  category?: string;
  ageMin?: number | null;
  ageMax?: number | null;
  region?: string | null;
  applicationStartDate?: string | null;
  applicationEndDate?: string | null;
  presentation?: Partial<PolicyPresentation> | null;
};

const aiPresentationSchema = z.object({
  badgeText: z.string().trim().min(1).max(30),
  headline: z.string().trim().min(1).max(90),
  summary: z.string().trim().min(1).max(180),
  targetText: z.string().trim().min(1).max(120),
  benefitText: z.string().trim().min(1).max(180),
  applicationText: z.string().trim().min(1).max(120),
  categoryText: z.string().trim().min(1).max(30),
}).strict();

const shorten = (value: string, maxLength: number) => value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
const valueOf = (value: unknown) => typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();

const categoryBadge = (category: string) => {
  if (/금융|자산|저축|대출/.test(category)) return '청년금융 PICK';
  if (/주거|주택|월세/.test(category)) return '청년주거 PICK';
  if (/취업|일자리|창업|직업/.test(category)) return '청년취업 PICK';
  if (/교육|학자금|훈련/.test(category)) return '청년교육 PICK';
  if (/복지|문화|건강/.test(category)) return '청년복지 PICK';
  return '청년정책 PICK';
};

const targetText = (policy: PolicyLike) => {
  const age = policy.ageMin && policy.ageMax ? `만 ${policy.ageMin}~${policy.ageMax}세` : policy.ageMin ? `만 ${policy.ageMin}세 이상` : policy.ageMax ? `만 ${policy.ageMax}세 이하` : '';
  const region = valueOf(policy.region);
  return [age, region && region !== '전국' ? region : '전국'].filter(Boolean).join(' · ') || '청년 대상';
};

const applicationText = (policy: PolicyLike) => {
  const start = valueOf(policy.applicationStartDate);
  const end = valueOf(policy.applicationEndDate);
  if (start && end) return `신청기간 ${start.replace(/-/g, '.')} ~ ${end.replace(/-/g, '.')} 신청`;
  if (end) return `${end.replace(/-/g, '.')}까지 신청`;
  if (start) return `${start.replace(/-/g, '.')}부터 신청`;
  return '신청기간은 상세 내용을 확인해주세요';
};

export function fallbackPolicyPresentation(policy: PolicyLike): PolicyPresentation {
  const category = valueOf(policy.category) || '청년정책';
  const title = valueOf(policy.title) || '청년을 위한 지원 정책';
  const summary = valueOf(policy.summary) || valueOf(policy.description) || title;
  return {
    badgeText: categoryBadge(category),
    headline: shorten(title, 90),
    summary: shorten(summary, 180),
    targetText: targetText(policy),
    benefitText: shorten(summary, 180),
    applicationText: applicationText(policy),
    categoryText: shorten(category, 30),
  };
}

export function policyPresentationSourceHash(policy: PolicyLike) {
  const source = JSON.stringify({
    title: valueOf(policy.title),
    summary: valueOf(policy.summary),
    description: valueOf(policy.description),
    category: valueOf(policy.category),
    ageMin: policy.ageMin ?? null,
    ageMax: policy.ageMax ?? null,
    region: valueOf(policy.region),
    applicationStartDate: valueOf(policy.applicationStartDate),
    applicationEndDate: valueOf(policy.applicationEndDate),
  });
  return createHash('sha256').update(source).digest('hex');
}

const aiPrompt = (policy: PolicyLike) => `너는 대한민국 청년정책을 앱 카드 UI용 문구로 요약하는 편집자다.
반드시 제공된 정책 원문에 있는 정보만 사용하고, 금액·날짜·연령·대상·지원내용을 추측하거나 새로 만들지 마라.
과장 광고 표현 대신 짧고 자연스러운 한국어를 사용하라.
headline은 카드에서 가장 크게 보일 한 문장으로 90자 이내로 작성하라.
badgeText는 "청년금융 PICK" 같은 짧은 라벨로 작성하라.
applicationText에는 원문 날짜가 있을 때만 날짜를 포함하라.

정책 원문:
${JSON.stringify({
  title: valueOf(policy.title),
  summary: valueOf(policy.summary),
  description: shorten(valueOf(policy.description), 12000),
  category: valueOf(policy.category),
  ageMin: policy.ageMin ?? null,
  ageMax: policy.ageMax ?? null,
  region: valueOf(policy.region),
  applicationStartDate: valueOf(policy.applicationStartDate),
  applicationEndDate: valueOf(policy.applicationEndDate),
})}`;

async function generateWithGemini(policy: PolicyLike): Promise<PolicyPresentation> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: '응답은 지정된 JSON Schema만 따르고 Markdown이나 설명을 추가하지 마라.' }] },
        contents: [{ role: 'user', parts: [{ text: aiPrompt(policy) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              badgeText: { type: 'STRING' },
              headline: { type: 'STRING' },
              summary: { type: 'STRING' },
              targetText: { type: 'STRING' },
              benefitText: { type: 'STRING' },
              applicationText: { type: 'STRING' },
              categoryText: { type: 'STRING' },
            },
            required: ['badgeText', 'headline', 'summary', 'targetText', 'benefitText', 'applicationText', 'categoryText'],
            propertyOrdering: ['badgeText', 'headline', 'summary', 'targetText', 'benefitText', 'applicationText', 'categoryText'],
          },
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 700,
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const outputText = body.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text ?? '').join('').trim();
    if (!outputText) throw new Error('Gemini response did not contain text output');
    return aiPresentationSchema.parse(JSON.parse(outputText));
  } finally {
    clearTimeout(timeout);
  }
}

export async function generatePolicyPresentation(policy: PolicyLike) {
  if (!env.GEMINI_API_KEY) return { presentation: fallbackPolicyPresentation(policy), provider: 'FALLBACK' as const };
  try {
    return { presentation: await generateWithGemini(policy), provider: 'GEMINI' as const };
  } catch {
    return { presentation: fallbackPolicyPresentation(policy), provider: 'FALLBACK' as const };
  }
}

export function deadlineLabel(applicationEndDate: string | null | undefined, today = new Date()) {
  if (!applicationEndDate) return null;
  const end = parseDateOnly(applicationEndDate);
  const current = parseDateOnly(dateOnly(today));
  const days = Math.floor((end.getTime() - current.getTime()) / 86400000);
  if (days < 0) return '마감';
  if (days === 0) return 'D-DAY';
  return `D-${days}`;
}

export function withDeadlineLabel(policy: PolicyLike) {
  const presentation = policy.presentation && Object.keys(policy.presentation).length > 0 ? policy.presentation : fallbackPolicyPresentation(policy);
  return { ...presentation, deadlineLabel: deadlineLabel(valueOf(policy.applicationEndDate) || null) };
}
