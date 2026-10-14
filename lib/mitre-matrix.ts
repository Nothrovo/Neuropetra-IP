/**
 * MITRE ATT&CK enterprise tactics and technique normalization.
 */

export interface MitreTechniqueInfo {
  id: string;
  name: string;
  tacticId: string;
  tacticName: string;
  url: string;
  description: string;
}

export interface MitreTactic {
  id: string;
  name: string;
  order: number;
}

export const MITRE_TACTICS: Record<string, MitreTactic> = {
  TA0043: { id: 'TA0043', name: 'Reconnaissance', order: 1 },
  TA0042: { id: 'TA0042', name: 'Resource Development', order: 2 },
  TA0001: { id: 'TA0001', name: 'Initial Access', order: 3 },
  TA0002: { id: 'TA0002', name: 'Execution', order: 4 },
  TA0003: { id: 'TA0003', name: 'Persistence', order: 5 },
  TA0004: { id: 'TA0004', name: 'Privilege Escalation', order: 6 },
  TA0005: { id: 'TA0005', name: 'Defense Evasion', order: 7 },
  TA0006: { id: 'TA0006', name: 'Credential Access', order: 8 },
  TA0007: { id: 'TA0007', name: 'Discovery', order: 9 },
  TA0008: { id: 'TA0008', name: 'Lateral Movement', order: 10 },
  TA0009: { id: 'TA0009', name: 'Collection', order: 11 },
  TA0011: { id: 'TA0011', name: 'Command and Control', order: 12 },
  TA0010: { id: 'TA0010', name: 'Exfiltration', order: 13 },
  TA0040: { id: 'TA0040', name: 'Impact', order: 14 },
};

const KNOWN_TECHNIQUES: Record<string, Omit<MitreTechniqueInfo, 'url'>> = {
  'T1595': {
    id: 'T1595',
    name: 'Active Scanning',
    tacticId: 'TA0043',
    tacticName: 'Reconnaissance',
    description: 'Adversary executes active reconnaissance scans against external infrastructure.',
  },
  'T1595.002': {
    id: 'T1595.002',
    name: 'Vulnerability Scanning',
    tacticId: 'TA0043',
    tacticName: 'Reconnaissance',
    description: 'Adversary scans for vulnerabilities using automated assessment tools.',
  },
  'T1190': {
    id: 'T1190',
    name: 'Exploit Public-Facing Application',
    tacticId: 'TA0001',
    tacticName: 'Initial Access',
    description: 'Adversary attempts exploitation of internet-accessible software or services.',
  },
  'T1059': {
    id: 'T1059',
    name: 'Command and Scripting Interpreter',
    tacticId: 'TA0002',
    tacticName: 'Execution',
    description: 'Adversary executes commands using shells, interpreters, or scripts.',
  },
  'T1059.004': {
    id: 'T1059.004',
    name: 'Unix Shell',
    tacticId: 'TA0002',
    tacticName: 'Execution',
    description: 'Adversary executes commands through Unix shells (bash, sh).',
  },
  'T1055': {
    id: 'T1055',
    name: 'Process Injection',
    tacticId: 'TA0005',
    tacticName: 'Defense Evasion',
    description: 'Adversary injects code into processes to evade defenses and escalate privileges.',
  },
  'T1083': {
    id: 'T1083',
    name: 'File and Directory Discovery',
    tacticId: 'TA0007',
    tacticName: 'Discovery',
    description: 'Adversary enumerates file system directories or files.',
  },
  'T1498': {
    id: 'T1498',
    name: 'Network Denial of Service',
    tacticId: 'TA0040',
    tacticName: 'Impact',
    description: 'Adversary degrades or blocks network availability via high-volume requests.',
  },
  'T1110': {
    id: 'T1110',
    name: 'Brute Force',
    tacticId: 'TA0006',
    tacticName: 'Credential Access',
    description: 'Adversary attempts guessing authentication credentials.',
  },
  'T1071': {
    id: 'T1071',
    name: 'Application Layer Protocol',
    tacticId: 'TA0011',
    tacticName: 'Command and Control',
    description: 'Adversary communicates using standard application protocols (HTTP/HTTPS).',
  },
};

/**
 * Normalizes any MITRE technique ID or tactic string into a structured MitreTechniqueInfo.
 */
export function normalizeMitre(idOrTactic: string): MitreTechniqueInfo {
  const clean = idOrTactic.trim().toUpperCase();
  const known = KNOWN_TECHNIQUES[clean];

  if (known) {
    const urlId = clean.replace('.', '/');
    return {
      ...known,
      url: `https://attack.mitre.org/techniques/${urlId}/`,
    };
  }

  // Fallback for unrecognized technique format Txxxx or Txxxx.xxx
  if (/^T\d{4}(\.\d{3})?$/.test(clean)) {
    const urlId = clean.replace('.', '/');
    return {
      id: clean,
      name: `Technique ${clean}`,
      tacticId: 'TA0001',
      tacticName: 'Enterprise Technique',
      url: `https://attack.mitre.org/techniques/${urlId}/`,
      description: 'MITRE ATT&CK Enterprise Technique.',
    };
  }

  // Fallback for tactic names or free text
  return {
    id: clean,
    name: clean,
    tacticId: 'TA0001',
    tacticName: clean,
    url: 'https://attack.mitre.org/',
    description: `Tactical category: ${clean}`,
  };
}

/**
 * Groups an array of technique IDs into unique tactics.
 */
export function groupTechniquesByTactic(
  techniques: string[]
): Record<string, { tactic: MitreTactic; techniques: MitreTechniqueInfo[] }> {
  const result: Record<string, { tactic: MitreTactic; techniques: MitreTechniqueInfo[] }> = {};

  for (const item of techniques) {
    if (!item) continue;
    const info = normalizeMitre(item);
    const tacticObj =
      MITRE_TACTICS[info.tacticId] || {
        id: info.tacticId,
        name: info.tacticName,
        order: 99,
      };

    if (!result[tacticObj.name]) {
      result[tacticObj.name] = {
        tactic: tacticObj,
        techniques: [],
      };
    }

    if (!result[tacticObj.name].techniques.some((t) => t.id === info.id)) {
      result[tacticObj.name].techniques.push(info);
    }
  }

  return result;
}
