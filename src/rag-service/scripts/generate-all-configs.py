#!/usr/bin/env python3
"""Generate all validation configs from CSV files"""

import csv
import yaml
import json
from pathlib import Path

def safe_key(text):
    """Convert text to safe YAML key"""
    return text.lower().replace(' ', '_').replace('&', 'and').replace('(', '').replace(')', '').replace('-', '_').replace(',', '')

def main():
    base_path = Path('/home/claude/dhf-rag-system')
    
    # Read Analysis Checks
    print("Reading Analysis Checks CSV...")
    with open('/mnt/user-data/uploads/Analysis_Checks_-_Enhanced.csv', 'r') as f:
        reader = csv.DictReader(f)
        analysis_checks = list(reader)
    
    # Group by Phase and Category
    phase_data = {}
    for check in analysis_checks:
        phase = check['Phase']
        category = check['Category']
        
        if phase not in phase_data:
            phase_data[phase] = {}
        if category not in phase_data[phase]:
            phase_data[phase][category] = []
        
        phase_data[phase][category].append(check)
    
    # Generate validation YAML for each phase
    for phase_name, categories in sorted(phase_data.items()):
        phase_num = phase_name.split()[-1]
        config = {}
        
        for category, checks in sorted(categories.items()):
            cat_key = safe_key(category)
            
            config[cat_key] = {
                'display_name': category,
                'folder_path': f'{phase_name}/{category}',
                'check_count': len(checks),
                'validation_checks': []
            }
            
            for idx, check in enumerate(checks, 1):
                check_id = f'P{phase_num}-{cat_key[:4].upper()}-{idx:03d}'
                
                check_cfg = {
                    'check_id': check_id,
                    'check_name': check['Draft Analysis Check (for review/editing)'][:100],
                    'severity': 'high',
                    'regulatory_source': check['Regulatory Source'],
                    'source_section': check['Source Section'],
                    'estar_section': check['eSTAR Section Relevance'],
                    'design_vv_reference': check.get('Design V&V Reference', ''),
                    'testing_ref': check.get('Testing Ref', ''),
                    'llm_validation': {
                        'question': check['Draft Analysis Check (for review/editing)'],
                        'validation_criteria': {
                            'must_include': []
                        }
                    },
                    'failure_message': f'Validation check {check_id} failed',
                    'remediation': [
                        'Review regulatory requirements',
                        'Update documentation per guidance'
                    ],
                    'priority': check.get('Priority', ''),
                    'automation_feasibility': check.get('Automation Feasibility', ''),
                    'notes': check.get('Notes', '')
                }
                
                config[cat_key]['validation_checks'].append(check_cfg)
        
        # Write phase validation file
        output_file = base_path / 'config' / 'validation' / f'phase{phase_num}-validation.yaml'
        with open(output_file, 'w') as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)
        
        total_checks = sum(len(v['validation_checks']) for v in config.values())
        print(f'✓ Created phase{phase_num}-validation.yaml with {total_checks} checks across {len(config)} categories')
    
    print(f'\n✅ All validation configs generated!')
    print(f'Total: {len(analysis_checks)} checks')

if __name__ == '__main__':
    main()
