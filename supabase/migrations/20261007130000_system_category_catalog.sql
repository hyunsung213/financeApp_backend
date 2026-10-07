-- System category catalog (ownerUserId null): the rows transactions, the
-- budget plan, fixed expenses and the notification parser reference by id.
-- Until now only CategoryService wrote them, lazily on its first use, so on a
-- fresh database a transaction or budget plan saved before any category call
-- failed the Transaction_categoryId_fkey check. This inserts the catalog as of
-- src/constants/categoryCatalog.ts with the same values CategoryService writes
-- (it keeps upserting the catalog at runtime, so later catalog changes still
-- reach the database without a new migration).
--
-- Re-runnable: rows are upserted by id; on a database whose catalog already
-- matches (dev, 2026-10-07) nothing changes. User rows are not touched.
-- Rollback: none needed (CategoryService writes the same rows).

insert into public."Category" (id, "ownerUserId", "sourceCategoryId", "parentCategoryId", name, type, "purposeType", "isActive", "sortOrder", "createdAt", "updatedAt")
select id, null, null, parent, name, type::public."enum_Category_type", purpose::public."enum_Category_purposeType", active, sort, now(), now()
from (values
  ('core.saving', null, '저축', 'SAVING', 'SAVING', true, 10),
  ('core.investment', null, '투자', 'SAVING', 'INVESTMENT', true, 20),
  ('core.expense', null, '지출', 'EXPENSE', 'GENERAL', false, 30),
  ('core.income', null, '수입', 'INCOME', 'GENERAL', true, 40),
  ('core.expense.food', null, '식비', 'EXPENSE', 'GENERAL', true, 310),
  ('core.expense.transport', null, '교통', 'EXPENSE', 'GENERAL', true, 320),
  ('core.expense.living', null, '생활', 'EXPENSE', 'GENERAL', true, 330),
  ('core.expense.fixed', null, '고정지출', 'EXPENSE', 'GENERAL', true, 335),
  ('core.expense.shopping', null, '쇼핑', 'EXPENSE', 'GENERAL', true, 340),
  ('core.expense.leisure-culture', null, '여가·문화', 'EXPENSE', 'GENERAL', true, 350),
  ('core.expense.health', null, '건강', 'EXPENSE', 'GENERAL', true, 360),
  ('core.expense.education', null, '교육·자기계발', 'EXPENSE', 'GENERAL', true, 370),
  ('core.expense.relationship', null, '모임·관계', 'EXPENSE', 'GENERAL', true, 380),
  ('core.expense.finance', null, '금융', 'EXPENSE', 'GENERAL', false, 390),
  ('core.expense.other', null, '기타', 'EXPENSE', 'GENERAL', true, 400),
  ('core.saving.emergency-fund', 'core.saving', '비상금', 'SAVING', 'SAVING', true, 110),
  ('core.saving.goal', 'core.saving', '목적성 저축', 'SAVING', 'SAVING', true, 120),
  ('core.saving.installment', 'core.saving', '적금', 'SAVING', 'SAVING', true, 130),
  ('core.saving.deposit', 'core.saving', '예금', 'SAVING', 'SAVING', true, 140),
  ('core.saving.housing', 'core.saving', '주택청약', 'SAVING', 'SAVING', true, 150),
  ('core.saving.pension', 'core.saving', '연금저축', 'SAVING', 'SAVING', true, 160),
  ('core.investment.stock', 'core.investment', '주식', 'SAVING', 'INVESTMENT', true, 210),
  ('core.investment.etf', 'core.investment', 'ETF', 'SAVING', 'INVESTMENT', true, 220),
  ('core.investment.fund', 'core.investment', '펀드', 'SAVING', 'INVESTMENT', true, 230),
  ('core.investment.bond', 'core.investment', '채권', 'SAVING', 'INVESTMENT', true, 240),
  ('core.investment.crypto', 'core.investment', '가상자산', 'SAVING', 'INVESTMENT', true, 250),
  ('core.investment.pension', 'core.investment', '퇴직연금·IRP', 'SAVING', 'INVESTMENT', true, 260),
  ('core.expense.food.meal', 'core.expense.food', '식사', 'EXPENSE', 'GENERAL', true, 311),
  ('core.expense.food.delivery', 'core.expense.food', '배달', 'EXPENSE', 'GENERAL', true, 312),
  ('core.expense.food.cafe', 'core.expense.food', '카페', 'EXPENSE', 'GENERAL', true, 313),
  ('core.expense.food.snack', 'core.expense.food', '간식', 'EXPENSE', 'GENERAL', true, 314),
  ('core.expense.food.alcohol', 'core.expense.food', '술', 'EXPENSE', 'GENERAL', true, 315),
  ('core.expense.food.convenience', 'core.expense.food', '편의점', 'EXPENSE', 'GENERAL', true, 316),
  ('core.expense.transport.public', 'core.expense.transport', '대중교통', 'EXPENSE', 'GENERAL', true, 321),
  ('core.expense.transport.taxi', 'core.expense.transport', '택시', 'EXPENSE', 'GENERAL', true, 322),
  ('core.expense.transport.intercity', 'core.expense.transport', '기차·버스', 'EXPENSE', 'GENERAL', true, 323),
  ('core.expense.transport.fuel', 'core.expense.transport', '주유', 'EXPENSE', 'GENERAL', true, 324),
  ('core.expense.transport.parking', 'core.expense.transport', '주차', 'EXPENSE', 'GENERAL', true, 325),
  ('core.expense.transport.maintenance', 'core.expense.transport', '차량관리', 'EXPENSE', 'GENERAL', true, 326),
  ('core.expense.living.necessities', 'core.expense.living', '생필품', 'EXPENSE', 'GENERAL', true, 331),
  ('core.expense.living.grocery', 'core.expense.living', '마트·장보기', 'EXPENSE', 'GENERAL', true, 332),
  ('core.expense.communication', 'core.expense.fixed', '통신비', 'EXPENSE', 'GENERAL', true, 336),
  ('core.expense.living.utilities', 'core.expense.fixed', '공과금', 'EXPENSE', 'GENERAL', true, 337),
  ('core.expense.housing', 'core.expense.fixed', '주거비', 'EXPENSE', 'GENERAL', true, 338),
  ('core.expense.living.subscription', 'core.expense.fixed', '구독', 'EXPENSE', 'GENERAL', true, 339),
  ('core.expense.shopping.clothing', 'core.expense.shopping', '의류', 'EXPENSE', 'GENERAL', true, 341),
  ('core.expense.shopping.shoes-accessories', 'core.expense.shopping', '신발·잡화', 'EXPENSE', 'GENERAL', true, 342),
  ('core.expense.shopping.beauty', 'core.expense.shopping', '화장품·미용', 'EXPENSE', 'GENERAL', true, 343),
  ('core.expense.shopping.electronics', 'core.expense.shopping', '전자기기', 'EXPENSE', 'GENERAL', true, 344),
  ('core.expense.shopping.furniture', 'core.expense.shopping', '가구·인테리어', 'EXPENSE', 'GENERAL', true, 345),
  ('core.expense.shopping.other', 'core.expense.shopping', '기타쇼핑', 'EXPENSE', 'GENERAL', true, 346),
  ('core.expense.leisure-culture.movie-performance', 'core.expense.leisure-culture', '영화·공연', 'EXPENSE', 'GENERAL', true, 351),
  ('core.expense.leisure-culture.game', 'core.expense.leisure-culture', '게임', 'EXPENSE', 'GENERAL', true, 352),
  ('core.expense.leisure-culture.hobby', 'core.expense.leisure-culture', '취미', 'EXPENSE', 'GENERAL', true, 353),
  ('core.expense.leisure-culture.travel', 'core.expense.leisure-culture', '여행', 'EXPENSE', 'GENERAL', true, 354),
  ('core.expense.leisure-culture.sports', 'core.expense.leisure-culture', '스포츠', 'EXPENSE', 'GENERAL', true, 355),
  ('core.expense.leisure-culture.content', 'core.expense.leisure-culture', '콘텐츠', 'EXPENSE', 'GENERAL', true, 356),
  ('core.expense.health.hospital', 'core.expense.health', '병원', 'EXPENSE', 'GENERAL', true, 361),
  ('core.expense.health.pharmacy', 'core.expense.health', '약국', 'EXPENSE', 'GENERAL', true, 362),
  ('core.expense.health.exercise', 'core.expense.health', '운동', 'EXPENSE', 'GENERAL', true, 363),
  ('core.expense.health.management', 'core.expense.health', '건강관리', 'EXPENSE', 'GENERAL', true, 364),
  ('core.expense.education.book', 'core.expense.education', '도서', 'EXPENSE', 'GENERAL', true, 371),
  ('core.expense.education.lecture', 'core.expense.education', '강의', 'EXPENSE', 'GENERAL', true, 372),
  ('core.expense.education.academy', 'core.expense.education', '학원', 'EXPENSE', 'GENERAL', true, 373),
  ('core.expense.education.certificate', 'core.expense.education', '자격증', 'EXPENSE', 'GENERAL', true, 374),
  ('core.expense.education.tuition', 'core.expense.education', '학비', 'EXPENSE', 'GENERAL', true, 375),
  ('core.expense.relationship.friends', 'core.expense.relationship', '친구·모임', 'EXPENSE', 'GENERAL', true, 381),
  ('core.expense.relationship.date', 'core.expense.relationship', '데이트', 'EXPENSE', 'GENERAL', true, 382),
  ('core.expense.relationship.gift', 'core.expense.relationship', '선물', 'EXPENSE', 'GENERAL', true, 383),
  ('core.expense.relationship.ceremony', 'core.expense.relationship', '경조사', 'EXPENSE', 'GENERAL', true, 384),
  ('core.expense.relationship.membership', 'core.expense.relationship', '회비', 'EXPENSE', 'GENERAL', true, 385),
  ('core.expense.finance.fee', 'core.expense.other', '수수료', 'EXPENSE', 'GENERAL', true, 403),
  ('core.expense.finance.interest', 'core.expense.fixed', '이자', 'EXPENSE', 'GENERAL', true, 340),
  ('core.expense.finance.tax', 'core.expense.fixed', '세금', 'EXPENSE', 'GENERAL', true, 341),
  ('core.expense.insurance-tax', 'core.expense.fixed', '보험', 'EXPENSE', 'GENERAL', true, 342),
  ('core.expense.debt-repayment', 'core.expense.fixed', '대출상환', 'EXPENSE', 'GENERAL', true, 343),
  ('core.expense.other.expense', 'core.expense.other', '기타지출', 'EXPENSE', 'GENERAL', true, 401),
  ('core.expense.unclassified', 'core.expense.other', '미분류', 'EXPENSE', 'GENERAL', true, 402),
  ('core.income.salary', 'core.income', '급여', 'INCOME', 'GENERAL', true, 410)
) as catalog (id, parent, name, type, purpose, active, sort)
on conflict (id) do update set
  "ownerUserId" = null,
  "sourceCategoryId" = null,
  "parentCategoryId" = excluded."parentCategoryId",
  name = excluded.name,
  type = excluded.type,
  "purposeType" = excluded."purposeType",
  "isActive" = excluded."isActive",
  "sortOrder" = excluded."sortOrder",
  "updatedAt" = now()
where (public."Category"."ownerUserId", public."Category"."sourceCategoryId", public."Category"."parentCategoryId", public."Category".name, public."Category".type, public."Category"."purposeType", public."Category"."isActive", public."Category"."sortOrder")
  is distinct from (null::uuid, null::varchar, excluded."parentCategoryId", excluded.name, excluded.type, excluded."purposeType", excluded."isActive", excluded."sortOrder");
