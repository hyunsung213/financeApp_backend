import { CATEGORY_CATALOG } from '../src/constants/categoryCatalog';

test('expense catalog exposes the agreed top-level categories and children', () => {
  const expense = CATEGORY_CATALOG.filter((category) => category.type === 'EXPENSE' && category.isActive !== false);
  const byName = new Map(expense.map((category) => [category.name, category]));
  const expected: Record<string, string[]> = {
    식비: ['식사', '배달', '카페', '간식', '술', '편의점'],
    교통: ['대중교통', '택시', '기차·버스', '주유', '주차', '차량관리'],
    생활: ['생필품', '마트·장보기', '통신비', '공과금', '주거비', '구독'],
    쇼핑: ['의류', '신발·잡화', '화장품·미용', '전자기기', '가구·인테리어', '기타쇼핑'],
    '여가·문화': ['영화·공연', '게임', '취미', '여행', '스포츠', '콘텐츠'],
    건강: ['병원', '약국', '운동', '건강관리'],
    '교육·자기계발': ['도서', '강의', '학원', '자격증', '학비'],
    '모임·관계': ['친구·모임', '데이트', '선물', '경조사', '회비'],
    금융: ['수수료', '이자', '세금', '보험', '대출상환'],
    기타: ['기타지출', '미분류'],
  };

  for (const [parentName, childNames] of Object.entries(expected)) {
    const parent = byName.get(parentName);
    expect(parent).toBeDefined();
    expect(parent?.parentCategoryId).toBeUndefined();
    expect(childNames.map((name) => byName.get(name)?.parentCategoryId)).toEqual(childNames.map(() => parent?.id));
  }
});

test('every catalog id is stable and the hierarchy is limited to two levels', () => {
  const ids = CATEGORY_CATALOG.map((category) => category.id);
  expect(new Set(ids).size).toBe(ids.length);

  const byId = new Map(CATEGORY_CATALOG.map((category) => [category.id, category]));
  for (const category of CATEGORY_CATALOG) {
    if (category.parentCategoryId) expect(byId.get(category.parentCategoryId)?.parentCategoryId).toBeUndefined();
  }
});
