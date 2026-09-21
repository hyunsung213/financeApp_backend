# Finance Backend MVP

20~30대 사용자를 위한 수기 입력 중심의 가계부/개인 소비관리 REST API입니다. Transaction을 단일 원천으로 사용하고, Home과 Report가 같은 `CONFIRMED` 거래를 재계산합니다.

## 기술 스택

Node.js, TypeScript, Express 5, Sequelize 6, PostgreSQL/Supabase, Supabase Auth, Zod, Jest.

프론트엔드 연동 명세는 [API_SPEC.md](./API_SPEC.md)를 참고하세요.

## 폴더 구조

```text
src/
  config/ middleware/ controllers/ routes/ services/ validators/ utils/ models/
  app.ts server.ts seed.ts dbSync.ts
tests/dailyBudgetService.test.ts
```

## 실행

1. `.env.example`을 참고해 `.env`를 설정합니다. `DATABASE_URL`은 `DATABASE_URL=...` 형식으로 작성해야 합니다.
2. Express + Sequelize 장기 실행 백엔드는 Supabase Session Pooler `5432` 연결을 사용합니다.
3. `npm install` 후 `npm run db:sync`로 Sequelize 모델을 DB 테이블에 동기화합니다. 운영 환경에서는 별도 migration 도구 사용을 권장합니다.
4. `npm run seed`로 개발용 샘플 데이터를 넣습니다. `[SEED]` 정책은 mock 데이터입니다. seed는 전용 사용자 데이터를 재생성하므로 반복 실행해도 같은 시나리오를 확인할 수 있습니다.
5. `npm run dev`로 `http://localhost:4000`에서 실행합니다. Android Emulator에서는 `http://10.0.2.2:4000`을 사용합니다.
6. `npm test`, `npm run typecheck`, `npm run build`로 검증합니다.

청년정책 동기화를 사용하려면 `.env`에 `YOUTH_POLICY_API_KEY`를 설정합니다. 서버가 실행 중이면 기본적으로 한국시간 매일 오후 6시에 지역·나이 필터 없이 전체 정책을 동기화합니다. 이미 저장된 정책은 원문만 갱신하고, 새로 추가된 정책에만 `GEMINI_API_KEY`로 카드용 AI 문구를 생성합니다. AI 키가 없거나 호출에 실패하면 원문 기반 fallback 문구를 사용합니다. API 키는 백엔드에서만 사용하며 프론트엔드로 전달하지 않습니다. 공식 API 주소는 `YOUTH_POLICY_API_URL`로 변경할 수 있습니다. `POLICY_SYNC_SCHEDULER_ENABLED=false`로 스케줄러를 끌 수 있고, `POLICY_SYNC_CRON`, `POLICY_SYNC_TIMEZONE`, `POLICY_SYNC_PAGE_SIZE`로 실행 시간을 조정할 수 있습니다.

사용자 맞춤 정책은 `PUT /api/profile`로 나이와 거주지역을 저장한 뒤 `GET /api/policies/recommended`로 조회합니다. 개발용 seed 사용자는 기본값으로 25세·광주가 저장됩니다.

`DB_SSL=true`가 기본값이며, `pg` 드라이버에 TLS를 요구하면서 로컬 인증서 검증은 비활성화한 설정을 사용합니다. 운영 환경에서는 Supabase CA 인증서를 내려받아 `rejectUnauthorized: true`와 root certificate를 설정하세요.

개발 중 로그인 없이 API를 호출하려면 `.env`에서 `DEV_AUTH_BYPASS=true`로 설정합니다. 이 옵션은 `NODE_ENV=production`에서는 무시되며, 개발용 seed 사용자(`seed@example.local`)로 요청을 처리합니다. 운영 배포 전 반드시 `DEV_AUTH_BYPASS=false`로 설정하세요.

