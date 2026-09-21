jest.mock('../src/services/policyPresentationService', () => {
  const actual = jest.requireActual('../src/services/policyPresentationService');
  return { ...actual, generatePolicyPresentation: jest.fn() };
});

jest.mock('../src/services/youthPolicyApiService', () => ({
  fetchYouthPolicies: jest.fn(),
}));

import { Policy } from '../src/models';
import { PolicyService } from '../src/services/policyService';
import { generatePolicyPresentation } from '../src/services/policyPresentationService';
import { fetchYouthPolicies } from '../src/services/youthPolicyApiService';

test('fetches every page and generates presentation only for newly inserted policies', async () => {
  const firstStored = { update: jest.fn().mockResolvedValue(undefined) };
  const existingStored = { update: jest.fn().mockResolvedValue(undefined) };
  jest.spyOn(Policy, 'findOrCreate')
    .mockResolvedValueOnce([firstStored, true] as any)
    .mockResolvedValueOnce([existingStored, false] as any);
  (fetchYouthPolicies as jest.Mock)
    .mockResolvedValueOnce({ pageIndex: 1, display: 1, totalCount: 2, items: [{ polyBizSecd: 'NEW-1', plcyNm: '새 정책', plcyExplnCn: '새 정책 설명' }] })
    .mockResolvedValueOnce({ pageIndex: 2, display: 1, totalCount: 2, items: [{ polyBizSecd: 'OLD-1', plcyNm: '기존 정책', plcyExplnCn: '기존 정책 설명' }] });
  (generatePolicyPresentation as jest.Mock).mockResolvedValue({
    provider: 'GEMINI',
    presentation: { badgeText: '청년정책 PICK', headline: '새 정책', summary: '요약', targetText: '전국', benefitText: '지원', applicationText: '신청', categoryText: '기타' },
  });

  const result = await new PolicyService().syncAllFromYouthPolicyApi({ display: 1 });

  expect(fetchYouthPolicies).toHaveBeenCalledTimes(2);
  expect(fetchYouthPolicies).toHaveBeenNthCalledWith(1, { pageIndex: 1, display: 1 });
  expect(fetchYouthPolicies).toHaveBeenNthCalledWith(2, { pageIndex: 2, display: 1 });
  expect(generatePolicyPresentation).toHaveBeenCalledTimes(1);
  expect(firstStored.update).toHaveBeenCalledTimes(1);
  expect(existingStored.update).toHaveBeenCalledTimes(1);
  expect(existingStored.update.mock.calls[0][0]).not.toHaveProperty('presentation');
  expect(result).toMatchObject({ pagesFetched: 2, fetchedCount: 2, insertedCount: 1, updatedCount: 1, skippedCount: 0 });

  jest.restoreAllMocks();
});
