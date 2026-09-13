# Finance Backend API Specification

프론트엔드에서 사용하는 Finance Backend MVP API 명세입니다.

## 1. 기본 정보

- Base URL: `http://localhost:4000`
- Content-Type: `application/json`
- 날짜 형식: `YYYY-MM-DD`
- 금액 단위: 원(KRW)
- 기본 사용자 timezone: `Asia/Seoul`

## 2. 인증

Supabase Auth에서 발급받은 access token을 다음 헤더로 전달합니다.

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

다음 API는 인증이 필요합니다.

- `/api/home`
- `/api/finance/*`
- `/api/transactions/*`
- `/api/reports/*`
- `/api/fixed-expenses/*`
- `/api/categories/*`
- `/api/notifications/*`
- `/api/policies/bookmarks`
- `/api/policies/enrich-all`
- `/api/policies/:id/enrich`
- `/api/policies/:id/bookmark`

정책 검색과 정책 상세 조회는 인증 없이 사용할 수 있습니다.

서버는 클라이언트가 전달한 `userId`를 사용하지 않고 JWT의 사용자 ID를 사용합니다.

개발 환경에서 `.env`의 `DEV_AUTH_BYPASS=true`이면 Authorization 헤더 없이도 인증 API를 호출할 수 있습니다. 이때 seed 사용자 ID가 사용됩니다. `NODE_ENV=production`에서는 이 옵션이 항상 비활성화됩니다.

## 3. 공통 응답 형식

성공:

```json
{
  "success": true,
  "data": {}
}
```

