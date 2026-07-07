if (!process.env.RESEND_API_KEY) {
  console.warn('[email] RESEND_API_KEY not set — email notifications disabled.');
}

export const sendEmail = async (to, subject, html) => {
  if (!process.env.RESEND_API_KEY) return;
  const recipient = process.env.RESEND_TO_OVERRIDE || to;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: 'ShiftWise <onboarding@resend.dev>', to: recipient, subject, html }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('[email] Resend error:', err);
    }
  } catch (err) {
    console.error('[email] failed to send to', to, ':', err.message);
  }
};

// ── helpers ─────────────────────────────────────────────────────────────────

const fmt = (dt) =>
  new Date(dt).toLocaleString('en-IL', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const wrap = (body) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
  <div style="background:#2563eb;padding:16px 24px;">
    <h1 style="color:white;margin:0;font-size:20px;letter-spacing:0.5px;">ShiftWise</h1>
  </div>
  <div style="padding:24px 24px 16px;">
    ${body}
  </div>
  <div style="padding:12px 24px;background:#f9fafb;font-size:12px;color:#9ca3af;">
    Automated message from ShiftWise — please do not reply.
  </div>
</div>`;

const shiftRow = (s, bg = '#f9fafb') =>
  `<tr style="background:${bg};">
     <td style="padding:10px 12px;border:1px solid #e5e7eb;font-weight:600;">${s.title}</td>
     <td style="padding:10px 12px;border:1px solid #e5e7eb;white-space:nowrap;">${fmt(s.start_time)} – ${fmt(s.end_time)}</td>
   </tr>`;

const tableOpen = `<table style="border-collapse:collapse;width:100%;margin:16px 0;">
  <thead><tr style="background:#eff6ff;">
    <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;">Shift</th>
    <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;">Time</th>
  </tr></thead><tbody>`;

const tableClose = `</tbody></table>`;

// ── templates ────────────────────────────────────────────────────────────────

export const shiftPublishedEmail = (name, shift) =>
  wrap(`<p>Hi ${name},</p>
        <p>Your shift has been <strong>published</strong> and is now on the schedule:</p>
        ${tableOpen}${shiftRow(shift, '#f0fdf4')}${tableClose}
        <p>Log in to ShiftWise to view your full schedule.</p>`);

export const weekPublishedEmail = (name, shifts) =>
  wrap(`<p>Hi ${name},</p>
        <p>Your schedule for the upcoming week has been published. Your assigned shifts:</p>
        ${tableOpen}${shifts.map((s) => shiftRow(s)).join('')}${tableClose}
        <p>Log in to ShiftWise to view your full schedule.</p>`);

export const shiftUnpublishedEmail = (name, shift) =>
  wrap(`<p>Hi ${name},</p>
        <p>A shift you were assigned to has been <strong>temporarily taken offline</strong> for edits:</p>
        ${tableOpen}${shiftRow(shift, '#fef9c3')}${tableClose}
        <p>Your lead will publish the updated schedule once edits are complete.</p>`);

export const swapApprovedEmail = (name, isRequester, shift, otherName) =>
  wrap(`<p>Hi ${name},</p>
        ${isRequester
          ? `<p>Your swap request has been <strong>approved</strong>. You have been <strong>removed</strong> from the following shift:</p>`
          : `<p>Your swap request has been <strong>approved</strong>. You are now <strong>assigned</strong> to the following shift:</p>`
        }
        ${tableOpen}${shiftRow(shift, '#f0fdf4')}${tableClose}
        ${isRequester
          ? `<p>This shift has been transferred to <strong>${otherName}</strong>.</p>`
          : `<p>This shift was transferred from <strong>${otherName}</strong>.</p>`
        }
        <p>Log in to ShiftWise for details.</p>`);
