from panelyt_api.core import metrics


def test_metrics_increment_and_snapshot() -> None:
    metrics.reset()

    metrics.increment("ingestion.run")
    metrics.increment("ingestion.run")
    metrics.increment("optimization.solve", mode="auto")

    snapshot = metrics.snapshot()

    assert snapshot["ingestion.run"] == 2
    assert snapshot["optimization.solve|mode=auto"] == 1
