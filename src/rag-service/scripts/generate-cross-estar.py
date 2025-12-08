#!/usr/bin/env python3
import csv
import yaml
from pathlib import Path

base_path = Path('/home/claude/dhf-rag-system/config/validation')

# Generate Cross-Phase validation
print("Generating cross-phase validation...")
with open('/mnt/user-data/uploads/Cross-Phase_Checks.csv', 'r') as f:
    reader = csv.DictReader(f)
    cross_checks = list(reader)

cross_config = {}
check_types = {}
for check in cross_checks:
    check_type = check['Check Type']
    if check_type not in check_types:
        check_types[check_type] = []
    check_types[check_type].append(check)

for check_type, checks in check_types.items():
    type_key = check_type.lower().replace(' ', '_')
    cross_config[type_key] = {
        'display_name': check_type,
        'check_count': len(checks),
        'validation_checks': []
    }
    
    for idx, check in enumerate(checks, 1):
        check_id = f'X-{type_key[:5].upper()}-{idx:03d}'
        cross_config[type_key]['validation_checks'].append({
            'check_id': check_id,
            'check_name': check['Draft Analysis Check (for review/editing)'][:100],
            'phases_involved': check['Phases/Categories Involved'],
            'regulatory_source': check['Regulatory Source'],
            'source_section': check['Source Section'],
            'estar_section': check['eSTAR Section Relevance'],
            'design_vv_reference': check.get('Design V&V Reference', ''),
            'llm_validation': {
                'question': check['Draft Analysis Check (for review/editing)'],
                'validation_criteria': {'must_include': []}
            },
            'priority': check.get('Priority', ''),
            'automation_feasibility': check.get('Automation Feasibility', ''),
            'notes': check.get('Notes', '')
        })

with open(base_path / 'cross-cutting-validation.yaml', 'w') as f:
    yaml.dump(cross_config, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)
print(f'✓ Created cross-cutting-validation.yaml with {len(cross_checks)} checks')

# Generate eSTAR validation
print("Generating eSTAR validation...")
with open('/mnt/user-data/uploads/eSTAR-Specific_Checks.csv', 'r') as f:
    reader = csv.DictReader(f)
    estar_checks = list(reader)

estar_config = {}
sections = {}
for check in estar_checks:
    section = check['Check Category']
    if section not in sections:
        sections[section] = []
    sections[section].append(check)

for section, checks in sections.items():
    section_key = section.lower().replace(' ', '_')
    estar_config[section_key] = {
        'display_name': section,
        'check_count': len(checks),
        'validation_checks': []
    }
    
    for idx, check in enumerate(checks, 1):
        check_id = f'ESTAR-{section_key[:6].upper()}-{idx:03d}'
        estar_config[section_key]['validation_checks'].append({
            'check_id': check_id,
            'check_name': check['Draft Analysis Check'][:100],
            'estar_section': check['eSTAR Section'],
            'fda_guidance': check['FDA Guidance Reference'],
            'llm_validation': {
                'question': check['Draft Analysis Check'],
                'validation_criteria': {'must_include': []}
            },
            'priority': check.get('Priority', ''),
            'notes': check.get('Notes', '')
        })

with open(base_path / 'estar-validation.yaml', 'w') as f:
    yaml.dump(estar_config, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)
print(f'✓ Created estar-validation.yaml with {len(estar_checks)} checks')

print('\n✅ All cross-cutting and eSTAR configs generated!')
