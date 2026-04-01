import type { AppSettings } from './settings'

export async function sendNotification(
  settings: AppSettings,
  monitor: { name: string; url: string },
  status: 'down' | 'up',
  message?: string | null
) {
  if (settings.webhookType === 'telegram') {
    await sendTelegram(settings, monitor, status, message)
  } else {
    await sendWebhook(settings, monitor, status, message)
  }
}

// Telegram ─

async function sendTelegram(
  settings: AppSettings,
  monitor: { name: string; url: string },
  status: 'down' | 'up',
  message?: string | null
) {
  const { telegramBotToken: token, telegramChatId: chatId } = settings
  if (!token || !chatId) return

  const isDown = status === 'down'
  const emoji = isDown ? '🔴' : '🟢'
  const label = isDown ? 'DOWN' : 'back UP'
  const urlText = monitor.url.length > 60 ? monitor.url.slice(0, 57) + '…' : monitor.url
  const time = new Date().toLocaleString()

  const lines = [
    `${emoji} <b>${escapeHtml(monitor.name)}</b> is <b>${label}</b>`,
    '',
    `<b>Endpoint:</b> <code>${escapeHtml(urlText)}</code>`,
  ]
  if (message) lines.push(`<b>Detail:</b> ${escapeHtml(message)}`)
  lines.push('', `<i>Uptime Monitor · ${time}</i>`)

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[Notify] Telegram error:', err)
    }
  } catch (err) {
    console.error('[Notify] Telegram delivery failed:', err)
  }
}

// Webhook (Discord / Slack / Generic) 

async function sendWebhook(
  settings: AppSettings,
  monitor: { name: string; url: string },
  status: 'down' | 'up',
  message?: string | null
) {
  const { webhookUrl, webhookType } = settings
  if (!webhookUrl) return

  const isDown = status === 'down'
  const timestamp = new Date().toISOString()
  const urlText = monitor.url.length > 60 ? monitor.url.slice(0, 57) + '…' : monitor.url

  let body: unknown

  if (webhookType === 'discord') {
    body = {
      embeds: [{
        title: isDown ? `🔴 ${monitor.name} is DOWN` : `🟢 ${monitor.name} is back UP`,
        description: `**Endpoint:** \`${urlText}\`${message ? `\n**Detail:** ${message}` : ''}`,
        color: isDown ? 0xed4245 : 0x3ba55c,
        timestamp,
        footer: { text: 'Uptime Monitor' },
      }],
    }
  } else if (webhookType === 'slack') {
    body = {
      attachments: [{
        color: isDown ? '#ed4245' : '#3ba55c',
        title: isDown ? `🔴 ${monitor.name} is DOWN` : `🟢 ${monitor.name} is back UP`,
        text: `Endpoint: \`${urlText}\`${message ? `\nDetail: ${message}` : ''}`,
        footer: 'Uptime Monitor',
        ts: Math.floor(Date.now() / 1000),
      }],
    }
  } else {
    body = {
      monitor: monitor.name,
      url: monitor.url,
      status,
      message: message ?? null,
      timestamp,
    }
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[Notify] Webhook delivery failed:', err)
  }
}

// Helpers 

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
