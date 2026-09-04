# Flutter Android 알림 수집 및 백엔드 전송 구현 요청문

Flutter 기반 가계부 앱에서 Android 금융·카드사 앱의 알림을 수집하고, 앱이 종료된 상태에서도 유실 없이 백엔드로 전송하는 기능을 구현해줘.

이번 요청의 범위는 Flutter 프론트와 Android 네이티브 연동이다. 백엔드는 아래 알림 수신 API 계약을 제공하므로, 프론트에서는 URL을 환경변수로 관리하여 연결한다.

---

## 1. 기술 및 구현 원칙

- Flutter/Dart
- Android Kotlin
- `NotificationListenerService`
- Android Room
- Android WorkManager
- Flutter `MethodChannel`
- 필요할 때만 `EventChannel`
- iOS에서는 기능을 비활성화하고 크래시가 발생하지 않도록 처리

가장 중요한 원칙은 다음과 같다.

```text
Android NotificationListenerService
        ↓
Room 로컬 수집 큐
        ↓
WorkManager 재시도 작업
        ↓
POST /api/notifications
```

Flutter UI와 `EventChannel`에만 의존해서는 안 된다. Flutter 앱이 백그라운드 또는 Terminated 상태여도 알림이 먼저 Room에 저장되어야 한다.

---

## 2. 알림 접근 권한

Android 설정 화면에서 사용자가 알림 접근 권한을 허용해야 한다.

### Native MethodChannel API

채널 이름:

```text
finance_app/notification_access
```

메서드:

```text
isNotificationAccessGranted
openNotificationAccessSettings
```

동작:

1. Flutter에서 권한 상태를 조회한다.
2. 미허용이면 `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`를 호출한다.
3. 설정 화면에서 돌아오면 권한 상태를 다시 조회한다.
4. Android가 아닌 플랫폼에서는 `false` 또는 `unsupported`를 반환하고 아무 동작도 하지 않는다.

Flutter 호출 예시:

```dart
if (!Platform.isAndroid) {
  return false;
}

const channel = MethodChannel('finance_app/notification_access');
final granted = await channel.invokeMethod<bool>(
  'isNotificationAccessGranted',
) ?? false;
```

온보딩 화면에는 다음 상태를 표시한다.

```text
허용됨
허용되지 않음
iOS에서 지원되지 않음
```

---

## 3. Android NotificationListenerService

`NotificationListenerService`를 상속받은 Kotlin 서비스를 작성한다.

Manifest에는 시스템 바인딩 권한을 선언한다.