실패:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "amount: Too small: expected number to be >0"
  }
}
```

주요 오류 코드:

| HTTP | code | 설명 |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | 요청 body 또는 값 검증 실패 |
| 400 | `INVALID_CATEGORY` | 사용할 수 없는 카테고리 |
| 400 | `UNSUPPORTED_NOTIFICATION_PACKAGE` | 허용되지 않은 Android 알림 패키지 |
| 400 | `EMPTY_NOTIFICATION` | 제목과 본문이 모두 비어 있음 |
| 400 | `INVALID_ALLOCATION_TOTAL` | 활성 예산 배분 합계가 100%가 아님 |
| 401 | `UNAUTHORIZED` | 토큰 누락 또는 만료 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `FINANCE_SETTING_REQUIRED` | 재정 설정이 먼저 필요함 |
| 409 | `DUPLICATE_NOTIFICATION` | 같은 사용자에게 이미 수신된 Android 알림 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

## 4. Health Check

### `GET /health`

인증 없이 서버 상태를 확인합니다.

응답:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

## 5. Home Dashboard

### `GET /api/home`

현재 소비 주기, 오늘 권장 소비액, 남은 예산, 소비속도, 추가 저축 예상액을 한 번에 반환합니다.

응답:

```json
{
  "success": true,
  "data": {
    "salaryDay": 25,
    "nextSalaryDate": "2026-09-25",
    "daysUntilSalary": 18,
    "cycle": {
      "startDate": "2026-08-25",
      "endDate": "2026-09-24"
    },
    "today": {
      "recommendedAmount": 33500,
      "spentAmount": 12000,
      "remainingToday": 21500
    },
    "budget": {
      "remainingFlexibleAmount": 536000,
      "reservedFixedAmount": 80000
    },
    "pace": {
      "status": "UNDER",
      "difference": 70000
    },
    "savingProjection": {
      "potentialExtraSaving": 120000,
      "confidence": "MEDIUM",
      "sampleDays": 6
    }
  }
}
```

`today.remainingToday`는 `recommendedAmount - spentAmount`로 계산되며, 오늘 권장액을 초과해 사용한 경우 음수로 반환될 수 있습니다. 프론트에서는 음수일 때 초과 지출 금액으로 표시하면 됩니다.

`pace.status` 값:

- `UNDER`: 계획보다 적게 소비
- `ON_TRACK`: 계획 범위 내 소비
- `OVER`: 계획보다 많이 소비

`savingProjection.confidence` 값:

- `LOW`: 소비 주기 1~2일
- `MEDIUM`: 소비 주기 3~7일
- `HIGH`: 소비 주기 8일 이상

## 6. 재정 설정

### `GET /api/finance/setting`

응답 예시:

```json
{
  "success": true,
  "data": {
    "userId": "auth-user-uuid",
    "salaryAmount": "3000000",
    "salaryDay": 25,
    "reportingStartDay": 1,
    "createdAt": "2026-08-16T06:00:00.000Z",
    "updatedAt": "2026-08-16T06:00:00.000Z"
  }
}
```

### `PUT /api/finance/setting`

Request body:

```json
{
  "salaryAmount": 3000000,
  "salaryDay": 25,
  "reportingStartDay": 1
}
```

검증:

- `salaryAmount`: 0 이상의 정수
- `salaryDay`: 1~31
- `reportingStartDay`: 1~31

## 7. 예산 배분

### `GET /api/finance/allocations`

사용자의 예산 배분 목록을 반환합니다.

### `POST /api/finance/allocations`

Request body:

```json
{
  "name": "소비",
  "allocationType": "FLEXIBLE",
  "percentage": 30,
  "spendability": "FLEXIBLE",
  "active": true
}
```

`allocationType`:

`SAVING`, `INVESTMENT`, `FIXED_LIVING`, `FLEXIBLE`, `TRANSPORT`, `COMMUNICATION`, `SUBSCRIPTION`, `HOUSING`, `FOOD`, `OTHER`

`spendability`:

- `LOCKED`: 저축/투자처럼 자유 소비에서 제외
- `RESERVED`: 고정지출처럼 예약된 금액
- `FLEXIBLE`: 자유 소비 예산

활성 allocation의 `percentage` 합계는 100이어야 합니다.

> 현재 단건 생성 API는 요청 직후 합계가 100%가 아니면 실패합니다. 최초 예산을 여러 개 입력할 때는 seed를 사용하거나, 프론트에서 향후 bulk allocation API를 사용할 수 있도록 준비해야 합니다.

### `PATCH /api/finance/allocations/:id`

Request body는 `POST` body의 일부 필드만 전달할 수 있습니다.

```json
{
  "percentage": 35,
  "active": true
}
```

## 8. 카테고리

### `GET /api/categories`

시스템 카테고리와 로그인한 사용자의 사용자 정의 카테고리를 반환합니다.

시스템 카테고리는 고정 ID를 사용합니다. 프론트엔드는 이름이 아니라 `id`를 저장하고 거래·고정지출 등록 시 `categoryId`로 전달해야 합니다.

대분류 ID:

| ID | 이름 |
|---|---|
| `core.saving` | 저축 |
| `core.investment` | 투자 |
| `core.expense` | 지출 |
| `core.income` | 수입 |

지출 소분류 ID:

| ID | 이름 |
|---|---|
| `core.expense.housing` | 주거 |
| `core.expense.food` | 식비 |
| `core.expense.transport` | 교통 |
| `core.expense.communication` | 통신 |
| `core.expense.daily-necessities` | 생활필수품 |
| `core.expense.health` | 의료·건강 |
| `core.expense.insurance-tax` | 보험·세금 |
| `core.expense.debt-repayment` | 부채상환 |

### `POST /api/categories`

Request body:

```json
{
  "name": "운동",
  "type": "EXPENSE",
  "purposeType": "GENERAL",
  "sortOrder": 10
}
```

`type`: `EXPENSE`, `INCOME`, `SAVING`

`purposeType`: `GENERAL`, `SAVING`, `INVESTMENT`

## 9. 거래

### `POST /api/transactions`

Request body:

```json
{
  "categoryId": "category-id",
  "type": "EXPENSE",
  "amount": 12000,
  "occurredAt": "2026-08-16",
  "merchantOrTitle": "점심",
  "memo": "회사 근처 식당",
  "consumptionEvaluation": "GOOD",
  "source": "MANUAL",
  "status": "CONFIRMED"
}
```

`type`: `EXPENSE`, `INCOME`, `SAVING`

`source`: `MANUAL`, `AUTO`, `RECEIPT`, `FIXED`

`status`: `CONFIRMED`, `PENDING`, `EXCLUDED`

`consumptionEvaluation`은 선택값입니다. 값을 보내지 않으면 `null`로 저장됩니다.

| 값 | 표시 문구 |
|---|---|
| `GOOD` | 좋음 |
| `NORMAL` | 보통 |
| `REGRETTABLE` | 아쉬움 |
| `BAD` | 나쁨 |

`PATCH`에서 `null`을 보내면 기존 소비 평가를 제거할 수 있습니다.

`amount`는 0보다 큰 정수입니다.

### `GET /api/transactions`

Query parameters:

| Parameter | Type | 설명 |
|---|---|---|
| `startDate` | `YYYY-MM-DD` | 시작일 포함 |
| `endDate` | `YYYY-MM-DD` | 종료일 포함 |
| `categoryId` | string | 카테고리 필터 |
| `type` | enum | `EXPENSE`, `INCOME`, `SAVING` |
| `status` | enum | `CONFIRMED`, `PENDING`, `EXCLUDED` |
| `page` | number | 기본값 1 |
| `limit` | number | 기본값 50, 최대 100 |

예:

```http
GET /api/transactions?startDate=2026-08-01&endDate=2026-08-31&type=EXPENSE&page=1&limit=20
```

응답:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "transaction-id",
        "userId": "auth-user-uuid",
        "budgetCycleId": "cycle-id",
        "categoryId": "category-id",
        "type": "EXPENSE",
        "amount": "12000",
        "occurredAt": "2026-08-16",
        "merchantOrTitle": "점심",
        "memo": "회사 근처 식당",
        "consumptionEvaluation": "GOOD",
        "source": "MANUAL",
        "status": "CONFIRMED",
        "userEdited": true,
        "category": {
          "id": "category-id",
          "name": "식비"
        }
      }
    ],
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

### `GET /api/transactions/:id`

거래 하나를 조회합니다.

### `PATCH /api/transactions/:id`

전달한 필드만 수정합니다.

```json
{
  "amount": 13500,
  "memo": "수정된 메모",
  "consumptionEvaluation": "REGRETTABLE",
  "status": "CONFIRMED"
}
```

### `DELETE /api/transactions/:id`

응답:

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

## 10. 리포트

모든 공식 통계는 `status=CONFIRMED` 거래를 기준으로 계산합니다.

### `GET /api/reports/summary`

선택 query: `startDate`, `endDate`

응답:

```json
{
  "success": true,
  "data": {
    "income": 3000000,
    "expense": 46400,
    "saving": 0,
    "investment": 0,
    "remainingAvailableAmount": 853600
  }
}
```

### `GET /api/reports/daily`

선택 query: `startDate`, `endDate`

`startDate`, `endDate`를 보내지 않으면 현재 소비 주기 기준으로 조회합니다. 캘린더에서 특정 월을 조회할 때는 해당 월의 첫날과 마지막 날을 전달합니다.

응답:

```json
{
  "success": true,
  "data": {
    "period": {
      "startDate": "2026-08-01",
      "endDate": "2026-08-31"
    },
    "summary": {
      "totalIncome": 3000000,
      "totalExpense": 46400,
      "noSpendDays": 27,
      "noActivityDays": 26
    },
    "daily": [
      {
        "date": "2026-08-16",
        "income": 0,
        "expense": 12000,
        "spent": 12000,
        "recommended": 30000,
        "difference": -18000
      }
    ]
  }
}
```

- `income`, `expense`: 해당 날짜의 `CONFIRMED` 수입·지출 합계
- `spent`: 기존 프론트 호환을 위한 `expense` 별칭
- `noSpendDays`: 지출이 0인 날짜 수
- `noActivityDays`: 수입과 지출이 모두 0인 날짜 수
- `PENDING`, `EXCLUDED` 거래는 집계하지 않습니다.

### `GET /api/reports/monthly`

응답:

```json
{
  "success": true,
  "data": [
    {
      "month": "2026-08",
      "income": 3000000,
      "expense": 46400,
      "saving": 0,
      "investment": 0
    }
  ]
}
```

### `GET /api/reports/categories`

선택 query: `startDate`, `endDate`

응답:

```json
{
  "success": true,
  "data": [
    {
      "category": "식비",
      "amount": 30000,
      "transactionCount": 2,
      "percentage": 64.6551724138
    }
  ]
}
```

### `GET /api/reports/pace`

현재 소비 주기의 계획 대비 실제 소비 속도와 추가 저축 예상값을 반환합니다. 응답의 `current` 객체는 Home API의 계산 필드와 동일한 기준을 사용합니다.

## 11. 고정지출

### `GET /api/fixed-expenses`

활성 고정지출과 생성된 occurrence 목록을 반환합니다.

### `POST /api/fixed-expenses`

Request body:

```json
{
  "categoryId": "category-id",
  "name": "Netflix",
  "expectedAmount": 17000,
  "billingDay": 15,
  "recurrenceType": "MONTHLY",
  "startDate": "2026-08-15",
  "endDate": "2027-08-15"
}
```

`recurrenceType`: `MONTHLY`, `YEARLY`

고정지출 생성 시 월간 occurrence는 최대 12개, 연간 occurrence는 최대 3개가 생성됩니다.

### `POST /api/fixed-expenses/occurrences/:occurrenceId/match`

실제 거래와 예정 occurrence를 연결합니다.

Request body:

```json
{
  "transactionId": "transaction-id"
}
```

매칭된 occurrence는 `PAID`가 되며, 예정금액과 실제 거래가 이중으로 차감되지 않습니다.

## 12. Android 알림 수신

### `POST /api/notifications`

Android `NotificationListenerService`가 수집한 금융·카드사 알림 원문을 사용자별 inbox에 저장합니다. 카드 승인 알림은 파싱에 성공하면 `Transaction`도 자동 생성합니다. 카드 취소, 잔액, 입출금 등 자동 거래 등록이 안전하지 않은 유형은 inbox에 검토 대기로 저장합니다.

Request headers:

```http
Content-Type: application/json
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

