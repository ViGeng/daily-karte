# Changelog

## 0.1.0 · 2026-11-06

This initial source release provides a static activity-card journal with a Google sign-in entry and an isolated guest experience.

The release includes editable activity presets, approximate time records, a daily timeline, and activity summaries. Its optional Firebase connector uses a deployer's own project and has cloud connectivity disabled by default.

The pre-release review added strict cached-data validation and escaped dynamic color attributes. It also pinned a patched development dependency after an npm advisory check. The public snapshot excludes earlier internal hosting metadata and local deployment configuration.

Google sign-in, live Firestore rules, and real cross-device synchronization still need deployment verification. The current user interface uses Simplified Chinese. JSON backup import and media attachments are not implemented.
