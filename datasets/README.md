
# Sentinel Test Datasets

This directory stores raw transaction logs, financial audit records, and synthetic benchmarks used to evaluate Sentinel's multi-agent risk assessment workflows.

## Notice
This folder is intentionally **git-ignored** to prevent heavy data files and proprietary/mock records from cluttering version control.

## Suggested Directory Layout
Place test data files here before running batch evaluation scripts:
```text
datasets/
├── transactions/    # Mock financial transaction feeds (.csv, .json)
├── cases/           # Historical investigation case files
└── evals/          # Benchmark target outputs for agent evaluation
```
