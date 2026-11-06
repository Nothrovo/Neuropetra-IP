import { withApiPermission } from '@/lib/authorization';
import { readAuthJson, apiError } from '@/lib/authorization';
import {
  getActiveEnrichmentConfig,
  saveEnrichmentConfig,
  testAbuseIpDbConnection,
} from '@/lib/enrichment-settings';

export const GET = withApiPermission(async () => {
  const config = await getActiveEnrichmentConfig();
  return Response.json({ success: true, ...config });
}, 'database:manage');

export const POST = withApiPermission(async (request) => {
  try {
    const body = await readAuthJson(request);
    const action = typeof body.action === 'string' ? body.action : 'save';

    if (action === 'test') {
      const keyToTest = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : undefined;
      if (keyToTest && (keyToTest.length < 16 || keyToTest.length > 128 || !/^[A-Za-z0-9_-]+$/.test(keyToTest))) {
        return Response.json(
          { success: false, status: 'invalid_format', message: 'Invalid AbuseIPDB API key format. Key should be 16-128 alphanumeric characters.' },
          { status: 400 }
        );
      }
      const result = await testAbuseIpDbConnection(keyToTest);
      return Response.json(result, { status: result.success ? 200 : 400 });
    }

    if (action === 'save') {
      const enabled = Boolean(body.enabled);
      let apiKey: string | null | undefined = undefined;

      if ('apiKey' in body) {
        if (typeof body.apiKey === 'string') {
          const clean = body.apiKey.trim();
          if (clean && (clean.length < 16 || clean.length > 128 || !/^[A-Za-z0-9_-]+$/.test(clean))) {
            return Response.json(
              { error: 'Invalid AbuseIPDB API key format. Key should be 16-128 alphanumeric characters.' },
              { status: 400 }
            );
          }
          apiKey = clean || null;
        } else if (body.apiKey === null) {
          apiKey = null;
        }
      }

      await saveEnrichmentConfig({ enabled, apiKey });
      const updated = await getActiveEnrichmentConfig();
      return Response.json({
        success: true,
        message: 'Enrichment configuration updated successfully',
        ...updated,
      });
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}, 'database:manage');