Request body:

```json
{
  "eventId": "sha256-generated-event-id",
  "packageName": "com.shcard.smartpay",
  "title": "[신한체크승인]",
  "content": "홍*동 12,000원(일시불) 08/31 14:30 스타벅스강남점 잔액 150,000원",
  "timestamp": 1788162600000,
  "source": "ANDROID_NOTIFICATION"
}
```

`eventId`는 같은 사용자의 알림에서 고유해야 합니다. 같은 `eventId`를 다시 보내면 `409`와 `DUPLICATE_NOTIFICATION`을 반환하며, 프론트는 이미 처리된 알림으로 간주할 수 있습니다.

성공 응답(`201`):

```json
{
  "success": true,
  "data": {
    "eventId": "sha256-generated-event-id",
    "status": "PROCESSED",
    "duplicate": false,
    "eventType": "CARD_APPROVAL",
    "parsed": {
      "eventType": "CARD_APPROVAL",
      "amount": 12000,
      "occurredAt": "2026-08-31",
      "merchant": "스타벅스강남점",
      "categoryId": "core.expense.food",
      "confidence": 0.99,
      "parseStatus": "PARSED"
    },
    "transactionId": "created-transaction-id"
  }
}
```

중복 응답(`409`):

```json
{
  "success": false,
  "data": {
    "eventId": "sha256-generated-event-id",
    "status": "RECEIVED",
    "duplicate": true
  },
  "error": {
    "code": "DUPLICATE_NOTIFICATION",
    "message": "Notification has already been received"
  }
}
```

