from __future__ import annotations

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from schemathesis import openapi


def _health_operations(app):
    schema = openapi.from_asgi("/openapi.json", app)
    operations = []
    for result in schema.get_all_operations():
        operation = result.ok()
        if operation is None:
            continue
        if operation.path.startswith("/health") and operation.method == "get":
            operations.append(operation)
    return operations


@given(st.data())
@settings(
    max_examples=6,
    suppress_health_check=[HealthCheck.filter_too_much, HealthCheck.too_slow],
)
def test_openapi_fuzz_health(app, data) -> None:
    operations = _health_operations(app)
    assert operations, "Expected at least one health endpoint in schema"

    operation = data.draw(st.sampled_from(operations))
    case = data.draw(operation.as_strategy())
    response = case.call(app=app)
    case.validate_response(response)
