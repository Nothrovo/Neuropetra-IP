import { describe, it, expect } from 'vitest';
import { normalizeMitre, groupTechniquesByTactic } from '../lib/mitre-matrix';

describe('MITRE ATT&CK Normalization & Matrix Library', () => {
  it('normalizes known technique IDs to their tactic and official URL', () => {
    const t1595 = normalizeMitre('T1595.002');
    expect(t1595.id).toBe('T1595.002');
    expect(t1595.tacticName).toBe('Reconnaissance');
    expect(t1595.url).toBe('https://attack.mitre.org/techniques/T1595/002/');

    const t1190 = normalizeMitre('T1190');
    expect(t1190.id).toBe('T1190');
    expect(t1190.tacticName).toBe('Initial Access');
    expect(t1190.url).toBe('https://attack.mitre.org/techniques/T1190/');
  });

  it('handles unknown technique ID formats gracefully', () => {
    const unknown = normalizeMitre('T9999');
    expect(unknown.id).toBe('T9999');
    expect(unknown.url).toBe('https://attack.mitre.org/techniques/T9999/');
  });

  it('groups multiple techniques by tactic for enterprise matrix view', () => {
    const grouped = groupTechniquesByTactic(['T1595.002', 'T1190', 'T1498']);
    expect(grouped['Reconnaissance']).toBeDefined();
    expect(grouped['Initial Access']).toBeDefined();
    expect(grouped['Impact']).toBeDefined();
    expect(grouped['Reconnaissance'].techniques[0].id).toBe('T1595.002');
  });
});
