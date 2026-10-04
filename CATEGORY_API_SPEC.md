# 카테고리 및 예산 설정 API 명세서

프론트엔드 전달용 문서입니다.

## 1. 기본 정보

- Base URL: `http://localhost:4000`
- Content-Type: `application/json`
- 금액 단위: 원(KRW)
- 날짜 형식: `YYYY-MM-DD`

운영 환경에서는 모든 인증 API에 Supabase access token을 전달합니다.

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

개발 환경에서 `DEV_AUTH_BYPASS=true`이면 Authorization 헤더 없이 호출할 수 있습니다.

## 2. 시스템 카테고리 조회

### `GET /api/categories`

시스템 카테고리와 현재 사용자의 사용자 정의 카테고리를 조회합니다.

```http
GET http://localhost:4000/api/categories
```

응답 예시:

```json
{
  "success": true,
  "data": [
    {
      "id": "core.expense.food",
      "name": "식비",
      "type": "EXPENSE",
      "purposeType": "GENERAL",
      "parentCategoryId": "core.expense",
      "isActive": true,
      "sortOrder": 320,
      "canonicalName": "식비",
      "icon": null,
      "color": null,
      "isCustomized": false,
      "isSystem": true,
      "isCustom": false
    }
  ]
}
```

프론트엔드는 카테고리 이름이 아닌 `id`를 저장하고, 거래 및 고정지출 등록 시 `categoryId`로 전달해야 합니다.

| 필드 | 설명 |
| --- | --- |
| `name` | 화면에 표시할 이름. 사용자가 기본 카테고리 이름을 바꿨다면 그 이름 |
| `canonicalName` | 카테고리 row의 원래 이름 (기본값 복원·내부 의미 확인용) |
| `icon` | 사용자가 고른 아이콘 key (`^[a-z0-9_]{1,40}$`), 없으면 `null` = 앱 기본 아이콘 |
| `color` | 사용자가 고른 색 `#RRGGBB`, 없으면 `null` = 앱 기본 색 |
| `isCustomized` | 현재 사용자의 이름/아이콘/색 override가 있는지 |

사용자별 표시값은 `UserCategoryPreference` (`userId` + `categoryId`)에 저장되며, 공용 시스템 카테고리 row는 바뀌지 않습니다. 거래(`transaction.category.name`)와 리포트(`category`)에는 원래 이름이 그대로 내려오므로, 프론트엔드는 `categoryId`로 이 목록의 `name`을 찾아 표시합니다.

## 2-1. 카테고리 수정 / 기본값 복원

### `PATCH /api/categories/:id`

```json
{ "name": "카카오택시", "icon": "local_taxi_outlined", "color": "#5D9CEC" }
```

- 시스템 카테고리: `name`/`icon`/`color`만 받고 현재 사용자의 override로 저장합니다. `id`, `parentCategoryId`, `sortOrder`, `isActive`와 예산·거래·자동분류 연결은 바뀌지 않습니다. 원래 이름을 다시 보내면 이름 override가 지워집니다. `parentCategoryId`/`sortOrder`/`isActive`를 보내면 `403 SYSTEM_CATEGORY_IMMUTABLE`.
- 사용자 정의 카테고리: `name`은 자기 row를 수정하고, `icon`/`color`는 override에 저장합니다. 다른 사용자의 카테고리는 `404`.
- `icon`/`color`에 `null`을 보내면 해당 override만 지웁니다.
- `userId`는 받지 않습니다. 항상 인증된 사용자 기준입니다.

`POST /api/categories`도 `icon`/`color`를 함께 받을 수 있습니다.

### `DELETE /api/categories/:id/preference`

현재 사용자의 이름/아이콘/색 override를 지워 기본값으로 되돌립니다. 응답은 되돌린 카테고리입니다.

### `DELETE /api/categories/:id`

사용자 정의 카테고리만 비활성화(`isActive: false`)합니다. 시스템 카테고리는 `403 SYSTEM_CATEGORY_IMMUTABLE`.

## 3. 고정 시스템 카테고리 ID

### 대분류

| ID | 이름 | 용도 |
|---|---|---|
| `core.saving` | 저축 | 예금, 적금, 비상금 등 |
| `core.investment` | 투자 | 주식, ETF, 펀드 등 |
| `core.expense` | 지출 | 생활비 및 필수지출 |
| `core.income` | 수입 | 급여 등 수입 |

### 저축 소분류

| ID | 이름 |
|---|---|
| `core.saving.emergency-fund` | 비상금 |
| `core.saving.goal` | 목적성 저축 |
| `core.saving.installment` | 적금 |
| `core.saving.deposit` | 예금 |
| `core.saving.housing` | 주택청약 |
| `core.saving.pension` | 연금저축 |

### 투자 소분류

| ID | 이름 |
|---|---|
| `core.investment.stock` | 주식 |
| `core.investment.etf` | ETF |
| `core.investment.fund` | 펀드 |
| `core.investment.bond` | 채권 |
| `core.investment.crypto` | 가상자산 |
| `core.investment.pension` | 퇴직연금·IRP |

### 지출 소분류

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
| `core.expense.unclassified` | 미분류 자동등록 fallback |

## 4. 대분류 예산 비율 조회

### `GET /api/finance/allocations`

현재 사용자의 저축·투자·지출 비율을 조회합니다.

```http
GET http://localhost:4000/api/finance/allocations
```

