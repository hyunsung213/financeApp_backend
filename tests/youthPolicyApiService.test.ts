import { fetchYouthPolicies, parseYouthPolicyPayload } from '../src/services/youthPolicyApiService';

test('parses the Youth Center XML policy response', () => {
  const result = parseYouthPolicyPayload(
    '<response><totalCnt>1</totalCnt><youthPolicy><polyBizSecd>POLICY-1</polyBizSecd><plcyNm>청년 취업 지원</plcyNm></youthPolicy></response>',
    'application/xml',
    { pageIndex: 1, display: 20 },
  );

  expect(result.totalCount).toBe(1);
  expect(result.items).toEqual([{ polyBizSecd: 'POLICY-1', plcyNm: '청년 취업 지원' }]);
});

test('parses a JSON policy response as a fallback', () => {
  const result = parseYouthPolicyPayload(
    JSON.stringify({ result: { totalCnt: 1, youthPolicy: [{ polyBizSecd: 'POLICY-2', plcyNm: '청년 주거 지원' }] } }),
    'application/json',
    { pageIndex: 2, display: 10 },
  );

  expect(result.pageIndex).toBe(2);
  expect(result.items[0]?.polyBizSecd).toBe('POLICY-2');
});

test('retries a temporary upstream server error', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response('temporary failure', { status: 500 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ result: { pagging: { totCount: 1 }, youthPolicyList: [{ polyBizSecd: 'POLICY-3', plcyNm: '재시도 정책' }] } }), { status: 200, headers: { 'content-type': 'application/json' } }));

  const result = await fetchYouthPolicies({ pageIndex: 1, display: 1 });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({ totalCount: 1, pageIndex: 1, display: 1 });
  fetchMock.mockRestore();
});