```xml
<service
    android:name=".notification.FinanceNotificationListenerService"
    android:label="Finance notification listener"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

알림 수신 시 다음 값을 추출한다.

```text
packageName
title
content
postTime
```

Android extras 처리 규칙:

- 제목: `Notification.EXTRA_TITLE`
- 본문: `Notification.EXTRA_TEXT`
- 긴 본문이 있으면 `Notification.EXTRA_BIG_TEXT` 우선 고려
- 값이 null이면 빈 문자열로 대체
- 제목과 본문이 모두 비어 있으면 저장하지 않음
- 앱 자신의 패키지 알림은 제외

금융·카드사 패키지 allowlist는 코드에 흩어놓지 말고 별도 설정으로 관리한다. 신한카드, KB국민카드, 카카오뱅크, 토스 등은 실제 앱 버전별 패키지명을 확인한 뒤 등록한다.

클라이언트의 `packageName`만으로 금융 알림임을 신뢰하지 않는다. 백엔드에서도 allowlist 또는 파싱 불가 상태를 검증한다.

---

## 4. 중복 방지용 eventId

동일 알림이 앱 재시작, 서비스 재연결, WorkManager 재시도 과정에서 여러 번 전송될 수 있으므로 반드시 `eventId`를 만든다.

가능하면 Android 알림의 고유 key를 사용하고, 사용할 수 없으면 다음 값을 조합하여 SHA-256 해시를 생성한다.

```text
packageName + postTime + title + content
```

`eventId`는 Room과 백엔드 모두에서 중복 식별자로 사용한다.

---

## 5. Room 로컬 큐

알림을 수신하면 네트워크 요청보다 먼저 Room에 저장한다.

권장 엔티티:

```text
NotificationInbox
```

필드:

```text
localId
eventId          unique
packageName
title
content
timestamp
source
status           PENDING / SENDING / SENT / FAILED
retryCount
lastError
createdAt
updatedAt
```

규칙:

- `eventId`가 이미 존재하면 중복 저장하지 않음
- Room 저장이 성공한 후에만 전송 작업을 예약함
- 전송 성공 전에는 데이터를 삭제하지 않음
- 네트워크 오류는 지수 백오프로 재시도함
- 영구적인 4xx 오류는 `FAILED`로 저장하고 재시도하지 않음
- 서버의 중복 응답은 성공으로 간주하고 `SENT` 처리함

---

## 6. 백그라운드 전송

WorkManager 작업은 다음 조건으로 등록한다.

- 네트워크 연결 상태에서 실행
- 앱 프로세스가 종료되어도 실행 가능
- 일시적인 네트워크 오류는 자동 재시도
- 배터리 최적화 및 제조사별 백그라운드 제한을 사용자에게 안내

인증 토큰을 평문으로 하드코딩하거나 소스 코드에 저장하지 않는다. Supabase access token을 사용할 경우 만료·갱신 전략을 구현하고, 가능하면 Android Keystore 기반 암호화 저장소를 사용한다. `service_role` 키는 절대 앱에 포함하지 않는다.

---

## 7. 백엔드 전송 API 계약

현재 백엔드 Base URL은 개발 환경 기준 다음과 같다.

```text
http://localhost:4000
```

알림 수신 API는 다음 경로를 기준으로 한다.

```http
POST /api/notifications
```

`/api/v1/notifications`를 사용하지 않는다. 현재 프로젝트의 API 경로가 `/api/...` 형식이기 때문이다.

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

필드 규칙:

| 필드 | 필수 | 설명 |
|---|---:|---|
| `eventId` | O | 중복 전송 방지용 고유 ID |
| `packageName` | O | 알림을 발생시킨 Android 패키지명 |
| `title` | O | 알림 제목 |
| `content` | O | 알림 본문 |
| `timestamp` | O | 원본 알림의 `postTime`, Unix milliseconds |
| `source` | O | 항상 `ANDROID_NOTIFICATION` |

전송 성공 예시:

```json
{
  "success": true,
  "data": {
    "eventId": "sha256-generated-event-id",
    "status": "PROCESSED",
    "duplicate": false,
    "eventType": "CARD_APPROVAL",
    "transactionId": "created-transaction-id"
  }
}
```

프론트는 HTTP `2xx`와 서버가 중복으로 응답한 `409`를 처리 완료로 간주한다. `5xx`, timeout, 네트워크 오류는 WorkManager가 재시도한다.

백엔드는 카드 승인 알림을 파싱하면 `Transaction`을 자동 생성한다. 결제 취소, 입금, 출금, 잔액 알림은 거래로 오인할 수 있으므로 원본만 저장하고 검토 대기로 남긴다. 프론트는 응답의 `transactionId`를 이용해 자동 등록 결과를 표시할 수 있다.

---

## 8. Foreground 화면 전달

앱이 실행 중일 때만 최근 수집 알림을 화면에 보여주려면 `EventChannel`을 추가한다.

채널 이름:

```text
finance_app/notification_events
```

단, `EventChannel`은 화면 표시용이다. 저장과 백엔드 전송의 필수 경로로 사용하지 않는다.

---

## 9. 개인정보 및 보안

- 알림 본문에는 이름, 카드번호 일부, 잔액, 결제처가 포함될 수 있음
- 알림 원문을 콘솔 로그에 출력하지 않음
- 디버그 화면에서도 민감정보를 마스킹함
- 서버 전송은 HTTPS 환경을 사용함
- `packageName`은 클라이언트 입력이므로 서버에서 검증함
- 사용자 ID는 요청 body로 받지 않고 Supabase JWT에서 식별함
- 기기 분실 시 로컬 Room 데이터가 평문으로 노출되지 않도록 고려함

---

## 10. 테스트 조건

다음 조건을 확인한다.

1. 알림 접근 권한이 없을 때 설정 화면으로 이동한다.
2. 권한 허용 후 앱으로 돌아오면 상태가 갱신된다.
3. allowlist에 없는 앱의 알림은 저장하지 않는다.
4. 제목과 본문을 정확히 추출한다.
5. 앱이 종료된 상태에서도 알림이 Room에 저장된다.
6. 네트워크가 끊긴 상태에서 알림이 `PENDING`으로 유지된다.
7. 네트워크 복구 후 WorkManager가 전송을 재시도한다.
8. 동일 알림이 중복 저장·중복 전송되지 않는다.
9. 서버 응답 성공 후에만 `SENT` 처리한다.
10. iOS에서 해당 화면과 서비스가 크래시를 발생시키지 않는다.
11. 알림 원문이 로그에 노출되지 않는다.

---

## 11. 완료 시 보고할 내용

구현 후 다음을 보고한다.

1. 생성·수정한 Flutter 파일
2. 생성·수정한 Kotlin 및 Android Manifest 파일
3. MethodChannel/EventChannel API 목록
4. Room 엔티티와 큐 상태 전이
5. WorkManager 재시도 정책
6. 인증 토큰 처리 방식
7. 지원하는 패키지 allowlist
8. 백엔드 API 전송 예시
9. Android 에뮬레이터 또는 실기기 테스트 결과
10. 제조사별 백그라운드 제한 등 남은 제약사항