현재 seed 시나리오의 기준값은 월급 2,500,000원, 유연 지출 예산 1,000,000원, 최근 7일 확정 유연 지출 138,600원, 예정 고정비 50,000원입니다. 최근 7일은 식비·교통·생활·건강 항목으로 구성되며, 하루 지출 합계는 50,000원 이하입니다. 따라서 `GET /api/home`에서 현재 날짜 기준 남은 유연 예산은 811,400원으로 계산되어야 합니다. seed 거래는 현실적인 지출 내역만 포함하며 수입·저축 이체 거래는 만들지 않습니다.

## 주요 API

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | 헬스 체크 |
| GET | `/api/home` | 오늘 권장 소비액, 남은 예산, pace, 추가 저축 예상 |
| GET/PUT | `/api/finance/setting` | 월급/월급일 설정 |
| GET/POST/PATCH | `/api/finance/allocations` | 예산 배분 |
| POST/GET/PATCH/DELETE | `/api/transactions` | 거래 CRUD 및 필터 |
| GET | `/api/reports/summary` | 수입/지출/저축/투자 요약 |
| GET | `/api/reports/daily` | 일별 수입·지출/권장액/차이 및 무지출 일수 |
| GET | `/api/reports/monthly` | 월별 추이 |
| GET | `/api/reports/categories` | 카테고리 통계 |
| GET | `/api/reports/pace` | 현재 소비속도 |
| GET/POST | `/api/fixed-expenses` | 고정지출 및 occurrence |
| POST | `/api/notifications` | Android 금융 알림 수신 및 카드 승인 자동 거래 등록 |
| GET | `/api/policies` | 정책 검색/필터 |
| POST | `/api/policies/sync` | 전체 정책 동기화 및 신규 정책 카드 문구 생성 |
| POST | `/api/policies/:id/enrich` | 특정 정책 카드 문구 재생성 |
| POST | `/api/policies/enrich-all` | 저장된 전체 정책 카드 문구 일괄 생성 |
| POST/DELETE | `/api/policies/:id/bookmark` | 관심 정책 등록/삭제 |
| GET | `/api/policies/bookmarks` | 관심 정책 및 마감일 요약 조회 |
| GET | `/api/categories` | 현재 사용자에게 적용되는 카테고리 평면 목록 |
| GET | `/api/categories/tree` | 대분류·중분류 트리 조회 |
| POST | `/api/categories` | 사용자 대분류·중분류 생성 |
| PATCH | `/api/categories/:id` | 사용자 카테고리 수정 또는 시스템 카테고리 사용자별 override |
| DELETE | `/api/categories/:id` | 현재 사용자 기준 카테고리 비활성화 |

## Daily Budget 계산

```text
flexibleBudget = salarySnapshot × FLEXIBLE percentage
remainingFlexible = flexibleBudget
  - confirmed flexible expense
  - non-flexible budget overage
  - unpaid scheduled fixed expense
todayRecommended = max(0, floor(remainingFlexible / 오늘 포함 남은 일수))
remainingToday = todayRecommended - 오늘의 확정 지출
```

`remainingToday`는 오늘 권장액을 초과하면 음수가 될 수 있습니다. `todayRecommended` 자체는 음수가 되지 않습니다.

`PENDING`와 `EXCLUDED`는 공식 통계에서 제외합니다. 고정지출 occurrence가 실제 Transaction에 매칭되면 occurrence가 `PAID`가 되어 예정금과 실제 거래가 이중 차감되지 않습니다.

## Sequelize 모델

`src/models/index.ts`에 User, UserFinanceSetting, BudgetAllocation, BudgetCycle, BudgetCycleAllocation, Category, Transaction, FixedExpense, FixedExpenseOccurrence, NotificationInbox, Policy, PolicyBookmark, PolicyCalendarEvent 모델과 관계를 정의했습니다. 금액은 PostgreSQL `BIGINT`, allocation percentage는 `DECIMAL(5,2)`로 저장합니다.

## 보안

Supabase JWT의 user id를 서버에서 사용하며 클라이언트가 전달한 userId는 신뢰하지 않습니다. 실제 DB 비밀번호는 `.env`에만 저장하고 `.env.example`이나 Git에 커밋하지 마세요.
