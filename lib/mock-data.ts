/**
 * High-fidelity synthetic dataset for development and demonstration (USE_MOCK_DATA=true).
 * Conforms 100% to the real PostgreSQL schema: ip_intel_cache and ip_intel_events.
 */

export interface IpIntelCacheRow {
  ip: string;
  first_seen: string;
  last_seen: string;
  last_alert_id: string | null;
  reputation_source: 'abuseipdb' | 'virustotal' | null;
  abuse_score: number | null;
  vt_malicious: number | null;
  country_code: string | null;
  isp: string | null;
  geo_json: {
    country: string;
    countryCode: string;
    isp: string;
    as?: string;
  } | null;
  reputation_json: any;
  attack_types: string[];
  mitre_tactics: string[];
  target_hosts: string[];
  endpoints_targeted: string[];
  http_methods_used: string[];
  total_alert_count: number;
  notes: string | null;
  reputation_checked_at: string | null;
}

export interface IpIntelEventRow {
  id: number;
  ip: string;
  seen_at: string;
  alert_type: string | null;
  attack_subtype: string | null;
  mitre: string[];
  target_host: string | null;
  endpoint: string | null;
  outcome: string | null;
  raw_summary: string | null;
}

const now = Date.now();
const h = (hoursAgo: number) => new Date(now - hoursAgo * 3600 * 1000).toISOString();
const d = (daysAgo: number) => new Date(now - daysAgo * 24 * 3600 * 1000).toISOString();

export const MOCK_IP_CACHE: IpIntelCacheRow[] = [
  {
    ip: '185.220.101.5',
    first_seen: d(14),
    last_seen: h(1),
    last_alert_id: 'wazuh-alert-892110',
    reputation_source: 'abuseipdb',
    abuse_score: 100,
    vt_malicious: 14,
    country_code: 'DE',
    isp: 'Tor Exit Node Relay Operator',
    geo_json: {
      country: 'Germany',
      countryCode: 'DE',
      isp: 'Tor Exit Relay Services',
      as: 'AS208294 Tor Network',
    },
    reputation_json: {
      ipAddress: '185.220.101.5',
      isPublic: true,
      ipVersion: 4,
      isWhitelisted: false,
      abuseConfidenceScore: 100,
      countryCode: 'DE',
      usageType: 'Data Center/Web Hosting/Transit',
      isp: 'Zwiebelfreunde e.V.',
      domain: 'torservers.net',
      totalReports: 2841,
      numDistinctUsers: 840,
      lastReportedAt: h(2),
      isTor: true,
    },
    attack_types: ['sql_injection', 'path_traversal', 'command_injection'],
    mitre_tactics: ['T1190', 'T1595.002', 'T1059'],
    target_hosts: ['srv-web-prod01', 'srv-app-api', 'portal-gateway'],
    endpoints_targeted: ['/api/v1/auth/login', '/cgi-bin/test.sh', '/portal/view.php?id=1'],
    http_methods_used: ['POST', 'GET'],
    total_alert_count: 89,
    notes: 'Known Tor Exit node actively testing SQLi and shell commands on public portal.',
    reputation_checked_at: h(6),
  },
  {
    ip: '45.154.255.89',
    first_seen: d(5),
    last_seen: h(3),
    last_alert_id: 'wazuh-alert-891904',
    reputation_source: 'abuseipdb',
    abuse_score: 85,
    vt_malicious: 8,
    country_code: 'RU',
    isp: 'VDSina Hosting Provider',
    geo_json: {
      country: 'Russia',
      countryCode: 'RU',
      isp: 'Hostkey LLC',
      as: 'AS57523 Hostkey',
    },
    reputation_json: {
      ipAddress: '45.154.255.89',
      abuseConfidenceScore: 85,
      countryCode: 'RU',
      isp: 'Hostkey LLC',
      domain: 'hostkey.com',
      totalReports: 620,
      numDistinctUsers: 140,
      isTor: false,
    },
    attack_types: ['sql_injection'],
    mitre_tactics: ['T1190'],
    target_hosts: ['srv-web-prod01'],
    endpoints_targeted: ['/index.php?category=UNION+SELECT'],
    http_methods_used: ['GET'],
    total_alert_count: 34,
    notes: 'Automated sqlmap crawler detected by WAF rule 31101.',
    reputation_checked_at: d(1),
  },
  {
    ip: '194.26.29.112',
    first_seen: d(2),
    last_seen: h(12),
    last_alert_id: 'wazuh-alert-890123',
    reputation_source: 'virustotal',
    abuse_score: 55,
    vt_malicious: 6,
    country_code: 'NL',
    isp: 'Global Internet Solutions B.V.',
    geo_json: {
      country: 'Netherlands',
      countryCode: 'NL',
      isp: 'Serverius Holding B.V.',
      as: 'AS50673 Serverius',
    },
    reputation_json: {
      type: 'ip_address',
      id: '194.26.29.112',
      attributes: {
        last_analysis_stats: {
          malicious: 6,
          suspicious: 1,
          harmless: 65,
          undetected: 12,
        },
        country: 'NL',
        as_owner: 'Serverius Holding B.V.',
      },
    },
    attack_types: ['path_traversal'],
    mitre_tactics: ['T1083'],
    target_hosts: ['srv-app-api'],
    endpoints_targeted: ['/static/../../../etc/passwd', '/app/download?file=..%2f..%2f.env'],
    http_methods_used: ['GET'],
    total_alert_count: 12,
    notes: 'Path traversal probes targeting sensitive configuration files.',
    reputation_checked_at: d(2),
  },
  {
    ip: '103.145.22.40',
    first_seen: d(20),
    last_seen: h(8),
    last_alert_id: 'wazuh-alert-889410',
    reputation_source: 'abuseipdb',
    abuse_score: 95,
    vt_malicious: 11,
    country_code: 'ID',
    isp: 'PT Telekomunikasi Selular',
    geo_json: {
      country: 'Indonesia',
      countryCode: 'ID',
      isp: 'Telkomsel Mobile Network',
      as: 'AS24434 Telkomsel',
    },
    reputation_json: {
      ipAddress: '103.145.22.40',
      abuseConfidenceScore: 95,
      countryCode: 'ID',
      isp: 'PT Telekomunikasi Selular',
      totalReports: 142,
    },
    attack_types: ['web_scan', 'path_traversal'],
    mitre_tactics: ['T1595.002', 'T1083'],
    target_hosts: ['portal-gateway', 'srv-web-prod01'],
    endpoints_targeted: ['/wp-admin/', '/.git/config', '/.env'],
    http_methods_used: ['GET', 'HEAD'],
    total_alert_count: 52,
    notes: 'High-volume web reconnaissance scan against public assets.',
    reputation_checked_at: h(18),
  },
  {
    ip: '8.8.8.8',
    first_seen: d(30),
    last_seen: d(15),
    last_alert_id: 'wazuh-alert-810012',
    reputation_source: 'abuseipdb',
    abuse_score: 0,
    vt_malicious: 0,
    country_code: 'US',
    isp: 'Google LLC',
    geo_json: {
      country: 'United States',
      countryCode: 'US',
      isp: 'Google Public DNS',
      as: 'AS15169 Google LLC',
    },
    reputation_json: {
      ipAddress: '8.8.8.8',
      abuseConfidenceScore: 0,
      countryCode: 'US',
      isp: 'Google LLC',
      domain: 'google.com',
      totalReports: 0,
      isWhitelisted: true,
    },
    attack_types: [],
    mitre_tactics: [],
    target_hosts: ['dns-resolver'],
    endpoints_targeted: ['53/udp'],
    http_methods_used: [],
    total_alert_count: 1,
    notes: 'Benign public DNS resolver.',
    reputation_checked_at: d(15),
  },
];

