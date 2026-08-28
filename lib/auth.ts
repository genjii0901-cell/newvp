export const AUTH_REQUEST_TIMEOUT_MS = 10_000;

const AUTH_TIMEOUT_MESSAGE = "AUTH_REQUEST_TIMEOUT";

export async function withAuthTimeout<T>(
  request: PromiseLike<T>,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(AUTH_TIMEOUT_MESSAGE)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(request), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function normalizeAuthErrorMessage(message: string) {
  const lower = message.toLowerCase();

  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(message)) {
    return message;
  }

  if (
    message === AUTH_TIMEOUT_MESSAGE ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("connection timeout") ||
    lower.includes("connection terminated") ||
    lower.includes("quota") ||
    lower.includes("status code 402")
  ) {
    return "現在、認証サービスに接続できません。時間をおいてもう一度お試しください。";
  }
  if (lower.includes("security purposes") && lower.includes("60 seconds")) {
    return "短時間に続けて送信されたため、60秒ほど待ってからもう一度お試しください。";
  }
  if (lower.includes("email rate limit exceeded") || lower.includes("over_email_send_rate_limit")) {
    return "確認メールの送信回数が上限に達しました。少し待ってからもう一度お試しください。";
  }
  if (lower.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (lower.includes("email not confirmed")) {
    return "メール認証が完了していません。最新の確認メール内のリンクを開いてください。";
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return "このメールアドレスは登録済みです。ログインをお試しください。";
  }
  if (lower.includes("signup is disabled")) {
    return "現在、新規登録を一時停止しています。";
  }
  if (lower.includes("provider") && (lower.includes("disabled") || lower.includes("not enabled"))) {
    return "このログイン方法は現在利用できません。メールアドレスでのログインをお試しください。";
  }
  if (lower.includes("pkce code verifier not found")) {
    return "ログインを始めたブラウザと同じブラウザで開けませんでした。ログイン画面からもう一度お試しください。";
  }
  if (lower.includes("expired") || lower.includes("otp_expired")) {
    return "確認リンクの有効期限が切れています。最新の確認メールからもう一度お試しください。";
  }

  return "ログイン処理に失敗しました。時間をおいてもう一度お試しください。";
}
