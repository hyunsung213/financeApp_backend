import { Op } from 'sequelize';
import { Policy, PolicyBookmark, User } from '../models';
import { AppError, notFound } from '../utils/errors';
import { newId } from '../utils/ids';
import { fetchYouthPolicies, type YouthPolicySearchParams } from './youthPolicyApiService';

const first = (record: Record<string, unknown>, aliases: string[]) => {
  const wanted = new Set(aliases.map((alias) => alias.replace(/[_-]/g, '').toLowerCase()));
  for (const [key, value] of Object.entries(record)) {
    if (!wanted.has(key.replace(/[_-]/g, '').toLowerCase())) continue;
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>)['#text'] === 'string') return String((value as Record<string, unknown>)['#text']).trim();
  }
  return '';
};

const numberFrom = (record: Record<string, unknown>, aliases: string[]) => {
  const value = first(record, aliases).replace(/,/g, '').match(/\d+/)?.[0];
  return value && Number(value) > 0 ? Number(value) : null;
};

const dateFrom = (record: Record<string, unknown>, aliases: string[], index = 0) => {
  const value = first(record, aliases);
  const matches = [...value.matchAll(/(\d{4})\D?(\d{2})\D?(\d{2})/g)];
  const match = matches[index];
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const shortText = (value: string, maxLength: number) => value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

const providerTypeFrom = (record: Record<string, unknown>): 'GOVERNMENT' | 'LOCAL_GOVERNMENT' | 'PUBLIC' | 'PRIVATE' => {
  const value = first(record, ['providerType', 'providerTypeName', 'plcyPvsnMthd', 'operInstNm', 'operInstCdNm', 'sprvsnInstCdNm', 'provider']);
  if (/지자체|지방|시청|도청|구청|군청|광역/.test(value)) return 'LOCAL_GOVERNMENT';
  if (/민간|기업|은행|카드|사기업/.test(value)) return 'PRIVATE';
  if (/정부|국가|중앙|고용노동부|보건복지부|국토교통부/.test(value)) return 'GOVERNMENT';
  return 'PUBLIC';
};

const mapPolicy = (record: Record<string, unknown>) => {
  const externalId = first(record, ['polyBizSecd', 'policyId', 'policy_id', 'id', 'plcyNo']);
  const title = first(record, ['plcyNm', 'title', 'policyName']);
  if (!externalId || !title) return null;
  const sourceUrl = first(record, ['refUrlAddr1', 'refUrlAddr2', 'refUrl', 'sourceUrl', 'plcyDtlUrl', 'detailUrl']) || `https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/${encodeURIComponent(externalId)}`;
  const applicationUrl = first(record, ['aplyUrlAddr', 'aplyUrl', 'applicationUrl', 'applyUrl']) || sourceUrl;
  const description = first(record, ['plcyExplnCn', 'description', 'detail', 'plcySprtCn']) || title;
  return {
    id: `youthcenter-${externalId}`,
    title: shortText(title, 255),
    provider: shortText(first(record, ['operInstNm', 'operInstCdNm', 'sprvsnInstCdNm', 'sprtInstNm', 'provider', 'pvsnInstNm']) || '온통청년', 255),
    providerType: providerTypeFrom(record),
    category: shortText(first(record, ['lclsfNm', 'mclsfNm', 'plcyTpNm', 'plcyFldNm', 'bizTyNm', 'category']) || '기타', 255),
    summary: shortText(first(record, ['plcySprtCn', 'summary', 'plcyExplnCn']) || description, 255),
    description,
    ageMin: numberFrom(record, ['sprtTrgtMinAge', 'sprtTrgtAgeL', 'ageMin', 'minAge']),
    ageMax: numberFrom(record, ['sprtTrgtMaxAge', 'sprtTrgtAgeU', 'ageMax', 'maxAge']),
    region: shortText(first(record, ['sprtTrgtLocal', 'region', 'rgion', 'area', 'rgtrInstCdNm', 'rgtrUpInstCdNm']) || '전국', 255),
    applicationStartDate: dateFrom(record, ['aplyStartDate', 'applicationStartDate', 'aplyYmdStart', 'aplyYmd'], 0),
    applicationEndDate: dateFrom(record, ['aplyEndDate', 'applicationEndDate', 'aplyYmdEnd', 'aplyYmd'], 1),
    applicationUrl,
    sourceUrl,
    dataCollectedAt: new Date(),
  };
};

const regionGroups = [
  ['서울', '서울특별시'], ['부산', '부산광역시'], ['대구', '대구광역시'], ['인천', '인천광역시'],
  ['광주', '광주광역시', '전남광주통합특별시'], ['대전', '대전광역시'], ['울산', '울산광역시'], ['세종', '세종특별자치시'],
  ['경기', '경기도'], ['강원', '강원도', '강원특별자치도'], ['충북', '충청북도'], ['충남', '충청남도'],
  ['전북', '전라북도', '전북특별자치도'], ['전남', '전라남도', '전남광주통합특별시'], ['경북', '경상북도'], ['경남', '경상남도'], ['제주', '제주도', '제주특별자치도'],
];

const compactRegion = (value: string) => value.replace(/\s+/g, '').toLowerCase();
const regionMatches = (policyRegion: string | null, userRegion: string) => {
  if (!policyRegion || compactRegion(policyRegion).includes('전국')) return true;
  const policy = compactRegion(policyRegion); const user = compactRegion(userRegion);
  if (policy.includes(user) || user.includes(policy)) return true;
  return regionGroups.some((group) => group.some((alias) => policy.includes(compactRegion(alias))) && group.some((alias) => user.includes(compactRegion(alias))));
};

export class PolicyService {
  async list(filters: { category?: string; region?: string; age?: number; providerType?: string; keyword?: string; applicationStatus?: 'OPEN' | 'CLOSED' }) {
    const today = new Date().toISOString().slice(0, 10); const where: any = {};
    if (filters.category) where.category = filters.category;
    if (filters.region) where.region = filters.region;
    if (filters.providerType) where.providerType = filters.providerType;
    if (filters.keyword) where[Op.or] = [{ title: { [Op.iLike]: `%${filters.keyword}%` } }, { summary: { [Op.iLike]: `%${filters.keyword}%` } }];
    if (filters.age !== undefined) where[Op.and] = [{ [Op.or]: [{ ageMin: null }, { ageMin: { [Op.lte]: filters.age } }] }, { [Op.or]: [{ ageMax: null }, { ageMax: { [Op.gte]: filters.age } }] }];
    if (filters.applicationStatus === 'OPEN') where[Op.or] = [{ applicationEndDate: null }, { applicationEndDate: { [Op.gte]: today } }];
    if (filters.applicationStatus === 'CLOSED') where.applicationEndDate = { [Op.lt]: today };
    return Policy.findAll({ where, order: [['updatedAt', 'DESC']] });
  }

  async get(id: string) { const policy = await Policy.findByPk(id); if (!policy) throw notFound('Policy not found'); return policy; }
  async recommended(userId: string) {
    const user = await User.findByPk(userId, { attributes: ['age', 'region'] });
    if (user?.age === null || user?.age === undefined || !user.region) throw new AppError('PROFILE_REQUIRED', 'Age and region must be saved before requesting recommendations', 409);
    const policies = await Policy.findAll({
      where: {
        [Op.and]: [
          { [Op.or]: [{ ageMin: null }, { ageMin: 0 }, { ageMin: { [Op.lte]: Number(user.age) } }] },
          { [Op.or]: [{ ageMax: null }, { ageMax: 0 }, { ageMax: { [Op.gte]: Number(user.age) } }] },
        ],
      },
      order: [['updatedAt', 'DESC']],
    });
    const matched = policies.filter((policy: any) => regionMatches(policy.region, user.region));
    return { profile: { age: Number(user.age), region: user.region }, policies: matched };
  }
  async syncFromYouthPolicyApi(params: YouthPolicySearchParams = {}) {
    const result = await fetchYouthPolicies(params);
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    for (const raw of result.items) {
      const policy = mapPolicy(raw);
      if (!policy) { skippedCount++; continue; }
      const exists = await Policy.findByPk(policy.id, { attributes: ['id'] });
      await Policy.upsert(policy);
      if (exists) updatedCount++; else insertedCount++;
    }
    return { source: 'YOUTH_CENTER', pageIndex: result.pageIndex, display: result.display, fetchedCount: result.items.length, totalCount: result.totalCount, insertedCount, updatedCount, skippedCount };
  }
  async bookmark(userId: string, policyId: string) { await this.get(policyId); const [bookmark] = await PolicyBookmark.findOrCreate({ where: { userId, policyId }, defaults: { id: newId(), userId, policyId } }); return bookmark; }
  async removeBookmark(userId: string, policyId: string) { await PolicyBookmark.destroy({ where: { userId, policyId } }); }
  async bookmarks(userId: string) { return PolicyBookmark.findAll({ where: { userId }, include: [{ model: Policy, as: 'policy' }], order: [['createdAt', 'DESC']] }); }
}
