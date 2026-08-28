import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://2la-noire-chagina7x.waw0.amvera.tech';
const INCIDENT_TITLE = '[monitor] 2LA Noire runtime outage';
const DOWN_MARKER = '<!-- runtime-monitor-down-notified -->';
const RECOVERY_MARKER = '<!-- runtime-monitor-recovery-notified -->';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

export const parseChatIds = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const safeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const probe = async (url, validate, fetcher, delay) => {
  let lastResult = { ok: false, httpStatus: null, detail: 'unreachable' };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: { Accept: 'application/json', 'User-Agent': '2la-noire-runtime-monitor' },
        signal: AbortSignal.timeout(12_000),
      });
      const body = await safeJson(response);
      const validation = validate(response, body);
      lastResult = {
        ok: response.ok && validation.ok,
        httpStatus: response.status,
        detail: validation.detail,
      };
    } catch (error) {
      lastResult = {
        ok: false,
        httpStatus: null,
        detail: error?.name === 'TimeoutError' ? 'timeout' : 'connection_error',
      };
    }
    if (lastResult.ok || attempt === 2) return lastResult;
    await delay(5_000);
  }
  return lastResult;
};

export async function probeRuntime(baseUrl, fetcher = fetch, delay = wait) {
  const base = normalizeBaseUrl(baseUrl);
  const [web, runtime] = await Promise.all([
    probe(
      `${base}/api/health`,
      (_response, body) => ({
        ok: body?.status === 'ok',
        detail: body?.status === 'ok' ? 'ok' : 'invalid_health_response',
      }),
      fetcher,
      delay,
    ),
    probe(
      `${base}/api/health/runtime`,
      (_response, body) => {
        const checks = body?.checks || {};
        const detail = ['database', 'bot', 'telegram']
          .map((key) => `${key}=${checks[key] || 'unknown'}`)
          .join(', ');
        return { ok: body?.status === 'ok', detail };
      },
      fetcher,
      delay,
    ),
  ]);

  return { ok: web.ok && runtime.ok, web, runtime };
}

const statusLabel = (probeResult) => probeResult.httpStatus == null
  ? probeResult.detail
  : `HTTP ${probeResult.httpStatus}; ${probeResult.detail}`;

const runUrl = () => {
  const server = normalizeBaseUrl(process.env.GITHUB_SERVER_URL);
  const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
  const runId = String(process.env.GITHUB_RUN_ID || '').trim();
  return server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : '';
};

const downMessage = (baseUrl, result, startedAt) => [
  '🚨 2LA Noire: приложение недоступно или работает с ошибкой.',
  `Время: ${startedAt}`,
  `Сайт: ${statusLabel(result.web)}`,
  `Бот/БД/Telegram: ${statusLabel(result.runtime)}`,
  `Адрес: ${baseUrl}`,
  runUrl() ? `Диагностика: ${runUrl()}` : '',
].filter(Boolean).join('\n');

const recoveryMessage = (baseUrl, startedAt, recoveredAt) => [
  '✅ 2LA Noire: работа приложения восстановлена.',
  `Сбой начался: ${startedAt}`,
  `Восстановление: ${recoveredAt}`,
  `Адрес: ${baseUrl}`,
].join('\n');

const sendTelegram = async (token, chatIds, text, fetcher = fetch) => {
  let delivered = 0;
  const failures = [];

  for (const [index, chatId] of chatIds.entries()) {
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          chat_id: chatId,
          text,
          disable_web_page_preview: 'true',
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const body = await safeJson(response);
      if (!response.ok || body?.ok !== true) throw new Error(`HTTP ${response.status}`);
      delivered += 1;
    } catch (error) {
      failures.push(`recipient #${index + 1}: ${error?.message || 'delivery_failed'}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Telegram notification incomplete: delivered ${delivered}/${chatIds.length} (${failures.join('; ')})`);
  }
};

const githubRequest = async (path, options = {}) => {
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  if (!token) throw new Error('GITHUB_TOKEN is not configured');
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
  if (response.status === 204) return null;
  return safeJson(response);
};

const repositoryPath = () => {
  const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('GITHUB_REPOSITORY is not configured');
  }
  return `/repos/${repository}`;
};

