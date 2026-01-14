/**
 * Unit tests for data models
 */

import { LabelTaxonomy } from '../data_models';

describe('LabelTaxonomy', () => {
    let taxonomy: LabelTaxonomy;

    beforeEach(() => {
        taxonomy = new LabelTaxonomy();
    });

    describe('feature_component labels', () => {
        it('should contain all expected feature/component labels', () => {
            const expected = [
                'auth', 'autocomplete', 'chat', 'cli', 'extensions', 'hooks',
                'ide', 'mcp', 'models', 'powers', 'specs', 'ssh', 'steering',
                'sub-agents', 'terminal', 'ui', 'usability', 'trusted-commands',
                'pricing', 'documentation', 'dependencies', 'compaction'
            ];
            
            expect(taxonomy.feature_component).toEqual(expected);
        });
    });
    
    describe('os_specific labels', () => {
        it('should contain all OS-specific labels', () => {
            const expected = ['os: linux', 'os: mac', 'os: windows'];
            expect(taxonomy.os_specific).toEqual(expected);
        });
    });
    
    describe('theme labels', () => {
        it('should contain all theme labels', () => {
            const expected = [
                'theme:account', 'theme:agent-latency', 'theme:agent-quality',
                'theme:context-limit-issue', 'theme:ide-performance',
                'theme:slow-unresponsive', 'theme:ssh-wsl', 'theme:unexpected-error'
            ];
            expect(taxonomy.theme).toEqual(expected);
        });
    });
    
    describe('workflow labels', () => {
        it('should contain all workflow labels', () => {
            const expected = [
                'pending-maintainer-response', 'pending-response',
                'pending-triage', 'duplicate', 'question'
            ];
            expect(taxonomy.workflow).toEqual(expected);
        });
    });
    
    describe('special labels', () => {
        it('should contain all special labels', () => {
            const expected = ['Autonomous agent', 'Inline chat', 'on boarding'];
            expect(taxonomy.special).toEqual(expected);
        });
    });
    
    describe('getAllLabels()', () => {
        it('should return all labels from all categories', () => {
            const allLabels = taxonomy.getAllLabels();
            
            // Should include labels from all categories
            expect(allLabels).toContain('auth');
            expect(allLabels).toContain('os: linux');
            expect(allLabels).toContain('theme:account');
            expect(allLabels).toContain('pending-triage');
            expect(allLabels).toContain('Autonomous agent');
        });
        
        it('should return correct total count', () => {
            const allLabels = taxonomy.getAllLabels();
            const expectedCount = 
                taxonomy.feature_component.length +
                taxonomy.os_specific.length +
                taxonomy.theme.length +
                taxonomy.workflow.length +
                taxonomy.special.length;
            
            expect(allLabels.length).toBe(expectedCount);
        });

        it('should return 41 total labels', () => {
            const allLabels = taxonomy.getAllLabels();
            expect(allLabels.length).toBe(41);
        });
    });
    
    describe('toDict()', () => {
        it('should return dictionary with all categories', () => {
            const dict = taxonomy.toDict();
            
            expect(dict).toHaveProperty('feature_component');
            expect(dict).toHaveProperty('os_specific');
            expect(dict).toHaveProperty('theme');
            expect(dict).toHaveProperty('workflow');
            expect(dict).toHaveProperty('special');
        });

        it('should return arrays for each category', () => {
            const dict = taxonomy.toDict();
            
            expect(Array.isArray(dict.feature_component)).toBe(true);
            expect(Array.isArray(dict.os_specific)).toBe(true);
            expect(Array.isArray(dict.theme)).toBe(true);
            expect(Array.isArray(dict.workflow)).toBe(true);
            expect(Array.isArray(dict.special)).toBe(true);
        });

        it('should match the class properties', () => {
            const dict = taxonomy.toDict();
            
            expect(dict.feature_component).toEqual(taxonomy.feature_component);
            expect(dict.os_specific).toEqual(taxonomy.os_specific);
            expect(dict.theme).toEqual(taxonomy.theme);
            expect(dict.workflow).toEqual(taxonomy.workflow);
            expect(dict.special).toEqual(taxonomy.special);
        });
    });

    describe('label validation', () => {
        it('should include common labels', () => {
            const allLabels = taxonomy.getAllLabels();
            
            expect(allLabels).toContain('auth');
            expect(allLabels).toContain('cli');
            expect(allLabels).toContain('ide');
            expect(allLabels).toContain('terminal');
        });

        it('should not include invalid labels', () => {
            const allLabels = taxonomy.getAllLabels();
            
            expect(allLabels).not.toContain('bug');
            expect(allLabels).not.toContain('enhancement');
            expect(allLabels).not.toContain('invalid');
        });
    });
});
