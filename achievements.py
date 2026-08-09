"""Compatibility shim for the retired local post-billing achievement evaluator.

The canonical TypeScript backend now owns achievement evaluation and persistence.
Legacy SQLite achievement tables and rows are intentionally preserved for later
controlled reconciliation, but billing must not award or notify achievements.
"""


async def check_and_award_achievements(*_args, **_kwargs):
    """Keep the historical billing import harmless during the migration."""
    return []
