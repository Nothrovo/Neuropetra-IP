import { NextResponse } from 'next/server';
import { getBlocklistData } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { allowed } = checkRateLimit(`blocklist:${clientIp}`, 30, 0.5);
  if (!allowed) {
    return new NextResponse('Rate limit exceeded', { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'txt').toLowerCase();
  const minScore = parseInt(searchParams.get('min_score') || '75', 10);
  const minAlerts = parseInt(searchParams.get('min_alerts') || '1', 10);
  const days = parseInt(searchParams.get('days') || '30', 10);

  try {
    const rows = await getBlocklistData({
      minScore,
      minAlerts,
      maxAgeDays: days,
    });

    if (format === 'cdb') {
      // Wazuh CDB-list format: ip:Description / Category
      const lines = rows.map((r) => {
        const desc = `Score_${r.abuse_score}|Alerts_${r.total_alert_count}|${r.attack_types?.[0] || 'Malicious'}`;
        return `${r.ip}:${desc}`;
      });
      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="wazuh_blocklist.cdb"',
        },
      });
    }

    if (format === 'csv') {
      const header = 'ip,abuse_score,total_alerts,country,primary_attack\n';
      const lines = rows.map(
        (r) =>
          `"${r.ip}",${r.abuse_score},${r.total_alert_count},"${r.country_code}","${r.attack_types?.[0] || 'unspecified'}"`
      );
      return new NextResponse(header + lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ip_intel_blocklist.csv"',
        },
      });
    }

    // Default: Plain text IP list (one IP per line)
    const ipList = rows.map((r) => r.ip).join('\n');
    return new NextResponse(ipList, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ip_blocklist.txt"',
      },
    });
  } catch (err: any) {
    console.error('[API /blocklist Error]', err);
    return new NextResponse('Failed to generate blocklist', { status: 500 });
  }
}
