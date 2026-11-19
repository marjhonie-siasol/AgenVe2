from __future__ import annotations

from pathlib import Path

from agenve2.core.models import Decision, PolicyMode, ToolCallRequest
from agenve2.core.pipeline import EvaluationPipeline
from agenve2.core.policy import PRESETS, PolicyLoader


def _make_loader(tmp_path: Path, preset: str = "strict") -> PolicyLoader:
    p = tmp_path / "policy.yaml"
    p.write_text(PRESETS[preset], encoding="utf-8")
    return PolicyLoader(p)


def test_pipeline_fail_closed_for_unknown_tool(tmp_path: Path):
    pipeline = EvaluationPipeline(_make_loader(tmp_path))
    report = pipeline.evaluate(
        ToolCallRequest(tool_name="delete_production_cluster", arguments={})
    )
    assert report.decision == Decision.BLOCK
    assert report.effective_decision == Decision.BLOCK
    assert "defaults.action=deny" in report.rule_triggered


def test_pipeline_kill_switch_overrides_even_dry_run(tmp_path: Path):
    pipeline = EvaluationPipeline(
        _make_loader(tmp_path),
        kill_switch=True,
        mode_override=PolicyMode.DRY_RUN,
    )
    report = pipeline.evaluate(
        ToolCallRequest(
            tool_name="postgres_query",
            arguments={"query": "SELECT 1"},
        )
    )
    assert report.decision == Decision.BLOCK
    assert report.effective_decision == Decision.BLOCK
    assert report.rule_triggered == "global_kill_switch"


def test_pipeline_dry_run_allows_but_marks_block_decision(tmp_path: Path):
    pipeline = EvaluationPipeline(
        _make_loader(tmp_path),
        mode_override=PolicyMode.DRY_RUN,
    )
    report = pipeline.evaluate(
        ToolCallRequest(
            tool_name="postgres_query",
            arguments={"query": "DROP TABLE orders;"},
        )
    )
    assert report.decision == Decision.BLOCK
    assert report.effective_decision == Decision.ALLOW
    assert report.dry_run is True


def test_pipeline_require_approval_after_param_bounds_pass(tmp_path: Path):
    pipeline = EvaluationPipeline(_make_loader(tmp_path))
    # Within $500 -> pauses for human approval
    ok_bounds = pipeline.evaluate(
        ToolCallRequest(tool_name="refund_customer", arguments={"amount": 250})
    )
    assert ok_bounds.decision == Decision.REQUIRE_APPROVAL

    # Above $500 -> hard-blocked immediately before approval
    over_bounds = pipeline.evaluate(
        ToolCallRequest(tool_name="refund_customer", arguments={"amount": 9000})
    )
    assert over_bounds.decision == Decision.BLOCK
    assert over_bounds.plugin_triggered == "param_bounds"
