# Median Quality Standards for Agents

When this plugin is active, all code generation and editing tasks must adhere to these quality standards:

1. **Verify Before Stopping**:
   - Always run the project's test suite and build commands before finishing your work.
   - Do not stop while tests are failing or compile errors remain.

2. **Test Completeness**:
   - Whenever you implement or modify functionality, write or update corresponding automated tests.
   - Ensure edge cases mentioned in the prompt are covered by tests.

3. **Respond to Quality Gate Failures**:
   - If the Median Stop Hook returns `{ "decision": "continue" }`, treat the accompanying reason as high-priority feedback.
   - Address the exact test failure or requirement defect indicated before attempting to stop again.
