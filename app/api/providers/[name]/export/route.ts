import { NextResponse } from 'next/server';
import { getProviderDetail } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: Request,
  props: { params: Promise<{ name: string }> }
) {
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`provider-export:${clientIp}`, 30, 0.5);
  if (!allowed) {
    return new NextResponse('Rate limit exceeded', { status: 429 });
  }

  const params = await props.params;
  const rawName = decodeURIComponent(params.name || '').trim();

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'txt').toLowerCase();

  try {
    const detail = await getProviderDetail(rawName);
    if (!detail.summary || detail.ips.length === 0) {
      return new NextResponse('No indicators found for provider', { status: 404 });
    }

    const safeSlug = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    if (format === 'cdb') {
      const lines = detail.ips.map((r) => {
        const desc = `Provider_${safeSlug}|Score_${r.abuse_score ?? 0}|Alerts_${r.total_alert_count}|${r.attack_types?.[0] || 'threat'}`;
        return `${r.ip}:${desc}`;
      });
      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeSlug}_blocklist.cdb"`,
        },
      });
    }

    if (format === 'csv') {
      const header = 'ip,abuse_score,vt_malicious,total_alerts,country,primary_attack\n';
      const lines = detail.ips.map(
        (r) =>
          `"${r.ip}",${r.abuse_score ?? 0},${r.vt_malicious ?? 0},${r.total_alert_count},"${r.country_code || 'XX'}","${r.attack_types?.[0] || 'unspecified'}"`
      );
      return new NextResponse(header + lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeSlug}_blocklist.csv"`,
        },
      });
    }

    // Plain text list
    const ipList = detail.ips.map((r) => r.ip).join('\n');
    return new NextResponse(ipList, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeSlug}_ips.txt"`,
      },
    });
  } catch (err: any) {
    console.error(`[Export /api/providers/${rawName}/export Error]`, err);
    return new NextResponse('Internal error during export', { status: 500 });
  }
}