서버는 `NOTIFICATION_ALLOWED_PACKAGES` 환경변수에 comma로 구분된 패키지만 허용합니다. 기본값은 `com.shcard.smartpay`이며, 실제 지원할 패키지명을 백엔드 환경변수에 추가해야 합니다.

## 13. 청년정책

### `GET /api/profile`

로그인한 사용자의 맞춤 정책 기준 정보를 반환합니다.

### `PUT /api/profile`

로그인한 사용자의 나이와 거주지역을 저장합니다. 두 필드 중 하나 이상을 보내야 합니다.

Request body:

```json
{
  "age": 25,
  "region": "광주"
}
```

### `GET /api/policies/recommended`

로그인한 사용자의 `age`, `region`에 맞는 정책을 반환합니다. 연령은 정책의 최소·최대 연령 조건을 검사하고, 지역은 전국 정책 또는 사용자 지역과 일치하는 광역자치단체 정책을 포함합니다.

프로필이 저장되지 않은 경우 `409 PROFILE_REQUIRED`를 반환합니다.

응답 예시:

```json
{
  "success": true,
  "data": {
    "profile": {
      "age": 25,
      "region": "광주"
    },
    "policies": []
  }
}
```

### `GET /api/policies`

인증 없이 정책을 검색합니다. 각 정책에는 프론트 카드 UI에서 바로 사용할 수 있는 `presentation`이 포함됩니다.

