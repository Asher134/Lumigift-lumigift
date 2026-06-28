# Mutation Score

## What is mutation testing?

Mutation testing evaluates test suite quality by introducing small, deliberate code changes ("mutants") and verifying that the tests detect them. A high mutation score means your tests catch real bugs; a low score reveals gaps in coverage.

## Thresholds

| Level  | Score |
|--------|-------|
| High   | ≥ 80% |
| Low    | ≥ 60% |
| Break  | 50%   |

CI fails automatically when the mutation score falls below the **break** threshold (50%).

## Running locally

```bash
npm run mutation
```

Reports are written to `reports/mutation/`.

## Baseline score

The baseline score has not been recorded yet — it will be updated here after the first successful CI run.