export const MOCK_IP_EVENTS: IpIntelEventRow[] = [
  {
    id: 1,
    ip: '185.220.101.5',
    seen_at: h(1),
    alert_type: 'attack',
    attack_subtype: 'sql_injection',
    mitre: ['T1190'],
    target_host: 'srv-web-prod01',
    endpoint: '/api/v1/auth/login',
    outcome: 'blocked',
    raw_summary: 'ModSecurity: SQL Injection attack detected in POST parameter "username" (Rule 942100). Payload: \' OR 1=1 --',
  },
  {
    id: 2,
    ip: '185.220.101.5',
    seen_at: h(2),
    alert_type: 'attack',
    attack_subtype: 'command_injection',
    mitre: ['T1059'],
    target_host: 'srv-app-api',
    endpoint: '/cgi-bin/test.sh',
    outcome: 'failed',
    raw_summary: 'Wazuh Alert 31105: Command injection string ;id;whoami detected in HTTP query parameters.',
  },
  {
    id: 3,
    ip: '185.220.101.5',
    seen_at: h(5),
    alert_type: 'attack',
    attack_subtype: 'path_traversal',
    mitre: ['T1083'],
    target_host: 'portal-gateway',
    endpoint: '/portal/view.php?id=1',
    outcome: null,
    raw_summary: 'Web server 400 error codes from same source IP. Probing directory patterns.',
  },
  {
    id: 4,
    ip: '45.154.255.89',
    seen_at: h(3),
    alert_type: 'attack',
    attack_subtype: 'sql_injection',
    mitre: ['T1190'],
    target_host: 'srv-web-prod01',
    endpoint: '/index.php?category=UNION+SELECT',
    outcome: 'blocked',
    raw_summary: 'Wazuh rule 31101: SQL injection test payload UNION SELECT ALL detected from sqlmap scanner.',
  },
  {
    id: 5,
    ip: '194.26.29.112',
    seen_at: h(12),
    alert_type: 'attack',
    attack_subtype: 'path_traversal',
    mitre: ['T1083'],
    target_host: 'srv-app-api',
    endpoint: '/static/../../../etc/passwd',
    outcome: 'blocked',
    raw_summary: 'NGINX access log: HTTP 403 Forbidden on directory traversal attempt to /etc/passwd.',
  },
  {
    id: 6,
    ip: '103.145.22.40',
    seen_at: h(8),
    alert_type: 'attack',
    attack_subtype: 'path_traversal',
    mitre: ['T1595.002'],
    target_host: 'srv-web-prod01',
    endpoint: '/.env',
    outcome: null,
    raw_summary: 'Automated vulnerability scanner probing for exposed environment files (Wazuh rule 31162).',
  },
  {
    id: 7,
    ip: '185.220.101.5',
    seen_at: d(1),
    alert_type: 'attack',
    attack_subtype: 'sql_injection',
    mitre: ['T1190'],
    target_host: 'srv-web-prod01',
    endpoint: '/api/v1/auth/login',
    outcome: 'blocked',
    raw_summary: 'Repeated authentication attempt with SQL injection bypass vector.',
  },
  {
    id: 8,
    ip: '8.8.8.8',
    seen_at: d(15),
    alert_type: 'system',
    attack_subtype: null,
    mitre: [],
    target_host: 'dns-resolver',
    endpoint: '53/udp',
    outcome: null,
    raw_summary: 'DNS health-check response logged.',
  },
];