const findOpenIncident = async () => {
  const issues = await githubRequest(`${repositoryPath()}/issues?state=open&per_page=100`);
  return issues.find((issue) => (
    !issue.pull_request
    && issue.title === INCIDENT_TITLE
    && issue.user?.login === 'github-actions[bot]'
  )) || null;
};

const incidentBody = (baseUrl, result, startedAt) => [
  'The external runtime monitor detected a production outage or degraded dependency.',
  '',
  `- Started (UTC): ${startedAt}`,
  `- Target: ${baseUrl}`,
  `- Web: ${statusLabel(result.web)}`,
  `- Runtime: ${statusLabel(result.runtime)}`,
  '',
  'This issue is managed automatically and will close after recovery.',
].join('\n');

const createIncident = async (baseUrl, result, startedAt) => githubRequest(`${repositoryPath()}/issues`, {
  method: 'POST',
  body: JSON.stringify({ title: INCIDENT_TITLE, body: incidentBody(baseUrl, result, startedAt) }),
});

const appendMarker = async (issue, marker) => {
  const body = `${String(issue.body || '').trim()}\n\n${marker}\n`;
  return githubRequest(`${repositoryPath()}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
};

const closeIncident = async (issue, recoveredAt) => {
  await githubRequest(`${repositoryPath()}/issues/${issue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: `Runtime checks recovered at ${recoveredAt}. Closing automatically.` }),
  });
  await githubRequest(`${repositoryPath()}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });
};

const startedAtFrom = (issue) => {
  const match = String(issue?.body || '').match(/Started \(UTC\): ([^\n]+)/);
  return match?.[1]?.trim() || String(issue?.created_at || 'unknown');
};

export async function main() {
  const baseUrl = normalizeBaseUrl(process.env.RUNTIME_MONITOR_BASE_URL || DEFAULT_BASE_URL);
  const telegramToken = String(process.env.TELEGRAM_MONITOR_BOT_TOKEN || '').trim();
  const chatIds = parseChatIds(process.env.TELEGRAM_MONITOR_CHAT_IDS);
  const testNotification = String(process.env.MONITOR_TEST_NOTIFICATION || '').toLowerCase() === 'true';

  if (!telegramToken || chatIds.length === 0) {
    if (testNotification) throw new Error('Telegram monitor secrets are not configured');
    console.log('[monitor] Not armed: configure TELEGRAM_MONITOR_BOT_TOKEN and TELEGRAM_MONITOR_CHAT_IDS.');
    return;
  }

  if (testNotification) {
    await sendTelegram(
      telegramToken,
      chatIds,
      `✅ 2LA Noire: тестовые уведомления мониторинга подключены.\nАдрес: ${baseUrl}`,
    );
    console.log('[monitor] Test notification delivered to all recipients.');
    return;
  }

  const checkedAt = new Date().toISOString();
  const result = await probeRuntime(baseUrl);
  let incident = await findOpenIncident();

  if (!result.ok) {
    if (!incident) incident = await createIncident(baseUrl, result, checkedAt);
    if (!String(incident.body || '').includes(DOWN_MARKER)) {
      await sendTelegram(telegramToken, chatIds, downMessage(baseUrl, result, checkedAt));
      incident = await appendMarker(incident, DOWN_MARKER);
    }
    console.error(`[monitor] Runtime is degraded: web=${statusLabel(result.web)}; runtime=${statusLabel(result.runtime)}`);
    process.exitCode = 1;
    return;
  }

  if (!incident) {
    console.log('[monitor] Runtime is healthy.');
    return;
  }

  if (!String(incident.body || '').includes(RECOVERY_MARKER)) {
    await sendTelegram(
      telegramToken,
      chatIds,
      recoveryMessage(baseUrl, startedAtFrom(incident), checkedAt),
    );
    incident = await appendMarker(incident, RECOVERY_MARKER);
  }
  await closeIncident(incident, checkedAt);
  console.log('[monitor] Runtime recovered; incident closed.');
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[monitor] ${error?.message || 'Unexpected monitor failure'}`);
    process.exitCode = 1;
  });
}