응답 예시:

```json
{
  "success": true,
  "data": [
    {
      "id": "allocation-id",
      "name": "저축",
      "allocationType": "SAVING",
      "percentage": "30.00",
      "spendability": "LOCKED",
      "active": true
    },
    {
      "id": "allocation-id",
      "name": "투자",
      "allocationType": "INVESTMENT",
      "percentage": "20.00",
      "spendability": "LOCKED",
      "active": true
    },
    {
      "id": "allocation-id",
      "name": "지출",
      "allocationType": "FLEXIBLE",
      "percentage": "50.00",
      "spendability": "FLEXIBLE",
      "active": true
    }
  ]
}
```

활성 예산 배분의 `percentage` 합계는 반드시 `100`이어야 합니다.

현재 대분류 예산 배분 저장 API는 단건 저장 방식입니다.

### `POST /api/finance/allocations`

```json
{
  "name": "저축",
  "allocationType": "SAVING",
  "percentage": 30,
  "spendability": "LOCKED",
  "active": true
}
```

이번 3대분류 표준에서 사용하는 `allocationType`:

```text
SAVING
INVESTMENT
FLEXIBLE
```

현재 `FLEXIBLE`이 대분류 `지출`을 의미합니다.

현재 API는 예산 배분을 단건으로 저장하며, 각 요청 직후 활성 비율 합계가 `100`인지 검사합니다. 따라서 최초 설정에서 `30%`, `20%`, `50%`를 각각 순서대로 보내면 중간 합계가 100이 아니어서 실패할 수 있습니다. 프론트에서 일괄 저장을 사용하려면 백엔드에 bulk 저장 API를 추가해야 합니다.

## 5. 월 고정지출 등록

### `POST /api/fixed-expenses`

월세, 통신비, 보험료처럼 매월 반복되는 예정 지출을 등록합니다.

```http
POST http://localhost:4000/api/fixed-expenses
```

Request body:

```json
{
  "categoryId": "core.expense.housing",
  "name": "월세",
  "expectedAmount": 700000,
  "billingDay": 25,
  "recurrenceType": "MONTHLY",
  "startDate": "2026-08-25",
  "endDate": "2027-08-24"
}
```

필드 설명:

| 필드 | 필수 | 설명 |
|---|---:|---|
| `categoryId` | O | 시스템 카테고리 ID |
| `name` | O | 고정지출 이름 |
| `expectedAmount` | O | 예정 금액, 0보다 큰 정수 |
| `billingDay` | O | 결제일, 1~31 |
| `recurrenceType` | O | `MONTHLY` 또는 `YEARLY` |
| `startDate` | O | 시작일 |
| `endDate` | X | 종료일 |

통신비 예시:

```json
{
  "categoryId": "core.expense.communication",
  "name": "휴대폰 요금",
  "expectedAmount": 55000,
  "billingDay": 10,
  "recurrenceType": "MONTHLY",
  "startDate": "2026-08-10"
}
```

## 6. 실제 지출 등록

### `POST /api/transactions`

고정지출이 실제로 결제되었거나 일반 지출이 발생했을 때 사용합니다.

```http
POST http://localhost:4000/api/transactions
```

```json
{
  "categoryId": "core.expense.food",
  "type": "EXPENSE",
  "amount": 12000,
  "occurredAt": "2026-08-25",
  "merchantOrTitle": "점심 식사",
  "memo": "회사 근처 식당",
  "source": "MANUAL",
  "status": "CONFIRMED"
}
```

고정지출 실제 결제인 경우:

```json
{
  "categoryId": "core.expense.housing",
  "type": "EXPENSE",
  "amount": 700000,
  "occurredAt": "2026-08-25",
  "merchantOrTitle": "월세",
  "source": "FIXED",
  "status": "CONFIRMED"
}
```

## 7. 저축·투자 거래 등록 참고

현재 백엔드의 거래 `type`은 `EXPENSE`, `INCOME`, `SAVING`을 사용합니다.

투자는 카테고리의 `purposeType`으로 구분하므로, 투자 거래도 현재는 `type: "SAVING"`으로 전달합니다.

저축:

```json
{
  "categoryId": "core.saving.installment",
  "type": "SAVING",
  "amount": 300000,
  "occurredAt": "2026-08-25",
  "merchantOrTitle": "적금 이체",
  "source": "MANUAL",
  "status": "CONFIRMED"
}
```

투자:

```json
{
  "categoryId": "core.investment.etf",
  "type": "SAVING",
  "amount": 200000,
  "occurredAt": "2026-08-25",
  "merchantOrTitle": "ETF 매수",
  "source": "MANUAL",
  "status": "CONFIRMED"
}
```

## 8. 프론트 구현 규칙

1. 앱 시작 시 `GET /api/categories`를 호출합니다.
2. `id`를 기준으로 카테고리를 저장합니다.
3. 화면에는 `name`을 표시합니다. 거래·리포트처럼 다른 응답의 카테고리 이름은 `categoryId`로 이 목록의 `name`을 찾아 표시합니다.
4. 거래 및 고정지출 API에는 `categoryId`만 전달합니다.
5. 카테고리 이름을 직접 API에 전달하지 않습니다. 이름으로 카테고리를 찾지 않습니다 (사용자가 바꿀 수 있음).
6. `parentCategoryId`가 `null`이면 대분류이고, 값이 있으면 해당 대분류의 소분류입니다.
