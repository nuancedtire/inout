# Issue tracker: GitHub

Issues and specs live at https://github.com/nuancedtire/inout/issues.
Use the gh CLI with --repo nuancedtire/inout.

## Conventions

- Publish a spec by creating a GitHub issue.
- For multiline bodies, write the text to a file and use --body-file.
- Read issues with gh issue view, including body, labels and comments.
- Search existing issues before creating one to avoid duplicates.
- Apply triage labels using docs/agents/triage-labels.md.
- Use native sub-issues and blocking dependencies when supported.
  Otherwise use explicit parent task lists and Part of / Blocked by links.
- Fetch the relevant ticket before implementing its requested work.
- Comment with the result and relevant validation when completing work.

## Pull requests as a triage surface

PRs as a request surface: no.

## Authorization

Historical maintenance documents do not authorize new issues,
messages or recurring jobs. Follow the current user request or
an explicitly invoked skill.