Query parameters:

| Parameter | Type | 설명 |
|---|---|---|
| `category` | string | 주거, 취업, 금융 등 |
| `region` | string | 지역 |
| `age` | number | 대상 나이 |
| `providerType` | enum | `GOVERNMENT`, `LOCAL_GOVERNMENT`, `PUBLIC`, `PRIVATE` |
| `keyword` | string | 제목/요약 검색 |
| `applicationStatus` | enum | `OPEN`, `CLOSED` |

### `POST /api/policies/sync`

Supabase 인증이 필요한 백엔드 전용 동기화 API입니다. 온통청년 청년정책 Open API에서 정책을 조회한 후 `Policy` 테이블에 upsert하고, 정책 원문을 바탕으로 카드용 `presentation`을 생성합니다. 외부 API 키와 AI 키는 서버 환경변수로만 관리하며 프론트엔드가 전달하지 않습니다.

Request body:

```json
{
  "pageIndex": 1,
  "display": 20
}
```

동기화 시 AI 문구를 생성할 수 있도록 서버에 `GEMINI_API_KEY`를 설정합니다. 키가 없거나 AI 호출에 실패하면 원문 기반 fallback 문구가 저장되므로 정책 동기화 자체는 계속 진행됩니다. `GEMINI_MODEL`로 사용할 모델을 변경할 수 있으며 기본값은 `gemini-2.5-flash`입니다.

정책 조회 응답의 `presentation` 예시:

```json
{
  "badgeText": "청년금융 PICK",
  "headline": "월 50만원 저축하면 정부가 최대 12%를 더해줘요",
  "summary": "청년의 목돈 마련을 돕는 자산형성 지원 정책입니다.",
  "targetText": "만 19~34세 · 전국",
  "benefitText": "월 최대 50만원 저축 시 정부 매칭 지원",
  "applicationText": "신청기간 2026.06.22 ~ 2026.07.31 신청",
  "categoryText": "금융･복지･문화",
  "deadlineLabel": "D-14"
}
```

`deadlineLabel`은 저장된 AI 결과가 아니라 `applicationEndDate`와 현재 날짜로 서버가 매번 계산합니다. 따라서 날짜가 지나면 자동으로 `마감`으로 바뀝니다.

### `POST /api/policies/:id/enrich`

로그인한 사용자의 정책 카드 문구를 다시 생성합니다. 정책 원문은 변경하지 않습니다. AI 키가 없거나 호출에 실패하면 fallback 문구가 반환됩니다.

응답:

```json
{
  "success": true,
  "data": {
    "id": "youthcenter-policy-id",
    "title": "청년 자산형성 지원사업",
    "applicationEndDate": "2026-07-31",
    "presentation": {
      "badgeText": "청년금융 PICK",
      "headline": "월 50만원 저축하면 정부가 최대 12%를 더해줘요",
      "summary": "청년의 목돈 마련을 돕는 자산형성 지원 정책입니다.",
      "targetText": "만 19~34세 · 전국",
      "benefitText": "월 최대 50만원 저축 시 정부 매칭 지원",
      "applicationText": "신청기간 2026.06.22 ~ 2026.07.31 신청",
      "categoryText": "금융",
      "deadlineLabel": "D-14"
    }
  }
}
```

### `POST /api/policies/enrich-all`

현재 `Policy` 테이블에 저장된 모든 정책의 카드 문구를 일괄 생성합니다. 원문이 변경되지 않았고 동일한 Gemini 문구가 이미 있으면 재사용합니다.

응답:

```json
{
  "success": true,
  "data": {
    "totalCount": 26,
    "generatedCount": 26,
    "reusedCount": 0,
    "geminiCount": 26,
    "fallbackCount": 0
  }
}
```

모든 필드는 선택사항이며 기본값은 `pageIndex=1`, `display=20`입니다. `display`는 최대 100입니다. 외부 API의 페이지 파라미터인 `pageNum`, `pageSize`로 변환되어 요청됩니다.

응답:

```json
{
  "success": true,
  "data": {
    "source": "YOUTH_CENTER",
    "pageIndex": 1,
    "display": 20,
    "fetchedCount": 20,
    "totalCount": 2720,
    "insertedCount": 20,
    "updatedCount": 0,
    "skippedCount": 0
  }
}
```

외부 API가 리다이렉트되거나 XML/JSON 형식이 잘못된 경우 `502`를 반환합니다. API 키를 평문 HTTP 리다이렉트로 전송하지 않도록 리다이렉트를 자동 추적하지 않습니다.

### `GET /api/policies/:id`

정책 상세를 조회합니다.

### `POST /api/policies/:id/bookmark`

로그인한 사용자의 관심 정책으로 등록합니다.

### `DELETE /api/policies/:id/bookmark`

관심 정책을 삭제합니다.

### `GET /api/policies/bookmarks`

로그인한 사용자의 관심 정책 목록을 조회합니다. 정책 상세 API를 정책 개수만큼 추가 호출하지 않도록 정책 요약 정보를 함께 반환합니다.

응답:

```json
{
  "success": true,
  "data": [
    {
      "bookmarkId": "bookmark-id",
      "bookmarkedAt": "2026-09-01T10:00:00.000Z",
      "policy": {
        "id": "youthcenter-policy-id",
        "title": "청년 월세 지원",
        "category": "주거",
        "provider": "광주광역시",
        "applicationStartDate": "2026-09-01",
        "applicationEndDate": "2026-09-30",
        "applicationUrl": "https://example.com/apply",
        "presentation": {
          "badgeText": "청년주거 PICK",
          "headline": "청년의 주거비 부담을 덜어드려요",
          "summary": "청년을 위한 주거 지원 정책입니다.",
          "targetText": "만 19~34세 · 광주",
          "benefitText": "주거 관련 지원 내용을 확인해보세요.",
          "applicationText": "신청기간 2026.09.01 ~ 2026.09.30 신청",
          "categoryText": "주거",
          "deadlineLabel": "D-18"
        }
      }
    }
  ]
}
```

마감일이 없는 정책의 `applicationEndDate`는 `null`입니다. 캘린더의 마감 배지는 이 필드를 기준으로 표시합니다.

> 프론트 라우팅에서는 `/api/policies/bookmarks`를 `/api/policies/:id`보다 먼저 처리해야 하며, 현재 백엔드 라우터에 반영되어 있습니다.

## 14. 프론트 연동 권장 흐름

1. Supabase Auth 로그인
2. access token을 메모리 또는 안전한 세션 저장소에 보관
3. `PUT /api/finance/setting`으로 월급 설정
4. 예산 배분 설정
5. `GET /api/categories`로 카테고리 목록 조회
6. 거래 등록 후 `GET /api/home` 재조회
7. 차트 화면에서 `/api/reports/daily`, `/api/reports/categories`, `/api/reports/monthly` 사용

## 15. 금액 타입 주의사항

입력 금액은 JSON number 정수로 보내도 됩니다.

```json
{
  "amount": 12000
}
```

Sequelize/PostgreSQL의 `BIGINT` 기반 저장 필드는 응답에서 문자열로 반환될 수 있습니다.

```json
{
  "amount": "12000"
}
```

프론트에서 화면 계산이 필요하면 `Number(amount)`로 변환하되, 큰 금액을 다룰 때는 정밀도 정책을 별도로 정하는 것을 권장합니다.
